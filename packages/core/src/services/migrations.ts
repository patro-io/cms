import { Context, Effect, Layer, pipe } from 'effect'
import { DatabaseService, DatabaseError } from './database-effect'

export interface Migration {
  id: string
  name: string
  filename: string
  description?: string
  applied: boolean
  appliedAt?: string
  size?: number
}

export interface MigrationStatus {
  totalMigrations: number
  appliedMigrations: number
  pendingMigrations: number
  lastApplied?: string
  migrations: Migration[]
}

/**
 * Migration Service Interface
 */
export interface MigrationService {
  readonly initializeMigrationsTable: () => Effect.Effect<void, DatabaseError, DatabaseService>
  readonly getAvailableMigrations: () => Effect.Effect<Migration[], DatabaseError, DatabaseService>
  readonly getMigrationStatus: () => Effect.Effect<MigrationStatus, DatabaseError, DatabaseService>
  readonly runPendingMigrations: () => Effect.Effect<
    { success: boolean; message: string; applied: string[] },
    DatabaseError,
    DatabaseService
  >
  readonly validateSchema: () => Effect.Effect<
    { valid: boolean; issues: string[] },
    DatabaseError,
    DatabaseService
  >
}

/**
 * Migration Service Tag for dependency injection
 */
export const MigrationService = Context.GenericTag<MigrationService>('@services/MigrationService')

/**
 * Create a Migration Service implementation
 */
export const makeMigrationService = (): MigrationService => ({
  initializeMigrationsTable: () =>
    Effect.gen(function* (_) {
      const db = yield* DatabaseService
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          filename TEXT NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT
        )
      `
      
      yield* db.execute(createTableQuery, [])
    }),

  getAvailableMigrations: () =>
    Effect.gen(function* (_) {
      const db = yield* DatabaseService
      const migrationFiles = [
        { id: '001', name: 'Initial Schema', filename: '001_initial_schema.sql', description: '...' },
        { id: '002', name: 'Core Enhancements', filename: '002_core_enhancements.sql', description: '...' },
        { id: '003', name: 'Plugins and Settings', filename: '003_plugins_and_settings.sql', description: '...' },
        { id: '004', name: 'Translation Indexes', filename: '004_add_translation_index.sql', description: 'Add indexes for translation linking' }
      ]

      const appliedMigrations = yield* getAppliedMigrations()
      
      return migrationFiles.map((file) => ({
        ...file,
        applied: appliedMigrations.has(file.id),
        appliedAt: appliedMigrations.get(file.id)?.applied_at,
      }))
    }),

  getMigrationStatus: () =>
    Effect.gen(function* (_) {
      const db = yield* DatabaseService
      
      // Initialize migrations table
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          filename TEXT NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT
        )
      `
      yield* db.execute(createTableQuery, [])
      
      // Get available migrations
      const migrationFiles = [
        { id: '001', name: 'Initial Schema', filename: '001_initial_schema.sql', description: '...' },
        { id: '002', name: 'Core Enhancements', filename: '002_core_enhancements.sql', description: '...' },
        { id: '003', name: 'Plugins and Settings', filename: '003_plugins_and_settings.sql', description: '...' },
        { id: '004', name: 'Translation Indexes', filename: '004_add_translation_index.sql', description: 'Add indexes for translation linking' }
      ]

      const appliedMigrations = yield* getAppliedMigrations()
      
      const migrations = migrationFiles.map((file) => ({
        ...file,
        applied: appliedMigrations.has(file.id),
        appliedAt: appliedMigrations.get(file.id)?.applied_at,
      }))
      
      const applied = migrations.filter(m => m.applied)
      return {
        totalMigrations: migrations.length,
        appliedMigrations: applied.length,
        pendingMigrations: migrations.length - applied.length,
        lastApplied: applied[applied.length - 1]?.appliedAt,
        migrations
      }
    }),

  runPendingMigrations: () =>
    Effect.gen(function* (_) {
      const db = yield* DatabaseService
      
      // Initialize migrations table
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          filename TEXT NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT
        )
      `
      yield* db.execute(createTableQuery, [])
      
      // Get migration status
      const migrationFiles = [
        { id: '001', name: 'Initial Schema', filename: '001_initial_schema.sql', description: '...' },
        { id: '002', name: 'Core Enhancements', filename: '002_core_enhancements.sql', description: '...' },
        { id: '003', name: 'Plugins and Settings', filename: '003_plugins_and_settings.sql', description: '...' },
        { id: '004', name: 'Translation Indexes', filename: '004_add_translation_index.sql', description: 'Add indexes for translation linking' }
      ]

      const appliedMigrations = yield* getAppliedMigrations()
      
      const migrations = migrationFiles.map((file) => ({
        ...file,
        applied: appliedMigrations.has(file.id),
        appliedAt: appliedMigrations.get(file.id)?.applied_at,
      }))
      
      const status = {
        totalMigrations: migrations.length,
        appliedMigrations: migrations.filter(m => m.applied).length,
        pendingMigrations: migrations.filter(m => !m.applied).length,
        lastApplied: migrations.filter(m => m.applied).slice(-1)[0]?.appliedAt,
        migrations
      }
      const pendingMigrations = status.migrations.filter(m => !m.applied)
      
      if (pendingMigrations.length === 0) {
        return {
          success: true,
          message: 'All migrations are up to date',
          applied: []
        }
      }

      const applied: string[] = []
      yield* Effect.forEach(pendingMigrations, (migration) =>
          Effect.gen(function* (_) {
            yield* applyMigration(migration)
            yield* markMigrationApplied(migration.id, migration.name, migration.filename)
            applied.push(migration.id)
            return migration.id
          }).pipe(
            Effect.catchAll((error) => {
              console.error(`Failed to apply migration ${migration.id}:`, error)
              return Effect.fail(new DatabaseError({ message: `Migration ${migration.id} failed`, cause: error }))
            })
          ),
          { concurrency: 1 }
        )
     
      return {
        success: true,
        message: `Applied ${applied.length} migration(s)`,
        applied
      }
    }),

  validateSchema: () =>
    Effect.gen(function* (_) {
      const db = yield* DatabaseService
      const requiredTables = ['users', 'content', 'collections', 'media', 'sessions']
      
      const results = yield* Effect.forEach(requiredTables, (table) =>
          db.queryFirst(`SELECT COUNT(*) FROM ${table} LIMIT 1`, []).pipe(
            Effect.map(() => null as string | null),
            Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
            Effect.catchAll(() => Effect.succeed(table))
          )
        )
      
      const issues = results.filter((r): r is string => r !== null).map(table => `Missing table: ${table}`)
      return {
        valid: issues.length === 0,
        issues
      }
    })
})

/**
 * Helper: Get applied migrations from database
 */
const getAppliedMigrations = (): Effect.Effect<Map<string, any>, DatabaseError, DatabaseService> =>
  Effect.gen(function* (_) {
    const db = yield* DatabaseService
    const results = yield* db.query('SELECT id, applied_at FROM migrations', [])
    return new Map(results.map((row: any) => [row.id, row]))
  })

/**
 * Helper: Apply a single migration
 */
const applyMigration = (migration: Migration): Effect.Effect<void, DatabaseError, DatabaseService> =>
  Effect.gen(function* (_) {
    const db = yield* DatabaseService
    console.log(`Applying migration ${migration.id}: ${migration.name}`)
    
    const sql = yield* getMigrationSQL(migration.id)
    
    if (sql === null) {
      return yield* Effect.fail(new DatabaseError({ message: `Migration SQL not found for ${migration.id}` }))
    }
    
    if (sql === '') {
      console.log(`Skipping migration ${migration.id} (empty/obsolete)`)
      return
    }

    const statements = splitSQLStatements(sql)
    
    yield* 
      Effect.forEach(statements, (statement) => {
        if (!statement.trim()) return Effect.succeed(undefined)
        return db.execute(statement, [])
      }, { concurrency: 1 })
    
  })

/**
 * Helper: Split SQL into individual statements
 */
const splitSQLStatements = (sql: string): string[] => {
  const statements: string[] = []
  let current = ''
  let inTrigger = false

  const lines = sql.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('--') || trimmed.length === 0) {
      continue
    }

    if (trimmed.toUpperCase().includes('CREATE TRIGGER')) {
      inTrigger = true
    }

    current += line + '\n'

    if (inTrigger && trimmed.toUpperCase() === 'END;') {
      statements.push(current.trim())
      current = ''
      inTrigger = false
    } else if (!inTrigger && trimmed.endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements.filter(s => s.length > 0)
}

/**
 * Helper: Get migration SQL content
 */
const getMigrationSQL = (migrationId: string): Effect.Effect<string | null, never> => {
  // Return migration SQL based on ID
  // For migrations 002 and 003, return empty string to indicate they should be run via wrangler
  switch (migrationId) {
    case '001':
      return Effect.succeed(`-- Initial schema omitted for brevity, see migrations.ts`)
    case '002':
      return Effect.succeed('')
    case '003':
      return Effect.succeed('')
    case '004':
      return Effect.succeed(`
-- Migration: Add index on translation_group_id for translation linking
CREATE INDEX IF NOT EXISTS idx_content_translation_group_id
ON content(translation_group_id);

CREATE INDEX IF NOT EXISTS idx_content_collection_translation
ON content(collection_id, translation_group_id);

CREATE INDEX IF NOT EXISTS idx_content_language
ON content(language);
`)
    default:
      return Effect.succeed(null)
  }
}

/**
 * Helper: Mark migration as applied in database
 */
const markMigrationApplied = (
  migrationId: string,
  name: string,
  filename: string
): Effect.Effect<void, DatabaseError, DatabaseService> =>
  Effect.gen(function* (_) {
    const db = yield* DatabaseService
    
    // Initialize migrations table first
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT
      )
    `
    yield* db.execute(createTableQuery, [])
    
    yield* 
      db.execute(
        'INSERT OR REPLACE INTO migrations (id, name, filename, applied_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [migrationId, name, filename]
      )
    
  })

/**
 * Create a Layer for providing MigrationService
 */
export const makeMigrationServiceLayer = (): Layer.Layer<MigrationService, never, DatabaseService> =>
  Layer.succeed(MigrationService, makeMigrationService())