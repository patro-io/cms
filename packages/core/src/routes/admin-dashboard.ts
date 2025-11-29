import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { Effect } from 'effect'
import { Hono } from 'hono'
import { requireAuth, getTranslate, i18nMiddleware } from '../middleware'
import { DatabaseService } from '../services/database-effect'
import { SettingsService } from '../services/settings'
import { makeAppLayer } from '../services'
import {
  renderDashboardPage,
  renderRecentActivity,
  renderStatsCards,
  renderStorageUsage,
  type ActivityItem,
  type DashboardPageData,
} from '../templates/pages/admin-dashboard.template'
import {
  MetricsServiceLive,
  getAverageRPS,
  getRequestsPerSecond,
  getTotalRequests,
} from '../utils/metrics'
import { getCoreVersion } from '../utils/version'

const VERSION = getCoreVersion()

type Bindings = {
  DB: D1Database
  CACHE_KV: KVNamespace
  MEDIA_BUCKET: R2Bucket
}

type Variables = {
  user?: {
    userId: string
    email: string
    role: string
  }
}

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

/**
 * GET /admin - Admin Dashboard
 */
router.get('/', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)
  
  // Load appearance settings for logo
  const program = Effect.gen(function* (_) {
    const settingsService = yield* SettingsService
    
    const appearanceSettings = yield* 
      settingsService.getAppearanceSettings().pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({
          theme: 'dark' as const,
          primaryColor: '#465FFF',
          logoUrl: '',
          favicon: '',
          customCSS: ''
        }))
      )
    
    
    return appearanceSettings.logoUrl || undefined
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )
  ).then(logoUrl => {
    const pageData: DashboardPageData = {
      user: {
        name: user!.email.split('@')[0] || user!.email,
        email: user!.email,
        role: user!.role,
      },
      version: VERSION,
      logoUrl,
    }

    return c.html(renderDashboardPage(pageData, t))
  })
})

/**
 * GET /admin/dashboard/stats - Dashboard stats HTML fragment (HTMX endpoint)
 */
router.get('/stats', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const db = yield* DatabaseService

    const collectionsResult = yield* db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM collections WHERE is_active = 1').pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({ count: 0 }))
    )

    const contentResult = yield* db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM content').pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({ count: 0 }))
    )

    const mediaResult = yield* db.queryFirst<{ count: number; total_size: number }>(
        'SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM media WHERE deleted_at IS NULL'
      ).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({ count: 0, total_size: 0 }))
    )

    const usersResult = yield* db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE is_active = 1').pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({ count: 0 }))
    )

    const html = renderStatsCards({
      collections: collectionsResult?.count || 0,
      contentItems: contentResult?.count || 0,
      mediaFiles: mediaResult?.count || 0,
      users: usersResult?.count || 0,
      mediaSize: mediaResult?.total_size || 0,
    }, t)

    return c.html(html)
  }).pipe(
    Effect.catchAll((error) => {
      console.error('Error fetching stats:', error)
      return Effect.succeed(c.html('<div class="text-red-500">Failed to load statistics</div>'))
    })
  )

  return Effect.runPromise(Effect.provide(program, makeAppLayer(c.env.DB))) // ✅ Unified layer
})

/**
 * GET /admin/dashboard/storage - Storage usage HTML fragment (HTMX endpoint)
 */
router.get('/storage', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const db = yield* DatabaseService

    // D1 metadata is not directly available via Effect service,
    // so we get it from the environment directly for now.
    const d1result = yield* 
      Effect.tryPromise({
        try: () => c.env.DB.prepare('SELECT 1').run(),
        catch: (e) => {
          console.error('Error fetching database size:', e)
          return { meta: { size_after: 0 } }
        },
      })
    
    const databaseSize = (d1result as any)?.meta?.size_after || 0

    const mediaResult = yield* db.queryFirst<{ total_size: number }>(
        'SELECT COALESCE(SUM(size), 0) as total_size FROM media WHERE deleted_at IS NULL'
      ).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({ total_size: 0 }))
    )

    const html = renderStorageUsage(databaseSize, mediaResult?.total_size || 0, t)
    return c.html(html)
  }).pipe(
    Effect.catchAll((error) => {
      console.error('Error fetching storage usage:', error)
      return Effect.succeed(c.html('<div class="text-red-500">Failed to load storage information</div>'))
    })
  )

  return Effect.runPromise(Effect.provide(program, makeAppLayer(c.env.DB))) // ✅ Unified layer
})

/**
 * GET /admin/dashboard/recent-activity - Recent activity HTML fragment (HTMX endpoint)
 */
router.get('/recent-activity', (c) => {
  const limit = parseInt(c.req.query('limit') || '5')
  const t = getTranslate(c)

  const program = Effect.gen(function* (_) {
    const db = yield* DatabaseService
    const results = yield* 
      db.query<any>(
        `
        SELECT
          a.id, a.action, a.resource_type, a.resource_id, a.details, a.created_at,
          u.email, u.first_name, u.last_name
        FROM activity_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.resource_type IN ('content', 'collections', 'users', 'media')
        ORDER BY a.created_at DESC
        LIMIT ?
      `,
        [limit]
      )
    

    const activities: ActivityItem[] = (results || []).map((row: any) => {
      const userName =
        row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.email || 'System'

      let description = ''
      if (row.action === 'create') {
        description = `Created new ${row.resource_type}`
      } else if (row.action === 'update') {
        description = `Updated ${row.resource_type}`
      } else if (row.action === 'delete') {
        description = `Deleted ${row.resource_type}`
      } else {
        description = `${row.action} ${row.resource_type}`
      }

      return {
        id: row.id,
        type: row.resource_type,
        action: row.action,
        description,
        timestamp: new Date(Number(row.created_at)).toISOString(),
        user: userName,
      }
    })

    return c.html(renderRecentActivity(activities, t))
  }).pipe(
    Effect.catchAll((error) => {
      console.error('Error fetching recent activity:', error)
      return Effect.succeed(c.html(renderRecentActivity([], t)))
    })
  )

  return Effect.runPromise(Effect.provide(program, makeAppLayer(c.env.DB))) // ✅ Unified layer
})

/**
 * GET /admin/api/metrics - Real-time metrics for analytics chart
 * Returns JSON with current requests per second from the metrics tracker
 */
router.get('/api/metrics', (c) => {
  const program = Effect.gen(function* (_) {
    const rps = yield* getRequestsPerSecond()
    const total = yield* getTotalRequests()
    const avgRPS = yield* getAverageRPS()

    return c.json({
      requestsPerSecond: rps,
      totalRequests: total,
      averageRPS: Number(avgRPS.toFixed(2)),
      timestamp: new Date().toISOString(),
    })
  }).pipe(
    Effect.catchAll((error) => {
      console.error('Error fetching metrics:', error)
      return Effect.succeed(
        c.json({
          requestsPerSecond: 0,
          totalRequests: 0,
          averageRPS: 0,
          timestamp: new Date().toISOString(),
        })
      )
    })
  )

  return Effect.runPromise(Effect.provide(program, MetricsServiceLive))
})

/**
 * GET /admin/dashboard/system-status - System status HTML fragment (HTMX endpoint)
 */
router.get('/system-status', (c) => {
  const html = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 dark:from-blue-500/10 dark:to-cyan-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="relative bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200/50 dark:border-zinc-700/50">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">API Status</span>
            <svg class="w-6 h-6 text-lime-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Operational</p>
        </div>
      </div>

      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-500/10 dark:to-pink-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="relative bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200/50 dark:border-zinc-700/50">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">Database</span>
            <svg class="w-6 h-6 text-lime-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Connected</p>
        </div>
      </div>

      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-orange-500/20 dark:from-amber-500/10 dark:to-orange-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="relative bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200/50 dark:border-zinc-700/50">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">R2 Storage</span>
            <svg class="w-6 h-6 text-lime-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Available</p>
        </div>
      </div>

      <div class="relative group">
        <div class="absolute inset-0 bg-gradient-to-br from-lime-500/20 to-emerald-500/20 dark:from-lime-500/10 dark:to-emerald-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div class="relative bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-5 border border-zinc-200/50 dark:border-zinc-700/50">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-zinc-600 dark:text-zinc-400">KV Cache</span>
            <svg class="w-6 h-6 text-lime-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">Ready</p>
        </div>
      </div>
    </div>
  `
  return c.html(html)
})

export { router as adminDashboardRoutes }
