import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Schema } from 'effect'

// Mock database
function createMockDB() {
  const mockData = {
    testimonials: [] as any[]
  }

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: any[]) => ({
        all: vi.fn().mockResolvedValue({
          results: sql.includes('SELECT') ? mockData.testimonials : [],
          success: true
        }),
        run: vi.fn().mockResolvedValue({
          success: true,
          changes: 1
        }),
        first: vi.fn().mockResolvedValue(
          sql.includes('SELECT') && mockData.testimonials.length > 0
            ? mockData.testimonials[0]
            : null
        )
      }))
    }))
  }
}

describe('Testimonials Plugin - Schema Validation', () => {
  const testimonialSchema = Schema.Struct({
    id: Schema.optional(Schema.Number),
    authorName: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Author name is required' }),
      Schema.maxLength(100, { message: () => 'Author name must be under 100 characters' })
    ),
    authorTitle: Schema.optional(
      Schema.String.pipe(Schema.maxLength(100, { message: () => 'Author title must be under 100 characters' }))
    ),
    authorCompany: Schema.optional(
      Schema.String.pipe(Schema.maxLength(100, { message: () => 'Company must be under 100 characters' }))
    ),
    testimonialText: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Testimonial text is required' }),
      Schema.maxLength(1000, { message: () => 'Testimonial must be under 1000 characters' })
    ),
    rating: Schema.optional(Schema.Number.pipe(
      Schema.greaterThanOrEqualTo(1),
      Schema.lessThanOrEqualTo(5)
    )),
    isPublished: Schema.Boolean,
    sortOrder: Schema.Number,
    createdAt: Schema.optional(Schema.Number),
    updatedAt: Schema.optional(Schema.Number)
  })

  describe('Valid input', () => {
    it('should validate a complete testimonial', () => {
      const validData = {
        authorName: 'John Doe',
        authorTitle: 'CTO',
        authorCompany: 'Tech Corp',
        testimonialText: 'This product is amazing! It has transformed our workflow.',
        rating: 5,
        isPublished: true,
        sortOrder: 1
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(validData)
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right.authorName).toBe('John Doe')
        expect(result.right.rating).toBe(5)
      }
    })

    it('should validate with minimal required fields', () => {
      const validData = {
        authorName: 'Jane Smith',
        testimonialText: 'Great service!',
        isPublished: false,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(validData)
      expect(result._tag).toBe('Right')
    })

    it('should validate with all optional fields', () => {
      const validData = {
        authorName: 'Alice Johnson',
        authorTitle: 'Product Manager',
        authorCompany: 'StartupXYZ',
        testimonialText: 'Excellent experience from start to finish!',
        rating: 4,
        isPublished: true,
        sortOrder: 2
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(validData)
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right.authorTitle).toBe('Product Manager')
        expect(result.right.authorCompany).toBe('StartupXYZ')
      }
    })

    it('should validate rating within valid range (1-5)', () => {
      const testRatings = [1, 2, 3, 4, 5]
      
      testRatings.forEach(rating => {
        const validData = {
          authorName: 'Test User',
          testimonialText: 'Test testimonial',
          rating,
          isPublished: true,
          sortOrder: 0
        }

        const result = Schema.decodeUnknownEither(testimonialSchema)(validData)
        expect(result._tag).toBe('Right')
      })
    })
  })

  describe('Invalid input - Required fields', () => {
    it('should reject when authorName is missing', () => {
      const invalidData = {
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('authorName')
      }
    })

    it('should reject when authorName is empty', () => {
      const invalidData = {
        authorName: '',
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('Author name is required')
      }
    })

    it('should reject when testimonialText is missing', () => {
      const invalidData = {
        authorName: 'John Doe',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('testimonialText')
      }
    })

    it('should reject when testimonialText is empty', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: '',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('Testimonial text is required')
      }
    })
  })

  describe('Invalid input - Length constraints', () => {
    it('should reject when authorName exceeds 100 characters', () => {
      const invalidData = {
        authorName: 'x'.repeat(101),
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('100 characters')
      }
    })

    it('should reject when authorTitle exceeds 100 characters', () => {
      const invalidData = {
        authorName: 'John Doe',
        authorTitle: 'x'.repeat(101),
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('100 characters')
      }
    })

    it('should reject when authorCompany exceeds 100 characters', () => {
      const invalidData = {
        authorName: 'John Doe',
        authorCompany: 'x'.repeat(101),
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('100 characters')
      }
    })

    it('should reject when testimonialText exceeds 1000 characters', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'x'.repeat(1001),
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('1000 characters')
      }
    })
  })

  describe('Invalid input - Rating constraints', () => {
    it('should reject rating less than 1', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        rating: 0,
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject rating greater than 5', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        rating: 6,
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject negative rating', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        rating: -1,
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })
  })

  describe('Invalid input - Type validation', () => {
    it('should reject when isPublished is not a boolean', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        isPublished: 'true' as any,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject when sortOrder is not a number', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: '0' as any
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject when rating is not a number', () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        rating: '5' as any,
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(testimonialSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })
  })
})

describe('Testimonials Plugin - API Routes', () => {
  let app: Hono
  let mockDB: any

  beforeEach(() => {
    mockDB = createMockDB()
    app = new Hono()
    
    // Mock the POST route with validation
    app.post('/api/testimonials', async (c) => {
      try {
        const body = await c.req.json()
        const testimonialSchema = Schema.Struct({
          authorName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
          authorTitle: Schema.optional(Schema.String.pipe(Schema.maxLength(100))),
          authorCompany: Schema.optional(Schema.String.pipe(Schema.maxLength(100))),
          testimonialText: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(1000)),
          rating: Schema.optional(Schema.Number.pipe(
            Schema.greaterThanOrEqualTo(1),
            Schema.lessThanOrEqualTo(5)
          )),
          isPublished: Schema.Boolean,
          sortOrder: Schema.Number
        })
        
        const validation = Schema.decodeUnknownEither(testimonialSchema)(body)
        
        if (validation._tag === 'Left') {
          return c.json({
            success: false,
            error: 'Validation failed',
            details: validation.left.message
          }, 400)
        }
        
        return c.json({
          success: true,
          data: { id: 1, ...validation.right },
          message: 'Testimonial created successfully'
        }, 201)
      } catch (error) {
        return c.json({
          success: false,
          error: 'Failed to create testimonial'
        }, 500)
      }
    })
  })

  describe('POST /api/testimonials', () => {
    it('should create a testimonial with valid data', async () => {
      const validData = {
        authorName: 'Sarah Connor',
        authorTitle: 'CEO',
        authorCompany: 'Cyberdyne Systems',
        testimonialText: 'Outstanding service and support!',
        rating: 5,
        isPublished: true,
        sortOrder: 1
      }

      const res = await app.request('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.authorName).toBe('Sarah Connor')
      expect(data.data.rating).toBe(5)
      expect(data.message).toBe('Testimonial created successfully')
    })

    it('should create a testimonial without optional fields', async () => {
      const validData = {
        authorName: 'John Smith',
        testimonialText: 'Highly recommended!',
        isPublished: true,
        sortOrder: 0
      }

      const res = await app.request('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.authorName).toBe('John Smith')
    })

    it('should reject invalid data with 400 status', async () => {
      const invalidData = {
        authorName: '', // Empty name
        testimonialText: 'Great product!',
        isPublished: true,
        sortOrder: 0
      }

      const res = await app.request('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.success).toBe(false)
      expect(data.error).toBe('Validation failed')
    })

    it('should reject when required fields are missing', async () => {
      const invalidData = {
        authorName: 'John Doe'
        // Missing testimonialText, isPublished, sortOrder
      }

      const res = await app.request('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.success).toBe(false)
    })

    it('should reject invalid rating', async () => {
      const invalidData = {
        authorName: 'John Doe',
        testimonialText: 'Great product!',
        rating: 10, // Invalid rating > 5
        isPublished: true,
        sortOrder: 0
      }

      const res = await app.request('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.success).toBe(false)
    })

    it('should accept valid rating (1-5)', async () => {
      const validData = {
        authorName: 'Test User',
        testimonialText: 'Good experience',
        rating: 4,
        isPublished: true,
        sortOrder: 0
      }

      const res = await app.request('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.rating).toBe(4)
    })
  })
})