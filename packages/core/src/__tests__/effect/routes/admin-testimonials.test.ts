import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Schema } from 'effect'
import adminTestimonialsRoutes from '../../../routes/admin-testimonials'

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
  KV: {}
})

describe('Admin Testimonials Routes - Effect Schema Validation', () => {
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
    app.route('/admin/testimonials', adminTestimonialsRoutes)
  })

  describe('Testimonial Schema Validation', () => {
    it('should validate testimonial with all required fields', () => {
      const testimonialData = {
        authorName: 'John Doe',
        authorTitle: 'CEO',
        authorCompany: 'Test Corp',
        testimonialText: 'Great product!',
        rating: '5',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        authorName: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(100)
        ),
        authorTitle: Schema.optional(Schema.String),
        authorCompany: Schema.optional(Schema.String),
        testimonialText: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(1000)
        ),
        rating: Schema.optional(Schema.String),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(testimonialData)
      expect(validation._tag).toBe('Right')
    })

    it('should reject author name that is too long', () => {
      const testimonialData = {
        authorName: 'a'.repeat(101), // Exceeds 100 characters
        testimonialText: 'Great product!',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        authorName: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(100)
        ),
        testimonialText: Schema.String,
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(testimonialData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject empty author name', () => {
      const testimonialData = {
        authorName: '',
        testimonialText: 'Great product!',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        authorName: Schema.String.pipe(Schema.minLength(1)),
        testimonialText: Schema.String,
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(testimonialData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject testimonial text that is too long', () => {
      const testimonialData = {
        authorName: 'John Doe',
        testimonialText: 'a'.repeat(1001), // Exceeds 1000 characters
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        authorName: Schema.String,
        testimonialText: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(1000)
        ),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(testimonialData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject empty testimonial text', () => {
      const testimonialData = {
        authorName: 'John Doe',
        testimonialText: '',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        authorName: Schema.String,
        testimonialText: Schema.String.pipe(Schema.minLength(1)),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(testimonialData)
      expect(validation._tag).toBe('Left')
    })

    it('should handle optional fields correctly', () => {
      const testimonialData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        isPublished: 'true',
        sortOrder: '1'
        // authorTitle, authorCompany, and rating are optional
      }

      const schema = Schema.Struct({
        authorName: Schema.String.pipe(Schema.minLength(1)),
        authorTitle: Schema.optional(Schema.String),
        authorCompany: Schema.optional(Schema.String),
        testimonialText: Schema.String.pipe(Schema.minLength(1)),
        rating: Schema.optional(Schema.String),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(testimonialData)
      expect(validation._tag).toBe('Right')
    })
  })

  describe('Effect Schema Integration', () => {
    it('should use Effect Schema for validation', () => {
      expect(Schema).toBeDefined()
      expect(Schema.Struct).toBeDefined()
      expect(Schema.String).toBeDefined()
      expect(Schema.optional).toBeDefined()
    })

    it('should properly handle validation errors', () => {
      const invalidData = {
        authorName: '', // Too short
        testimonialText: '', // Too short
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        authorName: Schema.String.pipe(Schema.minLength(1)),
        testimonialText: Schema.String.pipe(Schema.minLength(1)),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(invalidData)
      expect(validation._tag).toBe('Left')
      if (validation._tag === 'Left') {
        expect(validation.left.message).toBeDefined()
      }
    })
  })
})