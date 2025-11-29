/**
 * Effect-based Error Types pro Plugin System
 * 
 * Tyto error types poskytují type-safe error handling pro všechny
 * plugin operace pomocí Effect's Data.TaggedError.
 */

import { Data } from "effect"

/**
 * Obecná chyba plugin systému
 */
export class PluginError extends Data.TaggedError("PluginError")<{
  readonly plugin: string
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Plugin nebyl nalezen v registru
 */
export class PluginNotFoundError extends Data.TaggedError("PluginNotFoundError")<{
  readonly plugin: string
}> {
  override get message() {
    return `Plugin "${this.plugin}" not found`
  }
}

/**
 * Plugin neprošel validací
 */
export class PluginValidationError extends Data.TaggedError("PluginValidationError")<{
  readonly plugin: string
  readonly errors: string[]
  readonly warnings: string[]
}> {
  override get message() {
    const errorList = this.errors.join(", ")
    return `Plugin "${this.plugin}" validation failed: ${errorList}`
  }
}

/**
 * Chybějící závislosti pluginu
 */
export class PluginDependencyError extends Data.TaggedError("PluginDependencyError")<{
  readonly plugin: string
  readonly missingDependencies: string[]
}> {
  override get message() {
    const deps = this.missingDependencies.join(", ")
    return `Plugin "${this.plugin}" has missing dependencies: ${deps}`
  }
}

/**
 * Cirkulární závislost mezi pluginy
 */
export class PluginCircularDependencyError extends Data.TaggedError("PluginCircularDependencyError")<{
  readonly plugins: string[]
}> {
  override get message() {
    const cycle = this.plugins.join(" -> ")
    return `Circular dependency detected: ${cycle}`
  }
}

/**
 * Chyba při vykonávání hooku
 */
export class HookExecutionError extends Data.TaggedError("HookExecutionError")<{
  readonly hookName: string
  readonly plugin: string
  readonly cause: unknown
}> {
  override get message() {
    return `Hook "${this.hookName}" failed in plugin "${this.plugin}"`
  }
}

/**
 * Plugin je již registrován
 */
export class PluginAlreadyRegisteredError extends Data.TaggedError("PluginAlreadyRegisteredError")<{
  readonly plugin: string
}> {
  override get message() {
    return `Plugin "${this.plugin}" is already registered`
  }
}

/**
 * Plugin je v nesprávném stavu pro požadovanou operaci
 */
export class PluginInvalidStateError extends Data.TaggedError("PluginInvalidStateError")<{
  readonly plugin: string
  readonly currentState: string
  readonly expectedState: string
  readonly operation: string
}> {
  override get message() {
    return `Plugin "${this.plugin}" cannot perform "${this.operation}" - current state: ${this.currentState}, expected: ${this.expectedState}`
  }
}

/**
 * Konflikt názvů routes, middleware nebo jiných extensionů
 */
export class PluginConflictError extends Data.TaggedError("PluginConflictError")<{
  readonly plugin: string
  readonly conflictType: "route" | "middleware" | "hook" | "command"
  readonly conflictingItem: string
  readonly existingPlugin?: string
}> {
  override get message() {
    const existing = this.existingPlugin
      ? ` (already registered by "${this.existingPlugin}")`
      : ""
    return `Plugin "${this.plugin}" ${this.conflictType} conflict: "${this.conflictingItem}"${existing}`
  }
}

/**
 * Chyba při inicializaci plugin systému
 */
export class PluginSystemInitializationError extends Data.TaggedError("PluginSystemInitializationError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Timeout při vykonávání plugin operace
 */
export class PluginTimeoutError extends Data.TaggedError("PluginTimeoutError")<{
  readonly plugin: string
  readonly operation: string
  readonly timeoutMs: number
}> {
  override get message() {
    return `Plugin "${this.plugin}" ${this.operation} operation timed out after ${this.timeoutMs}ms`
  }
}

/**
 * Union type všech plugin error typů pro pattern matching
 */
export type PluginSystemError =
  | PluginError
  | PluginNotFoundError
  | PluginValidationError
  | PluginDependencyError
  | PluginCircularDependencyError
  | HookExecutionError
  | PluginAlreadyRegisteredError
  | PluginInvalidStateError
  | PluginConflictError
  | PluginSystemInitializationError
  | PluginTimeoutError