import type { D1Database } from '@cloudflare/workers-types'
import { Effect, Option } from 'effect'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Variables as AppVariables, Bindings } from '../app'
import { isPluginActive } from '../middleware'
import { schemaDefinitions } from '../schemas'
import { CACHE_CONFIGS, CacheService, makeCacheServiceLayer } from '../services/cache'
import { LoggerService, makeLoggerServiceLayer } from '../services/logger'
import { QueryFilter, buildQueryEffect, parseFromQueryEffect } from '../utils/query-filter'
import apiContentCrudRoutes from './api-content-crud'
import { CollectionService } from '../services/collection-effect'
import { DatabaseService } from '../services/database-effect'
import { makeAppLayer } from '../services'

// Extend Variables with API-specific fields
interface Variables extends AppVariables {
  startTime: number
  cacheEnabled?: boolean
}

const apiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Add timing middleware
apiRoutes.use('*', async (c, next) => {
  const startTime = Date.now()
  c.set('startTime', startTime)
  await next()
  const totalTime = Date.now() - startTime
  c.header('X-Response-Time', `${totalTime}ms`)
})

// Check if cache plugin is active
apiRoutes.use('*', async (c, next) => {
  const cacheEnabled = await isPluginActive(c.env.DB, 'core-cache')
  c.set('cacheEnabled', cacheEnabled)
  await next()
})

// Add CORS middleware
apiRoutes.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

// Helper function to add timing metadata
function addTimingMeta(c: any, meta: any = {}, executionStartTime?: number) {
  const totalTime = Date.now() - c.get('startTime')
  const executionTime = executionStartTime ? Date.now() - executionStartTime : undefined

  return {
    ...meta,
    timing: {
      total: totalTime,
      execution: executionTime,
      unit: 'ms'
    }
  }
}

/**
 * Effect-based helper to get cached data with logging
 */
const getCachedData = (
  db: D1Database,
  cacheKey: string,
  cacheEnabled: boolean | undefined
) =>
  Effect.gen(function* (_) {
    if (!cacheEnabled) {
      return Option.none<any>()
    }

    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.api!)
    const cache = yield* CacheService
    
    const result = yield* 
      cache.getWithSource<any>(cacheKey).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed({
          hit: false,
          data: undefined,
          source: 'none' as const,
          ttl: undefined
        }))
      )
    

    if (result.hit && result.data) {
      // Log cache hit (non-blocking)
      const loggerLayer = makeLoggerServiceLayer(db)
      const logProgram = Effect.flatMap(LoggerService, logger =>
        logger.debug('api', 'Cache hit', {
          cacheKey,
          source: result.source,
          ttl: result.ttl
        })
      )
      
      Effect.runPromise(
        Effect.provide(logProgram, loggerLayer).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      ).catch(() => {})

      return Option.some(result)
    }

    return Option.none<any>()
  }).pipe(
    Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.api!))
  )

/**
 * Effect-based helper to set cache with logging
 */
const setCachedData = (
  db: D1Database,
  cacheKey: string,
  data: any,
  cacheEnabled: boolean | undefined
) =>
  Effect.gen(function* (_) {
    if (!cacheEnabled) {
      return
    }

    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.api!)
    const cache = yield* CacheService
    
    yield* 
      cache.set(cacheKey, data).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    

    // Log cache set (non-blocking)
    const loggerLayer = makeLoggerServiceLayer(db)
    const logProgram = Effect.flatMap(LoggerService, logger =>
      logger.debug('api', 'Cache set', { cacheKey })
    )
    
    Effect.runPromise(
      Effect.provide(logProgram, loggerLayer).pipe(
        Effect.tapError(Effect.logDebug),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})
  }).pipe(
    Effect.provide(makeCacheServiceLayer(CACHE_CONFIGS.api!))
  )

// Root endpoint - API info
apiRoutes.get('/', (c) => {
  return c.json({
    name: 'PatroCMS API',
    version: '2.0.0',
    description: 'RESTful API for PatroCMS headless CMS',
    endpoints: {
      health: '/api/health',
      collections: '/api/collections',
      content: '/api/content',
      contentById: '/api/content/:id',
      collectionContent: '/api/collections/:collection/content'
    },
    documentation: '/docs'
  })
})

// Health check endpoint
apiRoutes.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    schemas: schemaDefinitions.map(s => s.name)
  })
})

// Basic collections endpoint with Pure Effect
apiRoutes.get('/collections', (c) => {
  const executionStart = Date.now()
  
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const cacheEnabled = c.get('cacheEnabled')
    const cacheKey = `collections:all`

    // Try to get cached data using Effect
    const cachedResult = yield* 
      getCachedData(db, cacheKey, cacheEnabled).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(Option.none()))
      )
    

    if (Option.isSome(cachedResult)) {
      const result = cachedResult.value
      
      return {
        type: 'cached' as const,
        data: result.data,
        source: result.source,
        ttl: result.ttl,
        executionStart
      }
    }

    // Cache miss - fetch from CollectionService
    const collectionService = yield* CollectionService
    const collections = yield* collectionService.getCollections()

    // Parse schema and format results
    const transformedResults = collections.map((row: any) => ({
      ...row,
      schema: row.schema ? (typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema) : {},
      is_active: row.is_active
    }))

    const responseData = {
      data: transformedResults,
      meta: {
        count: collections.length,
        timestamp: new Date().toISOString(),
        cache: {
          hit: false,
          source: 'database'
        }
      }
    }

    // Cache the response using Effect (non-blocking)
    Effect.runPromise(
      setCachedData(db, cacheKey, responseData, cacheEnabled).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})

    return {
      type: 'fresh' as const,
      data: responseData,
      executionStart
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        // Log error using Effect-based LoggerService (non-blocking)
        const loggerLayer = makeLoggerServiceLayer(db)
        const logProgram = Effect.flatMap(LoggerService, logger =>
          logger.error('api', 'Failed to fetch collections', error)
        )
        
        Effect.runPromise(
          Effect.provide(logProgram, loggerLayer).pipe(
            Effect.tapError(Effect.logDebug),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
        ).catch(() => {})

        console.error('Error fetching collections:', error)
        return Effect.succeed({
          type: 'error' as const,
          error: 'Failed to fetch collections'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, 500)
    }
    
    if (result.type === 'cached') {
      c.header('X-Cache-Status', 'HIT')
      c.header('X-Cache-Source', result.source)
      if (result.ttl) {
        c.header('X-Cache-TTL', Math.floor(result.ttl).toString())
      }

      const dataWithMeta = {
        ...result.data,
        meta: addTimingMeta(c, {
          ...result.data.meta,
          cache: {
            hit: true,
            source: result.source,
            ttl: result.ttl ? Math.floor(result.ttl) : undefined
          }
        }, result.executionStart)
      }

      return c.json(dataWithMeta)
    }
    
    // Fresh data
    c.header('X-Cache-Status', 'MISS')
    c.header('X-Cache-Source', 'database')
    
    const dataWithMeta = {
      ...result.data,
      meta: addTimingMeta(c, result.data.meta, result.executionStart)
    }
    
    return c.json(dataWithMeta)
  })
})

// Basic content endpoint with Pure Effect and advanced filtering
apiRoutes.get('/content', (c) => {
  const executionStart = Date.now()
  
  const program = Effect.gen(function* (_) {
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const queryParams = c.req.query()

    // Handle collection parameter - convert collection name to collection_id
    if (queryParams.collection) {
      const collectionName = queryParams.collection
      const collectionResult = yield* 
        dbService.queryFirst<{ id: string }>(
          'SELECT id FROM collections WHERE name = ? AND is_active = 1',
          [collectionName]
        ).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      

      if (collectionResult) {
        queryParams.collection_id = collectionResult.id
        delete queryParams.collection
      } else {
        return {
          type: 'empty' as const,
          message: `Collection '${collectionName}' not found`,
          executionStart
        }
      }
    }

    // Parse filter from query parameters
    const filter: QueryFilter = Effect.runSync(parseFromQueryEffect(queryParams))

    // Set default limit if not provided
    if (!filter.limit) {
      filter.limit = 50
    }
    filter.limit = Math.min(filter.limit, 1000) // Max 1000

    // Build SQL query from filter
    const queryResult = Effect.runSync(buildQueryEffect('content', filter))

    // Check for query building errors
    if (queryResult.errors.length > 0) {
      return {
        type: 'validation_error' as const,
        errors: queryResult.errors,
        filter
      }
    }

    // Only use cache if cache plugin is active
    const cacheEnabled = c.get('cacheEnabled')
    const cacheKey = `content-filtered:${JSON.stringify({ filter, query: queryResult.sql })}`

    // Try to get cached data using Effect
    const cachedResult = yield* 
      getCachedData(db, cacheKey, cacheEnabled).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(Option.none()))
      )
    

    if (Option.isSome(cachedResult)) {
      const result = cachedResult.value
      return {
        type: 'cached' as const,
        data: result.data,
        source: result.source,
        ttl: result.ttl,
        executionStart
      }
    }

    // Cache miss - fetch from database using DatabaseService
    const results = yield* 
      dbService.query<any>(queryResult.sql, queryResult.params)
    

    // Transform results to match API spec (camelCase)
    const transformedResults = results.map((row: any) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      collectionId: row.collection_id,
      data: row.data ? JSON.parse(row.data) : {},
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    const responseData = {
      data: transformedResults,
      meta: {
        count: results.length,
        timestamp: new Date().toISOString(),
        filter: filter,
        query: {
          sql: queryResult.sql,
          params: queryResult.params
        },
        cache: {
          hit: false,
          source: 'database'
        }
      }
    }

    // Cache the response using Effect (non-blocking)
    Effect.runPromise(
      setCachedData(db, cacheKey, responseData, cacheEnabled).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})

    return {
      type: 'fresh' as const,
      data: responseData,
      executionStart
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        // Log error using Effect-based LoggerService (non-blocking)
        const loggerLayer = makeLoggerServiceLayer(db)
        const logProgram = Effect.flatMap(LoggerService, logger =>
          logger.error('api', 'Failed to fetch content', error)
        )
        
        Effect.runPromise(
          Effect.provide(logProgram, loggerLayer).pipe(
            Effect.tapError(Effect.logDebug),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
        ).catch(() => {})

        console.error('Error fetching content:', error)
        return Effect.succeed({
          type: 'error' as const,
          error: 'Failed to fetch content',
          details: error instanceof Error ? error.message : String(error)
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({
        error: result.error,
        details: result.details
      }, 500)
    }
    
    if (result.type === 'empty') {
      return c.json({
        data: [],
        meta: addTimingMeta(c, {
          count: 0,
          timestamp: new Date().toISOString(),
          message: result.message
        }, result.executionStart)
      })
    }
    
    if (result.type === 'validation_error') {
      // Log validation error (non-blocking)
      const loggerLayer = makeLoggerServiceLayer(db)
      const logProgram = Effect.flatMap(LoggerService, logger =>
        logger.warn('api', 'Invalid filter parameters', {
          errors: result.errors,
          filter: result.filter
        })
      )
      
      Effect.runPromise(
        Effect.provide(logProgram, loggerLayer).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      ).catch(() => {})
      
      return c.json({
        error: 'Invalid filter parameters',
        details: result.errors
      }, 400)
    }
    
    if (result.type === 'cached') {
      c.header('X-Cache-Status', 'HIT')
      c.header('X-Cache-Source', result.source)
      if (result.ttl) {
        c.header('X-Cache-TTL', Math.floor(result.ttl).toString())
      }

      const dataWithMeta = {
        ...result.data,
        meta: addTimingMeta(c, {
          ...result.data.meta,
          cache: {
            hit: true,
            source: result.source,
            ttl: result.ttl ? Math.floor(result.ttl) : undefined
          }
        }, result.executionStart)
      }

      return c.json(dataWithMeta)
    }
    
    // Fresh data
    c.header('X-Cache-Status', 'MISS')
    c.header('X-Cache-Source', 'database')
    
    const dataWithMeta = {
      ...result.data,
      meta: addTimingMeta(c, result.data.meta, result.executionStart)
    }
    
    return c.json(dataWithMeta)
  })
})

// Collection-specific routes with Pure Effect and advanced filtering
apiRoutes.get('/collections/:collection/content', (c) => {
  const executionStart = Date.now()
  
  const program = Effect.gen(function* (_) {
    const collection = c.req.param('collection')
    const db = c.env.DB
    const dbService = yield* DatabaseService
    const queryParams = c.req.query()

    // First check if collection exists
    const collectionResult = yield* 
      dbService.queryFirst<any>(
        'SELECT * FROM collections WHERE name = ? AND is_active = 1',
        [collection]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (!collectionResult) {
      return {
        type: 'not_found' as const,
        collection
      }
    }

    // Parse filter from query parameters
    const filter: QueryFilter = Effect.runSync(parseFromQueryEffect(queryParams))

    // Add collection_id filter to where clause
    if (!filter.where) {
      filter.where = { and: [] }
    }

    if (!filter.where.and) {
      filter.where.and = []
    }

    // Add collection filter
    filter.where.and.push({
      field: 'collection_id',
      operator: 'equals',
      value: collectionResult.id
    })

    // Set default limit if not provided
    if (!filter.limit) {
      filter.limit = 50
    }
    filter.limit = Math.min(filter.limit, 1000)

    // Build SQL query from filter
    const queryResult = Effect.runSync(buildQueryEffect('content', filter))

    // Check for query building errors
    if (queryResult.errors.length > 0) {
      return {
        type: 'validation_error' as const,
        collection,
        errors: queryResult.errors,
        filter
      }
    }

    // Generate cache key
    const cacheEnabled = c.get('cacheEnabled')
    const cacheKey = `collection-content-filtered:${collection}:${JSON.stringify({ filter, query: queryResult.sql })}`

    // Try to get cached data using Effect
    const cachedResult = yield* 
      getCachedData(db, cacheKey, cacheEnabled).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(Option.none()))
      )
    

    if (Option.isSome(cachedResult)) {
      const result = cachedResult.value
      return {
        type: 'cached' as const,
        data: result.data,
        source: result.source,
        ttl: result.ttl,
        executionStart
      }
    }

    // Cache miss - fetch from database using DatabaseService
    const results = yield* 
      dbService.query<any>(queryResult.sql, queryResult.params)
    

    // Transform results to match API spec (camelCase)
    const transformedResults = results.map((row: any) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      collectionId: row.collection_id,
      data: row.data ? JSON.parse(row.data) : {},
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    const responseData = {
      data: transformedResults,
      meta: {
        collection: {
          ...collectionResult,
          schema: collectionResult.schema ? JSON.parse(collectionResult.schema) : {}
        },
        count: results.length,
        timestamp: new Date().toISOString(),
        filter: filter,
        query: {
          sql: queryResult.sql,
          params: queryResult.params
        },
        cache: {
          hit: false,
          source: 'database'
        }
      }
    }

    // Cache the response using Effect (non-blocking)
    Effect.runPromise(
      setCachedData(db, cacheKey, responseData, cacheEnabled).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service zápisu (cache)", e)),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    ).catch(() => {})

    return {
      type: 'fresh' as const,
      data: responseData,
      collectionResult,
      executionStart
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.catchAll((error) => {
        // Log error using Effect-based LoggerService (non-blocking)
        const loggerLayer = makeLoggerServiceLayer(db)
        const logProgram = Effect.flatMap(LoggerService, logger =>
          logger.error('api', 'Failed to fetch collection content', error)
        )
        
        Effect.runPromise(
          Effect.provide(logProgram, loggerLayer).pipe(
            Effect.tapError(Effect.logDebug),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
        ).catch(() => {})

        console.error('Error fetching content:', error)
        return Effect.succeed({
          type: 'error' as const,
          error: 'Failed to fetch content',
          details: error instanceof Error ? error.message : String(error)
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({
        error: result.error,
        details: result.details
      }, 500)
    }
    
    if (result.type === 'not_found') {
      // Log not found (non-blocking)
      const loggerLayer = makeLoggerServiceLayer(db)
      const logProgram = Effect.flatMap(LoggerService, logger =>
        logger.warn('api', 'Collection not found', {
          collection: result.collection
        })
      )
      
      Effect.runPromise(
        Effect.provide(logProgram, loggerLayer).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      ).catch(() => {})
      
      return c.json({ error: 'Collection not found' }, 404)
    }
    
    if (result.type === 'validation_error') {
      // Log validation error (non-blocking)
      const loggerLayer = makeLoggerServiceLayer(db)
      const logProgram = Effect.flatMap(LoggerService, logger =>
        logger.warn('api', 'Invalid filter parameters', {
          collection: result.collection,
          errors: result.errors,
          filter: result.filter
        })
      )
      
      Effect.runPromise(
        Effect.provide(logProgram, loggerLayer).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      ).catch(() => {})
      
      return c.json({
        error: 'Invalid filter parameters',
        details: result.errors
      }, 400)
    }
    
    if (result.type === 'cached') {
      c.header('X-Cache-Status', 'HIT')
      c.header('X-Cache-Source', result.source)
      if (result.ttl) {
        c.header('X-Cache-TTL', Math.floor(result.ttl).toString())
      }

      const dataWithMeta = {
        ...result.data,
        meta: addTimingMeta(c, {
          ...result.data.meta,
          cache: {
            hit: true,
            source: result.source,
            ttl: result.ttl ? Math.floor(result.ttl) : undefined
          }
        }, result.executionStart)
      }

      return c.json(dataWithMeta)
    }
    
    // Fresh data
    c.header('X-Cache-Status', 'MISS')
    c.header('X-Cache-Source', 'database')
    
    const dataWithMeta = {
      ...result.data,
      meta: addTimingMeta(c, result.data.meta, result.executionStart)
    }
    
    return c.json(dataWithMeta)
  })
})

// Mount CRUD routes for content
apiRoutes.route('/content', apiContentCrudRoutes)

export default apiRoutes
