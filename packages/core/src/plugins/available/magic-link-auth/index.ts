/**
 * Magic Link Authentication Plugin
 *
 * Provides passwordless authentication via email magic links
 * Users receive a secure one-time link to sign in without passwords
 */

import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import type { Plugin, PluginContext } from '../../types'
import type { D1Database } from '@cloudflare/workers-types'
import {
  AuthService,
  AuthServiceLive
} from '../../../services/auth-effect'
import { makeAppConfigLayer } from '../../../config/config-provider.js'
import {
  DatabaseService,
  makeDatabaseLayer,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../services/database-effect'
import type { Context as HonoContext } from 'hono'

/**
 * Validation schema for magic link request
 */
const magicLinkRequestSchema = Schema.Struct({
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: () => 'Valid email is required'
    })
  )
})

/**
 * User type from database
 */
interface User {
  id: string
  email: string
  role: string
  is_active: number
  username?: string
  first_name?: string
  last_name?: string
}

/**
 * Magic link type from database
 */
interface MagicLink {
  id: string
  user_email: string
  token: string
  expires_at: number
  used: number
  used_at: number | null
  created_at: number
  ip_address: string | null
  user_agent: string | null
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

export function createMagicLinkAuthPlugin(): Plugin {
  const magicLinkRoutes = new Hono()

  // Request a magic link
  magicLinkRoutes.post('/request', (c) => {
    const program = Effect.gen(function* (_) {
      const db = yield* getDatabase(c)
      const dbService = yield* DatabaseService

      const body = yield* parseJsonBody(c)
      const validatedData = yield* validateInput(magicLinkRequestSchema, body)

      const email = (validatedData as { email: string }).email
      const normalizedEmail = email.toLowerCase()

      // Check rate limiting
      const oneHourAgo = Date.now() - (60 * 60 * 1000)
      const recentLinks = yield* 
        dbService.queryFirst<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM magic_links
           WHERE user_email = ? AND created_at > ?`,
          [normalizedEmail, oneHourAgo]
        )
      

      const rateLimitPerHour = 5 // TODO: Get from plugin settings
      if (recentLinks && recentLinks.count >= rateLimitPerHour) {
        return {
          error: 'Too many requests. Please try again later.',
          statusCode: 429
        }
      }

      // Check if user exists
      const user = yield* 
        dbService.queryFirst<User>(
          `SELECT id, email, role, is_active
           FROM users
           WHERE email = ?`,
          [normalizedEmail]
        )
      

      const allowNewUsers = false // TODO: Get from plugin settings

      if (!user && !allowNewUsers) {
        // Don't reveal if user exists or not for security
        return {
          message: 'If an account exists for this email, you will receive a magic link shortly.',
          statusCode: 200
        }
      }

      if (user && !user.is_active) {
        return {
          error: 'This account has been deactivated.',
          statusCode: 403
        }
      }

      // Generate secure token
      const token = crypto.randomUUID() + '-' + crypto.randomUUID()
      const tokenId = crypto.randomUUID()
      const linkExpiryMinutes = 15 // TODO: Get from plugin settings
      const expiresAt = Date.now() + (linkExpiryMinutes * 60 * 1000)

      // Store magic link
      yield* 
        dbService.execute(
          `INSERT INTO magic_links (
            id, user_email, token, expires_at, used, created_at, ip_address, user_agent
          ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            tokenId,
            normalizedEmail,
            token,
            expiresAt,
            Date.now(),
            c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown',
            c.req.header('user-agent') || 'unknown'
          ]
        )
      

      // Generate magic link URL
      const baseUrl = new URL(c.req.url).origin
      const magicLink = `${baseUrl}/auth/magic-link/verify?token=${token}`

      // Send email via email plugin
      // TODO: Integrate with email plugin
      const isDevMode = (c.env as Record<string, unknown>).ENVIRONMENT === 'development'
      
      if (isDevMode) {
        console.log(`Magic link for ${normalizedEmail}: ${magicLink}`)
      }

      return {
        message: 'If an account exists for this email, you will receive a magic link shortly.',
        statusCode: 200,
        ...(isDevMode && { dev_link: magicLink })
      }
    })

    const db = (c.env as Record<string, unknown>).DB as D1Database
    return Effect.runPromise(
      program.pipe(
        Effect.provide(makeDatabaseLayer(db)),
        Effect.catchAll((error) => {
          if (typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'ValidationError') {
            return Effect.succeed({
              error: 'Validation failed',
              details: (error as ValidationError).details,
              statusCode: 400
            })
          }
          console.error('Magic link request error:', error)
          return Effect.succeed({
            error: 'Failed to process request',
            statusCode: 500
          })
        })
      )
    ).then(result => {
      const statusCode = (result as Record<string, unknown>).statusCode as number || 200
      delete (result as Record<string, unknown>).statusCode
      return c.json(result, statusCode as 200 | 400 | 403 | 429 | 500)
    })
  })

  // Verify magic link and sign in
  magicLinkRoutes.get('/verify', (c) => {
    const program = Effect.gen(function* (_) {
      const token = c.req.query('token')

      if (!token) {
        return {
          redirect: '/auth/login?error=Invalid magic link'
        }
      }

      const db = yield* getDatabase(c)
      const dbService = yield* DatabaseService

      // Find magic link
      const magicLink = yield* 
        dbService.queryFirst<MagicLink>(
          `SELECT * FROM magic_links
           WHERE token = ? AND used = 0`,
          [token]
        )
      

      if (!magicLink) {
        return {
          redirect: '/auth/login?error=Invalid or expired magic link'
        }
      }

      // Check expiration
      if (magicLink.expires_at < Date.now()) {
        return {
          redirect: '/auth/login?error=This magic link has expired'
        }
      }

      // Get or create user
      let user = yield* 
        dbService.queryFirst<User>(
          `SELECT * FROM users WHERE email = ? AND is_active = 1`,
          [magicLink.user_email]
        )
      

      const allowNewUsers = false // TODO: Get from plugin settings

      if (!user && allowNewUsers) {
        // Create new user
        const userId = crypto.randomUUID()
        const username = magicLink.user_email.split('@')[0]
        const now = Date.now()

        user = yield* 
          dbService.insert<User>(
            `INSERT INTO users (
              id, email, username, first_name, last_name,
              password_hash, role, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, 'viewer', 1, ?, ?)
            RETURNING *`,
            [userId, magicLink.user_email, username, username, '', now, now]
          )
        
      } else if (!user) {
        return {
          redirect: '/auth/login?error=No account found for this email'
        }
      }

      // Mark magic link as used
      yield* 
        dbService.execute(
          `UPDATE magic_links
           SET used = 1, used_at = ?
           WHERE id = ?`,
          [Date.now(), magicLink.id]
        )
      

      // Generate JWT token using AuthService
      const authService = yield* AuthService
      const jwtToken = yield* 
        authService.generateToken(user.id, user.email, user.role)
      

      // Update last login
      yield* 
        dbService.execute(
          `UPDATE users SET last_login_at = ? WHERE id = ?`,
          [Date.now(), user.id]
        )
      

      return {
        redirect: '/admin/dashboard?message=Successfully signed in',
        token: jwtToken
      }
    })

    const db = (c.env as Record<string, unknown>).DB as D1Database
    const configLayer = makeAppConfigLayer(c.env as any)
    const authLayer = AuthServiceLive
    
    return Effect.runPromise(
      program.pipe(
        Effect.provide(authLayer),
        Effect.provide(configLayer),
        Effect.provide(makeDatabaseLayer(db)),
        Effect.catchAll((error) => {
          console.error('Magic link verification error:', error)
          return Effect.succeed({
            redirect: '/auth/login?error=Authentication failed'
          })
        })
      )
    ).then(result => {
      if ('token' in result) {
        // Set auth cookie
        const token = result.token as string
        c.header('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
      }
      return c.redirect((result as { redirect: string }).redirect)
    })
  })

  return {
    name: 'magic-link-auth',
    version: '1.0.0',
    description: 'Passwordless authentication via email magic links',
    author: {
      name: 'Patro',
      email: 'team@patro.io',
      url: 'https://patro.io'
    },
    dependencies: ['email'],

    routes: [{
      path: '/auth/magic-link',
      handler: magicLinkRoutes,
      description: 'Magic link authentication endpoints',
      requiresAuth: false
    }],

    async install(context: PluginContext) {
      console.log('Installing magic-link-auth plugin...')
      // Migration is handled by plugin system
    },

    async activate(context: PluginContext) {
      console.log('Magic link authentication activated')
      console.log('Users can now sign in via /auth/magic-link/request')
    },

    async deactivate(context: PluginContext) {
      console.log('Magic link authentication deactivated')
    },

    async uninstall(context: PluginContext) {
      console.log('Uninstalling magic-link-auth plugin...')
      // Optionally clean up magic_links table
      // await context.db.prepare('DROP TABLE IF EXISTS magic_links').run()
    }
  }
}

export default createMagicLinkAuthPlugin()
