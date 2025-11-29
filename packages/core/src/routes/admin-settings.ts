/**
 * Admin Settings Routes
 *
 * FULLY MIGRATED TO PURE EFFECT ✅ - Sprint 2, Balík B
 * MIGRATED TO makeAppLayer ✅ - Using centralized layer composition
 * REFACTORED ✅ - Middleware moved to app.ts for clean separation
 */

import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import { getTranslate } from '../middleware'
import { renderSettingsPage, SettingsPageData } from '../templates/pages/admin-settings.template'
import { getAvailableLocales, getLocaleDisplayName, type Locale } from '../services/i18n'
import { DatabaseService, DatabaseError } from '../services/database-effect'
import { SettingsService, AppearanceSettings } from '../services/settings'
import { MigrationService, makeMigrationServiceLayer } from '../services/migrations'
import { makeAppLayer } from '../services'

type Bindings = {
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
}

type Variables = {
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
}

export const adminSettingsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts
// This keeps routes clean and focused on business logic

// Pre-compute available languages at module load time for performance
const AVAILABLE_LANGUAGES = getAvailableLocales().map((locale: Locale) => ({
  value: locale,
  label: getLocaleDisplayName(locale)
}))

// Helper function to get mock settings data
function getMockSettings(user: Variables['user']): {
  general: {
    siteName: string
    siteDescription: string
    adminEmail: string
    timezone: string
    language: string
    maintenanceMode: boolean
    availableLanguages: Array<{ value: string; label: string }>
  }
  appearance: any
  security: any
  notifications: any
  storage: any
  migrations: any
  databaseTools: any
} {
  return {
    general: {
      siteName: 'PatroCMS',
      siteDescription: 'A modern headless CMS powered by AI',
      adminEmail: user?.email || 'admin@example.com',
      timezone: 'UTC',
      language: 'en',
      maintenanceMode: false,
      availableLanguages: AVAILABLE_LANGUAGES
    },
    appearance: {
      theme: 'dark' as const,
      primaryColor: '#465FFF',
      logoUrl: '',
      favicon: '',
      customCSS: ''
    },
    security: {
      twoFactorEnabled: false,
      sessionTimeout: 30,
      passwordRequirements: {
        minLength: 8,
        requireUppercase: true,
        requireNumbers: true,
        requireSymbols: false
      },
      ipWhitelist: []
    },
    notifications: {
      emailNotifications: true,
      contentUpdates: true,
      systemAlerts: true,
      userRegistrations: false,
      emailFrequency: 'immediate' as const
    },
    storage: {
      maxFileSize: 10,
      allowedFileTypes: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'docx'],
      storageProvider: 'cloudflare' as const,
      backupFrequency: 'daily' as const,
      retentionPeriod: 30
    },
    migrations: {
      totalMigrations: 0,
      appliedMigrations: 0,
      pendingMigrations: 0,
      lastApplied: undefined,
      migrations: []
    },
    databaseTools: {
      totalTables: 0,
      totalRows: 0,
      lastBackup: undefined,
      databaseSize: '0 MB',
      tables: []
    }
  }
}

/**
 * Settings page (redirects to general settings)
 * PURE EFFECT ✅ (no async needed)
 */
adminSettingsRoutes.get('/', (c) => {
  return c.redirect('/admin/settings/general')
})

/**
 * General settings
 * GET /admin/settings/general
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.get('/general', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService

    // Get user's language from database
    let userLanguage = 'en'
    if (user) {
      const userResult = yield* 
        dbService.queryFirst<{ language: string }>(
          'SELECT language FROM users WHERE id = ?',
          [user.userId]
        ).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      
      userLanguage = userResult?.language || 'en'
    }

    // Get real general settings from database
    const generalSettings = yield* 
      settingsService.getGeneralSettings(user?.email)
    

    const mockSettings = getMockSettings(user)
    // Merge general settings with user's language
    mockSettings.general = {
      ...generalSettings,
      adminEmail: generalSettings.adminEmail || user?.email || 'admin@example.com',
      language: userLanguage,  // Add user's actual language
      availableLanguages: AVAILABLE_LANGUAGES
    }

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: mockSettings,
      activeTab: 'general' as const,
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading general settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'general' as const,
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Appearance settings
 * GET /admin/settings/appearance
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.get('/appearance', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const settingsService = yield* SettingsService

    // Get real appearance settings from database
    const appearanceSettings = yield* 
      settingsService.getAppearanceSettings()
    

    const mockSettings = getMockSettings(user)
    mockSettings.appearance = appearanceSettings

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: mockSettings,
      activeTab: 'appearance' as const,
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading appearance settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'appearance' as const,
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Security settings
 * PURE EFFECT ✅ (no DB access)
 */
adminSettingsRoutes.get('/security', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: getMockSettings(user),
      activeTab: 'security',
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading security settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'security',
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Notifications settings
 * PURE EFFECT ✅ (no DB access)
 */
adminSettingsRoutes.get('/notifications', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: getMockSettings(user),
      activeTab: 'notifications',
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading notification settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'notifications',
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Storage settings
 * PURE EFFECT ✅ (no DB access)
 */
adminSettingsRoutes.get('/storage', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: getMockSettings(user),
      activeTab: 'storage',
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading storage settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'storage',
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Migrations settings
 * PURE EFFECT ✅ (no DB access)
 */
adminSettingsRoutes.get('/migrations', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: getMockSettings(user),
      activeTab: 'migrations',
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading migrations settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'migrations',
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Database tools settings
 * PURE EFFECT ✅ (no DB access)
 */
adminSettingsRoutes.get('/database-tools', (c) => {
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      settings: getMockSettings(user),
      activeTab: 'database-tools',
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading database-tools settings:', error)
        const user = c.get('user')
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          settings: getMockSettings(user),
          activeTab: 'database-tools',
          version: c.get('appVersion')
        })
      })
    )
  ).then(pageData => {
    return c.html(renderSettingsPage(pageData as SettingsPageData, t))
  })
})

/**
 * Get migration status
 * GET /admin/settings/api/migrations/status
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.get('/api/migrations/status', (c) => {
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
      Effect.provide(makeAppLayer(db)), // Then AppLayer provides DatabaseService
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
 * POST /admin/settings/api/migrations/run
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.post('/api/migrations/run', (c) => {
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
      Effect.provide(makeAppLayer(db)), // Then AppLayer provides DatabaseService
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
 * GET /admin/settings/api/migrations/validate
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.get('/api/migrations/validate', (c) => {
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
      Effect.provide(makeAppLayer(db)), // Then AppLayer provides DatabaseService
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
 * Get database tools stats
 * GET /admin/settings/api/database-tools/stats
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.get('/api/database-tools/stats', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService

    // Get list of all tables
    const tables = yield* 
      dbService.query<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_cf_%'
         ORDER BY name`,
        []
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed([]))
      )
    

    let totalRows = 0
    const tableStats: Array<{ name: string; rowCount: number }> = []

    // Get row count for each table
    for (const table of tables) {
      const countResult = yield* 
        dbService.queryFirst<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table.name}`,
          []
        ).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed({ count: 0 }))
        )
      
      
      const rowCount = countResult?.count || 0
      totalRows += rowCount
      tableStats.push({
        name: table.name,
        rowCount
      })
    }

    // D1 doesn't expose database size directly, so we'll estimate based on row counts
    // Average row size estimate: 1KB per row (rough approximation)
    const estimatedSizeBytes = totalRows * 1024
    const databaseSizeMB = (estimatedSizeBytes / (1024 * 1024)).toFixed(2)

    return {
      success: true,
      data: {
        totalTables: tables.length,
        totalRows,
        databaseSize: `${databaseSizeMB} MB (estimated)`,
        tables: tableStats
      }
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching database stats:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to fetch database statistics',
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
 * Validate database
 * GET /admin/settings/api/database-tools/validate
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.get('/api/database-tools/validate', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService

    // Run PRAGMA integrity_check
    const integrityResult = yield* 
      dbService.queryFirst<{ integrity_check: string }>(
        'PRAGMA integrity_check',
        []
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed({ integrity_check: 'error' }))
      )
    
    
    const isValid = integrityResult?.integrity_check === 'ok'

    return {
      success: true,
      data: {
        valid: isValid,
        message: isValid ? 'Database integrity check passed' : 'Database integrity check failed'
      }
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error validating database:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to validate database',
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
 * Backup database
 * POST /admin/settings/api/database-tools/backup
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.post('/api/database-tools/backup', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')

    // Only allow admin users
    if (!user || user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized. Admin access required.',
        statusCode: 403
      }
    }

    // TODO: Implement actual backup functionality
    // For now, return success message
    return {
      success: true,
      message: 'Database backup feature coming soon. Use Cloudflare Dashboard for backups.'
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.catchAll((error) => {
        console.error('Error creating backup:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to create backup',
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
 * Truncate tables schema
 */
const truncateTablesSchema = Schema.Struct({
  tables: Schema.Array(Schema.String)
})

/**
 * Truncate tables
 * POST /admin/settings/api/database-tools/truncate
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.post('/api/database-tools/truncate', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')

    // Only allow admin users
    if (!user || user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized. Admin access required.',
        statusCode: 403
      }
    }

    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new DatabaseError({ message: 'Invalid JSON in request body', cause: error })
      })
    

    const validation = Schema.decodeUnknownEither(truncateTablesSchema)(body)
    if (validation._tag === 'Left') {
      return {
        success: false,
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }

    const { tables: tablesToTruncate } = validation.right

    if (tablesToTruncate.length === 0) {
      return {
        success: false,
        error: 'No tables specified for truncation',
        statusCode: 400
      }
    }

    const dbService = yield* DatabaseService
    const results: Array<{ table: string; success: boolean; error?: string }> = []

    for (const tableName of tablesToTruncate) {
      const truncateResult = yield* 
        dbService.execute(`DELETE FROM ${tableName}`, []).pipe(
          Effect.map(() => ({ table: tableName, success: true })),
          Effect.catchAll((error) => 
            Effect.succeed({
              table: tableName,
              success: false,
              error: String(error)
            })
          )
        )
      
      results.push(truncateResult)
    }

    const successCount = results.filter(r => r.success).length

    return {
      success: true,
      message: `Truncated ${successCount} of ${tablesToTruncate.length} tables`,
      results
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error truncating tables:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to truncate tables',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 403 | 500
      return c.json({ success: false, error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * General settings schema
 */
const generalSettingsSchema = Schema.Struct({
  siteName: Schema.String.pipe(Schema.minLength(1)),
  siteDescription: Schema.String.pipe(Schema.minLength(1)),
  adminEmail: Schema.optional(Schema.String),
  timezone: Schema.String,
  language: Schema.String,
  maintenanceMode: Schema.Boolean
})

/**
 * Save general settings
 * POST /admin/settings/general
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.post('/general', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')

    if (!user || user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized. Admin access required.',
        statusCode: 403
      }
    }

    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new DatabaseError({ message: 'Failed to parse form data', cause: error })
      })
    

    // Extract general settings from form data
    const settings = {
      siteName: formData.get('siteName') as string,
      siteDescription: formData.get('siteDescription') as string,
      adminEmail: formData.get('adminEmail') as string,
      timezone: formData.get('timezone') as string,
      language: formData.get('language') as string,
      maintenanceMode: formData.get('maintenanceMode') === 'true'
    }

    // Validate using Effect Schema
    const validation = Schema.decodeUnknownEither(generalSettingsSchema)(settings)
    if (validation._tag === 'Left') {
      return {
        success: false,
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }

    const validatedSettings = validation.right

    // Save settings using SettingsService
    const settingsService = yield* SettingsService
    yield* settingsService.saveGeneralSettings(validatedSettings)

    return {
      success: true,
      message: 'General settings saved successfully!'
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error saving general settings:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to save settings. Please try again.',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 403 | 500
      return c.json({ success: false, error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Appearance settings schema
 */
const appearanceSettingsSchema = Schema.Struct({
  theme: Schema.Literal('light', 'dark', 'auto'),
  primaryColor: Schema.String.pipe(Schema.minLength(4)),
  logoUrl: Schema.String,
  favicon: Schema.String,
  customCSS: Schema.String
})

/**
 * Save appearance settings
 * POST /admin/settings/appearance
 * MIGRATED TO PURE EFFECT ✅
 */
adminSettingsRoutes.post('/appearance', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')

    if (!user || user.role !== 'admin') {
      return {
        success: false,
        error: 'Unauthorized. Admin access required.',
        statusCode: 403
      }
    }

    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new DatabaseError({ message: 'Failed to parse form data', cause: error })
      })
    

    // Extract appearance settings from form data
    const settings = {
      theme: formData.get('theme') as 'light' | 'dark' | 'auto',
      primaryColor: formData.get('primaryColor') as string,
      logoUrl: formData.get('logoUrl') as string,
      favicon: formData.get('favicon') as string,
      customCSS: formData.get('customCSS') as string
    }

    // Validate using Effect Schema
    const validation = Schema.decodeUnknownEither(appearanceSettingsSchema)(settings)
    if (validation._tag === 'Left') {
      return {
        success: false,
        error: 'Validation failed',
        details: validation.left.message,
        statusCode: 400
      }
    }

    const validatedSettings = validation.right

    // Save settings using SettingsService
    const settingsService = yield* SettingsService
    yield* settingsService.saveAppearanceSettings(validatedSettings)

    return {
      success: true,
      message: 'Appearance settings saved successfully!'
    }
  })

  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error saving appearance settings:', error)
        return Effect.succeed({
          success: false,
          error: 'Failed to save settings. Please try again.',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      const statusCode = result.statusCode as 400 | 403 | 500
      return c.json({ success: false, error: result.error }, statusCode)
    }
    return c.json(result)
  })
})

/**
 * Save settings (legacy endpoint - redirect to general)
 * PURE EFFECT ✅ (no async needed)
 */
adminSettingsRoutes.post('/', (c) => {
  return c.redirect('/admin/settings/general')
})

export default adminSettingsRoutes
