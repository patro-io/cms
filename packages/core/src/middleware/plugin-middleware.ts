/**
 * Plugin Middleware (Pure Effect)
 *
 * Provides middleware functions for checking plugin status and enforcing plugin requirements
 */

import { Effect, pipe } from 'effect'
import { PluginService, makePluginServiceLayer } from '../services/plugin-service'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Check if a plugin is active
 * @param db - The D1 database instance
 * @param pluginId - The plugin ID to check
 * @returns Promise<boolean> - True if the plugin is active, false otherwise
 */
export async function isPluginActive(db: D1Database, pluginId: string): Promise<boolean> {
  const layer = makePluginServiceLayer(db)
  
  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService
    const plugin = yield* pluginService.getPlugin(pluginId)
    return plugin?.status === 'active'
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(layer),
      Effect.catchAll((error) => {
        console.error(`[isPluginActive] Error checking plugin status for ${pluginId}:`, error)
        return Effect.succeed(false)
      })
    )
  )
}

/**
 * Middleware to require a plugin to be active
 * Throws an error if the plugin is not active
 * @param db - The D1 database instance
 * @param pluginId - The plugin ID to check
 * @throws Error if plugin is not active
 */
export async function requireActivePlugin(db: D1Database, pluginId: string): Promise<void> {
  const isActive = await isPluginActive(db, pluginId)
  if (!isActive) {
    throw new Error(`Plugin '${pluginId}' is required but is not active`)
  }
}

/**
 * Middleware to require multiple plugins to be active
 * Throws an error if any plugin is not active
 * @param db - The D1 database instance
 * @param pluginIds - Array of plugin IDs to check
 * @throws Error if any plugin is not active
 */
export async function requireActivePlugins(db: D1Database, pluginIds: string[]): Promise<void> {
  for (const pluginId of pluginIds) {
    await requireActivePlugin(db, pluginId)
  }
}

/**
 * Get all active plugins
 * @param db - The D1 database instance
 * @returns Promise<any[]> - Array of active plugin records
 */
export async function getActivePlugins(db: D1Database): Promise<any[]> {
  const layer = makePluginServiceLayer(db)
  
  const program = Effect.gen(function* (_) {
    const pluginService = yield* PluginService
    const stats = yield* pluginService.getPluginStats() // Or getAllPlugins and filter
    // Since getPluginStats only returns counts, we should use getAllPlugins
    const plugins = yield* pluginService.getAllPlugins()
    return plugins.filter(p => p.status === 'active')
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(layer),
      Effect.catchAll((error) => {
        console.error('[getActivePlugins] Error fetching active plugins:', error)
        return Effect.succeed([])
      })
    )
  )
}
