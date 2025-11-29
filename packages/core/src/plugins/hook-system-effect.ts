/**
 * Effect-based Hook System Service
 * 
 * Poskytuje type-safe, composable API pro event-driven extensibilitu
 * pomocí Effect TS patterns.
 */

import { Effect, Context, Layer } from "effect"
import type { HookHandler, PluginHook } from "../types"
import type { HookExecutionError } from "./plugin-errors"

/**
 * Hook System Service Interface
 * 
 * Tento service používá Closed Service Pattern - nevyžaduje dependencies
 * v type signatures. Hook system je stavový, ale bezpečný díky Effect patterns.
 */
export interface HookSystemService {
  /**
   * Zaregistrovat hook handler
   * Synchronní operace - nikdy nefailuje
   */
  readonly register: (
    hookName: string,
    handler: HookHandler,
    priority?: number
  ) => Effect.Effect<void>
  
  /**
   * Odregistrovat hook handler
   * Synchronní operace - nikdy nefailuje
   */
  readonly unregister: (
    hookName: string,
    handler: HookHandler
  ) => Effect.Effect<void>
  
  /**
   * Získat všechny hooks pro daný název
   */
  readonly getHooks: (
    hookName: string
  ) => Effect.Effect<PluginHook[]>
  
  /**
   * Získat všechny registrované hook názvy
   */
  readonly getHookNames: () => Effect.Effect<string[]>
  
  /**
   * Vymazat všechny hooks (pro testování)
   */
  readonly clear: () => Effect.Effect<void>
  
  /**
   * Vykonat všechny handlers pro hook
   * 
   * @param hookName Název hooku
   * @param data Data předaná do hook handlers
   * @param context Kontext pro hook execution
   * @returns Modifikovaná data po průchodu všemi handlers
   * @throws HookExecutionError pokud některý handler failuje kriticky
   */
  readonly execute: (
    hookName: string,
    data: any,
    context?: any
  ) => Effect.Effect<any, HookExecutionError>
  
  /**
   * Vytvořit scoped hook system pro plugin
   * 
   * Scoped system umožňuje pluginům registrovat hooks, které jsou
   * automaticky odregistrovány při uninstall pluginu.
   */
  readonly createScope: (
    pluginName: string
  ) => Effect.Effect<ScopedHookSystemService>
  
  /**
   * Získat statistiky hook systému
   */
  readonly getStats: () => Effect.Effect<Array<{
    hookName: string
    handlerCount: number
  }>>
}

/**
 * Scoped Hook System Interface
 * 
 * Poskytuje izolované hook operace pro jednotlivé pluginy.
 * Všechny hooks registrované přes scoped system lze hromadně
 * odregistrovat voláním unregisterAll().
 */
export interface ScopedHookSystemService {
  /**
   * Zaregistrovat hook v rámci tohoto scope
   */
  readonly register: (
    hookName: string,
    handler: HookHandler,
    priority?: number
  ) => Effect.Effect<void>
  
  /**
   * Vykonat hook (používá globální hook system)
   */
  readonly execute: (
    hookName: string,
    data: any,
    context?: any
  ) => Effect.Effect<any, HookExecutionError>
  
  /**
   * Odregistrovat specifický hook z tohoto scope
   */
  readonly unregister: (
    hookName: string,
    handler: HookHandler
  ) => Effect.Effect<void>
  
  /**
   * Odregistrovat všechny hooks z tohoto scope
   * Používáno při uninstall pluginu
   */
  readonly unregisterAll: () => Effect.Effect<void>
  
  /**
   * Získat seznam hooks registrovaných tímto scope
   */
  readonly getRegisteredHooks: () => Effect.Effect<Array<{
    hookName: string
    handler: HookHandler
  }>>
}

/**
 * Service Tag pro dependency injection
 */
export const HookSystemService = Context.GenericTag<HookSystemService>(
  "@services/HookSystemService"
)

/**
 * Hook Utilities
 * 
 * Helper funkce pro práci s hooks (pure functions, nejsou Effect-based)
 */
export const HookUtils = {
  /**
   * Vytvořit hook název s namespace
   */
  createHookName: (namespace: string, event: string): string => {
    return `${namespace}:${event}`
  },
  
  /**
   * Parsovat hook název na namespace a event
   */
  parseHookName: (hookName: string): { namespace: string; event: string } => {
    const parts = hookName.split(':')
    return {
      namespace: parts[0] || '',
      event: parts.slice(1).join(':') || ''
    }
  }
} as const