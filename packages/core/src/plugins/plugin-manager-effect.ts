/**
 * Effect-based Plugin Manager Service
 * 
 * Centrální orchestrátor plugin systému s type-safe Effect API.
 */

import { Effect, Context } from "effect"
import type { Hono } from "hono"
import type { Plugin, PluginConfig, PluginContext, PluginStatus } from "../types"
import type { PluginError, PluginValidationError, PluginSystemInitializationError } from "./plugin-errors"
import type { PluginRegistryService } from "./plugin-registry-effect"
import type { HookSystemService } from "./hook-system-effect"

/**
 * Plugin Manager Service Interface
 * 
 * Poskytuje vysokoúrovňové API pro správu celého plugin systému.
 * Používá Closed Service Pattern - dependencies jsou poskytnuty přes Layer.
 */
export interface PluginManagerService {
  /**
   * Přístup k plugin registry (pro query operace)
   */
  readonly registry: PluginRegistryService
  
  /**
   * Přístup k hook system (pro registraci hooks)
   */
  readonly hooks: HookSystemService
  
  /**
   * Inicializovat plugin systém s context
   * 
   * Musí být voláno před použitím ostatních operací.
   * Vykoná APP_INIT hook.
   * 
   * @throws PluginSystemInitializationError pokud inicializace failuje
   */
  readonly initialize: (
    context: PluginContext
  ) => Effect.Effect<void, PluginSystemInitializationError>
  
  /**
   * Načíst pluginy z konfigurace
   * 
   * - Filtruje pouze enabled pluginy
   * - Řeší dependency order
   * - Aktivuje pluginy ve správném pořadí
   * 
   * @param configs Array plugin konfigurací
   * @throws PluginError pokud načítání failuje
   */
  readonly loadPlugins: (
    configs: PluginConfig[]
  ) => Effect.Effect<void, PluginError>
  
  /**
   * Instalovat nový plugin
   * 
   * Kroky:
   * 1. Validace pluginu
   * 2. Registrace do registry
   * 3. Nastavení konfigurace
   * 4. Vytvoření scoped hooks
   * 5. Registrace extensions (routes, middleware, hooks)
   * 6. Vykonání plugin.install() lifecycle hooku
   * 7. Vykonání PLUGIN_INSTALL system hooku
   * 
   * @param plugin Plugin instance k instalaci
   * @param config Volitelná konfigurace
   * @throws PluginValidationError pokud validace failuje
   * @throws PluginError pokud instalace failuje
   */
  readonly install: (
    plugin: Plugin,
    config?: PluginConfig
  ) => Effect.Effect<void, PluginError | PluginValidationError>
  
  /**
   * Odinstalovat plugin
   * 
   * Kroky:
   * 1. Deaktivace pluginu (pokud je aktivní)
   * 2. Vykonání plugin.uninstall() lifecycle hooku
   * 3. Odregistrace extensions
   * 4. Vyčištění scoped hooks
   * 5. Odebrání plugin routes
   * 6. Vykonání PLUGIN_UNINSTALL system hooku
   * 7. Odregistrace z registry
   * 
   * @param name Název pluginu
   * @throws PluginError pokud odinstalace failuje
   */
  readonly uninstall: (
    name: string
  ) => Effect.Effect<void, PluginError>
  
  /**
   * Aktivovat plugin
   * 
   * Deleguje na registry.activate, ale také:
   * - Vykoná plugin.activate() lifecycle hook
   * - Vykoná PLUGIN_ACTIVATE system hook
   * 
   * @param name Název pluginu
   * @throws PluginError pokud aktivace failuje
   */
  readonly activate: (
    name: string
  ) => Effect.Effect<void, PluginError>
  
  /**
   * Deaktivovat plugin
   * 
   * Deleguje na registry.deactivate, ale také:
   * - Vykoná plugin.deactivate() lifecycle hook
   * - Vykoná PLUGIN_DEACTIVATE system hook
   * 
   * @param name Název pluginu
   * @throws PluginError pokud deaktivace failuje
   */
  readonly deactivate: (
    name: string
  ) => Effect.Effect<void, PluginError>
  
  /**
   * Získat status pluginu
   * 
   * Nikdy nefailuje - vrací default status pokud plugin neexistuje.
   */
  readonly getStatus: (
    name: string
  ) => Effect.Effect<PluginStatus>
  
  /**
   * Získat statusy všech pluginů
   */
  readonly getAllStatuses: () => Effect.Effect<PluginStatus[]>
  
  /**
   * Získat plugin routes pro mounting v hlavní aplikaci
   * 
   * Vrací Map kde klíč je plugin name a hodnota je Hono instance.
   */
  readonly getPluginRoutes: () => Effect.Effect<Map<string, Hono>>
  
  /**
   * Získat plugin middleware pro hlavní aplikaci
   * 
   * Middleware je seřazeno podle priority.
   */
  readonly getPluginMiddleware: () => Effect.Effect<Array<{
    name: string
    handler: any
    priority: number
    global: boolean
  }>>
  
  /**
   * Získat statistiky plugin systému
   */
  readonly getStats: () => Effect.Effect<{
    registry: {
      total: number
      active: number
      inactive: number
      withErrors: number
    }
    hooks: Array<{
      hookName: string
      handlerCount: number
    }>
    routes: number
    middleware: number
  }>
  
  /**
   * Vypnout plugin systém
   * 
   * - Vykoná APP_SHUTDOWN hook
   * - Deaktivuje všechny aktivní pluginy v reverse order
   * 
   * @throws PluginError pokud shutdown failuje
   */
  readonly shutdown: () => Effect.Effect<void, PluginError>
}

/**
 * Service Tag pro dependency injection
 */
export const PluginManagerService = Context.GenericTag<PluginManagerService>(
  "@services/PluginManagerService"
)