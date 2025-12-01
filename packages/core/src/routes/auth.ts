import type { D1Database } from '@cloudflare/workers-types'
import { Effect, Option, Schema } from 'effect'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { html } from 'hono/html'
import type { Bindings, Variables } from '../app'
import { AuthManager, requireAuth, getTranslate } from '../middleware'
import { authValidationService } from '../services/auth-validation'
import { runInBackground } from '../utils/waitUntil'
import {
  DatabaseService,
  makeDatabaseLayer,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../services/database-effect'
import { AuthService, makeAuthServiceLayer } from '../services/auth-effect'
import { SettingsService } from '../services/settings'
import { CACHE_CONFIGS, CacheService, makeCacheServiceLayer } from '../services/cache'
import { LoggerService, makeLoggerServiceLayer } from '../services/logger'
import { makeAppLayer } from '../services'
import { LoginPageData, renderLoginPage } from '../templates/pages/auth-login.template'
import { RegisterPageData, renderRegisterPage } from '../templates/pages/auth-register.template'

const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (i18nMiddleware) now applied in app.ts
// This keeps routes clean and focused on business logic

/**
 * Effect-based helper to get cached user data
 */
const getCachedUser = (
  db: D1Database,
  cacheKey: string
) =>
  Effect.gen(function* (_) {
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.user!)
    const cache = yield* CacheService
    
    const result = yield* 
      cache.get<any>(cacheKey).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup (cache)", e)),
        Effect.catchAll(() => Effect.succeed(Option.none()))
      )
    

    return result
  }).pipe(
    Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.user!))
  )

/**
 * Effect-based helper to cache user data
 */
const setCachedUser = (
  db: D1Database,
  cacheKey: string,
  userData: any
) =>
  Effect.gen(function* (_) {
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.user!)
    const cache = yield* CacheService
    
    yield* 
      cache.set(cacheKey, userData).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    
  }).pipe(
    Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.user!))
  )

/**
 * Effect-based helper to invalidate user cache
 */
const invalidateUserCache = (
  db: D1Database,
  userId: string,
  email: string
) =>
  Effect.gen(function* (_) {
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.user!)
    const cache = yield* CacheService
    
    yield* 
      cache.delete(`user:${userId}`).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    
    
    yield* 
      cache.delete(`user:email:${email.toLowerCase()}`).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    
  }).pipe(
    Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.user!))
  )

/**
 * Effect-based helper for audit logging
 */
const logAuthEvent = (
  db: D1Database,
  event: string,
  level: 'info' | 'warn' | 'error',
  data?: any,
  context?: { ipAddress?: string; userAgent?: string; url?: string }
) =>
  Effect.gen(function* (_) {
    const loggerLayer = makeLoggerServiceLayer(db)
    const logger = yield* LoggerService
    
    if (level === 'info') {
      yield* logger.info('auth', event, data, context)
    } else if (level === 'warn') {
      yield* logger.warn('auth', event, data, context)
    } else {
      yield* logger.error('auth', event, data, context)
    }
  }).pipe(
    Effect.provide(makeLoggerServiceLayer(db)),
    Effect.tapError(Effect.logDebug),
    Effect.catchAll(() => Effect.succeed(undefined))
  )

// Login page (HTML form) with Pure Effect
authRoutes.get('/login', (c) => {
  const error = c.req.query('error')
  const message = c.req.query('message')
  const t = getTranslate(c)
  
  // Check if demo login plugin is active AND load appearance settings
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService
    
    const plugin = yield* 
      dbService.queryFirst<{ id: string; status: string }>(
        'SELECT * FROM plugins WHERE id = ? AND status = ?',
        ['demo-login-prefill', 'active']
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    
    
    // Load appearance settings to get logoUrl
    const appearanceSettings = yield* 
      settingsService.getAppearanceSettings().pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({
          theme: 'dark' as const,
          primaryColor: '#465FFF',
          logoUrl: '',
          favicon: '',
          customCSS: ''
        }))
      )
    
    
    return {
      demoLoginActive: !!plugin,
      logoUrl: appearanceSettings.logoUrl || undefined
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.catchAll(() => Effect.succeed({ demoLoginActive: false, logoUrl: undefined }))
    )
  ).then(({ demoLoginActive, logoUrl }) => {
    const pageData: LoginPageData = {
      error: error || undefined,
      message: message || undefined,
      version: c.get('appVersion'),
      logoUrl
    }
    return c.html(renderLoginPage(pageData, t, demoLoginActive))
  })
})

// Registration page (HTML form)
authRoutes.get('/register', (c) => {
  const error = c.req.query('error')
  const t = getTranslate(c)
  
  const pageData: RegisterPageData = {
    error: error || undefined
  }
  
  return c.html(renderRegisterPage(pageData, t))
})

// Login schema using Effect Schema
const loginSchema = Schema.Struct({
  email: Schema.String.pipe(
    Schema.filter((s): s is string => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
      message: () => 'Valid email is required'
    })
  ),
  password: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Password is required' })
  )
})

// Register new user with Pure Effect
authRoutes.post('/register', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // Parse JSON with error handling
    const requestData = yield*
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new ValidationError('Invalid JSON in request body')
      })
    
    
    // Build and validate using dynamic schema
    const validationSchema = yield*
      Effect.succeed(authValidationService.buildRegistrationSchema())
    
    
    // Použití Schema.decodeUnknown - automaticky failuje Effect při chybě
    const validatedData = (yield*
      Schema.decodeUnknown(validationSchema as any)(requestData).pipe(
        Effect.catchTag('ParseError', (error) => {
          // Log validation error (non-blocking)
          runInBackground(c, logAuthEvent(db, 'Registration validation failed', 'warn', {
            errors: error.message
          }))
          
          return Effect.fail(new ValidationError('Validation failed', error.message))
        })
      )) as any
    
    // Extract fields with defaults for optional ones
    const email = validatedData.email
    const password = validatedData.password
    const username = validatedData.username || authValidationService.generateDefaultValue('username', validatedData)
    const firstName = validatedData.firstName || authValidationService.generateDefaultValue('firstName', validatedData)
    const lastName = validatedData.lastName || authValidationService.generateDefaultValue('lastName', validatedData)
    
    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase()
    
    // Check if user already exists
    const existingUser = yield* 
      dbService.queryFirst<{ id: string }>(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        [normalizedEmail, username]
      )
    
    
    if (existingUser) {
      // Log duplicate user attempt (non-blocking)
      runInBackground(c, logAuthEvent(db, 'Registration failed: User exists', 'warn', {
        email: normalizedEmail,
        username
      }))
      
      return {
        error: 'User with this email or username already exists',
        statusCode: 400
      }
    }
    
    // Hash password using AuthService
    const passwordHash = yield* authService.hashPassword(password)
    
    // Create user
    const userId = crypto.randomUUID()
    const now = new Date().getTime()
    
    yield* 
      dbService.execute(
        `INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, language, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, normalizedEmail, username, firstName, lastName, passwordHash, 'viewer', null, 1, now, now]
      )
    
    
    // Generate JWT token using AuthService
    const token = yield* authService.generateToken(userId, normalizedEmail, 'viewer')
    
    // Set HTTP-only cookie
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    })
    
    // Log successful registration (non-blocking)
    runInBackground(c, logAuthEvent(db, 'User registered successfully', 'info', {
      userId,
      email: normalizedEmail,
      username,
      role: 'viewer'
    }, {
      ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      userAgent: c.req.header('User-Agent'),
      url: c.req.url
    }))
    
    return {
      user: {
        id: userId,
        email: normalizedEmail,
        username,
        firstName,
        lastName,
        role: 'viewer'
      },
      token,
      statusCode: 201
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    (program as any).pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService layer
      Effect.catchAll((error) => {
        // Log error (non-blocking)
        runInBackground(c, logAuthEvent(db, 'Registration error', 'error', error))
        
        console.error('Registration error:', error)
        
        if (typeof error === 'object' && error !== null && '_tag' in error) {
          if (error._tag === 'ValidationError') {
            return Effect.succeed({
              error: (error as ValidationError).message,
              statusCode: 400
            })
          }
        }
        
        return Effect.succeed({
          error: 'Registration failed',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 500
    delete (result as any).statusCode
    return c.json(result, statusCode as 201 | 400 | 500)
  })
})

// Login user with Pure Effect
authRoutes.post('/login', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // Parse and validate request body
    const body = yield*
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new ValidationError('Failed to parse JSON')
      })
    
    
    // Použití Schema.decodeUnknown - automaticky failuje Effect při chybě
    const { email, password } = yield*
      Schema.decodeUnknown(loginSchema)(body).pipe(
        Effect.catchTag('ParseError', (error) => {
          // Log validation error (non-blocking)
          runInBackground(c, logAuthEvent(db, 'Login validation failed', 'warn', {
            errors: error.message
          }))
          
          return Effect.fail(new ValidationError('Validation failed', error.message))
        })
      )
    const normalizedEmail = email.toLowerCase()
    
    // Find user with Effect-based caching
    const cacheKey = `user:email:${normalizedEmail}`
    const cachedUserOption = yield* 
      getCachedUser(db, cacheKey).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup (cache)", e)),
        Effect.catchAll(() => Effect.succeed(Option.none()))
      )
    
    
    let user: any = null
    
    if (Option.isSome(cachedUserOption)) {
      user = cachedUserOption.value
    } else {
      user = yield* 
        dbService.queryFirst<any>(
          'SELECT * FROM users WHERE email = ? AND is_active = 1',
          [normalizedEmail]
        )
      
      
      if (user) {
        // Cache the user (non-blocking)
        runInBackground(c, setCachedUser(db, cacheKey, user).pipe(
          Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
          Effect.catchAll(() => Effect.succeed(undefined))
        ))
        
        runInBackground(c, setCachedUser(db, `user:${user.id}`, user).pipe(
          Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
          Effect.catchAll(() => Effect.succeed(undefined))
        ))
      }
    }
    
    if (!user) {
      // Log failed login (non-blocking)
      runInBackground(c, logAuthEvent(db, 'Login failed: User not found', 'warn', {
        email: normalizedEmail
      }, {
        ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
        userAgent: c.req.header('User-Agent'),
        url: c.req.url
      }))
      
      return {
        error: 'Invalid email or password',
        statusCode: 401
      }
    }
    
    // Verify password using AuthService
    const isValidPassword = yield* 
      authService.verifyPassword(password, user.password_hash).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(false))
      )
    
    
    if (!isValidPassword) {
      // Log failed login (non-blocking)
      runInBackground(c, logAuthEvent(db, 'Login failed: Invalid password', 'warn', {
        userId: user.id,
        email: normalizedEmail
      }, {
        ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
        userAgent: c.req.header('User-Agent'),
        url: c.req.url
      }))
      
      return {
        error: 'Invalid email or password',
        statusCode: 401
      }
    }
    
    // Generate JWT token using AuthService
    const token = yield* authService.generateToken(user.id, user.email, user.role)
    
    // Set HTTP-only cookie
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    })
    
    // Update last login
    yield* 
      dbService.execute(
        'UPDATE users SET last_login_at = ? WHERE id = ?',
        [new Date().getTime(), user.id]
      )
    
    
    // Invalidate user cache (non-blocking)
    runInBackground(c, invalidateUserCache(db, user.id, normalizedEmail).pipe(
      Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    ))
    
    // Log successful login (non-blocking)
    runInBackground(c, logAuthEvent(db, 'User logged in successfully', 'info', {
      userId: user.id,
      email: user.email,
      role: user.role
    }, {
      ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      userAgent: c.req.header('User-Agent'),
      url: c.req.url
    }))
    
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      },
      token,
      statusCode: 200
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService remains separate
      Effect.catchAll((error) => {
        // Log error (non-blocking)
        runInBackground(c, logAuthEvent(db, 'Login error', 'error', error))
        
        console.error('Login error:', error)
        
        // Return appropriate status code based on error type
        if (typeof error === 'object' && error !== null && '_tag' in error) {
          if (error._tag === 'ValidationError') {
            return Effect.succeed({
              error: (error as ValidationError).message,
              statusCode: 400
            })
          }
        }
        
        return Effect.succeed({
          error: 'Login failed',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 500
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 401 | 500)
  })
})

// Logout user (both GET and POST for convenience)
authRoutes.post('/logout', (c) => {
  // Clear the auth cookie
  setCookie(c, 'auth_token', '', {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'Strict',
    maxAge: 0 // Expire immediately
  })
  
  // Log logout (non-blocking)
  if (c.env?.DB) {
    const user = c.get('user')
    runInBackground(c, logAuthEvent(c.env.DB, 'User logged out', 'info', {
      userId: user?.userId
    }))
  }
  
  return c.json({ message: 'Logged out successfully' })
})

authRoutes.get('/logout', (c) => {
  // Clear the auth cookie
  setCookie(c, 'auth_token', '', {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'Strict',
    maxAge: 0 // Expire immediately
  })
  
  // Log logout (non-blocking)
  if (c.env?.DB) {
    const user = c.get('user')
    runInBackground(c, logAuthEvent(c.env.DB, 'User logged out', 'info', {
      userId: user?.userId
    }))
  }
  
  return c.redirect('/auth/login?message=You have been logged out successfully')
})

// Get current user with Pure Effect
authRoutes.get('/me', requireAuth(), (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    
    if (!user) {
      return {
        error: 'Not authenticated',
        statusCode: 401
      }
    }
    
    const dbService = yield* DatabaseService
    
    // Get user data from database
    const userData = yield* 
      dbService.queryFirst<any>(
        'SELECT id, email, username, first_name, last_name, role, created_at FROM users WHERE id = ?',
        [user.userId]
      )
    
    
    if (!userData) {
      return {
        error: 'User not found',
        statusCode: 404
      }
    }
    
    return {
      user: userData,
      statusCode: 200
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.catchAll((error) => {
        console.error('Get user error:', error)
        return Effect.succeed({
          error: 'Failed to get user',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 500
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 401 | 404 | 500)
  })
})

// Refresh token with Pure Effect
authRoutes.post('/refresh', requireAuth(), (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const user = c.get('user')
    
    if (!user) {
      return {
        error: 'Not authenticated',
        statusCode: 401
      }
    }
    
    const authService = yield* AuthService
    
    // Generate new token using AuthService
    const token = yield* authService.generateToken(user.userId, user.email, user.role)
    
    // Set new cookie
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    })
    
    // Log token refresh (non-blocking)
    runInBackground(c, logAuthEvent(db, 'Token refreshed', 'info', {
      userId: user.userId
    }))
    
    return {
      token,
      statusCode: 200
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAuthServiceLayer()),
      Effect.catchAll((error) => {
        console.error('Token refresh error:', error)
        return Effect.succeed({
          error: 'Token refresh failed',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 500
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 401 | 500)
  })
})

// Form-based registration handler (for HTML forms) with Pure Effect
authRoutes.post('/register/form', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    

    // Extract form data
    const requestData = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      username: formData.get('username') as string,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
    }

    // Normalize email to lowercase
    const normalizedEmail = requestData.email?.toLowerCase()
    requestData.email = normalizedEmail

    // Build and validate using dynamic schema
    const validationSchema = yield* 
      Effect.succeed(authValidationService.buildRegistrationSchema())
    
    
    // Použití Schema.decodeUnknown - failuje Effect při chybě
    const validatedData: any = yield*
      Schema.decodeUnknown(validationSchema as any)(requestData).pipe(
        Effect.catchTag('ParseError', (error) =>
          Effect.succeed({
            type: 'error' as const,
            message: error.message
          } as any)
        )
      )
    
    // Check if we got error response
    if (typeof validatedData === 'object' && validatedData.type === 'error') {
      return validatedData
    }

    // Extract fields with defaults for optional ones
    const password = validatedData.password
    const username = validatedData.username || authValidationService.generateDefaultValue('username', validatedData)
    const firstName = validatedData.firstName || authValidationService.generateDefaultValue('firstName', validatedData)
    const lastName = validatedData.lastName || authValidationService.generateDefaultValue('lastName', validatedData)
    
    // Check if user already exists
    const existingUser = yield* 
      dbService.queryFirst<{ id: string }>(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        [normalizedEmail, username]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    
    
    if (existingUser) {
      return {
        type: 'error' as const,
        message: 'User with this email or username already exists'
      }
    }
    
    // Hash password using AuthService
    const passwordHash = yield* authService.hashPassword(password)
    
    // Create user
    const userId = crypto.randomUUID()
    const now = Date.now()
    
    yield* 
      dbService.execute(
        `INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, language, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, normalizedEmail, username, firstName, lastName, passwordHash, 'admin', null, 1, now, now]
      )
    
    
    // Generate JWT token using AuthService
    const token = yield* authService.generateToken(userId, normalizedEmail, 'admin')
    
    // Set HTTP-only cookie
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    })
    
    // Log successful registration (non-blocking)
    runInBackground(c, logAuthEvent(db, 'User registered via form', 'info', {
      userId,
      email: normalizedEmail,
      username,
      role: 'admin'
    }))
    
    return {
      type: 'success' as const,
      userId,
      username
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    (program as any).pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService layer
      Effect.catchAll((error) => {
        console.error('Registration error:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Registration failed. Please try again.'
        })
      })
    )
  ).then((result: any) => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ${result.message}
        </div>
      `)
    }
    
    return c.html(html`
      <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        Account created successfully! Redirecting to admin dashboard...
        <script>
          setTimeout(() => {
            window.location.href = '/admin/dashboard';
          }, 2000);
        </script>
      </div>
    `)
  })
})

// Form-based login handler (for HTML forms) with Pure Effect
authRoutes.post('/login/form', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase()

    // Validate the data using Schema.decodeUnknown
    const validationResult = yield*
      Schema.decodeUnknown(loginSchema)({ email: normalizedEmail, password }).pipe(
        Effect.catchTag('ParseError', (error) =>
          Effect.fail({ type: 'error' as const, message: error.message })
        ),
        Effect.catchAll((error) => Effect.fail(error))
      )
    
    // Find user
    const user = yield* 
      dbService.queryFirst<any>(
        'SELECT * FROM users WHERE email = ? AND is_active = 1',
        [normalizedEmail]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    
    
    if (!user) {
      return {
        type: 'error' as const,
        message: 'Invalid email or password'
      }
    }
    
    // Verify password using AuthService
    const isValidPassword = yield* 
      authService.verifyPassword(password, user.password_hash).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(false))
      )
    
    
    if (!isValidPassword) {
      return {
        type: 'error' as const,
        message: 'Invalid email or password'
      }
    }
    
    // Generate JWT token using AuthService
    const token = yield* authService.generateToken(user.id, user.email, user.role)
    
    // Set HTTP-only cookie
    setCookie(c, 'auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    })
    
    // Update last login
    yield* 
      dbService.execute(
        'UPDATE users SET last_login_at = ? WHERE id = ?',
        [Date.now(), user.id]
      )
    
    
    // Log successful login (non-blocking)
    runInBackground(c, logAuthEvent(db, 'User logged in via form', 'info', {
      userId: user.id,
      email: user.email,
      role: user.role
    }))
    
    return {
      type: 'success' as const
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService remains separate
      Effect.catchAll((error) => {
        console.error('Login error:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Login failed. Please try again.'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ${result.message}
        </div>
      `)
    }
    
    return c.html(html`
      <div id="form-response">
        <div class="rounded-lg bg-green-100 dark:bg-lime-500/10 p-4 ring-1 ring-green-400 dark:ring-lime-500/20">
          <div class="flex items-start gap-x-3">
            <svg class="h-5 w-5 text-green-600 dark:text-lime-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div class="flex-1">
              <p class="text-sm font-medium text-green-700 dark:text-lime-300">Login successful! Redirecting to admin dashboard...</p>
            </div>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = '/admin/dashboard';
            }, 2000);
          </script>
        </div>
      </div>
    `)
  })
})

// Test seeding endpoint (only for development/testing) with Pure Effect
// SECURITY NOTE: This endpoint is for development only and should be disabled in production
authRoutes.post('/seed-admin', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // First ensure the users table exists
    yield*
      dbService.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL UNIQUE,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'viewer',
          avatar TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_login_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `, [])
    
    
    // Check if admin user already exists
    const existingAdmin = yield*
      dbService.queryFirst<{ id: string }>(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        ['admin@patro.io', 'admin']
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (existingAdmin) {
      return {
        message: 'Admin user already exists. Use /auth/register to create a new user.',
        user: {
          id: existingAdmin.id,
          email: 'admin@patro.io',
          username: 'admin',
          role: 'admin'
        }
      }
    }

    // Generate a random secure password (16 characters)
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(byte => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'[byte % 72])
      .join('')
    
    // Hash password using AuthService
    const passwordHash = yield* authService.hashPassword(randomPassword)
    
    // Create admin user
    const userId = crypto.randomUUID()
    const now = Date.now()
    const adminEmail = 'admin@patro.io'.toLowerCase()
    
    yield*
      dbService.execute(
        `INSERT INTO users (id, email, username, first_name, last_name, password_hash, role, language, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, adminEmail, 'admin', 'Admin', 'User', passwordHash, 'admin', null, 1, now, now]
      )
    
    
    // Log admin user creation (non-blocking)
    runInBackground(c, logAuthEvent(db, 'Admin user seeded', 'info', {
      userId,
      email: adminEmail
    }))
    
    return {
      message: 'Admin user created successfully',
      user: {
        id: userId,
        email: adminEmail,
        username: 'admin',
        role: 'admin'
      },
      password: randomPassword,
      warning: 'SAVE THIS PASSWORD! It will not be shown again.'
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService remains separate
      Effect.catchAll((error) => {
        console.error('Seed admin error:', error)
        return Effect.succeed({
          error: 'Failed to create admin user',
          details: error instanceof Error ? error.message : String(error)
        })
      })
    )
  ).then(result => {
    if ('error' in result) {
      return c.json(result, 500)
    }
    return c.json(result)
  })
})


// Accept invitation page with Pure Effect
authRoutes.get('/accept-invitation', (c) => {
  const program = Effect.gen(function* (_) {
    const token = c.req.query('token')
    
    if (!token) {
      return {
        type: 'error' as const,
        title: 'Invalid Invitation',
        message: 'The invitation link is invalid or has expired.'
      }
    }

    const dbService = yield* DatabaseService
    
    // Check if invitation token is valid
    const invitedUser = yield* 
      dbService.queryFirst<{
        id: string
        email: string
        first_name: string
        last_name: string
        role: string
        invited_at: number
      }>(
        `SELECT id, email, first_name, last_name, role, invited_at
         FROM users
         WHERE invitation_token = ? AND is_active = 0`,
        [token]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (!invitedUser) {
      return {
        type: 'error' as const,
        title: 'Invalid Invitation',
        message: 'The invitation link is invalid or has expired.'
      }
    }

    // Check if invitation is expired (7 days)
    const invitationAge = Date.now() - invitedUser.invited_at
    const maxAge = 7 * 24 * 60 * 60 * 1000
    
    if (invitationAge > maxAge) {
      return {
        type: 'expired' as const,
        title: 'Invitation Expired',
        message: 'This invitation has expired. Please contact your administrator for a new invitation.'
      }
    }

    return {
      type: 'success' as const,
      user: invitedUser,
      token
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.catchAll((error) => {
        console.error('Accept invitation page error:', error)
        return Effect.succeed({
          type: 'error' as const,
          title: 'Error',
          message: 'An error occurred while processing your invitation.'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error' || result.type === 'expired') {
      return c.html(`
        <html>
          <head><title>${result.title}</title></head>
          <body>
            <h1>${result.title}</h1>
            <p>${result.message}</p>
            <a href="/auth/login">Go to Login</a>
          </body>
        </html>
      `)
    }
    
    const { user, token } = result
    
    // Show invitation acceptance form
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Accept Invitation - PatroCMS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            min-height: 100vh;
          }
        </style>
      </head>
      <body class="bg-gray-900 text-white">
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="max-w-md w-full space-y-8">
            <div class="text-center">
              <div class="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                </svg>
              </div>
              <h2 class="text-3xl font-bold">Accept Invitation</h2>
              <p class="mt-2 text-gray-400">Complete your account setup</p>
              <p class="mt-4 text-sm">
                You've been invited as <strong>${user.first_name} ${user.last_name}</strong><br>
                <span class="text-gray-400">${user.email}</span><br>
                <span class="text-blue-400 capitalize">${user.role}</span>
              </p>
            </div>

            <form method="POST" action="/auth/accept-invitation" class="mt-8 space-y-6">
              <input type="hidden" name="token" value="${token}" />
              
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Username</label>
                <input
                  type="text"
                  name="username"
                  required
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Enter your username"
                >
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Password</label>
                <input
                  type="password"
                  name="password"
                  required
                  minlength="8"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Enter your password"
                >
                <p class="text-xs text-gray-400 mt-1">Password must be at least 8 characters long</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
                <input
                  type="password"
                  name="confirm_password"
                  required
                  minlength="8"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Confirm your password"
                >
              </div>

              <button
                type="submit"
                class="w-full py-3 px-4 bg-linear-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
              >
                Accept Invitation & Create Account
              </button>
            </form>
          </div>
        </div>
      </body>
      </html>
    `)
  })
})

// Process invitation acceptance with Pure Effect
authRoutes.post('/accept-invitation', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const token = formData.get('token')?.toString()
    const username = formData.get('username')?.toString()?.trim()
    const password = formData.get('password')?.toString()
    const confirmPassword = formData.get('confirm_password')?.toString()

    if (!token || !username || !password || !confirmPassword) {
      return { error: 'All fields are required', statusCode: 400 }
    }

    if (password !== confirmPassword) {
      return { error: 'Passwords do not match', statusCode: 400 }
    }

    if (password.length < 8) {
      return { error: 'Password must be at least 8 characters long', statusCode: 400 }
    }

    // Check if invitation token is valid
    const invitedUser = yield* 
      dbService.queryFirst<{
        id: string
        email: string
        first_name: string
        last_name: string
        role: string
        invited_at: number
      }>(
        `SELECT id, email, first_name, last_name, role, invited_at
         FROM users
         WHERE invitation_token = ? AND is_active = 0`,
        [token]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (!invitedUser) {
      return { error: 'Invalid or expired invitation', statusCode: 400 }
    }

    // Check if invitation is expired (7 days)
    const invitationAge = Date.now() - invitedUser.invited_at
    const maxAge = 7 * 24 * 60 * 60 * 1000
    
    if (invitationAge > maxAge) {
      return { error: 'Invitation has expired', statusCode: 400 }
    }

    // Check if username is available
    const existingUsername = yield* 
      dbService.queryFirst<{ id: string }>(
        `SELECT id FROM users WHERE username = ? AND id != ?`,
        [username, invitedUser.id]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (existingUsername) {
      return { error: 'Username is already taken', statusCode: 400 }
    }

    // Hash password using AuthService
    const passwordHash = yield* authService.hashPassword(password)

    // Activate user account
    yield* 
      dbService.execute(
        `UPDATE users SET
          username = ?,
          password_hash = ?,
          is_active = 1,
          email_verified = 1,
          invitation_token = NULL,
          accepted_invitation_at = ?,
          updated_at = ?
        WHERE id = ?`,
        [username, passwordHash, Date.now(), Date.now(), invitedUser.id]
      )
    

    // Generate JWT token for auto-login using AuthService
    const authToken = yield* authService.generateToken(invitedUser.id, invitedUser.email, invitedUser.role)
    
    // Set HTTP-only cookie
    setCookie(c, 'auth_token', authToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 60 * 60 * 24
    })

    // Log invitation acceptance (non-blocking)
    runInBackground(c, logAuthEvent(db, 'Invitation accepted', 'info', {
      userId: invitedUser.id,
      email: invitedUser.email,
      username,
      role: invitedUser.role
    }))

    return { redirect: '/admin/dashboard?welcome=true' }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService remains separate
      Effect.catchAll((error) => {
        console.error('Accept invitation error:', error)
        return Effect.succeed({
          error: 'Failed to accept invitation',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('redirect' in result && result.redirect) {
      return c.redirect(result.redirect)
    }
    const statusCode = (result as any).statusCode || 500
    return c.json({ error: (result as any).error }, statusCode as 400 | 500)
  })
})

// Request password reset with Pure Effect
authRoutes.post('/request-password-reset', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const email = formData.get('email')?.toString()?.trim()?.toLowerCase()

    if (!email) {
      return { error: 'Email is required', statusCode: 400 }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return { error: 'Please enter a valid email address', statusCode: 400 }
    }

    // Check if user exists and is active
    const user = yield* 
      dbService.queryFirst<{
        id: string
        email: string
        first_name: string
        last_name: string
      }>(
        `SELECT id, email, first_name, last_name FROM users
         WHERE email = ? AND is_active = 1`,
        [email]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        success: true,
        message: 'If an account with this email exists, a password reset link has been sent.',
        statusCode: 200
      }
    }

    // Generate password reset token (expires in 1 hour)
    const resetToken = crypto.randomUUID()
    const resetExpires = Date.now() + (60 * 60 * 1000)

    // Update user with reset token
    yield* 
      dbService.execute(
        `UPDATE users SET
          password_reset_token = ?,
          password_reset_expires = ?,
          updated_at = ?
        WHERE id = ?`,
        [resetToken, resetExpires, Date.now(), user.id]
      )
    

    // Log password reset request (non-blocking)
    runInBackground(c, logAuthEvent(db, 'Password reset requested', 'info', {
      userId: user.id,
      email: user.email
    }))

    // In a real implementation, you would send an email here
    const resetLink = `${c.req.header('origin') || 'http://localhost:8787'}/auth/reset-password?token=${resetToken}`

    return {
      success: true,
      message: 'If an account with this email exists, a password reset link has been sent.',
      reset_link: resetLink,
      statusCode: 200
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.catchAll((error) => {
        console.error('Password reset request error:', error)
        return Effect.succeed({
          error: 'Failed to process password reset request',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 500
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 500)
  })
})

// Show password reset form with Pure Effect
authRoutes.get('/reset-password', (c) => {
  const program = Effect.gen(function* (_) {
    const token = c.req.query('token')
    
    if (!token) {
      return {
        type: 'error' as const,
        title: 'Invalid Reset Link',
        message: 'The password reset link is invalid or has expired.'
      }
    }

    const dbService = yield* DatabaseService
    
    // Check if reset token is valid and not expired
    const user = yield* 
      dbService.queryFirst<{
        id: string
        email: string
        first_name: string
        last_name: string
        password_reset_expires: number
      }>(
        `SELECT id, email, first_name, last_name, password_reset_expires
         FROM users
         WHERE password_reset_token = ? AND is_active = 1`,
        [token]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (!user) {
      return {
        type: 'error' as const,
        title: 'Invalid Reset Link',
        message: 'The password reset link is invalid or has already been used.'
      }
    }

    // Check if token is expired
    if (Date.now() > user.password_reset_expires) {
      return {
        type: 'expired' as const,
        title: 'Reset Link Expired',
        message: 'The password reset link has expired. Please request a new one.'
      }
    }

    return {
      type: 'success' as const,
      user,
      token
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.catchAll((error) => {
        console.error('Password reset page error:', error)
        return Effect.succeed({
          type: 'error' as const,
          title: 'Error',
          message: 'An error occurred while processing your password reset.'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error' || result.type === 'expired') {
      return c.html(`
        <html>
          <head><title>${result.title}</title></head>
          <body>
            <h1>${result.title}</h1>
            <p>${result.message}</p>
            <a href="/auth/login">Go to Login</a>
          </body>
        </html>
      `)
    }
    
    const { user, token } = result
    
    // Show password reset form
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password - PatroCMS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            min-height: 100vh;
          }
        </style>
      </head>
      <body class="bg-gray-900 text-white">
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="max-w-md w-full space-y-8">
            <div class="text-center">
              <div class="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3.586l4.293-4.293A6 6 0 0119 9z"/>
                </svg>
              </div>
              <h2 class="text-3xl font-bold">Reset Password</h2>
              <p class="mt-2 text-gray-400">Choose a new password for your account</p>
              <p class="mt-4 text-sm">
                Reset password for <strong>${user.first_name} ${user.last_name}</strong><br>
                <span class="text-gray-400">${user.email}</span>
              </p>
            </div>

            <form method="POST" action="/auth/reset-password" class="mt-8 space-y-6">
              <input type="hidden" name="token" value="${token}" />
              
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">New Password</label>
                <input 
                  type="password" 
                  name="password" 
                  required
                  minlength="8"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Enter your new password"
                >
                <p class="text-xs text-gray-400 mt-1">Password must be at least 8 characters long</p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Confirm New Password</label>
                <input 
                  type="password" 
                  name="confirm_password" 
                  required
                  minlength="8"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Confirm your new password"
                >
              </div>

              <button 
                type="submit"
                class="w-full py-3 px-4 bg-linear-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
              >
                Reset Password
              </button>
            </form>

            <div class="text-center">
              <a href="/auth/login" class="text-sm text-blue-400 hover:text-blue-300">
                Back to Login
              </a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `)
  })
})

// Process password reset with Pure Effect
authRoutes.post('/reset-password', (c) => {
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const authService = yield* AuthService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const token = formData.get('token')?.toString()
    const password = formData.get('password')?.toString()
    const confirmPassword = formData.get('confirm_password')?.toString()

    if (!token || !password || !confirmPassword) {
      return { error: 'All fields are required', statusCode: 400 }
    }

    if (password !== confirmPassword) {
      return { error: 'Passwords do not match', statusCode: 400 }
    }

    if (password.length < 8) {
      return { error: 'Password must be at least 8 characters long', statusCode: 400 }
    }

    // Check if reset token is valid and not expired
    const user = yield* 
      dbService.queryFirst<{
        id: string
        email: string
        password_hash: string
        password_reset_expires: number
      }>(
        `SELECT id, email, password_hash, password_reset_expires
         FROM users
         WHERE password_reset_token = ? AND is_active = 1`,
        [token]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (!user) {
      return { error: 'Invalid or expired reset token', statusCode: 400 }
    }

    // Check if token is expired
    if (Date.now() > user.password_reset_expires) {
      return { error: 'Reset token has expired', statusCode: 400 }
    }

    // Hash new password using AuthService
    const newPasswordHash = yield* authService.hashPassword(password)

    // Store old password in history (skip if table doesn't exist)
    yield* 
      dbService.execute(
        `INSERT INTO password_history (id, user_id, password_hash, created_at)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), user.id, user.password_hash, Date.now()]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll((error) => {
          console.warn('Could not store password history:', error)
          return Effect.succeed(undefined)
        })
      )
    

    // Update user password and clear reset token
    yield* 
      dbService.execute(
        `UPDATE users SET
          password_hash = ?,
          password_reset_token = NULL,
          password_reset_expires = NULL,
          updated_at = ?
        WHERE id = ?`,
        [newPasswordHash, Date.now(), user.id]
      )
    

    // Log password reset (non-blocking)
    runInBackground(c, logAuthEvent(db, 'Password reset completed', 'info', {
      userId: user.id,
      email: user.email
    }))

    return { redirect: '/auth/login?message=Password reset successfully. Please log in with your new password.' }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer for DB-dependent services
      Effect.provide(makeAuthServiceLayer()), // AuthService remains separate
      Effect.catchAll((error) => {
        console.error('Password reset error:', error)
        return Effect.succeed({
          error: 'Failed to reset password',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('redirect' in result && result.redirect) {
      return c.redirect(result.redirect)
    }
    const statusCode = (result as any).statusCode || 500
    return c.json({ error: (result as any).error }, statusCode as 400 | 500)
  })
})

export default authRoutes