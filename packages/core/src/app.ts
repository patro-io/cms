/**
 * Main Application Factory
 *
 * Creates a configured PatroCMS application with all core functionality
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { Effect } from 'effect'
import {
  apiRoutes,
  apiMediaRoutes,
  apiSystemRoutes,
  adminApiRoutes,
  authRoutes,
  testCleanupRoutes,
  adminContentRoutes,
  adminUsersRoutes,
  adminMediaRoutes,
  adminPluginRoutes,
  adminLogsRoutes,
  adminDashboardRoutes,
  adminCollectionsRoutes,
  adminSettingsRoutes
} from './routes'
import { getCoreVersion } from './utils/version'
import { bootstrapMiddleware } from './middleware/bootstrap'
import { metricsMiddleware } from './middleware/metrics'
import { i18nMiddleware } from './middleware/i18n'
import { requireAuth, requireRole } from './middleware/auth'
import { createDatabaseToolsAdminRoutes } from './plugins/core-plugins/database-tools-plugin/admin-routes'
import { createSeedDataAdminRoutes } from './plugins/core-plugins/seed-data-plugin/admin-routes'
import { emailPlugin } from './plugins/core-plugins/email-plugin'
import type { TranslateFn, Locale, I18nService } from './services/i18n'
import { FullAppConfig } from './config/app-config.js'

// ============================================================================
// Type Definitions
// ============================================================================

export interface Bindings {
  DB: D1Database
  CACHE_KV: KVNamespace
  MEDIA_BUCKET: R2Bucket
  ASSETS: Fetcher
  EMAIL_QUEUE?: Queue
  SENDGRID_API_KEY?: string
  DEFAULT_FROM_EMAIL?: string
  IMAGES_ACCOUNT_ID?: string
  IMAGES_API_TOKEN?: string
  ENVIRONMENT?: string
  BUCKET_NAME?: string
}

export interface Variables {
  user?: {
    userId: string
    email: string
    role: string
    exp: number
    iat: number
  }
  requestId?: string
  startTime?: number
  appVersion?: string
  locale?: Locale
  t?: TranslateFn
  i18n?: I18nService
}

export interface PatroCMSConfig {
  // Collections configuration
  collections?: {
    directory?: string
    autoSync?: boolean
  }

  // Plugins configuration
  plugins?: {
    directory?: string
    autoLoad?: boolean
    disableAll?: boolean  // Disable all plugins including core plugins
  }

  // Custom routes
  routes?: Array<{
    path: string
    handler: Hono
  }>

  // Custom middleware
  middleware?: {
    beforeAuth?: Array<(c: Context, next: () => Promise<void>) => Promise<void>>
    afterAuth?: Array<(c: Context, next: () => Promise<void>) => Promise<void>>
  }

  // App metadata
  version?: string
  name?: string
}

export type PatroCMSApp = Hono<{ Bindings: Bindings; Variables: Variables }>

// ============================================================================
// Application Factory
// ============================================================================

/**
 * Create a PatroCMS application with core functionality
 *
 * @param config - Application configuration
 * @returns Configured Hono application
 *
 * @example
 * ```typescript
 * import { createPatroCMSApp } from '@@patro-io/cms'
 *
 * const app = createPatroCMSApp({
 *   collections: {
 *     directory: './src/collections',
 *     autoSync: true
 *   },
 *   plugins: {
 *     directory: './src/plugins',
 *     autoLoad: true
 *   }
 * })
 *
 * export default app
 * ```
 */
export function createPatroCMSApp(config: PatroCMSConfig = {}): PatroCMSApp {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

  // Config validation middleware - validates ENV variables on first request
  // This ensures the app fails fast if required config is missing
  let configValidated = false
  app.use('*', async (c, next) => {
    if (!configValidated) {
      // Validate config on first request using makeAppConfigLayer
      const { makeAppConfigLayer } = await import('./config/config-provider.js')
      const configLayer = makeAppConfigLayer(c.env as any)
      
      const validationProgram = Effect.gen(function* () {
        // Load config to trigger validation
        const config = yield* FullAppConfig
        
        // Log successful validation in development
        if (c.env.ENVIRONMENT === 'development') {
          console.log('✅ Configuration validated successfully')
        }
        
        return config
      })

      // Run validation with config layer
      const result = await Effect.runPromise(
        validationProgram.pipe(
          Effect.provide(configLayer),
          Effect.catchAll((error) => {
            console.error('❌ Configuration validation failed:', error)
            console.error('Please check your environment variables. See docs/effect/ENV_VARIABLES.md for details.')
            return Effect.fail(error)
          })
        )
      ).catch((error) => {
        // If validation fails, return error response
        return c.json({
          error: 'Configuration validation failed',
          message: 'Required environment variables are missing or invalid',
          details: String(error),
          hint: 'Check docs/effect/ENV_VARIABLES.md for required configuration'
        }, 500)
      })

      // If validation failed (returned Response), return it
      if (result && typeof result === 'object' && 'headers' in result) {
        return result as Response
      }

      configValidated = true
    }
    
    return await next()
  })

  // Metrics middleware - track all requests for real-time analytics
  // Must be one of the first middleware to run to capture all requests.
  app.use('*', metricsMiddleware())

  // Set app metadata
  const appVersion = config.version || getCoreVersion()
  const appName = config.name || 'PatroCMS'

  // App version middleware
  app.use('*', async (c, next) => {
    c.set('appVersion', appVersion)
    await next()
  })

  // Bootstrap middleware - runs migrations, syncs collections, and initializes plugins
  app.use('*', bootstrapMiddleware(config))

  // Custom middleware - before auth
  if (config.middleware?.beforeAuth) {
    for (const middleware of config.middleware.beforeAuth) {
      app.use('*', middleware)
    }
  }

  // Logging middleware
  app.use('*', async (_c, next) => {
    // Logging logic here
    await next()
  })

  // Security middleware
  app.use('*', async (_c, next) => {
    // Security headers, CORS, etc.
    await next()
  })

  // Custom middleware - after auth
  if (config.middleware?.afterAuth) {
    for (const middleware of config.middleware.afterAuth) {
      app.use('*', middleware)
    }
  }

  // ============================================================================
  // Centralized Middleware Layer (Refactored from individual routes)
  // ============================================================================
  
  // Auth routes - i18n only (no auth required)
  app.use('/auth/*', i18nMiddleware())
  
  // Admin API routes - auth + role check + i18n
  app.use('/admin/api/*', requireAuth())
  app.use('/admin/api/*', requireRole(['admin', 'editor']))
  app.use('/admin/api/*', i18nMiddleware())
  
  // API Media routes - auth only
  app.use('/api/media/*', requireAuth())
  
  // All other admin routes - auth + i18n
  app.use('/admin/dashboard/*', requireAuth())
  app.use('/admin/dashboard/*', i18nMiddleware())
  
  app.use('/admin/collections/*', requireAuth())
  app.use('/admin/collections/*', i18nMiddleware())
  
  app.use('/admin/settings/*', requireAuth())
  app.use('/admin/settings/*', i18nMiddleware())
  
  app.use('/admin/database-tools/*', requireAuth())
  app.use('/admin/database-tools/*', i18nMiddleware())
  
  app.use('/admin/seed-data/*', requireAuth())
  app.use('/admin/seed-data/*', i18nMiddleware())
  
  app.use('/admin/content/*', requireAuth())
  app.use('/admin/content/*', i18nMiddleware())
  
  app.use('/admin/media/*', requireAuth())
  app.use('/admin/media/*', i18nMiddleware())
  
  app.use('/admin/plugins/*', requireAuth())
  app.use('/admin/plugins/*', i18nMiddleware())
  
  app.use('/admin/logs/*', requireAuth())
  app.use('/admin/logs/*', i18nMiddleware())
  
  app.use('/admin/users/*', requireAuth())
  app.use('/admin/users/*', i18nMiddleware())

  // ============================================================================
  // Core routes (now pure business logic without middleware)
  // ============================================================================
  // Routes are being imported incrementally from routes/*
  // Each route is tested and migrated one-by-one
  app.route('/api', apiRoutes)
  app.route('/api/media', apiMediaRoutes)
  app.route('/api/system', apiSystemRoutes)
  app.route('/admin/api', adminApiRoutes)
  app.route('/admin/dashboard', adminDashboardRoutes)
  app.route('/admin/collections', adminCollectionsRoutes)
  app.route('/admin/settings', adminSettingsRoutes)
  app.route('/admin/database-tools', createDatabaseToolsAdminRoutes())
  app.route('/admin/seed-data', createSeedDataAdminRoutes())
  app.route('/admin/content', adminContentRoutes)
  app.route('/admin/media', adminMediaRoutes)
  app.route('/admin/plugins', adminPluginRoutes)
  app.route('/admin/logs', adminLogsRoutes)
  app.route('/admin', adminUsersRoutes)
  app.route('/auth', authRoutes)

  // Test cleanup routes (only for development/test environments)
  app.route('/', testCleanupRoutes)

  // Plugin routes
  if (emailPlugin.routes && emailPlugin.routes.length > 0) {
    for (const route of emailPlugin.routes) {
      app.route(route.path, route.handler)
    }
  }

  // Serve files from R2 storage (public file access)
  app.get('/files/*', async (c) => {
    try {
      // Extract the path from the URL pathname (everything after /files/)
      const url = new URL(c.req.url)
      const pathname = url.pathname

      // Remove the /files/ prefix to get the R2 object key
      const objectKey = pathname.replace(/^\/files\//, '')

      if (!objectKey) {
        return c.notFound()
      }

      // Get file from R2
      const object = await c.env.MEDIA_BUCKET.get(objectKey)

      if (!object) {
        return c.notFound()
      }

      // Set appropriate headers
      const headers = new Headers()
      object.httpMetadata?.contentType && headers.set('Content-Type', object.httpMetadata.contentType)
      object.httpMetadata?.contentDisposition && headers.set('Content-Disposition', object.httpMetadata.contentDisposition)
      headers.set('Cache-Control', 'public, max-age=31536000') // 1 year cache
      headers.set('Access-Control-Allow-Origin', '*') // Allow CORS for media files
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Content-Type')

      return new Response(object.body as any, {
        headers
      })
    } catch (error) {
      console.error('Error serving file:', error)
      return c.notFound()
    }
  })

  // Custom routes - User-defined routes
  if (config.routes) {
    for (const route of config.routes) {
      app.route(route.path, route.handler)
    }
  }

  // Root redirect to login
  app.get('/', (c) => {
    return c.redirect('/auth/login')
  })

  // Health check
  app.get('/health', (c) => {
    return c.json({
      name: appName,
      version: appVersion,
      status: 'running',
      timestamp: new Date().toISOString()
    })
  })

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not Found', status: 404 }, 404)
  })

  // Error handler
  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'Internal Server Error', status: 500 }, 500)
  })

  return app
}

/**
 * Setup core middleware (backward compatibility)
 *
 * @param _app - Hono application
 * @deprecated Use createPatroCMSApp() instead
 */
export function setupCoreMiddleware(_app: PatroCMSApp): void {
  console.warn('setupCoreMiddleware is deprecated. Use createPatroCMSApp() instead.')
  // Backward compatibility implementation
}

/**
 * Setup core routes (backward compatibility)
 *
 * @param _app - Hono application
 * @deprecated Use createPatroCMSApp() instead
 */
export function setupCoreRoutes(_app: PatroCMSApp): void {
  console.warn('setupCoreRoutes is deprecated. Use createPatroCMSApp() instead.')
  // Backward compatibility implementation
}
