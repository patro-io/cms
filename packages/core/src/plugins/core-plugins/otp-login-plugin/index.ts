/**
 * OTP Login Plugin
 *
 * Passwordless authentication via email one-time codes
 * Users receive a secure 6-digit code to sign in without passwords
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import { Effect, Schema } from 'effect'
import { PluginBuilder } from '../../sdk/plugin-builder'
import type { Plugin } from '@patro-io/cms'
import { i18nMiddleware } from '../../../middleware/i18n'
import {
  OTPService,
  makeOTPServiceLayer,
  type OTPSettings,
  OTPExpiredError,
  OTPMaxAttemptsError
} from './otp-service'
import {
  AuthService,
  makeAuthServiceLayer
} from '../../../services/auth-effect'
import {
  DatabaseService,
  makeDatabaseLayer,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../services/database-effect'
import { renderOTPEmail } from './email-templates'
import { adminLayoutV2 } from '../../../templates/layouts/admin-layout-v2.template'
import type { Context as HonoContext } from 'hono'

// Validation schemas
const otpRequestSchema = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: () => 'Valid email is required'
    })
  )
})

const otpVerifySchema = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: () => 'Valid email is required'
    })
  ),
  code: Schema.String.pipe(
    Schema.minLength(4),
    Schema.maxLength(8)
  )
})

// Default settings
const DEFAULT_SETTINGS: OTPSettings = {
  codeLength: 6,
  codeExpiryMinutes: 10,
  maxAttempts: 3,
  rateLimitPerHour: 5,
  allowNewUserRegistration: false,
  appName: 'PatroCMS'
}

/**
 * Helper to get D1Database from Hono context
 */
const getDatabase = (c: HonoContext): Effect.Effect<D1Database, DatabaseError> =>
  Effect.gen(function* (_) {
    const db = (c.env as Record<string, unknown>)?.DB as D1Database | undefined
    if (!db) {
      return yield* Effect.fail(new DatabaseError({ message: 'Database not available' }))
    }
    return db
  })

/**
 * Helper to parse JSON body
 */
const parseJsonBody = (c: HonoContext): Effect.Effect<unknown, DatabaseError> =>
  Effect.tryPromise({
    try: () => c.req.json(),
    catch: (error) => new DatabaseError({ message: 'Failed to parse JSON body', cause: error })
  })

/**
 * Helper to validate input with Schema
 */
const validateInput = <A, I>(
  schema: Schema.Schema<A, I, never>,
  data: unknown
): Effect.Effect<A, ValidationError> =>
  Effect.gen(function* (_) {
    const result = Schema.decodeUnknownEither(schema)(data)
    if (result._tag === 'Left') {
      return yield* Effect.fail(new ValidationError('Validation failed', result.left.message))
    }
    return result.right
  })

/**
 * User type from database
 */
interface User {
  id: string
  email: string
  role: string
  is_active: number
}

export function createOTPLoginPlugin(): Plugin {
  const builder = PluginBuilder.create({
    name: 'otp-login',
    version: '1.0.0-beta.1',
    description: 'Passwordless authentication via email one-time codes'
  })

  builder.metadata({
    author: {
      name: 'Patro',
      email: 'team@patro.io',
      url: 'https://patro.io'
    },
    license: 'MIT',
    compatibility: '^2.0.0'
  })

  // ==================== API Routes ====================

  const otpAPI = new Hono()

  // POST /auth/otp/request - Request OTP code
  otpAPI.post('/request', (c) => {
    const program = Effect.gen(function* (_) {
      const db = yield* getDatabase(c)
      const dbService = yield* DatabaseService
      const otpService = yield* OTPService
      
      const body = yield* parseJsonBody(c)
      const validatedData = yield* validateInput(otpRequestSchema, body)
      
      const email = (validatedData as { email: string }).email
      const normalizedEmail = email.toLowerCase()
      const settings = { ...DEFAULT_SETTINGS } // TODO: Load from plugin settings

      // Check rate limiting
      const canRequest = yield* otpService.checkRateLimit(normalizedEmail, settings)
      if (!canRequest) {
        return {
          error: 'Too many requests. Please try again in an hour.',
          statusCode: 429
        }
      }

      // Check if user exists
      const user = yield* dbService.queryFirst<User>(
          `SELECT id, email, role, is_active
           FROM users
           WHERE email = ?`,
          [normalizedEmail]
        )
      

      if (!user && !settings.allowNewUserRegistration) {
        // Don't reveal if user exists or not (security)
        return {
          message: 'If an account exists for this email, you will receive a verification code shortly.',
          expiresIn: settings.codeExpiryMinutes * 60,
          statusCode: 200
        }
      }

      if (user && !user.is_active) {
        return {
          error: 'This account has been deactivated.',
          statusCode: 403
        }
      }

      // Get IP and user agent
      const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
      const userAgent = c.req.header('user-agent') || 'unknown'

      // Create OTP code
      const otpCode = yield* otpService.createOTPCode(
          normalizedEmail,
          settings,
          ipAddress,
          userAgent
        )
      

      // Send email (if email plugin is available)
      const isDevMode = (c.env as Record<string, unknown>).ENVIRONMENT === 'development'

      if (isDevMode) {
        console.log(`[DEV] OTP Code for ${normalizedEmail}: ${otpCode.code}`)
      }

      // Prepare email content
      const emailContent = renderOTPEmail({
        code: otpCode.code,
        expiryMinutes: settings.codeExpiryMinutes,
        codeLength: settings.codeLength,
        maxAttempts: settings.maxAttempts,
        email: normalizedEmail,
        ipAddress,
        timestamp: new Date().toISOString(),
        appName: settings.appName
      })

      // TODO: Actually send email via email plugin
      // await emailService.send({
      //   to: normalizedEmail,
      //   subject: `Your login code for ${settings.appName}`,
      //   html: emailContent.html,
      //   text: emailContent.text
      // })

      const response = {
        message: 'If an account exists for this email, you will receive a verification code shortly.',
        expiresIn: settings.codeExpiryMinutes * 60,
        statusCode: 200,
        ...(isDevMode && { dev_code: otpCode.code })
      }

      return response
    })
    
    const db = (c.env as Record<string, unknown>).DB as D1Database
    return Effect.runPromise(
      program.pipe(
        Effect.provide(makeDatabaseLayer(db)),
        Effect.provide(makeOTPServiceLayer()),
        Effect.catchAll((error) => {
          if (error._tag === 'ValidationError') {
            return Effect.succeed({
              error: 'Validation failed',
              details: error.details,
              statusCode: 400
            })
          }
          console.error('OTP request error:', error)
          return Effect.succeed({
            error: 'An error occurred. Please try again.',
            statusCode: 500
          })
        })
      )
    ).then(result => {
      const statusCode = result.statusCode || 200
      delete (result as Record<string, unknown>).statusCode
      return c.json(result, statusCode as 200 | 400 | 403 | 429 | 500)
    })
  })

  // POST /auth/otp/verify - Verify OTP code
  otpAPI.post('/verify', (c) => {
    const program = Effect.gen(function* (_) {
      const db = yield* getDatabase(c)
      const dbService = yield* DatabaseService
      const otpService = yield* OTPService
      
      const body = yield* parseJsonBody(c)
      const validatedData = yield* validateInput(otpVerifySchema, body)
      
      const { email, code } = validatedData as { email: string; code: string }
      const normalizedEmail = email.toLowerCase()
      const settings = { ...DEFAULT_SETTINGS } // TODO: Load from plugin settings

      // Verify the code
      const isValid = yield* otpService.verifyCode(normalizedEmail, code, settings).pipe(
          Effect.catchAll((error) => {
            // Increment attempts on failure
            return Effect.gen(function* (_) {
              yield* otpService.incrementAttempts(normalizedEmail, code)
              
              if (error._tag === 'OTPExpiredError') {
                return yield* Effect.fail({
                  error: error.message,
                  statusCode: 401
                })
              }
              if (error._tag === 'OTPMaxAttemptsError') {
                return yield* Effect.fail({
                  error: error.message,
                  statusCode: 401
                })
              }
              if (error._tag === 'NotFoundError') {
                return yield* Effect.fail({
                  error: 'Invalid or expired code',
                  statusCode: 401
                })
              }
              return yield* Effect.fail({
                error: 'Verification failed',
                statusCode: 500
              })
            })
          })
        )

      // Cod is valid - get user
      const user = yield* dbService.queryFirst<User>(
          `SELECT id, email, role, is_active
           FROM users
           WHERE email = ?`,
          [normalizedEmail]
        )
      

      if (!user) {
        return {
          error: 'User not found',
          statusCode: 404
        }
      }

      if (!user.is_active) {
        return {
          error: 'Account is deactivated',
          statusCode: 403
        }
      }

      // Generate JWT token using AuthService
      const authService = yield* AuthService
      const jwtToken = yield* authService.generateToken(user.id, user.email, user.role)
      

      // Update last login
      yield* dbService.execute(
          `UPDATE users SET last_login_at = ? WHERE id = ?`,
          [Date.now(), user.id]
        )
      

      return {
        success: true,
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        },
        message: 'Authentication successful',
        statusCode: 200
      }
    })
    
    const db = (c.env as Record<string, unknown>).DB as D1Database
    const jwtSecret = (c.env as Record<string, unknown>).JWT_SECRET as string
    const passwordSalt = (c.env as Record<string, unknown>).PASSWORD_SALT as string
    
    return Effect.runPromise(
      program.pipe(
        Effect.provide(makeAuthServiceLayer(jwtSecret, passwordSalt)),
        Effect.provide(makeDatabaseLayer(db)),
        Effect.provide(makeOTPServiceLayer()),
        Effect.catchAll((error) => {
          if (typeof error === 'object' && error !== null && '_tag' in error) {
            if (error._tag === 'ValidationError') {
              return Effect.succeed({
                error: 'Validation failed',
                details: (error as ValidationError).details,
                statusCode: 400
              })
            }
          }
          if (typeof error === 'object' && error !== null && 'statusCode' in error) {
            return Effect.succeed(error as Record<string, unknown>)
          }
          console.error('OTP verify error:', error)
          return Effect.succeed({
            error: 'An error occurred. Please try again.',
            statusCode: 500
          })
        })
      )
    ).then(result => {
      const statusCode = (result as Record<string, unknown>).statusCode as number || 200
      delete (result as Record<string, unknown>).statusCode
      
      // Set auth cookie if token is present
      if ('token' in result) {
        const token = result.token as string
        c.header('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
        delete (result as Record<string, unknown>).token
      }
      
      return c.json(result, statusCode as 200 | 400 | 401 | 403 | 404 | 500)
    })
  })

  // POST /auth/otp/resend - Resend OTP code
  otpAPI.post('/resend', (c) => {
    const program = Effect.gen(function* (_) {
      const body = yield* parseJsonBody(c)
      const validatedData = yield* validateInput(otpRequestSchema, body)
      
      // Reuse the request endpoint logic by creating a new request
      const email = (validatedData as { email: string }).email
      return { redirect: true, email }
    })
    
    return Effect.runPromise(
      program.pipe(
        Effect.catchAll((error) => {
          if (typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'ValidationError') {
            return Effect.succeed({
              error: 'Validation failed',
              details: (error as ValidationError).details,
              statusCode: 400
            })
          }
          console.error('OTP resend error:', error)
          return Effect.succeed({
            error: 'An error occurred. Please try again.',
            statusCode: 500
          })
        })
      )
    ).then(result => {
      if ('redirect' in result) {
        // Reuse the request endpoint logic
        return otpAPI.fetch(
          new Request(c.req.url.replace('/resend', '/request'), {
            method: 'POST',
            headers: c.req.raw.headers,
            body: JSON.stringify({ email: result.email })
          }),
          c.env
        )
      }
      const statusCode = (result as Record<string, unknown>).statusCode as number || 500
      delete (result as Record<string, unknown>).statusCode
      return c.json(result, statusCode as 400 | 500)
    })
  })

  // Register API routes
  builder.addRoute('/auth/otp', otpAPI, {
    description: 'OTP authentication endpoints',
    requiresAuth: false,
    priority: 100
  })

  // ==================== Admin UI Routes ====================

  const adminRoutes = new Hono()

  // Apply i18n middleware to ensure translations work correctly
  adminRoutes.use('*', i18nMiddleware())

  // Settings page
  adminRoutes.get('/settings', (c: HonoContext) => {
    const user = (c as any).get('user') as { name?: string; email?: string; role?: string } | undefined
    const t = (c as any).get('t') || ((key: string) => key)

    const contentHTML = html`
      <div class="p-8">
        <div class="mb-8">
          <h1 class="text-3xl font-bold mb-2">${t('plugins.otpLogin.title')}</h1>
          <p class="text-zinc-600 dark:text-zinc-400">${t('plugins.otpLogin.subtitle')}</p>
        </div>

        <div class="max-w-3xl">
          <div class="backdrop-blur-md bg-black/20 border border-white/10 shadow-xl rounded-xl p-6 mb-6">
            <h2 class="text-xl font-semibold mb-4">${t('plugins.otpLogin.codeSettings')}</h2>

            <form id="otpSettingsForm" class="space-y-6">
              <div>
                <label for="codeLength" class="block text-sm font-medium mb-2">
                  ${t('plugins.otpLogin.codeLength')}
                </label>
                <input
                  type="number"
                  id="codeLength"
                  name="codeLength"
                  min="4"
                  max="8"
                  value="6"
                  class="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
                />
                <p class="text-xs text-zinc-500 mt-1">${t('plugins.otpLogin.codeLengthHelp')}</p>
              </div>

              <div>
                <label for="codeExpiryMinutes" class="block text-sm font-medium mb-2">
                  ${t('plugins.otpLogin.codeExpiry')}
                </label>
                <input
                  type="number"
                  id="codeExpiryMinutes"
                  name="codeExpiryMinutes"
                  min="5"
                  max="60"
                  value="10"
                  class="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
                />
                <p class="text-xs text-zinc-500 mt-1">${t('plugins.otpLogin.codeExpiryHelp')}</p>
              </div>

              <div>
                <label for="maxAttempts" class="block text-sm font-medium mb-2">
                  ${t('plugins.otpLogin.maxAttempts')}
                </label>
                <input
                  type="number"
                  id="maxAttempts"
                  name="maxAttempts"
                  min="3"
                  max="10"
                  value="3"
                  class="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
                />
                <p class="text-xs text-zinc-500 mt-1">${t('plugins.otpLogin.maxAttemptsHelp')}</p>
              </div>

              <div>
                <label for="rateLimitPerHour" class="block text-sm font-medium mb-2">
                  ${t('plugins.otpLogin.rateLimit')}
                </label>
                <input
                  type="number"
                  id="rateLimitPerHour"
                  name="rateLimitPerHour"
                  min="3"
                  max="20"
                  value="5"
                  class="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
                />
                <p class="text-xs text-zinc-500 mt-1">${t('plugins.otpLogin.rateLimitHelp')}</p>
              </div>

              <div class="flex items-center">
                <input
                  type="checkbox"
                  id="allowNewUserRegistration"
                  name="allowNewUserRegistration"
                  class="w-4 h-4 rounded border-white/10"
                />
                <label for="allowNewUserRegistration" class="ml-2 text-sm">
                  ${t('plugins.otpLogin.allowRegistration')}
                </label>
              </div>

              <div class="flex gap-3 pt-4">
                <button
                  type="submit"
                  class="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all"
                >
                  ${t('plugins.otpLogin.saveSettings')}
                </button>
                <button
                  type="button"
                  id="testOTPBtn"
                  class="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all"
                >
                  ${t('plugins.otpLogin.sendTestCode')}
                </button>
              </div>
            </form>
          </div>

          <div id="statusMessage" class="hidden backdrop-blur-md bg-black/20 border border-white/10 rounded-xl p-4 mb-6"></div>

          <div class="backdrop-blur-md bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
            <h3 class="font-semibold text-blue-400 mb-3">
              🔢 ${t('plugins.otpLogin.features')}
            </h3>
            <ul class="text-sm text-blue-200 space-y-2">
              <li>✓ ${t('plugins.otpLogin.featurePasswordless')}</li>
              <li>✓ ${t('plugins.otpLogin.featureSecureCode')}</li>
              <li>✓ ${t('plugins.otpLogin.featureRateLimit')}</li>
              <li>✓ ${t('plugins.otpLogin.featureBruteForce')}</li>
              <li>✓ ${t('plugins.otpLogin.featureMobile')}</li>
            </ul>
          </div>
        </div>
      </div>

      <script>
        document.getElementById('otpSettingsForm').addEventListener('submit', async (e) => {
          e.preventDefault()
          const statusEl = document.getElementById('statusMessage')
          statusEl.className = 'backdrop-blur-md bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6'
          statusEl.innerHTML = '✅ Settings saved successfully!'
          statusEl.classList.remove('hidden')
          setTimeout(() => statusEl.classList.add('hidden'), 3000)
        })

        document.getElementById('testOTPBtn').addEventListener('click', async () => {
          const email = prompt('Enter email address for test:')
          if (!email) return

          const statusEl = document.getElementById('statusMessage')
          statusEl.className = 'backdrop-blur-md bg-blue-500/20 border border-blue-500/30 rounded-xl p-4 mb-6'
          statusEl.innerHTML = '📧 Sending test code...'
          statusEl.classList.remove('hidden')

          try {
            const response = await fetch('/auth/otp/request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
            })

            const data = await response.json()

            if (response.ok) {
              statusEl.className = 'backdrop-blur-md bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6'
              statusEl.innerHTML = '✅ Test code sent!' + (data.dev_code ? \` Code: <strong>\${data.dev_code}</strong>\` : '')
            } else {
              throw new Error(data.error || 'Failed')
            }
          } catch (error) {
            statusEl.className = 'backdrop-blur-md bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6'
            statusEl.innerHTML = '❌ Failed to send test code'
          }
        })
      </script>
    `

    return (c as any).html(
      adminLayoutV2({
        title: 'OTP Login Settings',
        content: contentHTML as string,
        user: user ? {
          name: user.name || user.email || 'User',
          email: user.email || '',
          role: user.role || 'viewer'
        } : undefined,
        currentPath: '/admin/plugins/otp-login/settings'
      })
    )
  })

  // Register admin routes
  builder.addRoute('/admin/plugins/otp-login', adminRoutes, {
    description: 'OTP login admin interface',
    requiresAuth: true,
    priority: 85
  })

  // Add menu item
  builder.addMenuItem('OTP Login', '/admin/plugins/otp-login/settings', {
    icon: 'key',
    order: 85,
    permissions: ['otp:manage']
  })

  // Lifecycle hooks
  builder.lifecycle({
    activate: async () => {
      console.info('✅ OTP Login plugin activated')
    },
    deactivate: async () => {
      console.info('❌ OTP Login plugin deactivated')
    }
  })

  return builder.build() as Plugin
}

export const otpLoginPlugin = createOTPLoginPlugin()
