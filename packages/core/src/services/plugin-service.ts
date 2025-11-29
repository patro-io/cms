import { Context, Effect, Layer, pipe } from 'effect'
import { DatabaseError, DatabaseService, makeDatabaseLayer } from './database-effect'
import type { D1Database } from '@cloudflare/workers-types'

export interface PluginData {
  id: string
  name: string
  display_name: string
  description: string
  version: string
  author: string
  category: string
  icon: string
  status: 'active' | 'inactive' | 'error'
  is_core: boolean
  settings?: any
  permissions?: string[]
  dependencies?: string[]
  download_count: number
  rating: number
  installed_at: number
  activated_at?: number
  last_updated: number
  error_message?: string
}

export interface PluginStats {
  total: number
  active: number
  inactive: number
  errors: number
  uninstalled: number
}

// Service definition
export class PluginService extends Context.Tag("PluginService")<
  PluginService,
  {
    readonly getAllPlugins: () => Effect.Effect<PluginData[], DatabaseError>
    readonly getPlugin: (pluginId: string) => Effect.Effect<PluginData | null, DatabaseError>
    readonly getPluginByName: (name: string) => Effect.Effect<PluginData | null, DatabaseError>
    readonly getPluginStats: () => Effect.Effect<PluginStats, DatabaseError>
    readonly installPlugin: (pluginData: Partial<PluginData>) => Effect.Effect<PluginData, DatabaseError>
    readonly uninstallPlugin: (pluginId: string) => Effect.Effect<void, DatabaseError>
    readonly activatePlugin: (pluginId: string) => Effect.Effect<void, DatabaseError>
    readonly deactivatePlugin: (pluginId: string) => Effect.Effect<void, DatabaseError>
    readonly updatePluginSettings: (pluginId: string, settings: any) => Effect.Effect<void, DatabaseError>
    readonly setPluginError: (pluginId: string, error: string) => Effect.Effect<void, DatabaseError>
    readonly getPluginActivity: (pluginId: string, limit?: number) => Effect.Effect<any[], DatabaseError>
    readonly registerHook: (pluginId: string, hookName: string, handlerName: string, priority?: number) => Effect.Effect<void, DatabaseError>
    readonly registerRoute: (pluginId: string, path: string, method: string, handlerName: string, middleware?: any[]) => Effect.Effect<void, DatabaseError>
    readonly getPluginHooks: (pluginId: string) => Effect.Effect<any[], DatabaseError>
    readonly getPluginRoutes: (pluginId: string) => Effect.Effect<any[], DatabaseError>
  }
>() { }

// Helper: Map database row to PluginData
const mapPluginFromDb = (row: any): PluginData => ({
  id: row.id,
  name: row.name,
  display_name: row.display_name,
  description: row.description,
  version: row.version,
  author: row.author,
  category: row.category,
  icon: row.icon,
  status: row.status,
  is_core: row.is_core === 1,
  settings: row.settings ? JSON.parse(row.settings) : undefined,
  permissions: row.permissions ? JSON.parse(row.permissions) : undefined,
  dependencies: row.dependencies ? JSON.parse(row.dependencies) : undefined,
  download_count: row.download_count || 0,
  rating: row.rating || 0,
  installed_at: row.installed_at,
  activated_at: row.activated_at,
  last_updated: row.last_updated,
  error_message: row.error_message
})

export const PluginServiceLive = Layer.effect(
  PluginService,
  Effect.gen(function* () {
    const db = yield* DatabaseService

    // Helper: Log plugin activity
    const logActivity = (
      pluginId: string,
      action: string,
      userId: string | null,
      details?: any
    ): Effect.Effect<void, DatabaseError> => {
      const id = `activity-${Date.now()}`
      return pipe(
        db.execute(`
          INSERT INTO plugin_activity_log (id, plugin_id, action, user_id, details)
          VALUES (?, ?, ?, ?, ?)
        `, [id, pluginId, action, userId, details ? JSON.stringify(details) : null]),
        Effect.map(() => undefined)
      )
    }

    const getAllPlugins = () =>
      pipe(
        db.query<any>(`
          SELECT * FROM plugins
          ORDER BY is_core DESC, display_name ASC
        `),
        Effect.map((rows) => rows.map(mapPluginFromDb))
      )

    const getPlugin = (pluginId: string) =>
      pipe(
        db.queryFirst<any>('SELECT * FROM plugins WHERE id = ?', [pluginId]),
        Effect.map((row) => (row ? mapPluginFromDb(row) : null))
      )

    const getPluginByName = (name: string) =>
      pipe(
        db.queryFirst<any>('SELECT * FROM plugins WHERE name = ?', [name]),
        Effect.map((row) => (row ? mapPluginFromDb(row) : null))
      )
    
    // Check dependencies helper
    const checkDependencies = (dependencies: string[]): Effect.Effect<void, DatabaseError> =>
      pipe(
        Effect.forEach(dependencies, (dep) =>
          pipe(
            getPluginByName(dep),
            Effect.flatMap((plugin) => {
              if (!plugin || plugin.status !== 'active') {
                return Effect.fail(new DatabaseError({ message: `Required dependency '${dep}' is not active` }))
              }
              return Effect.succeed(undefined)
            })
          )
        ),
        Effect.map(() => undefined)
      )

    // Check dependents helper
    const checkDependents = (pluginName: string): Effect.Effect<void, DatabaseError> =>
      pipe(
        db.query<any>(`
          SELECT id, display_name FROM plugins 
          WHERE status = 'active' 
          AND dependencies LIKE ?
        `, [`%"${pluginName}"%`]),
        Effect.flatMap((rows) => {
          if (rows.length > 0) {
            const names = rows.map((p) => p.display_name).join(', ')
            return Effect.fail(new DatabaseError({ 
              message: `Cannot deactivate. The following plugins depend on this one: ${names}` 
            }))
          }
          return Effect.succeed(undefined)
        })
      )

    const getPluginStats = () =>
      pipe(
        db.queryFirst<any>(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
            COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
            COUNT(CASE WHEN status = 'error' THEN 1 END) as errors
          FROM plugins
        `),
        Effect.map((stats) => ({
          total: stats?.total || 0,
          active: stats?.active || 0,
          inactive: stats?.inactive || 0,
          errors: stats?.errors || 0,
          uninstalled: 0
        }))
      )

    const installPlugin = (pluginData: Partial<PluginData>) => {
      const id = pluginData.id || `plugin-${Date.now()}`
      const now = Math.floor(Date.now() / 1000)

      return pipe(
        db.execute(`
          INSERT INTO plugins (
            id, name, display_name, description, version, author, category, icon,
            status, is_core, settings, permissions, dependencies, download_count, 
            rating, installed_at, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          pluginData.name || id,
          pluginData.display_name || 'Unnamed Plugin',
          pluginData.description || '',
          pluginData.version || '1.0.0',
          pluginData.author || 'Unknown',
          pluginData.category || 'utilities',
          pluginData.icon || '🔌',
          'inactive',
          pluginData.is_core || false,
          JSON.stringify(pluginData.settings || {}),
          JSON.stringify(pluginData.permissions || []),
          JSON.stringify(pluginData.dependencies || []),
          pluginData.download_count || 0,
          pluginData.rating || 0,
          now,
          now
        ]),
        Effect.flatMap(() => logActivity(id, 'installed', null, { version: pluginData.version })),
        Effect.flatMap(() => getPlugin(id)),
        Effect.flatMap((plugin) => 
          plugin ? Effect.succeed(plugin) : Effect.fail(new DatabaseError({ message: 'Failed to retrieve installed plugin' }))
        )
      )
    }

    const deactivatePlugin = (pluginId: string) =>
      pipe(
        getPlugin(pluginId),
        Effect.flatMap((plugin) => {
          if (!plugin) {
            return Effect.fail(new DatabaseError({ message: 'Plugin not found' }))
          }
          return Effect.succeed(plugin)
        }),
        Effect.flatMap((plugin) => checkDependents(plugin.name)),
        Effect.flatMap(() =>
          db.execute(`
            UPDATE plugins 
            SET status = 'inactive', activated_at = NULL 
            WHERE id = ?
          `, [pluginId])
        ),
        Effect.flatMap(() => logActivity(pluginId, 'deactivated', null)),
        Effect.map(() => undefined)
      )

    const uninstallPlugin = (pluginId: string) =>
      pipe(
        getPlugin(pluginId),
        Effect.flatMap((plugin) => {
          if (!plugin) {
            return Effect.fail(new DatabaseError({ message: 'Plugin not found' }))
          }
          if (plugin.is_core) {
            return Effect.fail(new DatabaseError({ message: 'Cannot uninstall core plugins' }))
          }
          return Effect.succeed(plugin)
        }),
        Effect.flatMap((plugin) =>
          plugin.status === 'active'
            ? deactivatePlugin(pluginId).pipe(Effect.map(() => plugin))
            : Effect.succeed(plugin)
        ),
        Effect.flatMap((plugin) =>
          db.execute('DELETE FROM plugins WHERE id = ?', [pluginId])
            .pipe(Effect.map(() => plugin))
        ),
        Effect.flatMap((plugin) => logActivity(pluginId, 'uninstalled', null, { name: plugin.name })),
        Effect.map(() => undefined)
      )

    const activatePlugin = (pluginId: string) =>
      pipe(
        getPlugin(pluginId),
        Effect.flatMap((plugin) => {
          if (!plugin) {
            return Effect.fail(new DatabaseError({ message: 'Plugin not found' }))
          }
          return Effect.succeed(plugin)
        }),
        Effect.flatMap((plugin) =>
          plugin.dependencies && plugin.dependencies.length > 0
            ? checkDependencies(plugin.dependencies).pipe(Effect.map(() => plugin))
            : Effect.succeed(plugin)
        ),
        Effect.flatMap(() => {
          const now = Math.floor(Date.now() / 1000)
          return db.execute(`
            UPDATE plugins 
            SET status = 'active', activated_at = ?, error_message = NULL 
            WHERE id = ?
          `, [now, pluginId])
        }),
        Effect.flatMap(() => logActivity(pluginId, 'activated', null)),
        Effect.map(() => undefined)
      )

    const updatePluginSettings = (pluginId: string, settings: any) =>
      pipe(
        getPlugin(pluginId),
        Effect.flatMap((plugin) => {
          if (!plugin) {
            return Effect.fail(new DatabaseError({ message: 'Plugin not found' }))
          }
          return Effect.succeed(plugin)
        }),
        Effect.flatMap(() =>
          db.execute(`
            UPDATE plugins 
            SET settings = ?, updated_at = unixepoch() 
            WHERE id = ?
          `, [JSON.stringify(settings), pluginId])
        ),
        Effect.flatMap(() => logActivity(pluginId, 'settings_updated', null)),
        Effect.map(() => undefined)
      )

    const setPluginError = (pluginId: string, error: string) =>
      pipe(
        db.execute(`
          UPDATE plugins 
          SET status = 'error', error_message = ? 
          WHERE id = ?
        `, [error, pluginId]),
        Effect.flatMap(() => logActivity(pluginId, 'error', null, { error })),
        Effect.map(() => undefined)
      )

    const getPluginActivity = (pluginId: string, limit: number = 10) =>
      pipe(
        db.query<any>(`
          SELECT * FROM plugin_activity_log 
          WHERE plugin_id = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `, [pluginId, limit]),
        Effect.map((rows) => 
          rows.map((row) => ({
            id: row.id,
            action: row.action,
            userId: row.user_id,
            details: row.details ? JSON.parse(row.details) : null,
            timestamp: row.timestamp
          }))
        )
      )

    const registerHook = (
      pluginId: string,
      hookName: string,
      handlerName: string,
      priority: number = 10
    ) => {
      const id = `hook-${Date.now()}`
      return pipe(
        db.execute(`
          INSERT INTO plugin_hooks (id, plugin_id, hook_name, handler_name, priority)
          VALUES (?, ?, ?, ?, ?)
        `, [id, pluginId, hookName, handlerName, priority]),
        Effect.map(() => undefined)
      )
    }

    const registerRoute = (
      pluginId: string,
      path: string,
      method: string,
      handlerName: string,
      middleware?: any[]
    ) => {
      const id = `route-${Date.now()}`
      return pipe(
        db.execute(`
          INSERT INTO plugin_routes (id, plugin_id, path, method, handler_name, middleware)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, pluginId, path, method, handlerName, JSON.stringify(middleware || [])]),
        Effect.map(() => undefined)
      )
    }

    const getPluginHooks = (pluginId: string) =>
      pipe(
        db.query<any>(`
          SELECT * FROM plugin_hooks 
          WHERE plugin_id = ? AND is_active = TRUE
          ORDER BY priority ASC
        `, [pluginId]),
        Effect.map((rows) => rows)
      )

    const getPluginRoutes = (pluginId: string) =>
      pipe(
        db.query<any>(`
          SELECT * FROM plugin_routes 
          WHERE plugin_id = ? AND is_active = TRUE
        `, [pluginId]),
        Effect.map((rows) => rows)
      )

    return {
      getAllPlugins,
      getPlugin,
      getPluginByName,
      getPluginStats,
      installPlugin,
      uninstallPlugin,
      activatePlugin,
      deactivatePlugin,
      updatePluginSettings,
      setPluginError,
      getPluginActivity,
      registerHook,
      registerRoute,
      getPluginHooks,
      getPluginRoutes
    }
  })
)

// Helper to create a complete PluginService layer with database dependency satisfied
export const makePluginServiceLayer = (db: D1Database) => {
  const dbLayer = makeDatabaseLayer(db)
  return PluginServiceLive.pipe(
    Layer.provide(dbLayer)
  )
}