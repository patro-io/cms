/**
 * Auth Service - Pure Effect Implementation
 * Handles JWT token generation/verification and password hashing
 */

import { Config, Context, Data, Effect, Layer, Redacted } from 'effect'
import { sign, verify } from 'hono/jwt'
import { JwtConfig } from '../config/app-config.js'

/**
 * JWT Payload type
 */
export interface JWTPayload {
  userId: string
  email: string
  role: string
  exp: number
  iat: number
  [key: string]: unknown
}

/**
 * Auth Service Error types (using Data.TaggedError)
 */
export class AuthError extends Data.TaggedError("AuthError")<{
  message: string
  cause?: unknown
}> {}

export class TokenExpiredError extends Data.TaggedError("TokenExpiredError")<{
  message: string
}> {
  constructor(message: string = 'Token has expired') {
    super({ message })
  }
}

export class TokenInvalidError extends Data.TaggedError("TokenInvalidError")<{
  message: string
}> {
  constructor(message: string = 'Token is invalid') {
    super({ message })
  }
}

export class PasswordMismatchError extends Data.TaggedError("PasswordMismatchError")<{
  message: string
}> {
  constructor(message: string = 'Password does not match') {
    super({ message })
  }
}

/**
 * Auth Service Interface
 */
// Interface je nyní implicitně definován Effect.Service třídou níže
// Export type pro backwards compatibility
export type AuthServiceInterface = {
  readonly generateToken: (
    userId: string,
    email: string,
    role: string,
    expiryHours?: number
  ) => Effect.Effect<string, AuthError>

  readonly verifyToken: (
    token: string
  ) => Effect.Effect<JWTPayload, TokenExpiredError | TokenInvalidError>

  readonly hashPassword: (
    password: string,
    salt?: string
  ) => Effect.Effect<string, AuthError>

  readonly verifyPassword: (
    password: string,
    hash: string,
    salt?: string
  ) => Effect.Effect<boolean, AuthError | PasswordMismatchError>
}

/**
 * Auth Service Tag for dependency injection
 */
export const AuthService = Context.GenericTag<AuthServiceInterface>('@services/AuthService')

/**
 * Helper for hashing (Internal)
 */
const hashHelper = (password: string, salt: string): Effect.Effect<string, AuthError> =>
  Effect.tryPromise({
    try: async () => {
      const encoder = new TextEncoder()
      const data = encoder.encode(password + salt)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    },
    catch: (error) => new AuthError({ message: 'Failed to hash password', cause: error })
  })

/**
 * Auth Service Live Implementation
 *
 * Používá Effect.Config pro type-safe konfiguraci JWT
 */
export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    // Získáme JWT config z Environment
    const config = yield* JwtConfig
    
    // Rozbalíme Redacted hodnoty pro použití
    const jwtSecret = Redacted.value(config.secret)
    const passwordSalt = Redacted.value(config.passwordSalt)
    const defaultExpiryHours = config.expiresInHours

    return {
      generateToken: (userId, email, role, expiryHours = defaultExpiryHours) =>
        Effect.gen(function* () {
          const payload = {
            userId,
            email,
            role,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * expiryHours),
            iat: Math.floor(Date.now() / 1000)
          }

          return yield* Effect.tryPromise({
            try: () => sign(payload, jwtSecret),
            catch: (error) => new AuthError({ message: 'Failed to generate token', cause: error })
          })
        }),

      verifyToken: (token) =>
        Effect.gen(function* () {
          const payload = yield* Effect.tryPromise({
            try: () => verify(token, jwtSecret),
            catch: () => new TokenInvalidError()
          })

          // Cast payload safely
          const typedPayload = payload as unknown as JWTPayload

          // Check if token is expired
          if (typedPayload.exp < Math.floor(Date.now() / 1000)) {
            return yield* Effect.fail(new TokenExpiredError())
          }

          return typedPayload
        }),

      hashPassword: (password, salt = passwordSalt) =>
        hashHelper(password, salt),

      verifyPassword: (password, hash, salt = passwordSalt) =>
        Effect.gen(function* () {
          const calculatedHash = yield* hashHelper(password, salt)
          
          if (calculatedHash !== hash) {
            return yield* Effect.fail(new PasswordMismatchError())
          }

          return true
        })
    }
  })
)

/**
 * Convenience function pro vytvoření AuthService layer s výchozími hodnotami
 *
 * @deprecated Používejte AuthServiceLive přímo s ConfigProvider
 */
export const makeAuthServiceLayer = () => AuthServiceLive