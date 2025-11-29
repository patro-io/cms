/**
 * Effect-based Plugin Registry Service
 * 
 * Poskytuje type-safe, composable API pro správu plugin registrace
 * pomocí Effect TS patterns.
 */

import { Effect, Context, Layer } from "effect"
import type { Plugin, PluginConfig, PluginStatus } from "../types"
import type {
  PluginNotFoundError,
  PluginValidationError,
  PluginDependencyError,
  PluginCircularDependencyError,
  PluginAlreadyRegisteredError
} from "./plugin-errors"

/**
 * Plugin Registry Service Interface
 * 
 * Tento service používá Closed Service Pattern - nevyžaduje DatabaseService
 * ani jiné závislosti v type signatures. Všechny dependencies jsou poskytnuty
 * přes Layer composition.
 */
export interface PluginRegistryService {
  /**
   * Získat plugin podle jména
   * Tato operace nikdy nefailuje - vrací Option-like Effect<T | undefined>
   */
  readonly get: (name: string) => Effect.Effect<Plugin | undefined>
  
  /**
   * Získat všechny registrované pluginy
   */
  readonly getAll: () => Effect.Effect<Plugin[]>
  
  /**
   * Získat pouze aktivní pluginy
   */
  readonly getActive: () => Effect.Effect<Plugin[]>
  
  /**
   * Zkontrolovat, zda je plugin registrován
   */
  readonly has: (name: string) => Effect.Effect<boolean>
  
  /**
   * Získat konfiguraci pluginu
   */
  readonly getConfig: (name: string) => Effect.Effect<PluginConfig | undefined>
  
  /**
   * Získat status pluginu
   */
  readonly getStatus: (name: string) => Effect.Effect<PluginStatus | undefined>
  
  /**
   * Získat všechny plugin statusy
   */
  readonly getAllStatuses: () => Effect.Effect<Map<string, PluginStatus>>
  
  /**
   * Registrovat nový plugin
   * 
   * @throws PluginValidationError pokud plugin neprošel validací
   * @throws PluginDependencyError pokud chybí dependencies
   * @throws PluginAlreadyRegisteredError pokud plugin již existuje s jinou verzí
   */
  readonly register: (
    plugin: Plugin
  ) => Effect.Effect<void, PluginValidationError | PluginDependencyError | PluginAlreadyRegisteredError>
  
  /**
   * Odregistrovat plugin
   * 
   * @throws PluginNotFoundError pokud plugin neexistuje
   * @throws PluginDependencyError pokud na pluginu závisí jiné pluginy
   */
  readonly unregister: (
    name: string
  ) => Effect.Effect<void, PluginNotFoundError | PluginDependencyError>
  
  /**
   * Aktivovat plugin (včetně všech dependencies)
   * 
   * @throws PluginNotFoundError pokud plugin neexistuje
   * @throws PluginDependencyError pokud dependencies nejsou dostupné
   */
  readonly activate: (
    name: string
  ) => Effect.Effect<void, PluginNotFoundError | PluginDependencyError>
  
  /**
   * Deaktivovat plugin (včetně všech dependents)
   * 
   * @throws PluginNotFoundError pokud plugin neexistuje
   */
  readonly deactivate: (
    name: string
  ) => Effect.Effect<void, PluginNotFoundError>
  
  /**
   * Nastavit konfiguraci pluginu
   */
  readonly setConfig: (
    name: string,
    config: PluginConfig
  ) => Effect.Effect<void>
  
  /**
   * Vyřešit pořadí načítání pluginů na základě závislostí
   * 
   * @throws PluginCircularDependencyError pokud existuje cirkulární závislost
   * @throws PluginDependencyError pokud chybí požadovaný plugin
   */
  readonly resolveLoadOrder: () => Effect.Effect<string[], PluginCircularDependencyError | PluginDependencyError>
  
  /**
   * Získat dependency graph všech pluginů
   */
  readonly getDependencyGraph: () => Effect.Effect<Map<string, string[]>>
  
  /**
   * Exportovat konfiguraci všech pluginů
   */
  readonly exportConfig: () => Effect.Effect<{ plugins: PluginConfig[] }>
  
  /**
   * Importovat konfiguraci pluginů
   */
  readonly importConfig: (config: { plugins: PluginConfig[] }) => Effect.Effect<void>
  
  /**
   * Získat statistiky registry
   */
  readonly getStats: () => Effect.Effect<{
    total: number
    active: number
    inactive: number
    withErrors: number
  }>
  
  /**
   * Vymazat všechny pluginy (pro testování)
   */
  readonly clear: () => Effect.Effect<void>
}

/**
 * Service Tag pro dependency injection
 */
export const PluginRegistryService = Context.GenericTag<PluginRegistryService>(
  "@services/PluginRegistryService"
)