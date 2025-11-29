/**
 * API System Routes - Pure Effect Implementation
 *
 * Provides system health, status, and metadata endpoints
 * These are lightweight routes without heavy dependencies
 */

import { Effect } from 'effect'
import { Hono } from 'hono'
import type { Bindings, Variables } from '../app'
import { DatabaseService } from '../services/database-effect'
import { makeAppLayer } from '../services'

export const apiSystemRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * System health check
 * GET /api/system/health
 */
apiSystemRoutes.get('/health', (c) => {
  const program = Effect.gen(function* (_) {
    const startTime = Date.now()
    const dbService = yield* DatabaseService

    // Check database connectivity using Effect
    const dbCheck = yield* 
      Effect.gen(function* (_) {
        const dbStart = Date.now()
        yield* dbService.execute('SELECT 1', [])
        const dbLatency = Date.now() - dbStart
        return { status: 'healthy' as const, latency: dbLatency }
      }).pipe(
        Effect.catchAll((error) => {
          console.error('Database health check failed:', error)
          return Effect.succeed({ status: 'unhealthy' as const, latency: 0 })
        })
      )

   // Check KV connectivity (if available)
    const kvCheck = yield* 
      Effect.gen(function* (_) {
        if (!c.env.CACHE_KV) {
          return { status: 'not_configured' as const, latency: 0 }
        }

        return yield* 
          Effect.tryPromise({
            try: async () => {
              const kvStart = Date.now()
              await c.env.CACHE_KV.get('__health_check__')
              const kvLatency = Date.now() - kvStart
              return { status: 'healthy' as const, latency: kvLatency }
            },
            catch: (error) => {
              console.error('KV health check failed:', error)
              return { status: 'unhealthy' as const, latency: 0 }
            }
          }).pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
            Effect.catchAll((error) =>
              Effect.succeed({ status: 'unhealthy' as const, latency: 0 })
            )
          )
      })

   // Check R2 connectivity (if available)
    const r2Check = yield* 
      Effect.gen(function* (_) {
        if (!c.env.MEDIA_BUCKET) {
          return { status: 'not_configured' as const }
        }

        return yield* 
          Effect.tryPromise({
            try: async () => {
              await c.env.MEDIA_BUCKET.head('__health_check__')
              return { status: 'healthy' as const }
            },
            catch: () => {
              // R2 head on non-existent key returns null, not an error
              // This is expected, so we consider it healthy
              return { status: 'healthy' as const }
            }
          }).pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
            Effect.catchAll(() =>
              Effect.succeed({ status: 'healthy' as const })
            )
          )
      })

   const totalLatency = Date.now() - startTime
    const overall = dbCheck.status === 'healthy' ? 'healthy' : 'degraded'

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      uptime: totalLatency,
      checks: {
        database: dbCheck,
        cache: kvCheck,
        storage: r2Check
      },
      environment: c.env.ENVIRONMENT || 'production'
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Health check failed:', error)
        return Effect.succeed({
          status: 'unhealthy' as const,
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
          statusCode: 503
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const { statusCode, ...data } = result
      return c.json(data, statusCode as 503)
    }
    return c.json(result)
  })
})

/**
 * System information
 * GET /api/system/info
 */
apiSystemRoutes.get('/info', (c) => {
  const appVersion = c.get('appVersion') || '1.0.0'

  return c.json({
    name: 'PatroCMS',
    version: appVersion,
    description: 'Modern headless CMS built on Cloudflare Workers',
    endpoints: {
      api: '/api',
      auth: '/auth',
      health: '/api/system/health',
      docs: '/docs'
    },
    features: {
      content: true,
      media: true,
      auth: true,
      collections: true,
      caching: !!c.env.CACHE_KV,
      storage: !!c.env.MEDIA_BUCKET
    },
    timestamp: new Date().toISOString()
  })
})

/**
 * System stats
 * GET /api/system/stats
 */
apiSystemRoutes.get('/stats', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService

    // Get content statistics
    const contentStats = yield* 
      dbService.queryFirst<{ total_content: number }>(`
        SELECT COUNT(*) as total_content
        FROM content
        WHERE deleted_at IS NULL
      `).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({ total_content: 0 }))
      )
    

    // Get media statistics
    const mediaStats = yield* 
      dbService.queryFirst<{ total_files: number; total_size: number }>(`
        SELECT
          COUNT(*) as total_files,
          SUM(size) as total_size
        FROM media
        WHERE deleted_at IS NULL
      `).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({ total_files: 0, total_size: 0 }))
      )
    

    // Get user statistics
    const userStats = yield* 
      dbService.queryFirst<{ total_users: number }>(`
        SELECT COUNT(*) as total_users
        FROM users
      `).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({ total_users: 0 }))
      )
    

    return {
      content: {
        total: contentStats?.total_content || 0
      },
      media: {
        total_files: mediaStats?.total_files || 0,
        total_size_bytes: mediaStats?.total_size || 0,
        total_size_mb: Math.round((mediaStats?.total_size || 0) / 1024 / 1024 * 100) / 100
      },
      users: {
        total: userStats?.total_users || 0
      },
      timestamp: new Date().toISOString()
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Stats query failed:', error)
        return Effect.succeed({
          error: 'Failed to fetch system statistics',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const { statusCode, ...data } = result
      return c.json(data, statusCode as 500)
    }
    return c.json(result)
  })
})

/**
 * Database ping
 * GET /api/system/ping
 */
apiSystemRoutes.get('/ping', (c) => {
  const program = Effect.gen(function* (_) {
    const start = Date.now()
    const dbService = yield* DatabaseService
    
    yield* dbService.execute('SELECT 1', [])
    const latency = Date.now() - start

    return {
      pong: true,
      latency,
      timestamp: new Date().toISOString()
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Ping failed:', error)
        return Effect.succeed({
          pong: false,
          error: 'Database connection failed',
          statusCode: 503
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const { statusCode, ...data } = result
      return c.json(data, statusCode as 503)
    }
    return c.json(result)
  })
})

/**
 * Environment check
 * GET /api/system/env
 */
apiSystemRoutes.get('/env', (c) => {
  return c.json({
    environment: c.env.ENVIRONMENT || 'production',
    features: {
      database: !!c.env.DB,
      cache: !!c.env.CACHE_KV,
      media_bucket: !!c.env.MEDIA_BUCKET,
      email_queue: !!c.env.EMAIL_QUEUE,
      sendgrid: !!c.env.SENDGRID_API_KEY,
      cloudflare_images: !!(c.env.IMAGES_ACCOUNT_ID && c.env.IMAGES_API_TOKEN)
    },
    timestamp: new Date().toISOString()
  })
})

export default apiSystemRoutes
