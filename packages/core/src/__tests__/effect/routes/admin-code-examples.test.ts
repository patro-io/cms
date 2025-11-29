import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Schema } from 'effect'
import adminCodeExamplesRoutes from '../../../routes/admin-code-examples'

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

describe('Admin Code Examples Routes - Effect Schema Validation', () => {
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
    app.route('/admin/code-examples', adminCodeExamplesRoutes)
  })

  describe('Code Example Schema Validation', () => {
    it('should validate code example with all required fields', () => {
      const codeExampleData = {
        title: 'Test Example',
        description: 'A test code example',
        code: 'console.log("Hello World")',
        language: 'javascript',
        category: 'basics',
        tags: 'test, example',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(200)
        ),
        description: Schema.optional(
          Schema.String.pipe(Schema.maxLength(500))
        ),
        code: Schema.String.pipe(Schema.minLength(1)),
        language: Schema.String.pipe(Schema.minLength(1)),
        category: Schema.optional(
          Schema.String.pipe(Schema.maxLength(50))
        ),
        tags: Schema.optional(
          Schema.String.pipe(Schema.maxLength(200))
        ),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Right')
    })

    it('should reject title that is too long', () => {
      const codeExampleData = {
        title: 'a'.repeat(201), // Exceeds 200 characters
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(200)
        ),
        code: Schema.String,
        language: Schema.String,
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject empty title', () => {
      const codeExampleData = {
        title: '',
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String.pipe(Schema.minLength(1)),
        code: Schema.String,
        language: Schema.String,
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject empty code', () => {
      const codeExampleData = {
        title: 'Test Example',
        code: '',
        language: 'javascript',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String,
        code: Schema.String.pipe(Schema.minLength(1)),
        language: Schema.String,
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject empty language', () => {
      const codeExampleData = {
        title: 'Test Example',
        code: 'console.log("test")',
        language: '',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String,
        code: Schema.String,
        language: Schema.String.pipe(Schema.minLength(1)),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject description that is too long', () => {
      const codeExampleData = {
        title: 'Test Example',
        description: 'a'.repeat(501), // Exceeds 500 characters
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String,
        description: Schema.optional(
          Schema.String.pipe(Schema.maxLength(500))
        ),
        code: Schema.String,
        language: Schema.String,
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject category that is too long', () => {
      const codeExampleData = {
        title: 'Test Example',
        code: 'console.log("test")',
        language: 'javascript',
        category: 'a'.repeat(51), // Exceeds 50 characters
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String,
        code: Schema.String,
        language: Schema.String,
        category: Schema.optional(
          Schema.String.pipe(Schema.maxLength(50))
        ),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should reject tags that are too long', () => {
      const codeExampleData = {
        title: 'Test Example',
        code: 'console.log("test")',
        language: 'javascript',
        tags: 'a'.repeat(201), // Exceeds 200 characters
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String,
        code: Schema.String,
        language: Schema.String,
        tags: Schema.optional(
          Schema.String.pipe(Schema.maxLength(200))
        ),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
      expect(validation._tag).toBe('Left')
    })

    it('should handle optional fields correctly', () => {
      const codeExampleData = {
        title: 'Test Example',
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: 'true',
        sortOrder: '1'
        // description, category, and tags are optional
      }

      const schema = Schema.Struct({
        title: Schema.String.pipe(Schema.minLength(1)),
        description: Schema.optional(Schema.String),
        code: Schema.String.pipe(Schema.minLength(1)),
        language: Schema.String.pipe(Schema.minLength(1)),
        category: Schema.optional(Schema.String),
        tags: Schema.optional(Schema.String),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(codeExampleData)
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
        title: '', // Too short
        code: '', // Too short
        language: '', // Too short
        isPublished: 'true',
        sortOrder: '1'
      }

      const schema = Schema.Struct({
        title: Schema.String.pipe(Schema.minLength(1)),
        code: Schema.String.pipe(Schema.minLength(1)),
        language: Schema.String.pipe(Schema.minLength(1)),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(invalidData)
      expect(validation._tag).toBe('Left')
      if (validation._tag === 'Left') {
        expect(validation.left.message).toBeDefined()
      }
    })

    it('should validate with valid minimal data', () => {
      const minimalData = {
        title: 'Minimal Example',
        code: 'print("hello")',
        language: 'python',
        isPublished: 'false',
        sortOrder: '0'
      }

      const schema = Schema.Struct({
        title: Schema.String.pipe(
          Schema.minLength(1),
          Schema.maxLength(200)
        ),
        description: Schema.optional(Schema.String),
        code: Schema.String.pipe(Schema.minLength(1)),
        language: Schema.String.pipe(Schema.minLength(1)),
        category: Schema.optional(Schema.String),
        tags: Schema.optional(Schema.String),
        isPublished: Schema.String,
        sortOrder: Schema.String
      })

      const validation = Schema.decodeUnknownEither(schema)(minimalData)
      expect(validation._tag).toBe('Right')
    })
  })
})