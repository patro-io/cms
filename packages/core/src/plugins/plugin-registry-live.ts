/**
 * Plugin Registry Service - Live Implementation
 * 
 * Effect-based implementace plugin registry s type-safe error handling.
 */

import { Effect, Layer } from "effect"
import type { Plugin, PluginConfig, PluginStatus } from "../types"
import { PluginRegistryService } from "./plugin-registry-effect"
import { PluginValidator } from "./plugin-validator"
import {
  PluginNotFoundError,
  PluginValidationError,
  PluginDependencyError,
  PluginCircularDependencyError,
  PluginAlreadyRegisteredError
} from "./plugin-errors"

/**
 * Plugin Registry Service Live Implementation
 * 
 * Používá closure state pro Maps (plugins, configs, statuses).
 * Všechny operace jsou Effect-based pro composability a type safety.
 */
export const PluginRegistryServiceLive = Layer.succeed(
  PluginRegistryService,
  (() => {
    // Internal state (closure)
    const plugins = new Map<string, Plugin>()
    const configs = new Map<string, PluginConfig>()
    const statuses = new Map<string, PluginStatus>()
    const validator = new PluginValidator()
    
    /**
     * Helper: Získat pluginy závislé na daném pluginu
     */
    const getDependents = (name: string): string[] => {
      const dependents: string[] = []
      for (const [pluginName, plugin] of plugins) {
        if (plugin.dependencies?.includes(name)) {
          dependents.push(pluginName)
        }
      }
      return dependents
    }
    
    /**
     * Helper: Aktualizovat status pluginu
     */
    const updateStatus = (name: string, updates: Partial<PluginStatus>): void => {
      const current = statuses.get(name)
      if (current) {
        statuses.set(name, { ...current, ...updates })
      }
    }
    
    return PluginRegistryService.of({
      // Query operations (never fail)
      get: (name) =>
        Effect.sync(() => plugins.get(name)),
      
      getAll: () =>
        Effect.sync(() => Array.from(plugins.values())),
      
      getActive: () =>
        Effect.sync(() => {
          return Array.from(plugins.values()).filter(plugin => {
            const status = statuses.get(plugin.name)
            return status?.active === true
          })
        }),
      
      has: (name) =>
        Effect.sync(() => plugins.has(name)),
      
      getConfig: (name) =>
        Effect.sync(() => configs.get(name)),
      
      getStatus: (name) =>
        Effect.sync(() => statuses.get(name)),
      
      getAllStatuses: () =>
        Effect.sync(() => new Map(statuses)),
      
      // Mutation operations (can fail)
      register: (plugin) =>
        Effect.gen(function* () {
          console.info(`Registering plugin: ${plugin.name} v${plugin.version}`)
          
          // 1. Validace pluginu
          const validation = validator.validate(plugin)
          if (!validation.valid) {
            return yield* Effect.fail(
              new PluginValidationError({
                plugin: plugin.name,
                errors: validation.errors,
                warnings: validation.warnings
              })
            )
          }
          
          // 2. Kontrola konfliktů
          if (plugins.has(plugin.name)) {
            const existingPlugin = plugins.get(plugin.name)!
            if (existingPlugin.version !== plugin.version) {
              console.warn(
                `Plugin ${plugin.name} is already registered with version ${existingPlugin.version}, replacing with ${plugin.version}`
              )
              // V budoucnu by to mohlo být PluginAlreadyRegisteredError
              // Pro teď jen logujeme warning a pokračujeme
            }
          }
          
          // 3. Validace dependencies
          const depValidation = validator.validateDependencies(plugin, {
            get: (name: string) => plugins.get(name),
            has: (name: string) => plugins.has(name),
            getAll: () => Array.from(plugins.values()),
            // Ostatní metody registry nejsou potřeba pro validaci
          } as any)
          
          if (!depValidation.valid) {
            // Extrahovat názvy chybějících dependencies z error messages
            const missingDeps = (plugin.dependencies || []).filter(dep => !plugins.has(dep))
            return yield* Effect.fail(
              new PluginDependencyError({
                plugin: plugin.name,
                missingDependencies: missingDeps
              })
            )
          }
          
          // 4. Registrace pluginu
          plugins.set(plugin.name, plugin)
          
          // 5. Inicializace statusu
          statuses.set(plugin.name, {
            name: plugin.name,
            version: plugin.version,
            active: false,
            installed: true,
            hasErrors: false,
            errors: []
          })
          
          console.info(`Plugin registered successfully: ${plugin.name}`)
        }),
      
      unregister: (name) =>
        Effect.gen(function* () {
          console.info(`Unregistering plugin: ${name}`)
          
          // 1. Kontrola existence
          if (!plugins.has(name)) {
            return yield* Effect.fail(new PluginNotFoundError({ plugin: name }))
          }
          
          // 2. Kontrola dependents
          const dependents = getDependents(name)
          if (dependents.length > 0) {
            return yield* Effect.fail(
              new PluginDependencyError({
                plugin: name,
                missingDependencies: dependents
              })
            )
          }
          
          // 3. Odebrání pluginu
          plugins.delete(name)
          configs.delete(name)
          statuses.delete(name)
          
          console.info(`Plugin unregistered: ${name}`)
        }),
      
      activate: (name) =>
        Effect.gen(function* () {
          console.info(`Activating plugin: ${name}`)
          
          // 1. Kontrola existence
          const plugin = plugins.get(name)
          if (!plugin) {
            return yield* Effect.fail(new PluginNotFoundError({ plugin: name }))
          }
          
          // 2. Kontrola statusu
          const status = statuses.get(name)
          if (status?.active) {
            console.warn(`Plugin ${name} is already active`)
            return
          }
          
          // 3. Aktivace dependencies rekurzivně
          if (plugin.dependencies) {
            for (const depName of plugin.dependencies) {
              const depStatus = statuses.get(depName)
              if (!depStatus) {
                return yield* Effect.fail(
                  new PluginDependencyError({
                    plugin: name,
                    missingDependencies: [depName]
                  })
                )
              }
              
              // Rekurzivní aktivace dependency
              if (!depStatus.active) {
                yield* Effect.sync(() => {
                  // Využíváme vlastní activate metodu rekurzivně
                  // Ale musíme být opatrní s async/sync boundary
                })
                // TODO: Toto potřebuje lepší řešení pro rekurzivní Effect volání
                // Pro teď logujeme a pokračujeme
                console.debug(`Would activate dependency: ${depName}`)
              }
            }
          }
          
          // 4. Aktualizace statusu
          updateStatus(name, {
            active: true,
            hasErrors: false,
            errors: []
          })
          
          console.info(`Plugin activated: ${name}`)
        }),
      
      deactivate: (name) =>
        Effect.gen(function* () {
          console.info(`Deactivating plugin: ${name}`)
          
          // 1. Kontrola existence
          const plugin = plugins.get(name)
          if (!plugin) {
            return yield* Effect.fail(new PluginNotFoundError({ plugin: name }))
          }
          
          // 2. Kontrola statusu
          const status = statuses.get(name)
          if (!status?.active) {
            console.warn(`Plugin ${name} is not active`)
            return
          }
          
          // 3. Deaktivace dependents
          const dependents = getDependents(name)
          for (const depName of dependents) {
            const depStatus = statuses.get(depName)
            if (depStatus?.active) {
              // Rekurzivní deaktivace
              console.debug(`Would deactivate dependent: ${depName}`)
              // TODO: Implementovat rekurzivní deaktivaci
            }
          }
          
          // 4. Aktualizace statusu
          updateStatus(name, {
            active: false,
            hasErrors: false,
            errors: []
          })
          
          console.info(`Plugin deactivated: ${name}`)
        }),
      
      setConfig: (name, config) =>
        Effect.sync(() => {
          configs.set(name, {
            ...config,
            updatedAt: Date.now()
          })
        }),
      
      resolveLoadOrder: () =>
        Effect.gen(function* () {
          const graph = new Map<string, string[]>()
          
          // Sestavit dependency graph
          for (const [name, plugin] of plugins) {
            graph.set(name, plugin.dependencies || [])
          }
          
          const visited = new Set<string>()
          const visiting = new Set<string>()
          const result: string[] = []
          
          // Topological sort s detekcí cyklů
          const visit = (name: string, path: string[]): void => {
            if (visited.has(name)) return
            
            if (visiting.has(name)) {
              // Cirkulární závislost detekována
              throw new PluginCircularDependencyError({
                plugins: [...path, name]
              })
            }
            
            visiting.add(name)
            
            const dependencies = graph.get(name) || []
            for (const dep of dependencies) {
              if (!graph.has(dep)) {
                throw new PluginDependencyError({
                  plugin: name,
                  missingDependencies: [dep]
                })
              }
              visit(dep, [...path, name])
            }
            
            visiting.delete(name)
            visited.add(name)
            result.push(name)
          }
          
          // Projít všechny pluginy
          try {
            for (const name of graph.keys()) {
              visit(name, [])
            }
            return result
          } catch (error) {
            if (error instanceof PluginCircularDependencyError) {
              return yield* Effect.fail(error)
            }
            if (error instanceof PluginDependencyError) {
              return yield* Effect.fail(error)
            }
            throw error
          }
        }),
      
      getDependencyGraph: () =>
        Effect.sync(() => {
          const graph = new Map<string, string[]>()
          for (const [name, plugin] of plugins) {
            graph.set(name, plugin.dependencies || [])
          }
          return graph
        }),
      
      exportConfig: () =>
        Effect.sync(() => {
          const pluginConfigs: PluginConfig[] = []
          for (const [name, config] of configs) {
            pluginConfigs.push({
              ...config,
              name
            } as PluginConfig & { name: string })
          }
          return { plugins: pluginConfigs }
        }),
      
      importConfig: (config) =>
        Effect.sync(() => {
          for (const pluginConfig of config.plugins) {
            if ('name' in pluginConfig) {
              const { name, ...rest } = pluginConfig as PluginConfig & { name: string }
              configs.set(name, rest)
            }
          }
        }),
      
      getStats: () =>
        Effect.sync(() => {
          const statusArray = Array.from(statuses.values())
          return {
            total: statusArray.length,
            active: statusArray.filter(s => s.active).length,
            inactive: statusArray.filter(s => !s.active).length,
            withErrors: statusArray.filter(s => s.hasErrors).length
          }
        }),
      
      clear: () =>
        Effect.sync(() => {
          plugins.clear()
          configs.clear()
          statuses.clear()
        })
    })
  })()
)