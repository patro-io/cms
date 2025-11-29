/**
 * Collection Sync Service - Pure Effect Implementation
 *
 * Syncs collection configurations from code to the database.
 * Handles create, update, and validation of config-managed collections.
 */

import { Context, Effect, Layer } from 'effect'
import { DatabaseService, DatabaseError } from './database-effect'
import {
  CollectionLoaderService,
  CollectionValidationError,
  CollectionLoaderError
} from './collection-loader'
import { CollectionConfig, CollectionSyncResult } from '../types/collection-config'

/**
 * Collection Sync Error types
 */
export class CollectionSyncError {
  readonly _tag = 'CollectionSyncError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

/**
 * Collection Sync Service Interface
 */
export interface CollectionSyncService {
  /**
   * Sync all collection configurations to the database
   */
  readonly syncCollections: () => Effect.Effect<
    CollectionSyncResult[],
    DatabaseError | CollectionSyncError | CollectionLoaderError | CollectionValidationError,
    DatabaseService | CollectionLoaderService | CollectionSyncService
  >

  /**
   * Sync a single collection configuration to the database
   */
  readonly syncCollection: (
    config: CollectionConfig
  ) => Effect.Effect<
    CollectionSyncResult,
    DatabaseError | CollectionValidationError,
    DatabaseService | CollectionLoaderService
  >

  /**
   * Check if a collection is managed by config
   */
  readonly isCollectionManaged: (
    collectionName: string
  ) => Effect.Effect<boolean, DatabaseError, DatabaseService>

  /**
   * Get all managed collections from database
   */
  readonly getManagedCollections: () => Effect.Effect<
    string[],
    DatabaseError,
    DatabaseService
  >

  /**
   * Remove collections that are no longer in config files
   */
  readonly cleanupRemovedCollections: () => Effect.Effect<
    string[],
    DatabaseError | CollectionSyncError | CollectionLoaderError,
    DatabaseService | CollectionLoaderService | CollectionSyncService
  >

  /**
   * Full sync: sync all configs and cleanup removed
   */
  readonly fullCollectionSync: () => Effect.Effect<
    { results: CollectionSyncResult[]; removed: string[] },
    DatabaseError | CollectionSyncError | CollectionLoaderError | CollectionValidationError,
    DatabaseService | CollectionLoaderService | CollectionSyncService
  >
}

/**
 * Collection Sync Service Tag
 */
export const CollectionSyncService = Context.GenericTag<CollectionSyncService>(
  '@services/CollectionSyncService'
)

/**
 * Create Collection Sync Service implementation
 */
export const makeCollectionSyncService = (): CollectionSyncService => ({
  syncCollections: () =>
    Effect.gen(function* (_) {
      console.log('🔄 Starting collection sync...')

      const loaderService = yield* CollectionLoaderService
      const configs = yield* loaderService.loadCollectionConfigs()

      if (configs.length === 0) {
        console.log('⚠️  No collection configurations found')
        return []
      }

      const syncService = yield* CollectionSyncService
      const results: CollectionSyncResult[] = []

      for (const config of configs) {
        const result = yield* syncService.syncCollection(config)
        results.push(result)
      }

      const created = results.filter(r => r.status === 'created').length
      const updated = results.filter(r => r.status === 'updated').length
      const unchanged = results.filter(r => r.status === 'unchanged').length
      const errors = results.filter(r => r.status === 'error').length

      console.log(
        `✅ Collection sync complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${errors} errors`
      )

      return results
    }),

  syncCollection: (config: CollectionConfig) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService
      const loaderService = yield* CollectionLoaderService

      // Validate config
      const validation = loaderService.validateCollectionConfig(config)
      if (!validation.valid) {
        return {
          name: config.name,
          status: 'error' as const,
          error: `Validation failed: ${validation.errors.join(', ')}`
        }
      }

      // Check if collection exists
      const existing = yield* 
        dbService.queryFirst<any>(
          'SELECT * FROM collections WHERE name = ?',
          [config.name]
        )
      

      const now = Date.now()
      const collectionId =
        existing?.id || `col-${config.name}-${crypto.randomUUID().slice(0, 8)}`

      // Prepare collection data with backward compatibility
      const schemaJson = JSON.stringify(config.schema)
      const isActive = config.isActive !== false ? 1 : 0
      const managed = config.managed !== false ? 1 : 0
      const codeManaged = config.codeManaged !== undefined ? (config.codeManaged ? 1 : 0) : managed
      const fieldsEditable = config.fieldsEditable !== undefined ? (config.fieldsEditable ? 1 : 0) : 1

      if (!existing) {
        // Create new collection
        yield* 
          dbService.execute(
            `INSERT INTO collections (id, name, display_name, description, schema, is_active, managed, code_managed, fields_editable, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              collectionId,
              config.name,
              config.displayName,
              config.description || null,
              schemaJson,
              isActive,
              managed,
              codeManaged,
              fieldsEditable,
              now,
              now
            ]
          )
        

        console.log(`  ✓ Created collection: ${config.name}`)

        return {
          name: config.name,
          status: 'created' as const,
          message: `Created collection "${config.displayName}"`
        }
      } else {
        // Check if update is needed
        const existingSchema = existing.schema
          ? JSON.stringify(existing.schema)
          : '{}'
        const existingDisplayName = existing.display_name
        const existingDescription = existing.description
        const existingIsActive = existing.is_active
        const existingManaged = existing.managed
        const existingCodeManaged = existing.code_managed
        const existingFieldsEditable = existing.fields_editable

        const needsUpdate =
          schemaJson !== existingSchema ||
          config.displayName !== existingDisplayName ||
          (config.description || null) !== existingDescription ||
          isActive !== existingIsActive ||
          managed !== existingManaged ||
          codeManaged !== existingCodeManaged ||
          fieldsEditable !== existingFieldsEditable

        if (!needsUpdate) {
          return {
            name: config.name,
            status: 'unchanged' as const,
            message: `Collection "${config.displayName}" is up to date`
          }
        }

        // Update existing collection
        yield* 
          dbService.execute(
            `UPDATE collections
             SET display_name = ?, description = ?, schema = ?, is_active = ?, managed = ?, code_managed = ?, fields_editable = ?, updated_at = ?
             WHERE name = ?`,
            [
              config.displayName,
              config.description || null,
              schemaJson,
              isActive,
              managed,
              codeManaged,
              fieldsEditable,
              now,
              config.name
            ]
          )
        

        console.log(`  ✓ Updated collection: ${config.name}`)

        return {
          name: config.name,
          status: 'updated' as const,
          message: `Updated collection "${config.displayName}"`
        }
      }
    }),

  isCollectionManaged: (collectionName: string) =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService

      const result = yield* 
        dbService.queryFirst<{ managed: number }>(
          'SELECT managed FROM collections WHERE name = ?',
          [collectionName]
        )
      

      return result?.managed === 1
    }),

  getManagedCollections: () =>
    Effect.gen(function* (_) {
      const dbService = yield* DatabaseService

      const results = yield* 
        dbService.query<{ name: string }>(
          'SELECT name FROM collections WHERE managed = 1',
          []
        )
      

      return results.map(row => row.name)
    }),

  cleanupRemovedCollections: () =>
    Effect.gen(function* (_) {
      const loaderService = yield* CollectionLoaderService
      const syncService = yield* CollectionSyncService

      const configs = yield* loaderService.loadCollectionConfigs()
      const configNames = new Set(configs.map(c => c.name))
      const managedCollections = yield* syncService.getManagedCollections()
      const removed: string[] = []

      const dbService = yield* DatabaseService

      for (const managedName of managedCollections) {
        if (!configNames.has(managedName)) {
          // This managed collection no longer has a config file
          // Mark as inactive instead of deleting (safer)
          yield* 
            dbService.execute(
              `UPDATE collections
               SET is_active = 0, updated_at = ?
               WHERE name = ? AND managed = 1`,
              [Date.now(), managedName]
            )
          

          removed.push(managedName)
          console.log(`  ⚠️  Deactivated removed collection: ${managedName}`)
        }
      }

      return removed
    }),

  fullCollectionSync: () =>
    Effect.gen(function* (_) {
      const syncService = yield* CollectionSyncService

      const results = yield* syncService.syncCollections()
      const removed = yield* syncService.cleanupRemovedCollections()

      return { results, removed }
    })
})

/**
 * Create a Layer for providing CollectionSyncService
 */
export const makeCollectionSyncServiceLayer = (): Layer.Layer<CollectionSyncService> =>
  Layer.succeed(CollectionSyncService, makeCollectionSyncService())