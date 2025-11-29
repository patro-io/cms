/**
 * Admin API Routes
 *
 * Provides JSON API endpoints for admin operations
 * These routes complement the admin UI and can be used programmatically
 * 
 * FULLY MIGRATED TO PURE EFFECT ✅ - Sprint 2
 */

import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import { effectValidator as zValidator } from '../middleware/effect-validator'
import type { Bindings, Variables } from '../app'
import { DatabaseService, DatabaseError, ValidationError } from '../services/database-effect'
import { MigrationService, makeMigrationServiceLayer } from '../services/migrations'
import { makeAppLayer, isValidLocale } from '../services'

export const adminApiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth, requireRole, i18nMiddleware) now applied in app.ts
// This keeps routes clean and focused on business logic

/**
 * Get dashboard statistics
 * GET /admin/api/stats
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/stats', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    
    // Get collections count
    const collectionsCount = yield* 
      dbService.queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM collections WHERE is_active = 1',
        []
      ).pipe(
        Effect.map(result => result?.count || 0)
      )
    
    
    // Get content count
    const contentCount = yield* 
      dbService.queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL',
        []
      ).pipe(
        Effect.map(result => result?.count || 0)
      )
    
    
    // Get media count and total size
    const mediaResult = yield* 
      dbService.queryFirst<{ count: number; total_size: number }>(
        'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM media WHERE deleted_at IS NULL',
        []
      )
    
    
    const mediaCount = mediaResult?.count || 0
    const mediaSize = mediaResult?.total_size || 0
    
    // Get users count
    const usersCount = yield* 
      dbService.queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM users WHERE is_active = 1',
        []
      ).pipe(
        Effect.map(result => result?.count || 0)
      )
    
    
    return {
      collections: collectionsCount,
      contentItems: contentCount,
      mediaFiles: mediaCount,
      mediaSize: mediaSize,
      users: usersCount,
      timestamp: new Date().toISOString()
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching stats:', error)
        return Effect.succeed({
          error: 'Failed to fetch statistics',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result && result.statusCode === 500) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result)
  })
})

/**
 * Get storage usage
 * GET /admin/api/storage
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/storage', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    
    // Get database size from D1 metadata
    const databaseSize = yield* 
      dbService.execute('SELECT 1', []).pipe(
        Effect.map(result => (result as any)?.meta?.size_after || 0),
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(0))
      )
    
    
    // Get media total size
    const mediaSize = yield* 
      dbService.queryFirst<{ total_size: number }>(
        'SELECT COALESCE(SUM(size), 0) as total_size FROM media WHERE deleted_at IS NULL',
        []
      ).pipe(
        Effect.map(result => result?.total_size || 0),
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(0))
      )
    
    
    return {
      databaseSize,
      mediaSize,
      totalSize: databaseSize + mediaSize,
      timestamp: new Date().toISOString()
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching storage usage:', error)
        return Effect.succeed({
          error: 'Failed to fetch storage usage',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result && result.statusCode === 500) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result)
  })
})

/**
 * Get recent activity
 * GET /admin/api/activity
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/activity', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const limit = parseInt(c.req.query('limit') || '10')
    
    // Get recent activities from activity_logs table
    const results = yield* 
      dbService.query<{
        id: string
        action: string
        resource_type: string
        resource_id: string
        details: string
        created_at: number
        email: string
        first_name: string
        last_name: string
      }>(
        `SELECT
          a.id,
          a.action,
          a.resource_type,
          a.resource_id,
          a.details,
          a.created_at,
          u.email,
          u.first_name,
          u.last_name
        FROM activity_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.resource_type IN ('content', 'collections', 'users', 'media')
        ORDER BY a.created_at DESC
        LIMIT ?`,
        [limit]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed([]))
      )
    
    
    const recentActivity = results.map((row) => {
      const userName = row.first_name && row.last_name
        ? `${row.first_name} ${row.last_name}`
        : row.email || 'System'
      
      let details: Record<string, unknown> = {}
      try {
        details = row.details ? JSON.parse(row.details) : {}
      } catch (e) {
        console.error('Error parsing activity details:', e)
      }
      
      return {
        id: row.id,
        type: row.resource_type,
        action: row.action,
        resource_id: row.resource_id,
        details,
        timestamp: new Date(Number(row.created_at)).toISOString(),
        user: userName
      }
    })
    
    return {
      data: recentActivity,
      count: recentActivity.length,
      timestamp: new Date().toISOString()
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching recent activity:', error)
        return Effect.succeed({
          error: 'Failed to fetch recent activity',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result && result.statusCode === 500) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result)
  })
})

/**
 * Collection management schema
 */
const createCollectionSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(255),
    Schema.filter((s): s is string => /^[a-z0-9_]+$/.test(s), {
      message: () => 'Must contain only lowercase letters, numbers, and underscores'
    })
  ),
  displayName: Schema.optional(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))),
  display_name: Schema.optional(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))),
  description: Schema.optional(Schema.String)
})

const updateCollectionSchema = Schema.Struct({
  display_name: Schema.optional(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))),
  description: Schema.optional(Schema.String),
  is_active: Schema.optional(Schema.Boolean)
})

/**
 * Get all collections
 * GET /admin/api/collections
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/collections', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const search = c.req.query('search') || ''
    const includeInactive = c.req.query('includeInactive') === 'true'

    // Build query based on search and includeInactive
    let sql = `
      SELECT id, name, display_name, description, created_at, updated_at, is_active, managed
      FROM collections
    `
    const params: unknown[] = []
    
    if (!includeInactive) {
      sql += ' WHERE is_active = 1'
    }
    
    if (search) {
      sql += includeInactive ? ' WHERE ' : ' AND '
      sql += '(name LIKE ? OR display_name LIKE ? OR description LIKE ?)'
      const searchParam = `%${search}%`
      params.push(searchParam, searchParam, searchParam)
    }
    
    sql += ' ORDER BY created_at DESC'

    const results = yield* dbService.query<{
      id: string
      name: string
      display_name: string
      description: string
      created_at: number
      updated_at: number
      is_active: number
      managed: number
    }>(sql, params)

    // Get field counts
    const fieldCountResults = yield* 
      dbService.query<{ collection_id: string; count: number }>(
        'SELECT collection_id, COUNT(*) as count FROM content_fields GROUP BY collection_id',
        []
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed([]))
      )
    
    
    const fieldCounts = new Map(
      fieldCountResults.map(row => [String(row.collection_id), Number(row.count)])
    )

    const collections = results.map(row => ({
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      is_active: row.is_active === 1,
      managed: row.managed === 1,
      field_count: fieldCounts.get(String(row.id)) || 0
    }))

    return {
      data: collections,
      count: collections.length,
      timestamp: new Date().toISOString()
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching collections:', error)
        return Effect.succeed({
          error: 'Failed to fetch collections',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result && result.statusCode === 500) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result)
  })
})

/**
 * Get single collection
 * GET /admin/api/collections/:id
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/collections/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const dbService = yield* DatabaseService

    const collection = yield* 
      dbService.queryFirst<{
        id: string
        name: string
        display_name: string
        description: string
        is_active: number
        managed: number
        schema: string
        created_at: number
        updated_at: number
      }>('SELECT * FROM collections WHERE id = ?', [id])
    

    if (!collection) {
      return { error: 'Collection not found', statusCode: 404 }
    }

    // Get collection fields
    const fieldsResults = yield* 
      dbService.query<{
        id: string
        field_name: string
        field_type: string
        field_label: string
        field_options: string
        field_order: number
        is_required: number
        is_searchable: number
        created_at: number
        updated_at: number
      }>(
        `SELECT * FROM content_fields
         WHERE collection_id = ?
         ORDER BY field_order ASC`,
        [id]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed([]))
      )
    

    const fields = fieldsResults.map(row => ({
      id: row.id,
      field_name: row.field_name,
      field_type: row.field_type,
      field_label: row.field_label,
      field_options: row.field_options ? JSON.parse(row.field_options) : {},
      field_order: row.field_order,
      is_required: row.is_required === 1,
      is_searchable: row.is_searchable === 1,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    }))

    return {
      id: collection.id,
      name: collection.name,
      display_name: collection.display_name,
      description: collection.description,
      is_active: collection.is_active === 1,
      managed: collection.managed === 1,
      schema: collection.schema ? JSON.parse(collection.schema) : null,
      created_at: Number(collection.created_at),
      updated_at: Number(collection.updated_at),
      fields
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching collection:', error)
        return Effect.succeed({
          error: 'Failed to fetch collection',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 404 | 500
      return c.json({ error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Create collection
 * POST /admin/api/collections
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.post('/collections', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    
    // Validate content type
    const contentType = c.req.header('Content-Type')
    if (!contentType || !contentType.includes('application/json')) {
      return { error: 'Content-Type must be application/json', statusCode: 400 }
    }

    // Parse JSON body
    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: () => new ValidationError('Invalid JSON in request body')
      })
    

    // Validate using Effect Schema
    const validation = Schema.decodeUnknownEither(createCollectionSchema)(body)
    if (validation._tag === 'Left') {
      return {
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }
    
    const validatedData = validation.right

    // Handle both camelCase and snake_case for display_name
    const displayName = validatedData.displayName || validatedData.display_name || ''

    // Check if collection already exists
    const existing = yield* 
      dbService.queryFirst<{ id: string }>(
        'SELECT id FROM collections WHERE name = ?',
        [validatedData.name]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (existing) {
      return { error: 'A collection with this name already exists', statusCode: 400 }
    }

    // Create basic schema
    const basicSchema = {
      type: "object",
      properties: {
        title: {
          type: "string",
          title: "Title",
          required: true
        },
        content: {
          type: "string",
          title: "Content",
          format: "richtext"
        },
        status: {
          type: "string",
          title: "Status",
          enum: ["draft", "published", "archived"],
          default: "draft"
        }
      },
      required: ["title"]
    }

    const collectionId = crypto.randomUUID()
    const now = Date.now()

    yield* 
      dbService.execute(
        `INSERT INTO collections (id, name, display_name, description, schema, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          collectionId,
          validatedData.name,
          displayName,
          validatedData.description || null,
          JSON.stringify(basicSchema),
          1,
          now,
          now
        ]
      )
    

    // Clear cache (non-blocking)
    Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          await c.env.CACHE_KV.delete('cache:collections:all')
          await c.env.CACHE_KV.delete(`cache:collection:${validatedData.name}`)
        },
        catch: () => new DatabaseError({ message: 'Cache clear failed' })
      }).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})

    return {
      id: collectionId,
      name: validatedData.name,
      displayName: displayName,
      description: validatedData.description,
      created_at: now,
      statusCode: 201
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error creating collection:', error)
        return Effect.succeed({
          error: 'Failed to create collection',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = result.statusCode as 201 | 400 | 500
    const { statusCode: _, ...data } = result
    return c.json(data, statusCode)
  })
})

/**
 * Update collection
 * PATCH /admin/api/collections/:id
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.patch('/collections/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const dbService = yield* DatabaseService
    
    // Parse JSON body
    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: () => new ValidationError('Invalid JSON in request body')
      })
    

    // Validate using Effect Schema
    const validation = Schema.decodeUnknownEither(updateCollectionSchema)(body)
    if (validation._tag === 'Left') {
      return {
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }
    
    const validatedData = validation.right as {
      display_name?: string
      description?: string
      is_active?: boolean
    }

    // Check if collection exists
    const existing = yield* 
      dbService.queryFirst<{ name: string }>(
        'SELECT name FROM collections WHERE id = ?',
        [id]
      )
    

    if (!existing) {
      return { error: 'Collection not found', statusCode: 404 }
    }

    // Build update query
    const updateFields: string[] = []
    const updateParams: unknown[] = []

    if (validatedData.display_name !== undefined) {
      updateFields.push('display_name = ?')
      updateParams.push(validatedData.display_name)
    }

    if (validatedData.description !== undefined) {
      updateFields.push('description = ?')
      updateParams.push(validatedData.description)
    }

    if (validatedData.is_active !== undefined) {
      updateFields.push('is_active = ?')
      updateParams.push(validatedData.is_active ? 1 : 0)
    }

    if (updateFields.length === 0) {
      return { error: 'No fields to update', statusCode: 400 }
    }

    updateFields.push('updated_at = ?')
    updateParams.push(Date.now())
    updateParams.push(id)

    yield* 
      dbService.execute(
        `UPDATE collections SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      )
    

    // Clear cache (non-blocking)
    Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          await c.env.CACHE_KV.delete('cache:collections:all')
          await c.env.CACHE_KV.delete(`cache:collection:${existing.name}`)
        },
        catch: () => new DatabaseError({ message: 'Cache clear failed' })
      }).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})

    return { message: 'Collection updated successfully' }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error updating collection:', error)
        return Effect.succeed({
          error: 'Failed to update collection',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 404 | 500
      return c.json({ error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Delete collection
 * DELETE /admin/api/collections/:id
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.delete('/collections/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const dbService = yield* DatabaseService

    // Check if collection exists
    const collection = yield* 
      dbService.queryFirst<{ name: string }>(
        'SELECT name FROM collections WHERE id = ?',
        [id]
      )
    

    if (!collection) {
      return { error: 'Collection not found', statusCode: 404 }
    }

    // Check if collection has content
    const contentResult = yield* 
      dbService.queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM content WHERE collection_id = ?',
        [id]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({ count: 0 }))
      )
    

    if (contentResult && contentResult.count > 0) {
      return {
        error: `Cannot delete collection: it contains ${contentResult.count} content item(s). Delete all content first.`,
        statusCode: 400
      }
    }

    // Delete collection fields first
    yield* 
      dbService.execute(
        'DELETE FROM content_fields WHERE collection_id = ?',
        [id]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({ success: true, changes: 0 }))
      )
    

    // Delete collection
    yield* 
      dbService.execute(
        'DELETE FROM collections WHERE id = ?',
        [id]
      )
    

    // Clear cache (non-blocking)
    Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          await c.env.CACHE_KV.delete('cache:collections:all')
          await c.env.CACHE_KV.delete(`cache:collection:${collection.name}`)
        },
        catch: () => new DatabaseError({ message: 'Cache clear failed' })
      }).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})

    return { message: 'Collection deleted successfully' }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error deleting collection:', error)
        return Effect.succeed({
          error: 'Failed to delete collection',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 404 | 500
      return c.json({ error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Get migration status
 * GET /admin/api/migrations/status
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/migrations/status', (c) => {
  const db = c.env.DB
  
  const program = Effect.gen(function* (_) {
    const migrationService = yield* MigrationService
    const status = yield* migrationService.getMigrationStatus()

    return {
      success: true,
      data: status
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMigrationServiceLayer()), // MigrationService first
      Effect.provide(makeAppLayer(db)), // AppLayer provides DatabaseService
      Effect.catchAll((error) => {
        console.error('Error fetching migration status:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to fetch migration status',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result && result.statusCode === 500) {
      return c.json({ success: false, error: result.error }, 500)
    }
    return c.json(result)
  })
})

/**
 * Run pending migrations
 * POST /admin/api/migrations/run
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.post('/migrations/run', (c) => {
  const db = c.env.DB
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')

    // Only allow admin users to run migrations
    if (!user || user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized. Admin access required.',
        statusCode: 403
      }
    }

    const migrationService = yield* MigrationService
    const result = yield* migrationService.runPendingMigrations()

    return {
      success: result.success,
      message: result.message,
      applied: result.applied
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMigrationServiceLayer()), // MigrationService first
      Effect.provide(makeAppLayer(db)), // AppLayer provides DatabaseService
      Effect.catchAll((error) => {
        console.error('Error running migrations:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to run migrations',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 403 | 500
      return c.json({ success: false, error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Validate database schema
 * GET /admin/api/migrations/validate
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.get('/migrations/validate', (c) => {
  const db = c.env.DB
  
  const program = Effect.gen(function* (_) {
    const migrationService = yield* MigrationService
    const validation = yield* migrationService.validateSchema()

    return {
      success: true,
      data: validation
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMigrationServiceLayer()), // MigrationService first
      Effect.provide(makeAppLayer(db)), // AppLayer provides DatabaseService
      Effect.catchAll((error) => {
        console.error('Error validating schema:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to validate schema',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result && result.statusCode === 500) {
      return c.json({ success: false, error: result.error }, 500)
    }
    return c.json(result)
  })
})

/**
 * Update user language preference
 * POST /admin/api/user/language
 * MIGRATED TO PURE EFFECT ✅
 */
const updateLanguageSchema = Schema.Struct({
  language: Schema.String.pipe(
    Schema.filter((s): s is string => s === '' || isValidLocale(s), {
      message: () => 'Language must be empty (for auto-detect) or a supported locale'
    })
  )
})

adminApiRoutes.post('/user/language', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const dbService = yield* DatabaseService

    if (!user) {
      return { error: 'Unauthorized', statusCode: 401 }
    }

    // Parse JSON body - handle both JSON and URL-encoded data
    let body: any
    const contentType = c.req.header('Content-Type') || ''
    
    if (contentType.includes('application/json')) {
      body = yield* 
        Effect.tryPromise({
          try: () => c.req.json(),
          catch: () => new ValidationError('Invalid JSON in request body')
        })
      
    } else {
      // Handle URL-encoded or other formats (from HTMX hx-vals)
      const text = yield* 
        Effect.tryPromise({
          try: () => c.req.text(),
          catch: () => new ValidationError('Failed to read request body')
        })
      
      try {
        body = JSON.parse(text)
      } catch {
        return {
          error: 'Invalid request format',
          statusCode: 400
        }
      }
    }

    // Validate using Effect Schema
    const validation = Schema.decodeUnknownEither(updateLanguageSchema)(body)
    if (validation._tag === 'Left') {
      return {
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }

    const { language } = validation.right

    // Update user language (convert empty string to NULL for auto-detect)
    yield* 
      dbService.execute(
        'UPDATE users SET language = ? WHERE id = ?',
        [language || null, user.userId]
      )
    

    return {
      success: true,
      message: 'Language preference updated successfully',
      language
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error updating user language:', error)
        return Effect.succeed({
          error: 'Failed to update language preference',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 401 | 500
      return c.json({ error: result.error, details: (result as any).details }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Update global language setting
 * POST /admin/api/settings/language
 * MIGRATED TO PURE EFFECT ✅
 */
adminApiRoutes.post('/settings/language', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const dbService = yield* DatabaseService

    // Only allow admin users
    if (!user || user.role !== 'admin') {
      return {
        error: 'Unauthorized. Admin access required.',
        statusCode: 403
      }
    }

    // Parse JSON body
    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: () => new ValidationError('Invalid JSON in request body')
      })
    

    // Validate using Effect Schema
    const validation = Schema.decodeUnknownEither(updateLanguageSchema)(body)
    if (validation._tag === 'Left') {
      return {
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }

    const { language } = validation.right

    // Update or insert global language setting
    yield* 
      dbService.execute(
        `INSERT INTO settings (id, key, value, description, type, created_at, updated_at)
         VALUES ('setting_language', 'language', ?, 'Default application language', 'text', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
        [language, Date.now(), Date.now(), language, Date.now()]
      )
    

    return {
      success: true,
      message: 'Global language setting updated successfully',
      language
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error updating global language:', error)
        return Effect.succeed({
          error: 'Failed to update global language setting',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 403 | 500
      return c.json({ error: result.error, details: (result as any).details }, statusCode)
    }
    return c.json(result)
  })
})

export default adminApiRoutes
