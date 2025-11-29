import type { D1Database } from '@cloudflare/workers-types'
import { Effect, Layer, Option } from 'effect'
import { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { CACHE_CONFIGS, CacheService, makeCacheServiceLayer } from '../services/cache'
import { LoggerService, makeLoggerServiceLayer } from '../services/logger'
import { AuthService, makeAuthServiceLayer, type JWTPayload } from '../services/auth-effect'

// JWT secret - in production this should come from environment variables
const JWT_SECRET = 'your-super-secret-jwt-key-change-in-production'
const PASSWORD_SALT = 'salt-change-in-production'

/**
 * AuthManager - Compatibility wrapper that uses AuthService internally
 * This maintains backward compatibility while using the new Effect-based AuthService
 */
export class AuthManager {
  static async generateToken(userId: string, email: string, role: string): Promise<string> {
    const authLayer = makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT)
    const program = Effect.gen(function* (_) {
      const auth = yield* AuthService
      return yield* auth.generateToken(userId, email, role)
    })
    
    return await Effect.runPromise(
      program.pipe(Effect.provide(authLayer))
    )
  }

  static async verifyToken(token: string): Promise<JWTPayload | null> {
    const authLayer = makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT)
    const program = Effect.gen(function* (_) {
      const auth = yield* AuthService
      return yield* auth.verifyToken(token)
    })
    
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(authLayer),
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    )
    
    return result
  }

  static async hashPassword(password: string): Promise<string> {
    const authLayer = makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT)
    const program = Effect.gen(function* (_) {
      const auth = yield* AuthService
      return yield* auth.hashPassword(password)
    })
    
    return await Effect.runPromise(
      program.pipe(Effect.provide(authLayer))
    )
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const authLayer = makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT)
    const program = Effect.gen(function* (_) {
      const auth = yield* AuthService
      return yield* auth.verifyPassword(password, hash)
    })
    
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(authLayer),
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(false))
      )
    )
    
    return result
  }

  /**
   * Set authentication cookie - useful for plugins implementing alternative auth methods
   * @param c - Hono context
   * @param token - JWT token to set in cookie
   * @param options - Optional cookie configuration
   */
  static setAuthCookie(c: Context, token: string, options?: {
    maxAge?: number
    secure?: boolean
    httpOnly?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }): void {
    setCookie(c, 'auth_token', token, {
      httpOnly: options?.httpOnly ?? true,
      secure: options?.secure ?? true,
      sameSite: options?.sameSite ?? 'Strict',
      maxAge: options?.maxAge ?? (60 * 60 * 24) // 24 hours default
    })
  }
}

// Middleware to require authentication (Pure Effect)
export const requireAuth = () => {
  return async (c: Context, next: Next) => {
    // Context for logging
    const requestContext = {
      ipAddress: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      userAgent: c.req.header('User-Agent'),
      url: c.req.url,
      method: c.req.method
    }

    const program = Effect.gen(function* (_) {
      // 1. Get Token
      let token = c.req.header('Authorization')?.replace('Bearer ', '')
      if (!token) {
        token = getCookie(c, 'auth_token')
      }

      if (!token) {
        // Log missing token
        const logger = yield* LoggerService
        yield* logger.warn('auth', 'Authentication attempt without token', { event: 'token_missing' }, requestContext)
        
        // Handle redirect or JSON
        const acceptHeader = c.req.header('Accept') || ''
        if (acceptHeader.includes('text/html')) {
          return c.redirect('/auth/login?error=Please login to access the admin area')
        }
        return c.json({ error: 'Authentication required' }, 401)
      }

      // 2. Verify Token (Cache -> Verify -> Cache)
      const cache = yield* CacheService
      const auth = yield* AuthService
      const logger = yield* LoggerService
      const cacheKey = `auth:${token.substring(0, 20)}`

      // Try cache
      const cachedPayload = yield* 
        cache.get<JWTPayload>(cacheKey).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(Option.none()))
        )
      

      let payload: JWTPayload | null = null

      if (Option.isSome(cachedPayload)) {
        payload = cachedPayload.value
      } else {
        // Verify token
        payload = yield* 
          auth.verifyToken(token).pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
            Effect.catchAll(() => Effect.succeed(null))
          )
        

        // Cache if valid
        if (payload) {
          yield* 
             cache.set(cacheKey, payload, 300).pipe(
                Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
                Effect.catchAll(() => Effect.succeed(undefined))
             )
          
        }
      }

      if (!payload) {
        yield* logger.warn('auth', 'Invalid or expired token', {
            event: 'token_invalid',
            tokenPrefix: token.substring(0, 10)
        }, requestContext)

        const acceptHeader = c.req.header('Accept') || ''
        if (acceptHeader.includes('text/html')) {
          return c.redirect('/auth/login?error=Your session has expired, please login again')
        }
        return c.json({ error: 'Invalid or expired token' }, 401)
      }

      // 3. Success
      yield* logger.info('auth', 'Token verified successfully', {
        event: 'token_verified',
        userId: payload.userId,
        email: payload.email,
        role: payload.role
      }, requestContext)

      c.set('user', payload)

      // Continue middleware chain
      return yield* Effect.tryPromise({
        try: () => next(),
        catch: (error) => new Error(`Middleware chain failed: ${error}`)
      })
    })

    // Construct layers
    const authLayer = makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT)
    const loggerLayer = c.env?.DB ? makeLoggerServiceLayer(c.env.DB as D1Database) : Layer.die("No DB")
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.user)

    // Run program
    return Effect.runPromise(
      program.pipe(
        Effect.provide(authLayer),
        Effect.provide(loggerLayer),
        Effect.provide(cacheLayer),
        Effect.catchAll((error) => {
           console.error('Auth middleware error:', error)
           const acceptHeader = c.req.header('Accept') || ''
           if (acceptHeader.includes('text/html')) {
             return Effect.succeed(c.redirect('/auth/login?error=Authentication failed, please login again')) as unknown as Effect.Effect<Response, never, never>
           }
           return Effect.succeed(c.json({ error: 'Authentication failed' }, 401)) as unknown as Effect.Effect<Response, never, never>
        })
      )
    )
  }
}


// Middleware to require specific role
export const requireRole = (requiredRole: string | string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload
    
    if (!user) {
      // Check if this is a browser request (HTML accept header)
      const acceptHeader = c.req.header('Accept') || ''
      if (acceptHeader.includes('text/html')) {
        return c.redirect('/auth/login?error=Please login to access the admin area')
      }
      return c.json({ error: 'Authentication required' }, 401)
    }
    
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    
    if (!roles.includes(user.role)) {
      // Check if this is a browser request (HTML accept header)
      const acceptHeader = c.req.header('Accept') || ''
      if (acceptHeader.includes('text/html')) {
        return c.redirect('/auth/login?error=You do not have permission to access this area')
      }
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    
    return await next()
  }
}

// Optional auth middleware (Pure Effect)
export const optionalAuth = () => {
  return async (c: Context, next: Next) => {
    const program = Effect.gen(function* (_) {
      let token = c.req.header('Authorization')?.replace('Bearer ', '')
      
      if (!token) {
        token = getCookie(c, 'auth_token')
      }
      
      if (token) {
        const auth = yield* AuthService
        const payload = yield* 
            auth.verifyToken(token).pipe(
                Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
                Effect.catchAll(() => Effect.succeed(null))
            )
        

        if (payload) {
          c.set('user', payload)
        }
      }
      
      return yield* Effect.tryPromise({
        try: () => next(),
        catch: (error) => new Error(`Middleware chain failed: ${error}`)
      })
    })

    const authLayer = makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT)

    return Effect.runPromise(
        program.pipe(
            Effect.provide(authLayer),
            Effect.catchAll((error) => {
                console.error('Optional auth error:', error)
                return Effect.tryPromise({
                  try: () => next(),
                  catch: (e) => new Error(`Middleware chain failed: ${e}`)
                })
            })
        )
    )
  }
}