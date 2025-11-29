import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Schema } from 'effect'

// Mock database
function createMockDB() {
  const mockData = {
    codeExamples: [] as any[]
  }

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: any[]) => ({
        all: vi.fn().mockResolvedValue({
          results: sql.includes('SELECT') ? mockData.codeExamples : [],
          success: true
        }),
        run: vi.fn().mockResolvedValue({
          success: true,
          changes: 1
        }),
        first: vi.fn().mockResolvedValue(
          sql.includes('SELECT') && mockData.codeExamples.length > 0
            ? mockData.codeExamples[0]
            : null
        )
      }))
    }))
  }
}

describe('Code Examples Plugin - Schema Validation', () => {
  const codeExampleSchema = Schema.Struct({
    id: Schema.optional(Schema.Number),
    title: Schema.String.pipe(
      Schema.minLength(1, { message: () => 'Title is required' }),
      Schema.maxLength(200, { message: () => 'Title must be under 200 characters' })
    ),
    description: Schema.optional(
      Schema.String.pipe(Schema.maxLength(500, { message: () => 'Description must be under 500 characters' }))
    ),
    code: Schema.String.pipe(Schema.minLength(1, { message: () => 'Code is required' })),
    language: Schema.String.pipe(Schema.minLength(1, { message: () => 'Language is required' })),
    category: Schema.optional(
      Schema.String.pipe(Schema.maxLength(50, { message: () => 'Category must be under 50 characters' }))
    ),
    tags: Schema.optional(
      Schema.String.pipe(Schema.maxLength(200, { message: () => 'Tags must be under 200 characters' }))
    ),
    isPublished: Schema.Boolean,
    sortOrder: Schema.Number,
    createdAt: Schema.optional(Schema.Number),
    updatedAt: Schema.optional(Schema.Number)
  })

  describe('Valid input', () => {
    it('should validate a complete code example', () => {
      const validData = {
        title: 'React useState Hook',
        description: 'Example of using useState in React',
        code: 'const [count, setCount] = useState(0)',
        language: 'javascript',
        category: 'react',
        tags: 'react,hooks,state',
        isPublished: true,
        sortOrder: 1
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(validData)
      expect(result._tag).toBe('Right')
      if (result._tag === 'Right') {
        expect(result.right.title).toBe('React useState Hook')
        expect(result.right.language).toBe('javascript')
      }
    })

    it('should validate with minimal required fields', () => {
      const validData = {
        title: 'Simple Example',
        code: 'console.log("Hello")',
        language: 'javascript',
        isPublished: false,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(validData)
      expect(result._tag).toBe('Right')
    })

    it('should validate with optional fields', () => {
      const validData = {
        title: 'TypeScript Interface',
        description: 'Basic interface example',
        code: 'interface User { name: string }',
        language: 'typescript',
        category: 'typescript',
        tags: 'typescript,interfaces',
        isPublished: true,
        sortOrder: 5
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(validData)
      expect(result._tag).toBe('Right')
    })
  })

  describe('Invalid input - Required fields', () => {
    it('should reject when title is missing', () => {
      const invalidData = {
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('title')
      }
    })

    it('should reject when title is empty', () => {
      const invalidData = {
        title: '',
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('Title is required')
      }
    })

    it('should reject when code is missing', () => {
      const invalidData = {
        title: 'Example',
        language: 'javascript',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('code')
      }
    })

    it('should reject when language is missing', () => {
      const invalidData = {
        title: 'Example',
        code: 'console.log("test")',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('language')
      }
    })
  })

  describe('Invalid input - Length constraints', () => {
    it('should reject when title exceeds 200 characters', () => {
      const invalidData = {
        title: 'x'.repeat(201),
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('200 characters')
      }
    })

    it('should reject when description exceeds 500 characters', () => {
      const invalidData = {
        title: 'Example',
        description: 'x'.repeat(501),
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('500 characters')
      }
    })

    it('should reject when category exceeds 50 characters', () => {
      const invalidData = {
        title: 'Example',
        code: 'console.log("test")',
        language: 'javascript',
        category: 'x'.repeat(51),
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('50 characters')
      }
    })

    it('should reject when tags exceed 200 characters', () => {
      const invalidData = {
        title: 'Example',
        code: 'console.log("test")',
        language: 'javascript',
        tags: 'x'.repeat(201),
        isPublished: true,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left.message).toContain('200 characters')
      }
    })
  })

  describe('Invalid input - Type validation', () => {
    it('should reject when isPublished is not a boolean', () => {
      const invalidData = {
        title: 'Example',
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: 'true' as any,
        sortOrder: 0
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })

    it('should reject when sortOrder is not a number', () => {
      const invalidData = {
        title: 'Example',
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: true,
        sortOrder: '0' as any
      }

      const result = Schema.decodeUnknownEither(codeExampleSchema)(invalidData)
      expect(result._tag).toBe('Left')
    })
  })
})

describe('Code Examples Plugin - API Routes', () => {
  let app: Hono
  let mockDB: any

  beforeEach(() => {
    mockDB = createMockDB()
    app = new Hono()
    
    // Mock the POST route with validation
    app.post('/api/code-examples', async (c) => {
      try {
        const body = await c.req.json()
        const codeExampleSchema = Schema.Struct({
          title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
          description: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
          code: Schema.String.pipe(Schema.minLength(1)),
          language: Schema.String.pipe(Schema.minLength(1)),
          category: Schema.optional(Schema.String.pipe(Schema.maxLength(50))),
          tags: Schema.optional(Schema.String.pipe(Schema.maxLength(200))),
          isPublished: Schema.Boolean,
          sortOrder: Schema.Number
        })
        
        const validation = Schema.decodeUnknownEither(codeExampleSchema)(body)
        
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
          message: 'Code example created successfully'
        }, 201)
      } catch (error) {
        return c.json({
          success: false,
          error: 'Failed to create code example'
        }, 500)
      }
    })
  })

  describe('POST /api/code-examples', () => {
    it('should create a code example with valid data', async () => {
      const validData = {
        title: 'React Component',
        code: 'function App() { return <div>Hello</div> }',
        language: 'javascript',
        isPublished: true,
        sortOrder: 1
      }

      const res = await app.request('/api/code-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.title).toBe('React Component')
      expect(data.message).toBe('Code example created successfully')
    })

    it('should reject invalid data with 400 status', async () => {
      const invalidData = {
        title: '', // Empty title
        code: 'console.log("test")',
        language: 'javascript',
        isPublished: true,
        sortOrder: 0
      }

      const res = await app.request('/api/code-examples', {
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
        title: 'Example'
        // Missing code, language, isPublished, sortOrder
      }

      const res = await app.request('/api/code-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.success).toBe(false)
    })

    it('should accept optional fields', async () => {
      const validData = {
        title: 'Python Example',
        description: 'A simple Python function',
        code: 'def hello(): print("Hello")',
        language: 'python',
        category: 'python',
        tags: 'python,functions',
        isPublished: true,
        sortOrder: 2
      }

      const res = await app.request('/api/code-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData)
      })

      expect(res.status).toBe(201)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.description).toBe('A simple Python function')
      expect(data.data.category).toBe('python')
    })
  })
})