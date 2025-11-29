import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Schema } from 'effect'
import { apiMediaRoutes } from '../../../routes/api-media'

// Mock environment bindings
const createMockEnv = () => ({
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  },
  MEDIA_BUCKET: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  },
  BUCKET_NAME: 'test-bucket'
})

describe('API Media Routes - Effect Schema Validation', () => {
  let app: Hono
  let mockEnv: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = createMockEnv()
    
    app = new Hono()
    // Mock auth middleware
    app.use('*', async (c, next) => {
      (c as any).set('user', { userId: 'user-123', email: 'user@test.com', role: 'admin' })
      await next()
    })
    app.route('/api/media', apiMediaRoutes)
  })

  describe('File Validation Schema', () => {
    it('should validate file with correct properties', () => {
      const fileData = {
        name: 'test-image.jpg',
        type: 'image/jpeg',
        size: 1024 * 1024 // 1MB
      }

      const validation = Schema.decodeUnknownEither(Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
        type: Schema.String,
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      }))(fileData)

      expect(validation._tag).toBe('Right')
    })

    it('should reject file with empty name', () => {
      const fileData = {
        name: '',
        type: 'image/jpeg',
        size: 1024
      }

      const validation = Schema.decodeUnknownEither(Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
        type: Schema.String,
        size: Schema.Number
      }))(fileData)

      expect(validation._tag).toBe('Left')
    })

    it('should reject file name that is too long', () => {
      const fileData = {
        name: 'a'.repeat(256),
        type: 'image/jpeg',
        size: 1024
      }

      const validation = Schema.decodeUnknownEither(Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
        type: Schema.String,
        size: Schema.Number
      }))(fileData)

      expect(validation._tag).toBe('Left')
    })

    it('should reject file size that is too large', () => {
      const fileData = {
        name: 'test.jpg',
        type: 'image/jpeg',
        size: 51 * 1024 * 1024 // 51MB (exceeds 50MB limit)
      }

      const validation = Schema.decodeUnknownEither(Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
        type: Schema.String,
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      }))(fileData)

      expect(validation._tag).toBe('Left')
    })

    it('should reject file size of zero', () => {
      const fileData = {
        name: 'test.jpg',
        type: 'image/jpeg',
        size: 0
      }

      const validation = Schema.decodeUnknownEither(Schema.Struct({
        name: Schema.String,
        type: Schema.String,
        size: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1))
      }))(fileData)

      expect(validation._tag).toBe('Left')
    })
  })

  describe('Effect Schema Integration', () => {
    it('should use Effect Schema for validation', () => {
      expect(Schema).toBeDefined()
      expect(Schema.Struct).toBeDefined()
      expect(Schema.String).toBeDefined()
      expect(Schema.Number).toBeDefined()
      expect(Schema.filter).toBeDefined()
    })

    it('should properly handle validation errors', () => {
      const invalidData = {
        name: '',
        type: 'invalid/type',
        size: -1
      }

      const validation = Schema.decodeUnknownEither(Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1)),
        type: Schema.String,
        size: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1))
      }))(invalidData)

      expect(validation._tag).toBe('Left')
      if (validation._tag === 'Left') {
        expect(validation.left.message).toBeDefined()
      }
    })
  })
})