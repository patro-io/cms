/**
 * Settings Service - Pure Effect Implementation
 * 
 * Manages application settings storage and retrieval using Effect Runtime
 */

import { Context, Effect, Layer } from 'effect'
import { DatabaseService, DatabaseError, NotFoundError } from './database-effect'

/**
 * Setting database record
 */
export interface Setting {
  id: string
  category: string
  key: string
  value: string // JSON string
  created_at: number
  updated_at: number
}

/**
 * General settings structure
 */
export interface GeneralSettings {
  siteName: string
  siteDescription: string
  adminEmail?: string
  timezone: string
  language: string
  maintenanceMode: boolean
}

/**
 * Appearance settings structure
 */
export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'auto'
  primaryColor: string
  logoUrl: string
  favicon: string
  customCSS: string
}

/**
 * Settings Service Error types
 */
export class SettingsError {
  readonly _tag = 'SettingsError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

/**
 * Settings Service Interface - Closed Service Pattern
 */
export interface SettingsService {
  /**
   * Get a setting value by category and key
   */
  readonly getSetting: <T = unknown>(
    category: string,
    key: string
  ) => Effect.Effect<T | null, DatabaseError | SettingsError>

  /**
   * Get all settings for a category
   */
  readonly getCategorySettings: (
    category: string
  ) => Effect.Effect<Record<string, unknown>, DatabaseError | SettingsError>

  /**
   * Set a setting value
   */
  readonly setSetting: (
    category: string,
    key: string,
    value: unknown
  ) => Effect.Effect<boolean, DatabaseError | SettingsError>

  /**
   * Set multiple settings at once
   */
  readonly setMultipleSettings: (
    category: string,
    settings: Record<string, unknown>
  ) => Effect.Effect<boolean, DatabaseError | SettingsError>

  /**
   * Get general settings with defaults
   */
  readonly getGeneralSettings: (
    userEmail?: string
  ) => Effect.Effect<GeneralSettings, DatabaseError | SettingsError>

  /**
   * Save general settings
   */
  readonly saveGeneralSettings: (
    settings: Partial<GeneralSettings>
  ) => Effect.Effect<boolean, DatabaseError | SettingsError>

  /**
   * Get appearance settings with defaults
   */
  readonly getAppearanceSettings: () => Effect.Effect<AppearanceSettings, DatabaseError | SettingsError>

  /**
   * Save appearance settings
   */
  readonly saveAppearanceSettings: (
    settings: Partial<AppearanceSettings>
  ) => Effect.Effect<boolean, DatabaseError | SettingsError>
}

/**
 * Settings Service Tag for dependency injection
 */
export const SettingsService = Context.GenericTag<SettingsService>('@services/SettingsService')

/**
 * Settings Service Live Implementation - Closed Service Pattern
 * 
 * DatabaseService is obtained once at Layer creation and stored in closure.
 */
export const SettingsServiceLive = Layer.effect(
  SettingsService,
  Effect.gen(function* (_) {
    const db = yield* DatabaseService

    return {
      getSetting: <T = unknown>(category: string, key: string) =>
        Effect.gen(function* (_) {
          const result = yield* 
            db.queryFirst<{ value: string }>(
              'SELECT value FROM settings WHERE category = ? AND key = ?',
              [category, key]
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          

          if (!result) {
            return null
          }

          try {
            return JSON.parse(result.value) as T
          } catch (error) {
            return yield* 
              Effect.fail(
                new SettingsError(`Failed to parse setting value for ${category}.${key}`, error)
              )
            
          }
        }),

      getCategorySettings: (category: string) =>
        Effect.gen(function* (_) {
          const results = yield* 
            db.query<{ key: string; value: string }>(
              'SELECT key, value FROM settings WHERE category = ?',
              [category]
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed([]))
            )
          

          const settings: Record<string, unknown> = {}

          for (const row of results) {
            try {
              settings[row.key] = JSON.parse(row.value)
            } catch (error) {
              // Log error but continue processing other settings
              console.error(`Error parsing setting ${category}.${row.key}:`, error)
            }
          }

          return settings
        }),

      setSetting: (category: string, key: string, value: unknown) =>
        Effect.gen(function* (_) {
          const now = Date.now()
          let jsonValue: string

          try {
            jsonValue = JSON.stringify(value)
          } catch (error) {
            return yield* 
              Effect.fail(
                new SettingsError(`Failed to serialize value for ${category}.${key}`, error)
              )
            
          }

          yield* 
            db.execute(
              `INSERT INTO settings (id, category, key, value, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(category, key) DO UPDATE SET
                 value = excluded.value,
                 updated_at = excluded.updated_at`,
              [crypto.randomUUID(), category, key, jsonValue, now, now]
            )
          

          return true
        }),

      setMultipleSettings: (category: string, settings: Record<string, unknown>) =>
        Effect.gen(function* (_) {
          const now = Date.now()

          // Process all settings sequentially
          for (const [key, value] of Object.entries(settings)) {
            let jsonValue: string

            try {
              jsonValue = JSON.stringify(value)
            } catch (error) {
              return yield* 
                Effect.fail(
                  new SettingsError(`Failed to serialize value for ${category}.${key}`, error)
                )
              
            }

            yield* 
              db.execute(
                `INSERT INTO settings (id, category, key, value, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(category, key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = excluded.updated_at`,
                [crypto.randomUUID(), category, key, jsonValue, now, now]
              )
            
          }

          return true
        }),

      getGeneralSettings: (userEmail?: string) =>
        Effect.gen(function* (_) {
          const results = yield* 
            db.query<{ key: string; value: string }>(
              'SELECT key, value FROM settings WHERE category = ?',
              ['general']
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed([]))
            )
          

          const settings: Record<string, unknown> = {}

          for (const row of results) {
            try {
              settings[row.key] = JSON.parse(row.value)
            } catch (error) {
              console.error(`Error parsing general setting ${row.key}:`, error)
            }
          }

          // Return with defaults
          return {
            siteName: (settings.siteName as string) || 'PatroCMS',
            siteDescription: (settings.siteDescription as string) || 'A modern headless CMS powered by AI',
            adminEmail: (settings.adminEmail as string) || userEmail || 'admin@example.com',
            timezone: (settings.timezone as string) || 'UTC',
            language: (settings.language as string) || 'en',
            maintenanceMode: (settings.maintenanceMode as boolean) || false
          }
        }),

      saveGeneralSettings: (settings: Partial<GeneralSettings>) =>
        Effect.gen(function* (_) {
          const now = Date.now()

          const settingsToSave: Record<string, unknown> = {}

          if (settings.siteName !== undefined) settingsToSave.siteName = settings.siteName
          if (settings.siteDescription !== undefined) settingsToSave.siteDescription = settings.siteDescription
          if (settings.adminEmail !== undefined) settingsToSave.adminEmail = settings.adminEmail
          if (settings.timezone !== undefined) settingsToSave.timezone = settings.timezone
          if (settings.language !== undefined) settingsToSave.language = settings.language
          if (settings.maintenanceMode !== undefined) settingsToSave.maintenanceMode = settings.maintenanceMode

          // Process all settings sequentially
          for (const [key, value] of Object.entries(settingsToSave)) {
            let jsonValue: string

            try {
              jsonValue = JSON.stringify(value)
            } catch (error) {
              return yield* 
                Effect.fail(
                  new SettingsError(`Failed to serialize value for general.${key}`, error)
                )
              
            }

            yield* 
              db.execute(
                `INSERT INTO settings (id, category, key, value, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(category, key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = excluded.updated_at`,
                [crypto.randomUUID(), 'general', key, jsonValue, now, now]
              )
            
          }

          return true
        }),

      getAppearanceSettings: () =>
        Effect.gen(function* (_) {
          const results = yield* 
            db.query<{ key: string; value: string }>(
              'SELECT key, value FROM settings WHERE category = ?',
              ['appearance']
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed([]))
            )
          

          const settings: Record<string, unknown> = {}

          for (const row of results) {
            try {
              settings[row.key] = JSON.parse(row.value)
            } catch (error) {
              console.error(`Error parsing appearance setting ${row.key}:`, error)
            }
          }

          // Return with defaults
          return {
            theme: (settings.theme as 'light' | 'dark' | 'auto') || 'dark',
            primaryColor: (settings.primaryColor as string) || '#465FFF',
            logoUrl: (settings.logoUrl as string) || '',
            favicon: (settings.favicon as string) || '',
            customCSS: (settings.customCSS as string) || ''
          }
        }),

      saveAppearanceSettings: (settings: Partial<AppearanceSettings>) =>
        Effect.gen(function* (_) {
          const now = Date.now()

          const settingsToSave: Record<string, unknown> = {}

          if (settings.theme !== undefined) settingsToSave.theme = settings.theme
          if (settings.primaryColor !== undefined) settingsToSave.primaryColor = settings.primaryColor
          if (settings.logoUrl !== undefined) settingsToSave.logoUrl = settings.logoUrl
          if (settings.favicon !== undefined) settingsToSave.favicon = settings.favicon
          if (settings.customCSS !== undefined) settingsToSave.customCSS = settings.customCSS

          // Process all settings sequentially
          for (const [key, value] of Object.entries(settingsToSave)) {
            let jsonValue: string

            try {
              jsonValue = JSON.stringify(value)
            } catch (error) {
              return yield* 
                Effect.fail(
                  new SettingsError(`Failed to serialize value for appearance.${key}`, error)
                )
              
            }

            yield* 
              db.execute(
                `INSERT INTO settings (id, category, key, value, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(category, key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = excluded.updated_at`,
                [crypto.randomUUID(), 'appearance', key, jsonValue, now, now]
              )
            
          }

          return true
        })
    }
  })
)

/**
 * Helper function to create Settings service layer
 * Convenience wrapper for tests and simple use cases
 */
export const makeSettingsServiceLayer = () => SettingsServiceLive

/**
 * @deprecated Use makeSettingsServiceLayer instead
 * Kept for backwards compatibility
 */
export const makeSettingsService = makeSettingsServiceLayer

