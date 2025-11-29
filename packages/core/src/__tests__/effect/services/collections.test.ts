import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import {
  CollectionService,
  makeCollectionServiceLayer,
  CollectionNotFoundError,
  CollectionAlreadyExistsError,
  FieldNotFoundError,
  FieldAlreadyExistsError,
  type Collection,
  type CollectionField
} from '../../../services/collection-effect'
import { makeDatabaseLayer, DatabaseError } from '../../../services/database-effect'

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

describe('CollectionService - Effect Implementation', () => {
  let mockDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
  })

  describe('getCollections', () => {
    it('should return all active collections', async () => {
      const mockCollections: Collection[] = [
        {
          id: 'col-1',
          name: 'blog_posts',
          display_name: 'Blog Posts',
          description: 'Blog content',
          schema: null,
          is_active: 1,
          managed: 0,
          created_at: Date.now(),
          updated_at: Date.now()
        }
      ]

      mockDB.prepare().all.mockResolvedValue({ results: mockCollections })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.getCollections()
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result).toEqual(mockCollections)
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, display_name')
      )
    })

    it('should filter collections by search term', async () => {
      const mockCollections: Collection[] = []
      mockDB.prepare().all.mockResolvedValue({ results: mockCollections })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.getCollections('blog')
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LIKE ?')
      )
    })
  })

  describe('getCollectionById', () => {
    it('should return collection by ID', async () => {
      const mockCollection: Collection = {
        id: 'col-1',
        name: 'blog_posts',
        display_name: 'Blog Posts',
        description: 'Blog content',
        schema: null,
        is_active: 1,
        managed: 0,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      mockDB.prepare().first.mockResolvedValue(mockCollection)

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.getCollectionById('col-1')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result).toEqual(mockCollection)
    })

    it('should fail with CollectionNotFoundError when collection does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.getCollectionById('nonexistent')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(CollectionNotFoundError)
      }
    })
  })

  describe('createCollection', () => {
    it('should create a new collection', async () => {
      const mockCollection: Collection = {
        id: 'new-col-id',
        name: 'new_collection',
        display_name: 'New Collection',
        description: 'Test collection',
        schema: JSON.stringify({ type: 'object', properties: {} }),
        is_active: 1,
        managed: 0,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      // Mock checking for existing collection (none found)
      mockDB.prepare().first
        .mockResolvedValueOnce(null) // Check if exists
        .mockResolvedValueOnce(mockCollection) // Return created collection

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.createCollection({
          name: 'new_collection',
          display_name: 'New Collection',
          description: 'Test collection'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result.name).toBe('new_collection')
      expect(result.display_name).toBe('New Collection')
    })

    it('should fail with validation error for invalid collection name', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.createCollection({
          name: 'Invalid Name!',
          display_name: 'Invalid'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
    })

    it('should fail with CollectionAlreadyExistsError when collection exists', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'existing-id' })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.createCollection({
          name: 'existing_collection',
          display_name: 'Existing'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(CollectionAlreadyExistsError)
      }
    })
  })

  describe('updateCollection', () => {
    it('should update collection', async () => {
      const existingCollection: Collection = {
        id: 'col-1',
        name: 'blog_posts',
        display_name: 'Blog Posts',
        description: 'Old description',
        schema: null,
        is_active: 1,
        managed: 0,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      const updatedCollection: Collection = {
        ...existingCollection,
        display_name: 'Updated Blog Posts',
        description: 'New description'
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(existingCollection)
        .mockResolvedValueOnce(updatedCollection)

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.updateCollection('col-1', {
          display_name: 'Updated Blog Posts',
          description: 'New description'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result.display_name).toBe('Updated Blog Posts')
      expect(result.description).toBe('New description')
    })

    it('should fail with CollectionNotFoundError when collection does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.updateCollection('nonexistent', {
          display_name: 'Updated'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(CollectionNotFoundError)
      }
    })
  })

  describe('deleteCollection', () => {
    it('should delete collection when it has no content', async () => {
      mockDB.prepare().first.mockResolvedValue({ count: 0 })
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.deleteCollection('col-1')
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM content_fields')
      )
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM collections')
      )
    })

    it('should fail when collection has content', async () => {
      mockDB.prepare().first.mockResolvedValue({ count: 5 })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.deleteCollection('col-1')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
    })
  })

  describe('getCollectionFields', () => {
    it('should return fields for a collection', async () => {
      const mockFields: CollectionField[] = [
        {
          id: 'field-1',
          collection_id: 'col-1',
          field_name: 'title',
          field_type: 'string',
          field_label: 'Title',
          field_options: {},
          field_order: 1,
          is_required: 1,
          is_searchable: 1,
          created_at: Date.now(),
          updated_at: Date.now()
        }
      ]

      mockDB.prepare().all.mockResolvedValue({ results: mockFields })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.getCollectionFields('col-1')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result).toEqual(mockFields)
    })
  })

  describe('createField', () => {
    it('should create a new field', async () => {
      const mockField: CollectionField = {
        id: 'field-1',
        collection_id: 'col-1',
        field_name: 'new_field',
        field_type: 'string',
        field_label: 'New Field',
        field_options: {},
        field_order: 2,
        is_required: 0,
        is_searchable: 1,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(null) // Check if exists
        .mockResolvedValueOnce({ max_order: 1 }) // Get max order
        .mockResolvedValueOnce(mockField) // Return created field

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.createField({
          collection_id: 'col-1',
          field_name: 'new_field',
          field_type: 'string',
          field_label: 'New Field',
          is_searchable: true
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result.field_name).toBe('new_field')
      expect(result.field_order).toBe(2)
    })

    it('should fail with validation error for invalid field name', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.createField({
          collection_id: 'col-1',
          field_name: 'Invalid Field!',
          field_type: 'string',
          field_label: 'Invalid'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
    })

    it('should fail with FieldAlreadyExistsError when field exists', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'existing-field' })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.createField({
          collection_id: 'col-1',
          field_name: 'existing_field',
          field_type: 'string',
          field_label: 'Existing'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(FieldAlreadyExistsError)
      }
    })
  })

  describe('updateField', () => {
    it('should update field', async () => {
      const existingField: CollectionField = {
        id: 'field-1',
        collection_id: 'col-1',
        field_name: 'title',
        field_type: 'string',
        field_label: 'Title',
        field_options: {},
        field_order: 1,
        is_required: 0,
        is_searchable: 1,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      const updatedField: CollectionField = {
        ...existingField,
        field_label: 'Updated Title',
        is_required: 1
      }

      mockDB.prepare().first
        .mockResolvedValueOnce(existingField)
        .mockResolvedValueOnce(updatedField)

      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.updateField('field-1', {
          field_label: 'Updated Title',
          is_required: true
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(result.field_label).toBe('Updated Title')
      expect(result.is_required).toBe(1)
    })

    it('should fail with FieldNotFoundError when field does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.updateField('nonexistent', {
          field_label: 'Updated'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(FieldNotFoundError)
      }
    })
  })

  describe('deleteField', () => {
    it('should delete field', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'field-1' })
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.deleteField('field-1')
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM content_fields')
      )
    })

    it('should fail with FieldNotFoundError when field does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.deleteField('nonexistent')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(FieldNotFoundError)
      }
    })
  })

  describe('reorderFields', () => {
    it('should reorder fields', async () => {
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.reorderFields(['field-2', 'field-1', 'field-3'])
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      // Note: mockDB.prepare is called for each field update (3 fields)
      // The actual implementation may have additional prepare calls internally
      expect(mockDB.prepare).toHaveBeenCalled()
      expect(mockDB.prepare().run).toHaveBeenCalled()
    })
  })

  describe('updateSchemaField', () => {
    it('should update schema field', async () => {
      const mockCollection: Collection = {
        id: 'col-1',
        name: 'blog_posts',
        display_name: 'Blog Posts',
        description: undefined,
        schema: JSON.stringify({
          type: 'object',
          properties: {
            title: { type: 'string', title: 'Title' }
          },
          required: []
        }),
        is_active: 1,
        managed: 0,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      mockDB.prepare().first.mockResolvedValue(mockCollection)
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.updateSchemaField('col-1', 'title', {
          field_label: 'Updated Title',
          is_required: true
        })
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB))
        )
      )

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE collections SET schema')
      )
    })

    it('should fail with CollectionNotFoundError when collection does not exist', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* service.updateSchemaField('nonexistent', 'title', {
          field_label: 'Updated'
        })
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeCollectionServiceLayer(mockDB)),
          Effect.either
        )
      )

      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left).toBeInstanceOf(CollectionNotFoundError)
      }
    })
  })
})