/**
 * Hook System Service - Live Implementation
 * 
 * Effect-based implementace hook systému pro event-driven extensibilitu.
 */

import { Effect, Layer } from "effect"
import type { HookHandler, PluginHook, HookContext } from "../types"
import { HookSystemService, ScopedHookSystemService } from "./hook-system-effect"
import { HookExecutionError } from "./plugin-errors"

/**
 * Hook System Service Live Implementation
 * 
 * Používá closure state pro Maps (hooks, executing).
 * Poskytuje type-safe API pro registraci a vykonávání hooks.
 */
export const HookSystemServiceLive = Layer.succeed(
  HookSystemService,
  (() => {
    // Internal state (closure)
    const hooks = new Map<string, PluginHook[]>()
    const executing = new Set<string>()
    
    // Definovat implementaci nejdřív, aby na ni createScope mohl odkazovat
    const implementation = {
      register: (hookName: string, handler: HookHandler, priority = 10) =>
        Effect.sync(() => {
          if (!hooks.has(hookName)) {
            hooks.set(hookName, [])
          }
          
          const hookList = hooks.get(hookName)!
          const hook: PluginHook = {
            name: hookName,
            handler,
            priority,
          }
          
          // Insert hook v priority pořadí (nižší priorita = dřívější vykonání)
          const insertIndex = hookList.findIndex(h => (h.priority ?? 10) > priority)
          if (insertIndex === -1) {
            hookList.push(hook)
          } else {
            hookList.splice(insertIndex, 0, hook)
          }
          
          console.debug(`Hook registered: ${hookName} (priority: ${priority})`)
        }),
      
      unregister: (hookName: string, handler: HookHandler) =>
        Effect.sync(() => {
          const hookList = hooks.get(hookName)
          if (!hookList) return
          
          const index = hookList.findIndex(h => h.handler === handler)
          if (index !== -1) {
            hookList.splice(index, 1)
            console.debug(`Hook unregistered: ${hookName}`)
          }
          
          // Vyčistit prázdné hook arrays
          if (hookList.length === 0) {
            hooks.delete(hookName)
          }
        }),
      
      getHooks: (hookName: string) =>
        Effect.sync(() => hooks.get(hookName) || []),
      
      getHookNames: () =>
        Effect.sync(() => Array.from(hooks.keys())),
      
      clear: () =>
        Effect.sync(() => {
          hooks.clear()
          executing.clear()
        }),
      
      execute: (hookName: string, data: any, context?: any) =>
        Effect.gen(function* () {
          const hookList = hooks.get(hookName)
          if (!hookList || hookList.length === 0) {
            return data
          }
          
          // Prevence nekonečné rekurze
          if (executing.has(hookName)) {
            console.warn(`Hook recursion detected for: ${hookName}`)
            return data
          }
          
          executing.add(hookName)
          
          try {
            let result = data
            let cancelled = false
            
            const hookContext: HookContext = {
              plugin: '', // Bude nastaveno plugin managerem
              context: context || {},
              cancel: () => { cancelled = true }
            }
            
            // Procházet všechny hooks v pořadí priority
            for (const hook of hookList) {
              if (cancelled) {
                console.debug(`Hook execution cancelled: ${hookName}`)
                break
              }
              
              try {
                console.debug(`Executing hook: ${hookName} (priority: ${hook.priority})`)
                
                // Hook handler je Promise-based, musíme použít Effect.tryPromise
                result = yield* Effect.tryPromise({
                  try: () => hook.handler(result, hookContext),
                  catch: (error) => new HookExecutionError({
                    hookName,
                    plugin: hookContext.plugin || 'unknown',
                    cause: error
                  })
                })
              } catch (error) {
                console.error(`Hook execution failed: ${hookName}`, error)
                
                // Pokračovat s dalšími hooks pokud to není kritická chyba
                if (error instanceof Error && error.message.includes('CRITICAL')) {
                  return yield* Effect.fail(new HookExecutionError({
                    hookName,
                    plugin: hookContext.plugin || 'unknown',
                    cause: error
                  }))
                }
                // Jinak pokračujeme s dalším hookem
              }
            }
            
            return result
          } finally {
            executing.delete(hookName)
          }
        }),
      
      createScope: (pluginName: string) =>
        Effect.sync(() => createScopedHookSystem(pluginName, implementation)),
      
      getStats: () =>
        Effect.sync(() => {
          return Array.from(hooks.entries()).map(([hookName, handlers]) => ({
            hookName,
            handlerCount: handlers.length
          }))
        })
    }
    
    return HookSystemService.of(implementation)
  })()
)

/**
 * Create Scoped Hook System
 * 
 * Helper funkce pro vytvoření scoped hook systému.
 */
function createScopedHookSystem(
  pluginName: string,
  parent: {
    readonly register: (hookName: string, handler: HookHandler, priority?: number) => Effect.Effect<void>
    readonly unregister: (hookName: string, handler: HookHandler) => Effect.Effect<void>
    readonly execute: (hookName: string, data: any, context?: any) => Effect.Effect<any, HookExecutionError>
  }
): ScopedHookSystemService {
  // Tracking registrovaných hooks pro tento scope
  const registeredHooks: { hookName: string; handler: HookHandler }[] = []
  
  return {
    register: (hookName, handler, priority) =>
      Effect.gen(function* () {
        yield* parent.register(hookName, handler, priority)
        registeredHooks.push({ hookName, handler })
      }),
    
    execute: (hookName, data, context) =>
      parent.execute(hookName, data, context),
    
    unregister: (hookName, handler) =>
      Effect.gen(function* () {
        yield* parent.unregister(hookName, handler)
        const index = registeredHooks.findIndex(
          h => h.hookName === hookName && h.handler === handler
        )
        if (index !== -1) {
          registeredHooks.splice(index, 1)
        }
      }),
    
    unregisterAll: () =>
      Effect.gen(function* () {
        for (const { hookName, handler } of registeredHooks) {
          yield* parent.unregister(hookName, handler)
        }
        registeredHooks.length = 0
      }),
    
    getRegisteredHooks: () =>
      Effect.sync(() => [...registeredHooks])
  }
}