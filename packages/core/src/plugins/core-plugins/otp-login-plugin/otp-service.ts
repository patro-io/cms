/**
 * OTP Service - Pure Effect Implementation
 * Handles OTP code generation, verification, and management
 */

import { Context, Effect, Layer } from 'effect'
import { DatabaseService, DatabaseError, NotFoundError } from '../../../services/database-effect'

export interface OTPSettings {
  codeLength: number
  codeExpiryMinutes: number
  maxAttempts: number
  rateLimitPerHour: number
  allowNewUserRegistration: boolean
  appName: string
}

export interface OTPCode {
  id: string
  user_email: string
  code: string
  expires_at: number
  used: number
  used_at: number | null
  ip_address: string | null
  user_agent: string | null
  attempts: number
  created_at: number
}

export interface OTPStats {
  total: number
  successful: number
  failed: number
  expired: number
}

/**
 * OTP Service Error types
 */
export class OTPError {
  readonly _tag = 'OTPError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

export class OTPExpiredError {
  readonly _tag = 'OTPExpiredError'
  constructor(readonly message: string = 'Code has expired') {}
}

export class OTPMaxAttemptsError {
  readonly _tag = 'OTPMaxAttemptsError'
  constructor(readonly message: string = 'Maximum attempts exceeded') {}
}

export class OTPRateLimitError {
  readonly _tag = 'OTPRateLimitError'
  constructor(readonly message: string = 'Rate limit exceeded') {}
}

/**
 * OTP Service Interface
 */
export interface OTPService {
  /**
   * Generate a secure random OTP code
   */
  readonly generateCode: (length: number) => string

  /**
   * Create and store a new OTP code
   */
  readonly createOTPCode: (
    email: string,
    settings: OTPSettings,
    ipAddress?: string,
    userAgent?: string
  ) => Effect.Effect<OTPCode, DatabaseError, DatabaseService | OTPService>

  /**
   * Verify an OTP code
   */
  readonly verifyCode: (
    email: string,
    code: string,
    settings: OTPSettings
  ) => Effect.Effect<boolean, DatabaseError | OTPExpiredError | OTPMaxAttemptsError | NotFoundError, DatabaseService>

  /**
   * Increment failed attempt count
   */
  readonly incrementAttempts: (
    email: string,
    code: string
  ) => Effect.Effect<number, DatabaseError, DatabaseService>

  /**
   * Check rate limiting
   */
  readonly checkRateLimit: (
    email: string,
    settings: OTPSettings
  ) => Effect.Effect<boolean, DatabaseError, DatabaseService>

  /**
   * Get recent OTP requests for activity log
   */
  readonly getRecentRequests: (
    limit: number
  ) => Effect.Effect<OTPCode[], DatabaseError, DatabaseService>

  /**
   * Clean up expired codes (for maintenance)
   */
  readonly cleanupExpiredCodes: () => Effect.Effect<number, DatabaseError, DatabaseService>

  /**
   * Get OTP statistics
   */
  readonly getStats: (
    days: number
  ) => Effect.Effect<OTPStats, DatabaseError, DatabaseService>
}

/**
 * OTP Service Tag for dependency injection
 */
export const OTPService = Context.GenericTag<OTPService>('@services/OTPService')

/**
 * Create an OTP Service implementation
 */
export const makeOTPService = (): OTPService => ({
  generateCode: (length: number = 6): string => {
    const digits = '0123456789'
    let code = ''

    for (let i = 0; i < length; i++) {
      const randomValues = new Uint8Array(1)
      crypto.getRandomValues(randomValues)
      const value = randomValues[0]
      if (value !== undefined) {
        code += digits[value % digits.length]
      }
    }

    return code
  },

  createOTPCode: (
    email: string,
    settings: OTPSettings,
    ipAddress?: string,
    userAgent?: string
  ) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const otpService = yield* OTPService

      const code = otpService.generateCode(settings.codeLength)
      const id = crypto.randomUUID()
      const now = Date.now()
      const expiresAt = now + (settings.codeExpiryMinutes * 60 * 1000)

      const otpCode: OTPCode = {
        id,
        user_email: email.toLowerCase(),
        code,
        expires_at: expiresAt,
        used: 0,
        used_at: null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        attempts: 0,
        created_at: now
      }

      yield* 
        dbService.execute(
          `INSERT INTO otp_codes (
            id, user_email, code, expires_at, used, used_at,
            ip_address, user_agent, attempts, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            otpCode.id,
            otpCode.user_email,
            otpCode.code,
            otpCode.expires_at,
            otpCode.used,
            otpCode.used_at,
            otpCode.ip_address,
            otpCode.user_agent,
            otpCode.attempts,
            otpCode.created_at
          ]
        )
      

      return otpCode
    }),

  verifyCode: (email: string, code: string, settings: OTPSettings) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const normalizedEmail = email.toLowerCase()
      const now = Date.now()

      // Find the most recent unused code for this email
      const otpCode = yield* 
        dbService.queryFirst<OTPCode>(
          `SELECT * FROM otp_codes
           WHERE user_email = ? AND code = ? AND used = 0
           ORDER BY created_at DESC
           LIMIT 1`,
          [normalizedEmail, code]
        )
      

      if (!otpCode) {
        return yield* Effect.fail(new NotFoundError('Invalid or expired code'))
      }

      // Check if expired
      if (now > otpCode.expires_at) {
        return yield* Effect.fail(new OTPExpiredError())
      }

      // Check attempts
      if (otpCode.attempts >= settings.maxAttempts) {
        return yield* Effect.fail(new OTPMaxAttemptsError())
      }

      // Code is valid - mark as used
      yield* 
        dbService.execute(
          `UPDATE otp_codes
           SET used = 1, used_at = ?, attempts = attempts + 1
           WHERE id = ?`,
          [now, otpCode.id]
        )
      

      return true
    }),

  incrementAttempts: (email: string, code: string) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const normalizedEmail = email.toLowerCase()

      const result = yield* 
        dbService.queryFirst<{ attempts: number }>(
          `UPDATE otp_codes
           SET attempts = attempts + 1
           WHERE user_email = ? AND code = ? AND used = 0
           RETURNING attempts`,
          [normalizedEmail, code]
        )
      

      return result?.attempts || 0
    }),

  checkRateLimit: (email: string, settings: OTPSettings) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const normalizedEmail = email.toLowerCase()
      const oneHourAgo = Date.now() - (60 * 60 * 1000)

      const result = yield* 
        dbService.queryFirst<{ count: number }>(
          `SELECT COUNT(*) as count
           FROM otp_codes
           WHERE user_email = ? AND created_at > ?`,
          [normalizedEmail, oneHourAgo]
        )
      

      const count = result?.count || 0
      return count < settings.rateLimitPerHour
    }),

  getRecentRequests: (limit: number = 50) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService

      const results = yield* 
        dbService.query<OTPCode>(
          `SELECT * FROM otp_codes
           ORDER BY created_at DESC
           LIMIT ?`,
          [limit]
        )
      

      return results
    }),

  cleanupExpiredCodes: () =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const now = Date.now()
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)

      const result = yield* 
        dbService.execute(
          `DELETE FROM otp_codes
           WHERE expires_at < ? OR (used = 1 AND used_at < ?)`,
          [now, thirtyDaysAgo]
        )
      

      return result.changes
    }),

  getStats: (days: number = 7) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const since = Date.now() - (days * 24 * 60 * 60 * 1000)
      const now = Date.now()

      const stats = yield* 
        dbService.queryFirst<{
          total: number
          successful: number
          failed: number
          expired: number
        }>(
          `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN attempts >= 3 AND used = 0 THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN expires_at < ? AND used = 0 THEN 1 ELSE 0 END) as expired
           FROM otp_codes
           WHERE created_at > ?`,
          [now, since]
        )
      

      return {
        total: stats?.total || 0,
        successful: stats?.successful || 0,
        failed: stats?.failed || 0,
        expired: stats?.expired || 0
      }
    })
})

/**
 * Create a Layer for providing OTPService
 */
export const makeOTPServiceLayer = (): Layer.Layer<OTPService> =>
  Layer.succeed(OTPService, makeOTPService())
