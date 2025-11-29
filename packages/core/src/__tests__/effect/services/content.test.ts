import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import {
  ContentService,
  makeContentServiceLayer,
  ContentNotFoundError,
  ContentAlreadyExistsError,
  type Content
} from '../../../services/content-effect'
import { makeDatabaseLayer } from '../../../services/database-effect'

// Mock D1Database
const createMockDB = () => {
  const mockDB: any = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  }
  return mockDB
}

describe('ContentService - Effect Implementation', () => {
  let mockDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
  })

  describe('getContentById', () => {
    it('should return content by ID', async () => {
      const mockContent: Content = {
        id: 'content-1',
        collection_id: 'col-1',
        slug: 'test-post',
        data: JSON.stringify({ title: 'Test Post', body: 'Content' }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now()
      }

      mockDB.prepare().first.mockResolvedValue(mockContent)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.getContentById('content-1')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result.id).toBe('content-1')
      expect(result.slug).toBe('test-post')
      // Data should be parsed from JSON
      expect(typeof result.data).toBe('object')
    })

    it('should fail with ContentNotFoundError when content does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.getContentById('nonexistent')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(ContentNotFoundError)
      }
    })
  })

  describe('getContentBySlug', () => {
    it('should return content by slug', async () => {
      const mockContent: Content = {
        id: 'content-1',
        collection_id: 'col-1',
        slug: 'test-post',
        data: JSON.stringify({ title: 'Test Post' }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now()
      }

      mockDB.prepare().first.mockResolvedValue(mockContent)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.getContentBySlug('col-1', 'test-post')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result.slug).toBe('test-post')
      expect(result.collection_id).toBe('col-1')
    })
  })

  describe('queryContent', () => {
    it('should query content with filters', async () => {
      const mockContents: Content[] = [
        {
          id: 'content-1',
          collection_id: 'col-1',
          slug: 'post-1',
          data: JSON.stringify({ title: 'Post 1' }),
          status: 'published',
          author_id: 'user-1',
          created_at: Date.now(),
          updated_at: Date.now()
        }
      ]

      mockDB.prepare().all.mockResolvedValue({ results: mockContents })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.queryContent({
          collection_id: 'col-1',
          status: 'published',
          limit: 10
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.collection_id).toBe('col-1')
    })

    it('should handle search queries', async () => {
      mockDB.prepare().all.mockResolvedValue({ results: [] })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.queryContent({
          search: 'test',
          limit: 10
        })
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LIKE')
      )
    })
  })

  describe('countContent', () => {
    it('should count content with filters', async () => {
      mockDB.prepare().first.mockResolvedValue({ count: 42 })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.countContent({
          collection_id: 'col-1',
          status: 'published'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result).toBe(42)
    })
  })

  describe('createContent', () => {
    it('should create new content', async () => {
      const mockContent: Content = {
        id: 'new-content-id',
        collection_id: 'col-1',
        slug: 'new-post',
        data: JSON.stringify({ title: 'New Post' }),
        status: 'draft',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now()
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(null) // Check if exists
        .mockResolvedValueOnce(mockContent) // Return created content

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: 'col-1',
          slug: 'new-post',
          data: { title: 'New Post' },
          author_id: 'user-1'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result.slug).toBe('new-post')
      expect(result.collection_id).toBe('col-1')
    })

    it('should validate slug format', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: 'col-1',
          slug: 'Invalid Slug!',
          data: { title: 'Test' },
          author_id: 'user-1'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
    })

    it('should fail when slug already exists', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'existing-id' })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: 'col-1',
          slug: 'existing-slug',
          data: { title: 'Test' },
          author_id: 'user-1'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(ContentAlreadyExistsError)
      }
    })
  })

  describe('updateContent', () => {
    it('should update content', async () => {
      const existingContent: Content = {
        id: 'content-1',
        collection_id: 'col-1',
        slug: 'test-post',
        data: JSON.stringify({ title: 'Old Title' }),
        status: 'draft',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now()
      }

      const updatedContent: Content = {
        ...existingContent,
        data: JSON.stringify({ title: 'New Title' })
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(existingContent)
        .mockResolvedValueOnce(updatedContent)

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.updateContent('content-1', {
          data: { title: 'New Title' },
          updated_by: 'user-1'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result.id).toBe('content-1')
    })

    it('should fail when content does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.updateContent('nonexistent', {
          data: { title: 'Test' },
          updated_by: 'user-1'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(ContentNotFoundError)
      }
    })
  })

  describe('deleteContent', () => {
    it('should delete content', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'content-1' })
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.deleteContent('content-1')
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM content')
      )
    })

    it('should fail when content does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.deleteContent('nonexistent')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(ContentNotFoundError)
      }
    })
  })

  describe('publishContent', () => {
    it('should publish content', async () => {
      const existingContent: Content = {
        id: 'content-1',
        collection_id: 'col-1',
        slug: 'test-post',
        data: JSON.stringify({ title: 'Test' }),
        status: 'draft',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now()
      }

      const publishedContent: Content = {
        ...existingContent,
        status: 'published',
        published_at: Date.now()
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(existingContent)
        .mockResolvedValueOnce(publishedContent)

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.publishContent('content-1', 'user-1')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result.status).toBe('published')
    })
  })

  describe('duplicateContent', () => {
    it('should duplicate content with unique slug', async () => {
      const originalContent: Content = {
        id: 'content-1',
        collection_id: 'col-1',
        slug: 'original-post',
        data: JSON.stringify({ title: 'Original' }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now()
      }

      const duplicatedContent: Content = {
        ...originalContent,
        id: 'new-content-id',
        slug: 'original-post-copy',
        status: 'draft'
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(originalContent) // Get original
        .mockResolvedValueOnce(null) // Check slug availability
        .mockResolvedValueOnce(duplicatedContent) // Return duplicated

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.duplicateContent('content-1', 'user-1')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeContentServiceLayer(mockDB))
        )
      )

      expect(result.slug).toContain('copy')
      expect(result.status).toBe('draft')
    })
  })
})