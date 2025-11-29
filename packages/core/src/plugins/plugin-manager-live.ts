/**
 * Plugin Manager Service - Live Implementation
 * 
 * Effect-based centrální orchestrátor plugin systému.
 */

import { Effect, Layer, Context } from "effect"
import { Hono } from "hono"
import type { 
  Plugin, 
  PluginConfig, 
  PluginContext, 
  PluginStatus,
  PluginLogger,
  HookHandler,
  HookSystem,
  ScopedHookSystem,
  HOOKS as HookNames
} from "../types"
import { PluginManagerService } from "./plugin-manager-effect"
import { PluginRegistryService } from "./plugin-registry-effect"
import { HookSystemService, ScopedHookSystemService } from "./hook-system-effect"
import {
  PluginError,
  PluginValidationError,
  PluginSystemInitializationError,
  PluginNotFoundError
} from "./plugin-errors"
import { HOOKS } from "../types/plugin"

/**
 * Adapter: Převádí Effect-based HookSystemService na Promise-based HookSystem
 * 
 * Tento adapter je nutný pro backward compatibility s Promise-based Plugin API.
 */
const createHookSystemAdapter = (
  effectHooks: HookSystemService
): HookSystem => ({
  register: (hookName: string, handler: HookHandler, priority?: number) => {
    Effect.runSync(effectHooks.register(hookName, handler, priority))
  },
  execute: (hookName: string, data: any, context?: any) => {
    return Effect.runPromise(effectHooks.execute(hookName, data, context))
  },
  unregister: (hookName: string, handler: HookHandler) => {
    Effect.runSync(effectHooks.unregister(hookName, handler))
  },
  getHooks: (hookName: string) => {
    return Effect.runSync(effectHooks.getHooks(hookName))
  }
})

/**
 * Adapter: Převádí Effect-based ScopedHookSystemService na Promise-based ScopedHookSystem
 */
const createScopedHookSystemAdapter = (
  effectScoped: ScopedHookSystemService
): ScopedHookSystem => ({
  register: (hookName: string, handler: HookHandler, priority?: number) => {
    Effect.runSync(effectScoped.register(hookName, handler, priority))
  },
  execute: (hookName: string, data: any, context?: any) => {
    return Effect.runPromise(effectScoped.execute(hookName, data, context))
  },
  unregister: (hookName: string, handler: HookHandler) => {
    Effect.runSync(effectScoped.unregister(hookName, handler))
  },
  unregisterAll: () => {
    Effect.runSync(effectScoped.unregisterAll())
  }
})

/**
 * Plugin Manager Service Live Implementation
 * 
 * Používá Layer.effect pattern pro dependency injection Registry a HookSystem.
 * Spravuje lifecycle pluginů, scoped hooks, routes a middleware.
 */
export const PluginManagerServiceLive = Layer.effect(
  PluginManagerService,
  Effect.gen(function* () {
    // Získat dependencies
    const registry = yield* PluginRegistryService
    const hooks = yield* HookSystemService
    
    // Internal state (closure)
    let context: PluginContext | undefined = undefined
    const scopedHooks = new Map<string, ScopedHookSystemService>()
    const pluginRoutes = new Map<string, Hono>()
    
    /**
     * Helper: Vytvoření logger instance pro plugin
     */
    const createLogger = (pluginName: string): PluginLogger => ({
      debug: (message: string, data?: any) => {
        console.debug(`[Plugin:${pluginName}] ${message}`, data || '')
      },
      info: (message: string, data?: any) => {
        console.info(`[Plugin:${pluginName}] ${message}`, data || '')
      },
      warn: (message: string, data?: any) => {
        console.warn(`[Plugin:${pluginName}] ${message}`, data || '')
      },
      error: (message: string, error?: Error, data?: any) => {
        console.error(`[Plugin:${pluginName}] ${message}`, error || '', data || '')
      }
    })
    
    /**
     * Helper: Vykonání plugin lifecycle hooku (Promise-based)
     */
    const executeLifecycleHook = (
      hookFn: ((ctx: PluginContext) => Promise<void>) | undefined,
      pluginName: string,
      pluginContext: PluginContext,
      operation: string
    ): Effect.Effect<void, PluginError> => {
      if (!hookFn) {
        return Effect.void
      }
      
      return Effect.tryPromise({
        try: () => hookFn(pluginContext),
        catch: (error) => new PluginError({
          plugin: pluginName,
          message: `${operation} lifecycle hook failed`,
          cause: error
        })
      })
    }
    
    /**
     * Helper: Registrace plugin extensions (routes, middleware, hooks)
     */
    const registerPluginExtensions = (
      plugin: Plugin,
      pluginContext: PluginContext
    ): Effect.Effect<void, PluginError> =>
      Effect.gen(function* () {
        // Registrace routes
        if (plugin.routes && plugin.routes.length > 0) {
          const pluginApp = new Hono()
          
          for (const route of plugin.routes) {
            // Validace handler - musí být Hono instance
            if (route.handler && typeof route.handler.route === 'function') {
              console.debug(`Registering plugin route: ${route.path}`)
              pluginApp.route(route.path, route.handler)
            } else {
              console.warn(`Invalid route handler for ${route.path}, skipping`)
            }
          }
          
          if (pluginApp.routes.length > 0) {
            pluginRoutes.set(plugin.name, pluginApp)
          }
        }
        
        // Registrace hooks
        if (plugin.hooks && plugin.hooks.length > 0) {
          const scopedHookSystem = scopedHooks.get(plugin.name)
          if (scopedHookSystem) {
            for (const hook of plugin.hooks) {
              console.debug(`Registering plugin hook: ${hook.name}`)
              yield* scopedHookSystem.register(hook.name, hook.handler, hook.priority)
            }
          }
        }
        
        // TODO: Registrace middleware, services, models
        // Tyto by měly být spravovány oddělenými systémy
      })
    
    /**
     * Helper: Odregistrace plugin extensions
     */
    const unregisterPluginExtensions = (
      plugin: Plugin
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        console.debug(`Unregistering extensions for plugin: ${plugin.name}`)
        
        // Odebrání routes
        pluginRoutes.delete(plugin.name)
        
        // Hooks jsou odstraněny přes scopedHooks.unregisterAll()
      })
    
    return PluginManagerService.of({
      // Expose registry a hooks pro přímý přístup
      registry,
      hooks,
      
      // Inicializace plugin systému
      initialize: (ctx) =>
        Effect.gen(function* () {
          console.info('Initializing plugin system...')
          
          context = ctx
          
          // Vykonání APP_INIT hook
          yield* Effect.tryPromise({
            try: () => hooks.execute(HOOKS.APP_INIT, {
              pluginManager: 'initialized',
              context: ctx
            }).pipe(Effect.runPromise),
            catch: (error) => new PluginSystemInitializationError({
              message: 'APP_INIT hook failed',
              cause: error
            })
          })
          
          console.info('Plugin system initialized')
        }),
      
      // Načtení pluginů z konfigurace
      loadPlugins: (configs) =>
        Effect.gen(function* () {
          console.info(`Loading ${configs.length} plugins...`)
          
          // Filtrovat pouze enabled pluginy
          const enabledConfigs = configs.filter(config => config.enabled)
          
          if (enabledConfigs.length === 0) {
            console.info('No enabled plugins to load')
            return
          }
          
          // Uložit konfigurace
          for (const config of enabledConfigs) {
            if ('name' in config) {
              yield* registry.setConfig(config.name as string, config)
            }
          }
          
          // Vyřešit load order na základě dependencies
          const loadOrderResult = yield* Effect.either(registry.resolveLoadOrder())
          
          if (loadOrderResult._tag === 'Left') {
            // Chyba při resolving dependencies - mapujeme na PluginError
            const error = loadOrderResult.left
            return yield* Effect.fail(new PluginError({
              plugin: 'system',
              message: 'Failed to resolve plugin load order',
              cause: error
            }))
          }
          
          const loadOrder = loadOrderResult.right
          console.info(`Plugin load order: ${loadOrder.join(' -> ')}`)
          
          // Aktivovat pluginy v dependency order
          for (const pluginName of loadOrder) {
            const config = yield* registry.getConfig(pluginName)
            if (config?.enabled) {
              // Aktivace může failnout - ale chceme pokračovat s ostatními
              yield* Effect.catchAll(
                registry.activate(pluginName),
                (error) => {
                  console.error(`Failed to activate plugin ${pluginName}:`, error)
                  return Effect.void
                }
              )
            }
          }
          
          console.info('Plugin loading completed')
        }),
      
      // Instalace nového pluginu
      install: (plugin, config) =>
        Effect.gen(function* () {
          console.info(`Installing plugin: ${plugin.name}`)
          
          if (!context) {
            return yield* Effect.fail(new PluginError({
              plugin: plugin.name,
              message: 'Plugin manager not initialized'
            }))
          }
          
          // 1. Registrace pluginu (již obsahuje validaci)
          // Používáme catchTags pro selektivní error handling
          yield* registry.register(plugin).pipe(
            Effect.catchTags({
              // PluginValidationError předáme dál (je v return type)
              PluginValidationError: (error) => Effect.fail(error),
              // Ostatní errors mapujeme na PluginError
              PluginDependencyError: (error) => Effect.fail(new PluginError({
                plugin: plugin.name,
                message: 'Plugin dependency error during registration',
                cause: error
              })),
              PluginAlreadyRegisteredError: (error) => Effect.fail(new PluginError({
                plugin: plugin.name,
                message: 'Plugin already registered',
                cause: error
              }))
            })
          )
          
          // 2. Nastavení konfigurace
          const pluginConfig: PluginConfig = {
            enabled: true,
            installedAt: Date.now(),
            ...config
          }
          yield* registry.setConfig(plugin.name, pluginConfig)
          
          // 3. Vytvoření scoped hook system pro plugin
          const scopedHookSystem = yield* hooks.createScope(plugin.name)
          scopedHooks.set(plugin.name, scopedHookSystem)
          
          // 4. Vytvoření plugin context s Promise-based adapter
          const pluginContext: PluginContext = {
            ...context,
            config: pluginConfig,
            hooks: createScopedHookSystemAdapter(scopedHookSystem),
            logger: createLogger(plugin.name)
          }
          
          // 5. Registrace plugin extensions
          yield* registerPluginExtensions(plugin, pluginContext)
          
          // 6. Vykonání plugin.install() lifecycle hook
          yield* executeLifecycleHook(
            plugin.install,
            plugin.name,
            pluginContext,
            'install'
          )
          
          // 7. Vykonání PLUGIN_INSTALL system hook
          yield* Effect.tryPromise({
            try: () => hooks.execute(HOOKS.PLUGIN_INSTALL, {
              plugin: plugin.name,
              version: plugin.version,
              context: pluginContext
            }).pipe(Effect.runPromise),
            catch: (error) => new PluginError({
              plugin: plugin.name,
              message: 'PLUGIN_INSTALL hook failed',
              cause: error
            })
          })
          
          console.info(`Plugin installed successfully: ${plugin.name}`)
        }),
      
      // Odinstalace pluginu
      uninstall: (name) =>
        Effect.gen(function* () {
          console.info(`Uninstalling plugin: ${name}`)
          
          const pluginOption = yield* registry.get(name)
          if (!pluginOption) {
            return yield* Effect.fail(new PluginError({
              plugin: name,
              message: 'Plugin not found'
            }))
          }
          const plugin = pluginOption
          
          if (!context) {
            return yield* Effect.fail(new PluginError({
              plugin: name,
              message: 'Plugin manager not initialized'
            }))
          }
          
          // 1. Deaktivace pluginu (pokud je aktivní)
          const status = yield* registry.getStatus(name)
          if (status?.active) {
            // Vytvoření plugin context pro deactivate lifecycle hook
            const config = (yield* registry.getConfig(name)) || { enabled: false }
            const scopedHookSystem = scopedHooks.get(name)
            const deactivateContext: PluginContext = {
              ...context,
              config,
              hooks: scopedHookSystem
                ? createScopedHookSystemAdapter(scopedHookSystem)
                : createHookSystemAdapter(hooks),
              logger: createLogger(name)
            }
            
            // Vykonání plugin.deactivate() lifecycle hook
            yield* executeLifecycleHook(
              plugin.deactivate,
              plugin.name,
              deactivateContext,
              'deactivate'
            )
            
            // Mapujeme všechny errors na PluginError
            yield* Effect.catchAll(
              registry.deactivate(name),
              (error) => Effect.fail(new PluginError({
                plugin: name,
                message: 'Failed to deactivate plugin during uninstall',
                cause: error
              }))
            )
          }
          
          // 2. Vytvoření plugin context
          const config = (yield* registry.getConfig(name)) || { enabled: false }
          const scopedHookSystem = scopedHooks.get(name)
          const pluginContext: PluginContext = {
            ...context,
            config,
            hooks: scopedHookSystem 
              ? createScopedHookSystemAdapter(scopedHookSystem)
              : createHookSystemAdapter(hooks),
            logger: createLogger(name)
          }
          
          // 3. Vykonání plugin.uninstall() lifecycle hook
          yield* executeLifecycleHook(
            plugin.uninstall,
            plugin.name,
            pluginContext,
            'uninstall'
          )
          
          // 4. Odregistrace extensions
          yield* unregisterPluginExtensions(plugin)
          
          // 5. Vyčištění scoped hooks
          if (scopedHookSystem) {
            yield* scopedHookSystem.unregisterAll()
          }
          scopedHooks.delete(name)
          
          // 6. Vykonání PLUGIN_UNINSTALL system hook
          yield* Effect.tryPromise({
            try: () => hooks.execute(HOOKS.PLUGIN_UNINSTALL, {
              plugin: name,
              context: pluginContext
            }).pipe(Effect.runPromise),
            catch: (error) => new PluginError({
              plugin: name,
              message: 'PLUGIN_UNINSTALL hook failed',
              cause: error
            })
          })
          
          // 7. Odregistrace z registry
          yield* Effect.catchAll(
            registry.unregister(name),
            (error) => Effect.fail(new PluginError({
              plugin: name,
              message: 'Failed to unregister plugin',
              cause: error
            }))
          )
          
          console.info(`Plugin uninstalled successfully: ${name}`)
        }),
      
      // Aktivace pluginu
      activate: (name) =>
        Effect.gen(function* () {
          console.info(`Activating plugin: ${name}`)
          
          const pluginOption = yield* registry.get(name)
          if (!pluginOption) {
            return yield* Effect.fail(new PluginError({
              plugin: name,
              message: 'Plugin not found'
            }))
          }
          const plugin = pluginOption
          
          if (!context) {
            return yield* Effect.fail(new PluginError({
              plugin: name,
              message: 'Plugin manager not initialized'
            }))
          }
          
          // 1. Aktivace v registry (obsahuje dependency handling)
          yield* Effect.catchAll(
            registry.activate(name),
            (error) => Effect.fail(new PluginError({
              plugin: name,
              message: 'Failed to activate plugin',
              cause: error
            }))
          )
          
          // 2. Vytvoření plugin context
          const config = (yield* registry.getConfig(name)) || { enabled: true }
          const scopedHookSystem = scopedHooks.get(name)
          const pluginContext: PluginContext = {
            ...context,
            config,
            hooks: scopedHookSystem
              ? createScopedHookSystemAdapter(scopedHookSystem)
              : createHookSystemAdapter(hooks),
            logger: createLogger(name)
          }
          
          // 3. Vykonání plugin.activate() lifecycle hook
          yield* executeLifecycleHook(
            plugin.activate,
            plugin.name,
            pluginContext,
            'activate'
          )
          
          // 4. Vykonání PLUGIN_ACTIVATE system hook
          yield* Effect.tryPromise({
            try: () => hooks.execute(HOOKS.PLUGIN_ACTIVATE, {
              plugin: name,
              context: pluginContext
            }).pipe(Effect.runPromise),
            catch: (error) => new PluginError({
              plugin: name,
              message: 'PLUGIN_ACTIVATE hook failed',
              cause: error
            })
          })
          
          console.info(`Plugin activated: ${name}`)
        }),
      
      // Deaktivace pluginu
      deactivate: (name) =>
        Effect.gen(function* () {
          console.info(`Deactivating plugin: ${name}`)
          
          const pluginOption = yield* registry.get(name)
          if (!pluginOption) {
            return yield* Effect.fail(new PluginError({
              plugin: name,
              message: 'Plugin not found'
            }))
          }
          const plugin = pluginOption
          
          if (!context) {
            return yield* Effect.fail(new PluginError({
              plugin: name,
              message: 'Plugin manager not initialized'
            }))
          }
          
          // 1. Vytvoření plugin context
          const config = (yield* registry.getConfig(name)) || { enabled: false }
          const scopedHookSystem = scopedHooks.get(name)
          const pluginContext: PluginContext = {
            ...context,
            config,
            hooks: scopedHookSystem
              ? createScopedHookSystemAdapter(scopedHookSystem)
              : createHookSystemAdapter(hooks),
            logger: createLogger(name)
          }
          
          // 2. Vykonání plugin.deactivate() lifecycle hook
          yield* executeLifecycleHook(
            plugin.deactivate,
            plugin.name,
            pluginContext,
            'deactivate'
          )
          
          // 3. Deaktivace v registry (obsahuje dependent handling)
          yield* Effect.catchAll(
            registry.deactivate(name),
            (error) => Effect.fail(new PluginError({
              plugin: name,
              message: 'Failed to deactivate plugin',
              cause: error
            }))
          )
          
          // 4. Vykonání PLUGIN_DEACTIVATE system hook
          yield* Effect.tryPromise({
            try: () => hooks.execute(HOOKS.PLUGIN_DEACTIVATE, {
              plugin: name,
              context: pluginContext
            }).pipe(Effect.runPromise),
            catch: (error) => new PluginError({
              plugin: name,
              message: 'PLUGIN_DEACTIVATE hook failed',
              cause: error
            })
          })
          
          console.info(`Plugin deactivated: ${name}`)
        }),
      
      // Získání statusu pluginu (nikdy nefailuje)
      getStatus: (name) =>
        Effect.gen(function* () {
          const status = yield* registry.getStatus(name)
          if (!status) {
            return {
              name,
              version: 'unknown',
              active: false,
              installed: false,
              hasErrors: false
            }
          }
          return status
        }),
      
      // Získání statusů všech pluginů
      getAllStatuses: () =>
        Effect.gen(function* () {
          const statusMap = yield* registry.getAllStatuses()
          return Array.from(statusMap.values())
        }),
      
      // Získání plugin routes pro mounting
      getPluginRoutes: () =>
        Effect.sync(() => new Map(pluginRoutes)),
      
      // Získání plugin middleware
      getPluginMiddleware: () =>
        Effect.gen(function* () {
          const middleware: Array<{
            name: string
            handler: any
            priority: number
            global: boolean
          }> = []
          
          const activePlugins = yield* registry.getActive()
          
          for (const plugin of activePlugins) {
            if (plugin.middleware) {
              for (const mw of plugin.middleware) {
                middleware.push({
                  name: `${plugin.name}:${mw.name}`,
                  handler: mw.handler,
                  priority: mw.priority || 10,
                  global: mw.global || false
                })
              }
            }
          }
          
          // Seřadit podle priority (nižší = dřívější)
          return middleware.sort((a, b) => a.priority - b.priority)
        }),
      
      // Získání statistik plugin systému
      getStats: () =>
        Effect.gen(function* () {
          const registryStats = yield* registry.getStats()
          const hookStats = yield* hooks.getStats()
          
          // Spočítat middleware z aktivních pluginů
          const activePlugins = yield* registry.getActive()
          let middlewareCount = 0
          for (const plugin of activePlugins) {
            if (plugin.middleware) {
              middlewareCount += plugin.middleware.length
            }
          }
          
          return {
            registry: registryStats,
            hooks: hookStats,
            routes: pluginRoutes.size,
            middleware: middlewareCount
          }
        }),
      
      // Shutdown plugin systému
      shutdown: () =>
        Effect.gen(function* () {
          console.info('Shutting down plugin system...')
          
          // 1. Vykonání APP_SHUTDOWN hook
          yield* Effect.tryPromise({
            try: () => hooks.execute(HOOKS.APP_SHUTDOWN, {
              pluginManager: 'shutting_down'
            }).pipe(Effect.runPromise),
            catch: (error) => new PluginError({
              plugin: 'system',
              message: 'APP_SHUTDOWN hook failed',
              cause: error
            })
          })
          
          // 2. Deaktivace všech aktivních pluginů v reverse order
          const activePlugins = yield* registry.getActive()
          const reversed = [...activePlugins].reverse()
          
          for (const plugin of reversed) {
            // Vytvoření plugin context
            const config = (yield* registry.getConfig(plugin.name)) || { enabled: false }
            const scopedHookSystem = scopedHooks.get(plugin.name)
            const pluginContext: PluginContext = {
              ...context!,
              config,
              hooks: scopedHookSystem
                ? createScopedHookSystemAdapter(scopedHookSystem)
                : createHookSystemAdapter(hooks),
              logger: createLogger(plugin.name)
            }
            
            // Vykonání plugin.deactivate() lifecycle hook
            yield* Effect.catchAll(
              executeLifecycleHook(
                plugin.deactivate,
                plugin.name,
                pluginContext,
                'deactivate'
              ),
              (error) => {
                console.error(`Error in deactivate hook for ${plugin.name}:`, error)
                return Effect.void
              }
            )
            
            // Deaktivace v registry
            yield* Effect.catchAll(
              registry.deactivate(plugin.name),
              (error) => {
                console.error(`Error deactivating plugin ${plugin.name}:`, error)
                return Effect.void
              }
            )
          }
          
          console.info('Plugin system shutdown completed')
        })
    })
  })
)