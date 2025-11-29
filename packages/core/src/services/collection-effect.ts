/**
 * Collection Service - Pure Effect Implementation
 * Handles collection CRUD operations and field management
 */

import { Context, Effect, Layer, Schema } from 'effect'
import {
  DatabaseService,
  DatabaseError,
  NotFoundError,
  ValidationError,
  makeDatabaseLayer
} from './database-effect'

/**
 * Collection types
 */
export interface Collection {
  id: string
  name: string
  display_name: string
  description?: string
  schema?: any
  is_active: number
  managed?: number // @deprecated Use code_managed and fields_editable instead
  code_managed?: number
  fields_editable?: number
  created_at: number
  updated_at: number
}

export interface CollectionField {
  id: string
  collection_id: string
  field_name: string
  field_type: string
  field_label: string
  field_options: any
  field_order: number
  is_required: number
  is_searchable: number
  created_at: number
  updated_at: number
}

export interface CreateCollectionInput {
  name: string
  display_name: string
  description?: string
  schema?: any
}

export interface UpdateCollectionInput {
  display_name?: string
  description?: string
  schema?: any
}

export interface CreateFieldInput {
  collection_id: string
  field_name: string
  field_type: string
  field_label: string
  field_options?: any
  is_required?: boolean
  is_searchable?: boolean
}

export interface UpdateFieldInput {
  field_label?: string
  field_type?: string
  field_options?: any
  is_required?: boolean
  is_searchable?: boolean
}

/**
 * Collection Service Error types
 */
export class CollectionNotFoundError {
  readonly _tag = 'CollectionNotFoundError'
  constructor(readonly collectionId: string) {}
}

export class CollectionAlreadyExistsError {
  readonly _tag = 'CollectionAlreadyExistsError'
  constructor(readonly name: string) {}
}

export class FieldNotFoundError {
  readonly _tag = 'FieldNotFoundError'
  constructor(readonly fieldId: string) {}
}

export class FieldAlreadyExistsError {
  readonly _tag = 'FieldAlreadyExistsError'
  constructor(readonly fieldName: string) {}
}

/**
 * Collection Service Interface - Closed Service Pattern
 * No DatabaseService in requirements - dependencies resolved in Layer
 */
export interface CollectionService {
  /**
   * Get all active collections
   */
  readonly getCollections: (
    search?: string
  ) => Effect.Effect<Collection[], DatabaseError>

  /**
   * Get collection by ID
   */
  readonly getCollectionById: (
    id: string
  ) => Effect.Effect<Collection, DatabaseError | CollectionNotFoundError>

  /**
   * Get collection by name
   */
  readonly getCollectionByName: (
    name: string
  ) => Effect.Effect<Collection, DatabaseError | CollectionNotFoundError>

  /**
   * Create new collection
   */
  readonly createCollection: (
    input: CreateCollectionInput
  ) => Effect.Effect<Collection, DatabaseError | CollectionAlreadyExistsError | ValidationError | NotFoundError>

  /**
   * Update collection
   */
  readonly updateCollection: (
    id: string,
    input: UpdateCollectionInput
  ) => Effect.Effect<Collection, DatabaseError | CollectionNotFoundError | NotFoundError>

  /**
   * Delete collection
   */
  readonly deleteCollection: (
    id: string
  ) => Effect.Effect<void, DatabaseError | CollectionNotFoundError | ValidationError>

  /**
   * Get fields for a collection
   */
  readonly getCollectionFields: (
    collectionId: string
  ) => Effect.Effect<CollectionField[], DatabaseError>

  /**
   * Create field for collection
   */
  readonly createField: (
    input: CreateFieldInput
  ) => Effect.Effect<CollectionField, DatabaseError | FieldAlreadyExistsError | ValidationError | NotFoundError>

  /**
   * Update field
   */
  readonly updateField: (
    fieldId: string,
    input: UpdateFieldInput
  ) => Effect.Effect<CollectionField, DatabaseError | FieldNotFoundError | NotFoundError>

  /**
   * Delete field
   */
  readonly deleteField: (
    fieldId: string
  ) => Effect.Effect<void, DatabaseError | FieldNotFoundError>

  /**
   * Reorder fields
   */
  readonly reorderFields: (
    fieldIds: string[]
  ) => Effect.Effect<void, DatabaseError>

  /**
   * Update schema field (for schema-based collections)
   */
  readonly updateSchemaField: (
    collectionId: string,
    fieldName: string,
    input: UpdateFieldInput
  ) => Effect.Effect<void, DatabaseError | CollectionNotFoundError | ValidationError>
}

/**
 * Collection Service Tag for dependency injection
 */
export const CollectionService = Context.GenericTag<CollectionService>('@services/CollectionService')

/**
 * Collection Service Live Implementation - Closed Service Pattern
 * Dependencies (DatabaseService) are resolved at Layer creation time
 */
export const CollectionServiceLive = Layer.effect(
  CollectionService,
  Effect.gen(function* (_) {
    // Get DatabaseService once at Layer creation time
    const db = yield* DatabaseService
    
    // Return service implementation with db in closure
    return {
      getCollections: (search?: string) =>
        Effect.gen(function* (_) {
          if (search) {
            const searchParam = `%${search}%`
            return yield* 
              db.query<Collection>(
                `SELECT id, name, display_name, description, created_at, managed, schema, is_active, updated_at
                 FROM collections
                 WHERE is_active = 1
                 AND (name LIKE ? OR display_name LIKE ? OR description LIKE ?)
                 ORDER BY created_at DESC`,
                [searchParam, searchParam, searchParam]
              )
            
          }

          return yield* 
            db.query<Collection>(
              `SELECT id, name, display_name, description, created_at, managed, schema, is_active, updated_at
               FROM collections
               WHERE is_active = 1
               ORDER BY created_at DESC`
            )
          
        }),

      getCollectionById: (id: string) =>
        Effect.gen(function* (_) {
          const collection = yield* 
            db.queryFirst<Collection>(
              'SELECT * FROM collections WHERE id = ?',
              [id]
            )
          

          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError(id))
          }

          return collection
        }),

      getCollectionByName: (name: string) =>
        Effect.gen(function* (_) {
          const collection = yield* 
            db.queryFirst<Collection>(
              'SELECT * FROM collections WHERE name = ?',
              [name]
            )
          

          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError(name))
          }

          return collection
        }),

      createCollection: (input: CreateCollectionInput) =>
        Effect.gen(function* (_) {
          // Validate name format
          if (!/^[a-z0-9_]+$/.test(input.name)) {
            return yield* 
              Effect.fail(
                new ValidationError(
                  'Collection name must contain only lowercase letters, numbers, and underscores'
                )
              )
            
          }

          // Check if collection already exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM collections WHERE name = ?',
              [input.name]
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          

          if (existing) {
            return yield* Effect.fail(new CollectionAlreadyExistsError(input.name))
          }

          // Create basic schema if not provided
          const schema = input.schema || {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                title: 'Title',
                required: true
              },
              content: {
                type: 'string',
                title: 'Content',
                format: 'richtext'
              },
              status: {
                type: 'string',
                title: 'Status',
                enum: ['draft', 'published', 'archived'],
                default: 'draft'
              }
            },
            required: ['title']
          }

          const collectionId = crypto.randomUUID()
          const now = Date.now()

          yield* 
            db.execute(
              `INSERT INTO collections (id, name, display_name, description, schema, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                collectionId,
                input.name,
                input.display_name,
                input.description || null,
                JSON.stringify(schema),
                1,
                now,
                now
              ]
            )
          

          return yield* 
            db.queryFirst<Collection>(
              'SELECT * FROM collections WHERE id = ?',
              [collectionId]
            ).pipe(
              Effect.flatMap((collection) =>
                collection
                  ? Effect.succeed(collection)
                  : Effect.fail(new NotFoundError('Collection not found after creation'))
              )
            )
          
        }),

      updateCollection: (id: string, input: UpdateCollectionInput) =>
        Effect.gen(function* (_) {
          // Check if collection exists
          const existing = yield* 
            db.queryFirst<Collection>(
              'SELECT * FROM collections WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new CollectionNotFoundError(id))
          }

          const now = Date.now()
          const updates: string[] = []
          const params: any[] = []

          if (input.display_name !== undefined) {
            updates.push('display_name = ?')
            params.push(input.display_name)
          }

          if (input.description !== undefined) {
            updates.push('description = ?')
            params.push(input.description)
          }

          if (input.schema !== undefined) {
            updates.push('schema = ?')
            params.push(JSON.stringify(input.schema))
          }

          updates.push('updated_at = ?')
          params.push(now)
          params.push(id)

          yield* 
            db.execute(
              `UPDATE collections SET ${updates.join(', ')} WHERE id = ?`,
              params
            )
          

          return yield* 
            db.queryFirst<Collection>(
              'SELECT * FROM collections WHERE id = ?',
              [id]
            ).pipe(
              Effect.flatMap((collection) =>
                collection
                  ? Effect.succeed(collection)
                  : Effect.fail(new NotFoundError('Collection not found after update'))
              )
            )
          
        }),

      deleteCollection: (id: string) =>
        Effect.gen(function* (_) {
          // Check if collection has content
          const contentCount = yield* 
            db.queryFirst<{ count: number }>(
              'SELECT COUNT(*) as count FROM content WHERE collection_id = ?',
              [id]
            )
          

          if (contentCount && contentCount.count > 0) {
            return yield* 
              Effect.fail(
                new ValidationError(
                  `Cannot delete collection: it contains ${contentCount.count} content item(s)`
                )
              )
            
          }

          // Delete collection fields first
          yield* 
            db.execute(
              'DELETE FROM content_fields WHERE collection_id = ?',
              [id]
            )
          

          // Delete collection
          yield* 
            db.execute(
              'DELETE FROM collections WHERE id = ?',
              [id]
            )
          
        }),

      getCollectionFields: (collectionId: string) =>
        Effect.gen(function* (_) {
          return yield* 
            db.query<CollectionField>(
              `SELECT * FROM content_fields
               WHERE collection_id = ?
               ORDER BY field_order ASC`,
              [collectionId]
            )
          
        }),

      createField: (input: CreateFieldInput) =>
        Effect.gen(function* (_) {
          // Validate field name format
          if (!/^[a-z0-9_]+$/.test(input.field_name)) {
            return yield* 
              Effect.fail(
                new ValidationError(
                  'Field name must contain only lowercase letters, numbers, and underscores'
                )
              )
            
          }

          // Check if field already exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM content_fields WHERE collection_id = ? AND field_name = ?',
              [input.collection_id, input.field_name]
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          

          if (existing) {
            return yield* Effect.fail(new FieldAlreadyExistsError(input.field_name))
          }

          // Get next field order
          const orderResult = yield* 
            db.queryFirst<{ max_order: number | null }>(
              'SELECT MAX(field_order) as max_order FROM content_fields WHERE collection_id = ?',
              [input.collection_id]
            )
          

          const nextOrder = (orderResult?.max_order || 0) + 1
          const fieldId = crypto.randomUUID()
          const now = Date.now()

          yield* 
            db.execute(
              `INSERT INTO content_fields (
                id, collection_id, field_name, field_type, field_label,
                field_options, field_order, is_required, is_searchable,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                fieldId,
                input.collection_id,
                input.field_name,
                input.field_type,
                input.field_label,
                JSON.stringify(input.field_options || {}),
                nextOrder,
                input.is_required ? 1 : 0,
                input.is_searchable ? 1 : 0,
                now,
                now
              ]
            )
          

          return yield* 
            db.queryFirst<CollectionField>(
              'SELECT * FROM content_fields WHERE id = ?',
              [fieldId]
            ).pipe(
              Effect.flatMap((field) =>
                field
                  ? Effect.succeed(field)
                  : Effect.fail(new NotFoundError('Field not found after creation'))
              )
            )
          
        }),

      updateField: (fieldId: string, input: UpdateFieldInput) =>
        Effect.gen(function* (_) {
          // Check if field exists
          const existing = yield* 
            db.queryFirst<CollectionField>(
              'SELECT * FROM content_fields WHERE id = ?',
              [fieldId]
            )
          

          if (!existing) {
            return yield* Effect.fail(new FieldNotFoundError(fieldId))
          }

          const now = Date.now()
          const updates: string[] = []
          const params: any[] = []

          if (input.field_label !== undefined) {
            updates.push('field_label = ?')
            params.push(input.field_label)
          }

          if (input.field_type !== undefined) {
            updates.push('field_type = ?')
            params.push(input.field_type)
          }

          if (input.field_options !== undefined) {
            updates.push('field_options = ?')
            params.push(JSON.stringify(input.field_options))
          }

          if (input.is_required !== undefined) {
            updates.push('is_required = ?')
            params.push(input.is_required ? 1 : 0)
          }

          if (input.is_searchable !== undefined) {
            updates.push('is_searchable = ?')
            params.push(input.is_searchable ? 1 : 0)
          }

          updates.push('updated_at = ?')
          params.push(now)
          params.push(fieldId)

          yield* 
            db.execute(
              `UPDATE content_fields SET ${updates.join(', ')} WHERE id = ?`,
              params
            )
          

          return yield* 
            db.queryFirst<CollectionField>(
              'SELECT * FROM content_fields WHERE id = ?',
              [fieldId]
            ).pipe(
              Effect.flatMap((field) =>
                field
                  ? Effect.succeed(field)
                  : Effect.fail(new NotFoundError('Field not found after update'))
              )
            )
          
        }),

      deleteField: (fieldId: string) =>
        Effect.gen(function* (_) {
          // Check if field exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM content_fields WHERE id = ?',
              [fieldId]
            )
          

          if (!existing) {
            return yield* Effect.fail(new FieldNotFoundError(fieldId))
          }

          yield* 
            db.execute(
              'DELETE FROM content_fields WHERE id = ?',
              [fieldId]
            )
          
        }),

      reorderFields: (fieldIds: string[]) =>
        Effect.gen(function* (_) {
          const now = Date.now()

          // Update field order for each field
          for (let i = 0; i < fieldIds.length; i++) {
            yield* 
              db.execute(
                'UPDATE content_fields SET field_order = ?, updated_at = ? WHERE id = ?',
                [i + 1, now, fieldIds[i]]
              )
            
          }
        }),

      updateSchemaField: (collectionId: string, fieldName: string, input: UpdateFieldInput) =>
        Effect.gen(function* (_) {
          // Get the collection
          const collection = yield* 
            db.queryFirst<Collection>(
              'SELECT * FROM collections WHERE id = ?',
              [collectionId]
            )
          

          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError(collectionId))
          }

          // Parse schema
          let schema: any
          try {
            schema = typeof collection.schema === 'string'
              ? JSON.parse(collection.schema)
              : collection.schema
          } catch (e) {
            return yield* 
              Effect.fail(new ValidationError('Invalid collection schema'))
            
          }

          if (!schema || !schema.properties) {
            schema = { type: 'object', properties: {}, required: [] }
          }

          if (!schema.properties[fieldName]) {
            return yield* 
              Effect.fail(new ValidationError(`Field ${fieldName} not found in schema`))
            
          }

          // Update the field in the schema
          const updatedFieldConfig: any = {
            ...schema.properties[fieldName]
          }

          if (input.field_type !== undefined) {
            updatedFieldConfig.type = input.field_type
          }

          if (input.field_label !== undefined) {
            updatedFieldConfig.title = input.field_label
          }

          if (input.is_searchable !== undefined) {
            updatedFieldConfig.searchable = input.is_searchable
          }

          if (input.is_required !== undefined) {
            if (input.is_required) {
              updatedFieldConfig.required = true
              if (!schema.required) schema.required = []
              if (!schema.required.includes(fieldName)) {
                schema.required.push(fieldName)
              }
            } else {
              delete updatedFieldConfig.required
              if (schema.required) {
                schema.required = schema.required.filter((f: string) => f !== fieldName)
              }
            }
          }

          schema.properties[fieldName] = updatedFieldConfig

          // Update the collection
          const now = Date.now()
          yield* 
            db.execute(
              'UPDATE collections SET schema = ?, updated_at = ? WHERE id = ?',
              [JSON.stringify(schema), now, collectionId]
            )
          
        })
    }
  })
)

/**
 * Helper function to create Collection service layer with database dependency
 * Usage: makeCollectionServiceLayer(mockDb) for tests
 */
export const makeCollectionServiceLayer = (db: any) =>
  Layer.provide(CollectionServiceLive, makeDatabaseLayer(db))

