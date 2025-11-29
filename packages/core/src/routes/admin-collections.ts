/**
 * Admin Collections Routes - Pure Effect Implementation
 * Manages collection CRUD operations and field management
 * REFACTORED ✅ - Middleware moved to app.ts
 */

import { Effect } from 'effect'
import { Hono } from 'hono'
import { html } from 'hono/html'
import type { Bindings, Variables } from '../app'
import { getTranslate } from '../middleware'
import { isPluginActive } from '../middleware/plugin-middleware'
import {
  CollectionService,
  CollectionNotFoundError,
  CollectionAlreadyExistsError,
  FieldNotFoundError,
  FieldAlreadyExistsError,
  type Collection,
  type CollectionField
} from '../services/collection-effect'
import {
  DatabaseService,
  DatabaseError,
  ValidationError
} from '../services/database-effect'
import { SettingsService, makeAppLayer } from '../services'
import { renderCollectionFormPage } from '../templates/pages/admin-collections-form.template'
import { renderCollectionsListPage } from '../templates/pages/admin-collections-list.template'

const adminCollectionsRoutes = new Hono<{
  Bindings: Bindings
  Variables: Variables
}>()

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

/**
 * Helper to get field counts from collections
 */
const getFieldCounts = (collections: Collection[]) =>
  Effect.gen(function* (_) {
    const db = yield* DatabaseService
    
    // Fetch field counts for all collections from content_fields table
    const fieldCountResults = yield* 
      db.query<{ collection_id: string; count: number }>(
        'SELECT collection_id, COUNT(*) as count FROM content_fields GROUP BY collection_id'
      )
    
    
    const customFieldCounts = new Map(
      fieldCountResults.map((row) => [String(row.collection_id), Number(row.count)])
    )
    
    // Process collections and calculate field counts (schema + custom fields)
    return collections.map((collection) => {
      let schemaFieldCount = 0
      let customFieldCount = customFieldCounts.get(String(collection.id)) || 0
      
      // Count schema fields
      if (collection.schema) {
        try {
          const schema = typeof collection.schema === 'string'
            ? JSON.parse(collection.schema)
            : collection.schema
          if (schema && schema.properties) {
            schemaFieldCount = Object.keys(schema.properties).length
          }
        } catch (e) {
          console.error('Error parsing schema for field count:', e)
        }
      }
      
      const totalFieldCount = schemaFieldCount + customFieldCount
      
      return {
        ...collection,
        field_count: totalFieldCount,
        formattedDate: collection.created_at
          ? new Date(collection.created_at).toLocaleDateString()
          : 'Unknown',
        managed: collection.managed === 1,
        code_managed: collection.code_managed === 1,
        fields_editable: collection.fields_editable === 1
      }
    })
  })

/**
 * Helper to get collection fields (from schema or database)
 */
const getCollectionFieldsWithSchema = (collectionId: string, schema: any) =>
  Effect.gen(function* (_) {
    const collectionService = yield* CollectionService
    
    // Get custom fields from content_fields table
    const dbFields = yield* collectionService.getCollectionFields(collectionId)
    
    // Get schema fields
    let schemaFields: CollectionField[] = []
    if (schema) {
      try {
        const parsedSchema = typeof schema === 'string' ? JSON.parse(schema) : schema
        if (parsedSchema && parsedSchema.properties) {
          // Convert schema properties to field format
          let fieldOrder = 0
          schemaFields = Object.entries(parsedSchema.properties).map(
            ([fieldName, fieldConfig]: [string, any]) => ({
              id: `schema-${fieldName}`,
              collection_id: collectionId,
              field_name: fieldName,
              field_type: fieldConfig.type || 'string',
              field_label: fieldConfig.title || fieldName,
              field_options: fieldConfig,
              field_order: fieldOrder++,
              is_required:
                fieldConfig.required === true ||
                (parsedSchema.required && parsedSchema.required.includes(fieldName)) ? 1 : 0,
              is_searchable: fieldConfig.searchable === true ? 1 : 0,
              created_at: Date.now(),
              updated_at: Date.now()
            })
          )
        }
      } catch (e) {
        console.error('Error parsing collection schema:', e)
      }
    }
    
    // MERGE both sources: schema fields first, then custom DB fields
    return [...schemaFields, ...dbFields]
  })

// List all collections
adminCollectionsRoutes.get('/', (c) => {
  const t = getTranslate(c)
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const url = new URL(c.req.url)
    const search = url.searchParams.get('search') || ''
    
    const collectionService = yield* CollectionService
    const settingsService = yield* SettingsService
    
    // Get collections
    const collections = yield* 
      collectionService.getCollections(search || undefined)
    

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()
    
    // Get field counts
    const collectionsWithCounts = yield* getFieldCounts(collections)
    
    return {
      collections: collectionsWithCounts,
      search,
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer (includes CollectionService, SettingsService, DatabaseService)
      Effect.catchAll((error) => {
        console.error('Error fetching collections:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return Effect.succeed({
          collections: [],
          error: `Error loading collections: ${errorMessage}`
        })
      })
    )
  ).then(data => c.html(renderCollectionsListPage(data as any, t)))
})

// New collection form
adminCollectionsRoutes.get('/new', (c) => {
  const t = getTranslate(c)
  const user = c.get('user')
  const db = c.env.DB
  
  const program = Effect.gen(function* (_) {
    // Check which editor plugins are active
    // Note: Effect.promise() is the correct Effect pattern for wrapping Promise-returning functions
    // This is Pure Effect - we're converting external Promises into the Effect context
    const [quillActive, mdxeditorActive] = yield*
      Effect.all([
        Effect.tryPromise({
          try: () => isPluginActive(db, 'quill-editor'),
          catch: (error) => new Error(`Failed to check quill-editor plugin: ${error}`)
        }),
        Effect.tryPromise({
          try: () => isPluginActive(db, 'easy-mdx'),
          catch: (error) => new Error(`Failed to check easy-mdx plugin: ${error}`)
        })
      ]).pipe(
        // Fallback to false if plugin checks fail
        Effect.catchAll(() => Effect.succeed([false, false]))
      )
    
    
    return { quillActive, mdxeditorActive }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({ quillActive: false, mdxeditorActive: false }))
    )
  ).then(({ quillActive, mdxeditorActive }) => {
    const formData = {
      isEdit: false,
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      version: c.get('appVersion'),
      editorPlugins: {
        quill: quillActive,
        easyMdx: mdxeditorActive
      }
    }
    
    return c.html(renderCollectionFormPage(formData, t))
  })
})

// Create collection
adminCollectionsRoutes.post('/', (c) => {
  const program = Effect.gen(function* (_) {
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const name = formData.get('name') as string
    const displayName = formData.get('displayName') as string
    const description = formData.get('description') as string
    
    if (!name || !displayName) {
      return {
        type: 'error' as const,
        message: 'Name and display name are required.'
      }
    }
    
    const collectionService = yield* CollectionService
    
    const collection = yield* 
      collectionService.createCollection({
        name,
        display_name: displayName,
        description: description || undefined
      })
    
    
    // Clear cache if available
    if (c.env.CACHE_KV) {
      yield* 
        Effect.tryPromise({
          try: async () => {
            await c.env.CACHE_KV.delete('cache:collections:all')
            await c.env.CACHE_KV.delete(`cache:collection:${name}`)
          },
          catch: () => undefined
        }).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      
    }
    
    return {
      type: 'success' as const,
      collectionId: collection.id
    }
  })
  
  const db = c.env.DB
  const isHtmx = c.req.header('HX-Request') === 'true'
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error creating collection:', error)
        
        let message = 'Failed to create collection. Please try again.'
        
        if (error instanceof ValidationError) {
          message = error.message
        } else if (error instanceof CollectionAlreadyExistsError) {
          message = 'A collection with this name already exists.'
        }
        
        return Effect.succeed({
          type: 'error' as const,
          message
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      if (isHtmx) {
        return c.html(html`
          <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            ${result.message}
          </div>
        `)
      } else {
        return c.redirect('/admin/collections/new')
      }
    }
    
    if (isHtmx) {
      return c.html(html`
        <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          Collection created successfully! Redirecting to edit mode...
          <script>
            setTimeout(() => {
              window.location.href = "/admin/collections/${result.collectionId}";
            }, 1500);
          </script>
        </div>
      `)
    } else {
      return c.redirect(`/admin/collections/${result.collectionId}`)
    }
  })
})

// Edit collection form
adminCollectionsRoutes.get('/:id', (c) => {
  const t = getTranslate(c)
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const user = c.get('user')
    const db = c.env.DB
    
    const collectionService = yield* CollectionService
    
    const collection = yield* 
      collectionService.getCollectionById(id).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    
    
    if (!collection) {
      // Check editor plugins even in error state
      const [quillActive, mdxeditorActive] = yield*
        Effect.tryPromise({
          try: async () => Promise.all([
            isPluginActive(db, 'quill-editor'),
            isPluginActive(db, 'easy-mdx')
          ]),
          catch: (error) => new Error(`Failed to check editor plugins: ${error}`)
        }).pipe(
          Effect.catchAll(() => Effect.succeed([false, false]))
        )
      
      
      return {
        type: 'error' as const,
        error: 'Collection not found.',
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        version: c.get('appVersion'),
        editorPlugins: {
          quill: quillActive,
          easyMdx: mdxeditorActive
        }
      }
    }
    
    // Get collection fields
    const fields = yield* getCollectionFieldsWithSchema(id, collection.schema)
    
    // Check editor plugins
    const [quillActive, mdxeditorActive] = yield*
      Effect.tryPromise({
        try: async () => Promise.all([
          isPluginActive(db, 'quill-editor'),
          isPluginActive(db, 'easy-mdx')
        ]),
        catch: (error) => new Error(`Failed to check editor plugins: ${error}`)
      }).pipe(
        Effect.catchAll(() => Effect.succeed([false, false]))
      )
    
    
    return {
      type: 'success' as const,
      id: collection.id,
      name: collection.name,
      display_name: collection.display_name,
      description: collection.description,
      fields,
      managed: collection.managed === 1,
      code_managed: collection.code_managed === 1,
      fields_editable: collection.fields_editable === 1,
      isEdit: true,
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      version: c.get('appVersion'),
      editorPlugins: {
        quill: quillActive,
        easyMdx: mdxeditorActive
      }
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching collection:', error)
        const user = c.get('user')
        
        return Effect.succeed({
          type: 'error' as const,
          error: 'Failed to load collection.',
          isEdit: true,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          version: c.get('appVersion'),
          editorPlugins: {
            quill: false,
            easyMdx: false
          }
        })
      })
    )
  ).then(data => c.html(renderCollectionFormPage(data as any, t)))
})

// Update collection
adminCollectionsRoutes.put('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const displayName = formData.get('displayName') as string
    const description = formData.get('description') as string
    
    if (!displayName) {
      return {
        type: 'error' as const,
        message: 'Display name is required.'
      }
    }
    
    const collectionService = yield* CollectionService
    
    yield* 
      collectionService.updateCollection(id, {
        display_name: displayName,
        description: description || undefined
      })
    
    
    return {
      type: 'success' as const,
      message: 'Collection updated successfully!'
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error updating collection:', error)
        
        let message = 'Failed to update collection. Please try again.'
        if (error instanceof CollectionNotFoundError) {
          message = 'Collection not found.'
        }
        
        return Effect.succeed({
          type: 'error' as const,
          message
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ${result.message}
        </div>
      `)
    }
    
    return c.html(html`
      <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        ${result.message}
      </div>
    `)
  })
})

// Delete collection
adminCollectionsRoutes.delete('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const collectionService = yield* CollectionService
    
    yield* collectionService.deleteCollection(id)
    
    return { type: 'success' as const }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error deleting collection:', error)
        
        let message = 'Failed to delete collection. Please try again.'
        
        if (error instanceof ValidationError) {
          message = error.message
        }
        
        return Effect.succeed({
          type: 'error' as const,
          message
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ${result.message}
        </div>
      `)
    }
    
    return c.html(html`
      <script>
        window.location.href = "/admin/collections";
      </script>
    `)
  })
})

// Add field to collection
adminCollectionsRoutes.post('/:id/fields', (c) => {
  const program = Effect.gen(function* (_) {
    const collectionId = c.req.param('id')
    
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const fieldName = formData.get('field_name') as string
    const fieldType = formData.get('field_type') as string
    const fieldLabel = formData.get('field_label') as string
    const isRequired = formData.get('is_required') === '1'
    const isSearchable = formData.get('is_searchable') === '1'
    const fieldOptions = (formData.get('field_options') as string) || '{}'
    
    if (!fieldName || !fieldType || !fieldLabel) {
      return {
        success: false,
        error: 'Field name, type, and label are required.'
      }
    }
    
    const collectionService = yield* CollectionService
    
    let parsedOptions: any = {}
    try {
      parsedOptions = JSON.parse(fieldOptions)
    } catch (e) {
      parsedOptions = {}
    }
    
    const field = yield* 
      collectionService.createField({
        collection_id: collectionId,
        field_name: fieldName,
        field_type: fieldType,
        field_label: fieldLabel,
        field_options: parsedOptions,
        is_required: isRequired,
        is_searchable: isSearchable
      })
    
    
    return {
      success: true,
      fieldId: field.id
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error adding field:', error)
        
        let message = 'Failed to add field.'
        
        if (error instanceof ValidationError) {
          message = error.message
        } else if (error instanceof FieldAlreadyExistsError) {
          message = 'A field with this name already exists.'
        }
        
        return Effect.succeed({
          success: false,
          error: message
        })
      })
    )
  ).then(result => c.json(result))
})

// Update field
adminCollectionsRoutes.put('/:collectionId/fields/:fieldId', (c) => {
  const program = Effect.gen(function* (_) {
    const fieldId = c.req.param('fieldId')
    const collectionId = c.req.param('collectionId')
    
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new ValidationError('Failed to parse form data')
      })
    
    
    const fieldLabel = formData.get('field_label') as string
    const fieldType = formData.get('field_type') as string
    const isRequiredValues = formData.getAll('is_required')
    const isSearchableValues = formData.getAll('is_searchable')
    const isRequired = isRequiredValues[isRequiredValues.length - 1] === '1'
    const isSearchable = isSearchableValues[isSearchableValues.length - 1] === '1'
    const fieldOptions = (formData.get('field_options') as string) || '{}'
    
    if (!fieldLabel) {
      return { success: false, error: 'Field label is required.' }
    }
    
    const collectionService = yield* CollectionService
    
    // Check if this is a schema field
    if (fieldId.startsWith('schema-')) {
      const fieldName = fieldId.replace('schema-', '')
      
      yield* 
        collectionService.updateSchemaField(collectionId, fieldName, {
          field_label: fieldLabel,
          field_type: fieldType,
          is_required: isRequired,
          is_searchable: isSearchable
        })
      
    } else {
      // Regular database field
      let parsedOptions: any = {}
      try {
        parsedOptions = JSON.parse(fieldOptions)
      } catch (e) {
        parsedOptions = {}
      }
      
      yield* 
        collectionService.updateField(fieldId, {
          field_label: fieldLabel,
          field_type: fieldType,
          field_options: parsedOptions,
          is_required: isRequired,
          is_searchable: isSearchable
        })
      
    }
    
    return { success: true }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error updating field:', error)
        
        let message = 'Failed to update field.'
        
        if (error instanceof FieldNotFoundError || error instanceof CollectionNotFoundError) {
          message = 'Field or collection not found.'
        } else if (error instanceof ValidationError) {
          message = error.message
        }
        
        return Effect.succeed({
          success: false,
          error: message
        })
      })
    )
  ).then(result => c.json(result))
})

// Delete field
adminCollectionsRoutes.delete('/:collectionId/fields/:fieldId', (c) => {
  const program = Effect.gen(function* (_) {
    const fieldId = c.req.param('fieldId')
    const collectionService = yield* CollectionService
    
    yield* collectionService.deleteField(fieldId)
    
    return { success: true }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error deleting field:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to delete field.'
        })
      })
    )
  ).then(result => c.json(result))
})

// Update field order
adminCollectionsRoutes.post('/:collectionId/fields/reorder', (c) => {
  const program = Effect.gen(function* (_) {
    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new ValidationError('Failed to parse JSON')
      })
    
    
    const fieldIds = body.fieldIds as string[]
    
    if (!Array.isArray(fieldIds)) {
      return { success: false, error: 'Invalid field order data.' }
    }
    
    const collectionService = yield* CollectionService
    
    yield* collectionService.reorderFields(fieldIds)
    
    return { success: true }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error reordering fields:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to reorder fields.'
        })
      })
    )
  ).then(result => c.json(result))
})

export { adminCollectionsRoutes }