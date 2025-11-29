/**
 * Types Module Exports
 *
 * TypeScript type definitions for PatroCMS
 */

// Collection Configuration Types
export type {
  CollectionConfig,
  CollectionConfigModule,
  CollectionSchema,
  CollectionSyncResult,
  FieldConfig,
  FieldType,
} from "./collection-config";

// Plugin System Types
export type {
  AuthService,
  ContentService,
  HookContext,
  HookHandler,
  HookName,
  HookSystem,
  MediaService,
  ModelRelationship,
  Plugin,
  PluginAdminPage,
  PluginBuilderOptions,
  PluginComponent,
  PluginConfig,
  PluginContext,
  PluginHook,
  PluginLogger,
  PluginManager,
  PluginMenuItem,
  PluginMiddleware,
  PluginModel,
  PluginRegistry,
  PluginRoutes,
  PluginService,
  PluginStatus,
  PluginValidationResult,
  PluginValidator,
  ScopedHookSystem,
} from "./plugin";

export { HOOKS } from "./plugin";

// Plugin Manifest Types
export type { PluginManifest } from "./plugin-manifest";

// Re-export global types that are defined in global.d.ts
// Note: These are ambient declarations and don't need to be re-exported
// They are available globally once the file is included in the TypeScript project
