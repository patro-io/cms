/**
 * Plugins Module Exports
 *
 * Plugin system a SDK pro PatroCMS - Effect-based implementation
 */

// ============================================================================
// Effect-based Plugin System (NEW - Production Ready)
// ============================================================================

// Error Types
export {
  PluginError,
  PluginNotFoundError,
  PluginValidationError,
  PluginDependencyError,
  PluginCircularDependencyError,
  HookExecutionError,
  PluginAlreadyRegisteredError,
  PluginInvalidStateError,
  PluginConflictError,
  PluginSystemInitializationError,
  PluginTimeoutError,
  type PluginSystemError
} from './plugin-errors'

// Service Interfaces (Tags)
export { PluginRegistryService } from './plugin-registry-effect'
export { HookSystemService, type ScopedHookSystemService, HookUtils } from './hook-system-effect'
export { PluginManagerService } from './plugin-manager-effect'

// Live Implementations (Layers)
export { PluginRegistryServiceLive } from './plugin-registry-live'
export { HookSystemServiceLive } from './hook-system-live'
export { PluginManagerServiceLive } from './plugin-manager-live'

// Plugin Validator (shared utility)
export { PluginValidator } from './plugin-validator'

// ============================================================================
// Composed Plugin System Layer
// ============================================================================

import { Layer } from 'effect'
import { PluginRegistryServiceLive } from './plugin-registry-live'
import { HookSystemServiceLive } from './hook-system-live'
import { PluginManagerServiceLive } from './plugin-manager-live'

/**
 * Kompletní Plugin System Layer
 * 
 * Poskytuje všechny služby plugin systému:
 * - PluginRegistryService
 * - HookSystemService  
 * - PluginManagerService
 * 
 * @example
 * ```ts
 * import { PluginSystemLayer } from '@patrocms/core/plugins'
 * import { Effect, Layer } from 'effect'
 * 
 * const AppLayer = Layer.mergeAll(
 *   PluginSystemLayer,
 *   // ... ostatní layers
 * )
 * 
 * const program = Effect.gen(function* () {
 *   const pluginManager = yield* PluginManagerService
 *   yield* pluginManager.initialize(context)
 * })
 * 
 * Effect.runPromise(program.pipe(Effect.provide(AppLayer)))
 * ```
 */
export const PluginSystemLayer = Layer.mergeAll(
  PluginRegistryServiceLive,
  HookSystemServiceLive,
  PluginManagerServiceLive.pipe(
    Layer.provide(Layer.merge(PluginRegistryServiceLive, HookSystemServiceLive))
  )
)

// ============================================================================
// Legacy Exports (DEPRECATED - pouze pro backward compatibility)
// ============================================================================

/**
 * @deprecated Použij Effect-based HookSystemService a HookSystemServiceLive místo toho.
 * Tento export bude odstraněn v příští major verzi.
 */
export { HookSystemImpl } from './hook-system'

/**
 * @deprecated Použij Effect-based ScopedHookSystemService místo toho.
 * Tento export bude odstraněn v příští major verzi.
 */
export { ScopedHookSystem } from './hook-system'

/**
 * @deprecated Použij Effect-based PluginRegistryService a PluginRegistryServiceLive místo toho.
 * Tento export bude odstraněn v příští major verzi.
 */
export { PluginRegistryImpl } from './plugin-registry'

/**
 * @deprecated Použij Effect-based PluginManagerService a PluginManagerServiceLive místo toho.
 * Tento export bude odstraněn v příští major verzi.
 */
export { PluginManager } from './plugin-manager'
