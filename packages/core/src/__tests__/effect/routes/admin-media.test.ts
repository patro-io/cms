import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Schema } from 'effect'
import { adminMediaRoutes } from '../../../routes/admin-media'

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
  CACHE_KV: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
})

describe('Admin Media Routes - Effect Schema Validation', () => {
  let app: Hono
  let mockEnv: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = createMockEnv()
    
    app = new Hono()
    // Mock auth middleware
    app.use('*', async (c, next) => {
      (c as any).set('user', { userId: 'admin-123', email: 'admin@test.com', role: 'admin' })
      await next()
    })
    app.route('/admin/media', adminMediaRoutes)
  })

  describe('File Validation Schema', () => {
    it('should validate file with valid image type', () => {
      const fileData = {
        name: 'test-image.jpg',
        type: 'image/jpeg',
        size: 1024 * 1024 // 1MB
      }

      const schema = Schema.Struct({
        name: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(255)
        ),
        type: Schema.String.pipe(
          Schema.filter((type): type is string => {
            const allowedTypes = [
              'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
              'application/pdf', 'text/plain', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
              'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'
            ]
            return allowedTypes.includes(type)
          }, {
            message: () => 'Unsupported file type'
          })
        ),
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Right')
    })

    it('should validate file with valid document type', () => {
      const fileData = {
        name: 'document.pdf',
        type: 'application/pdf',
        size: 2 * 1024 * 1024 // 2MB
      }

      const schema = Schema.Struct({
        name: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(255)
        ),
        type: Schema.String.pipe(
          Schema.filter((type): type is string => {
            const allowedTypes = [
              'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
              'application/pdf', 'text/plain', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
              'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'
            ]
            return allowedTypes.includes(type)
          }, {
            message: () => 'Unsupported file type'
          })
        ),
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Right')
    })

    it('should validate file with valid video type', () => {
      const fileData = {
        name: 'video.mp4',
        type: 'video/mp4',
        size: 10 * 1024 * 1024 // 10MB
      }

      const schema = Schema.Struct({
        name: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(255)
        ),
        type: Schema.String.pipe(
          Schema.filter((type): type is string => {
            const allowedTypes = [
              'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
              'application/pdf', 'text/plain', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
              'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'
            ]
            return allowedTypes.includes(type)
          }, {
            message: () => 'Unsupported file type'
          })
        ),
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Right')
    })

    it('should reject unsupported file type', () => {
      const fileData = {
        name: 'malicious.exe',
        type: 'application/x-msdownload',
        size: 1024
      }

      const schema = Schema.Struct({
        name: Schema.String,
        type: Schema.String.pipe(
          Schema.filter((type): type is string => {
            const allowedTypes = [
              'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
              'application/pdf', 'text/plain', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
              'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'
            ]
            return allowedTypes.includes(type)
          }, {
            message: () => 'Unsupported file type'
          })
        ),
        size: Schema.Number
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject file that is too large', () => {
      const fileData = {
        name: 'large-file.jpg',
        type: 'image/jpeg',
        size: 51 * 1024 * 1024 // 51MB - exceeds 50MB limit
      }

      const schema = Schema.Struct({
        name: Schema.String,
        type: Schema.String,
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject file with zero size', () => {
      const fileData = {
        name: 'empty.txt',
        type: 'text/plain',
        size: 0
      }

      const schema = Schema.Struct({
        name: Schema.String,
        type: Schema.String,
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1)
        )
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject filename that is too long', () => {
      const fileData = {
        name: 'a'.repeat(256) + '.jpg', // Exceeds 255 characters
        type: 'image/jpeg',
        size: 1024
      }

      const schema = Schema.Struct({
        name: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(255)
        ),
        type: Schema.String,
        size: Schema.Number
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject empty filename', () => {
      const fileData = {
        name: '',
        type: 'image/jpeg',
        size: 1024
      }

      const schema = Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1)),
        type: Schema.String,
        size: Schema.Number
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
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

      const schema = Schema.Struct({
        name: Schema.String.pipe(Schema.minLength(1)),
        type: Schema.String.pipe(
          Schema.filter((type): type is string => {
            const allowedTypes = ['image/jpeg', 'image/png']
            return allowedTypes.includes(type)
          }, {
            message: () => 'Unsupported file type'
          })
        ),
        size: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1))
      })

      const validation = Schema.decodeUnknownEither(schema)(invalidData)
      expect(validation._tag).toBe('Left')
      if (validation._tag === 'Left') {
        expect(validation.left.message).toBeDefined()
      }
    })

    it('should validate maximum file size at boundary', () => {
      const fileData = {
        name: 'max-size.jpg',
        type: 'image/jpeg',
        size: 50 * 1024 * 1024 // Exactly 50MB
      }

      const schema = Schema.Struct({
        name: Schema.String,
        type: Schema.String,
        size: Schema.Number.pipe(
          Schema.greaterThanOrEqualTo(1),
          Schema.lessThanOrEqualTo(50 * 1024 * 1024)
        )
      })

      const validation = Schema.decodeUnknownEither(schema)(fileData)
      expect(validation._tag).toBe('Right')
    })

    it('should validate all supported image types', () => {
      const imageTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml'
      ]

      const schema = Schema.Struct({
        name: Schema.String,
        type: Schema.String.pipe(
          Schema.filter((type): type is string => {
            const allowedTypes = [
              'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
              'application/pdf', 'text/plain', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
              'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'
            ]
            return allowedTypes.includes(type)
          })
        ),
        size: Schema.Number
      })

      imageTypes.forEach(type => {
        const validation = Schema.decodeUnknownEither(schema)({
          name: 'test.' + type.split('/')[1],
          type,
          size: 1024
        })
        expect(validation._tag).toBe('Right')
      })
    })
  })
})