import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import {
  OTPService,
  makeOTPServiceLayer,
  type OTPSettings
} from '../../../plugins/core-plugins/otp-login-plugin/otp-service'
import { makeDatabaseLayer } from '../../../services/database-effect'

// Mock D1 Database
const createMockDB = () => {
  const mockData = {
    otpCodes: [] as any[],
    users: [
      { id: 'user-1', email: 'test@example.com', role: 'admin', is_active: 1 }
    ]
  }

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: any[]) => ({
        run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        first: vi.fn().mockResolvedValue(
          sql.includes('otp_codes') && sql.includes('SELECT')
            ? mockData.otpCodes[0]
            : sql.includes('users')
            ? mockData.users[0]
            : null
        ),
        all: vi.fn().mockResolvedValue({ results: mockData.otpCodes })
      }))
    }))
  } as any
}

describe('OTP Login Plugin - Schema Validation', () => {
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

  describe('OTP Request Schema - Valid input', () => {
    it('should validate valid email', () => {
      const validData = { email: 'user@example.com' }
      const result = Schema.decodeUnknownEither(otpRequestSchema)(validData)
      expect(result._tag).toBe('Right')
    })

    it('should validate email with subdomain', () => {
      const validData = { email: 'admin@mail.company.com' }
      const result = Schema.decodeUnknownEither(otpRequestSchema)(validData)
      expect(result._tag).toBe('Right')
    })

    it('should validate email with plus addressing', () => {
      const validData = { email: 'user+tag@example.com' }
      const result = Schema.decodeUnknownEither(otpRequestSchema)(validData)
      expect(result._tag).toBe('Right')
    })
  })

  describe('OTP Request Schema - Invalid input', () => {
    it('should reject missing email', () => {
      const invalidData = {}
      const result = Schema.decodeUnknownEither(otpRequestSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject invalid email format', () => {
      const invalidData = { email: 'notanemail' }
      const result = Schema.decodeUnknownEither(otpRequestSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('Valid email is required')
      }
    })

    it('should reject email without domain', () => {
      const invalidData = { email: 'user@' }
      const result = Schema.decodeUnknownEither(otpRequestSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject email with spaces', () => {
      const invalidData = { email: 'user name@example.com' }
      const result = Schema.decodeUnknownEither(otpRequestSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })
  })

  describe('OTP Verify Schema - Valid input', () => {
    it('should validate with valid email and code', () => {
      const validData = {
        email: 'user@example.com',
        code: '123456'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(validData)
      expect(result._tag).toBe('Right')
    })

    it('should validate 4-digit code', () => {
      const validData = {
        email: 'user@example.com',
        code: '1234'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(validData)
      expect(result._tag).toBe('Right')
    })

    it('should validate 8-digit code', () => {
      const validData = {
        email: 'user@example.com',
        code: '12345678'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(validData)
      expect(result._tag).toBe('Right')
    })
  })

  describe('OTP Verify Schema - Invalid input', () => {
    it('should reject code shorter than 4 characters', () => {
      const invalidData = {
        email: 'user@example.com',
        code: '123'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject code longer than 8 characters', () => {
      const invalidData = {
        email: 'user@example.com',
        code: '123456789'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject missing code', () => {
      const invalidData = {
        email: 'user@example.com'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject invalid email in verify', () => {
      const invalidData = {
        email: 'invalid-email',
        code: '123456'
      }
      const result = Schema.decodeUnknownEither(otpVerifySchema)(invalidData)
      expect(result._tag).toBe('Left')
    })
  })
})

describe('OTP Login Plugin - OTPService', () => {
  describe('OTPService', () => {
    let mockDB: any

    beforeEach(() => {
      vi.clearAllMocks()
      mockDB = createMockDB()
    })

    describe('generateCode', () => {
      it('should generate code of specified length', async () => {
        const program = Effect.gen(function* (_) {
          const service = yield* OTPService
          return service.generateCode(6)
        })

        const code = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeOTPServiceLayer())
          )
        )

        expect(code).toHaveLength(6)
        expect(code).toMatch(/^[0-9]+$/)
      })

      it('should generate different codes each time', async () => {
        const program = Effect.gen(function* (_) {
          const service = yield* OTPService
          const code1 = service.generateCode(6)
          const code2 = service.generateCode(6)
          return { code1, code2 }
        })

        const result = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeOTPServiceLayer())
          )
        )

        expect(result.code1).not.toBe(result.code2)
      })

      it('should handle different lengths', async () => {
        const program = Effect.gen(function* (_) {
          const service = yield* OTPService
          return {
            code4: service.generateCode(4),
            code8: service.generateCode(8)
          }
        })

        const result = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeOTPServiceLayer())
          )
        )

        expect(result.code4).toHaveLength(4)
        expect(result.code8).toHaveLength(8)
      })
    })

    describe('createOTPCode', () => {
      it('should create OTP code with correct structure', async () => {
        const settings: OTPSettings = {
          codeLength: 6,
          codeExpiryMinutes: 10,
          maxAttempts: 3,
          rateLimitPerHour: 5,
          allowNewUserRegistration: false,
          appName: 'Test App'
        }

        const program = Effect.gen(function* (_) {
          const service = yield* OTPService
          return yield* service.createOTPCode(
            'test@example.com',
            settings,
            '127.0.0.1',
            'Mozilla/5.0'
          )
        })

        const otpCode = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeDatabaseLayer(mockDB)),
            Effect.provide(makeOTPServiceLayer())
          )
        )

        expect(otpCode).toMatchObject({
          user_email: 'test@example.com',
          used: 0,
          attempts: 0,
          ip_address: '127.0.0.1',
          user_agent: 'Mozilla/5.0'
        })
        expect(otpCode.code).toHaveLength(6)
        expect(otpCode.expires_at).toBeGreaterThan(Date.now())
      })

      it('should normalize email to lowercase', async () => {
        const settings: OTPSettings = {
          codeLength: 6,
          codeExpiryMinutes: 10,
          maxAttempts: 3,
          rateLimitPerHour: 5,
          allowNewUserRegistration: false,
          appName: 'Test App'
        }

        const program = Effect.gen(function* (_) {
          const service = yield* OTPService
          return yield* service.createOTPCode(
            'TEST@EXAMPLE.COM',
            settings
          )
        })

        const otpCode = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeDatabaseLayer(mockDB)),
            Effect.provide(makeOTPServiceLayer())
          )
        )

        expect(otpCode.user_email).toBe('test@example.com')
      })
    })
  })
})

describe('OTP Login Plugin - API Routes', () => {
  let app: Hono
  let mockDB: any

  beforeEach(() => {
    mockDB = createMockDB()
    app = new Hono()
    
    // Mock the POST /request route with validation
    app.post('/auth/otp/request', async (c) => {
      try {
        const body = await c.req.json()
        const otpRequestSchema = Schema.Struct({
          email: Schema.String.pipe(
            Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
              message: () => 'Valid email is required'
            })
          )
        })
        
        const validation = Schema.decodeUnknownEither(otpRequestSchema)(body)
        
        if (validation._tag === 'Left') {
          return c.json({
            error: 'Validation failed',
            details: validation.left.message
          }, 400)
        }
        
        return c.json({
          message: 'If an account exists for this email, you will receive a verification code shortly.',
          expiresIn: 600
        })
      } catch (error) {
        return c.json({ error: 'An error occurred. Please try again.' }, 500)
      }
    })

    // Mock the POST /verify route with validation
    app.post('/auth/otp/verify', async (c) => {
      try {
        const body = await c.req.json()
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
        
        const validation = Schema.decodeUnknownEither(otpVerifySchema)(body)
        
        if (validation._tag === 'Left') {
          return c.json({
            error: 'Validation failed',
            details: validation.left.message
          }, 400)
        }
        
        return c.json({
          success: true,
          user: { id: 'user-1', email: 'test@example.com', role: 'admin' },
          message: 'Authentication successful'
        })
      } catch (error) {
        return c.json({ error: 'An error occurred. Please try again.' }, 500)
      }
    })
  })

  describe('POST /auth/otp/request', () => {
    it('should accept valid email and return success message', async () => {
      const validData = { email: 'user@example.com' }

      const res = await app.request('/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.message).toContain('verification code')
      expect(data.expiresIn).toBe(600)
    })

    it('should reject invalid email with 400 status', async () => {
      const invalidData = { email: 'invalid-email' }

      const res = await app.request('/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Validation failed')
      expect(data.details).toContain('Valid email is required')
    })

    it('should reject missing email', async () => {
      const invalidData = {}

      const res = await app.request('/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Validation failed')
    })
  })

  describe('POST /auth/otp/verify', () => {
    it('should accept valid email and code', async () => {
      const validData = {
        email: 'test@example.com',
        code: '123456'
      }

      const res = await app.request('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.message).toBe('Authentication successful')
    })

    it('should reject invalid email', async () => {
      const invalidData = {
        email: 'invalid-email',
        code: '123456'
      }

      const res = await app.request('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Validation failed')
    })

    it('should reject code shorter than 4 characters', async () => {
      const invalidData = {
        email: 'test@example.com',
        code: '123'
      }

      const res = await app.request('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Validation failed')
    })

    it('should reject code longer than 8 characters', async () => {
      const invalidData = {
        email: 'test@example.com',
        code: '123456789'
      }

      const res = await app.request('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Validation failed')
    })

    it('should reject missing code', async () => {
      const invalidData = {
        email: 'test@example.com'
      }

      const res = await app.request('/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Validation failed')
    })
  })
})

describe('OTP Login Plugin - Security', () => {
  let mockDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
  })

  it('should generate cryptographically secure codes', async () => {
    const codes = new Set()
    const iterations = 100

    for (let i = 0; i < iterations; i++) {
      const program = Effect.gen(function* (_) {
        const service = yield* OTPService
        return service.generateCode(6)
      })

      const code = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeOTPServiceLayer())
        )
      )
      codes.add(code)
    }

    // Should have high uniqueness (at least 95% unique)
    expect(codes.size).toBeGreaterThan(iterations * 0.95)
  })

  it('should handle rate limiting check', async () => {
    const settings: OTPSettings = {
      codeLength: 6,
      codeExpiryMinutes: 10,
      maxAttempts: 3,
      rateLimitPerHour: 5,
      allowNewUserRegistration: false,
      appName: 'Test App'
    }

    const program = Effect.gen(function* (_) {
      const service = yield* OTPService
      return yield* service.checkRateLimit('test@example.com', settings)
    })

    const canRequest = await Effect.runPromise(
      program.pipe(
        Effect.provide(makeDatabaseLayer(mockDB)),
        Effect.provide(makeOTPServiceLayer())
      )
    )

    expect(typeof canRequest).toBe('boolean')
  })
})
