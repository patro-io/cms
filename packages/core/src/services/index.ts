/**
 * Services Module Exports
 *
 * Core business logic services for PatroCMS
 */

import { Layer } from 'effect'
import { UserServiceLive } from './user-effect'
import { CollectionServiceLive } from './collection-effect'
import { ContentServiceLive } from './content-effect'
import { SettingsServiceLive } from './settings'
import { makeDatabaseLayer } from './database-effect'
import { PluginSystemLayer } from '../plugins'

/**
 * Central Application Layer - Closed Service Pattern
 *
 * Combines all core services (DatabaseService-dependent) with their dependencies resolved.
 * This is the recommended way to provide services to route handlers.
 *
 * Provides:
 * - DatabaseService (for direct database access)
 * - UserService
 * - CollectionService
 * - ContentService
 * - SettingsService
 * - PluginRegistryService (from PluginSystemLayer)
 * - HookSystemService (from PluginSystemLayer)
 * - PluginManagerService (from PluginSystemLayer)
 *
 * Note: AuthService is NOT included because it requires configuration parameters
 * (jwtSecret, passwordSalt) and doesn't depend on DatabaseService.
 * Use makeAuthServiceLayer() separately when AuthService is needed.
 *
 * Usage:
 * ```typescript
 * const result = await Effect.runPromise(
 *   myEffect.pipe(
 *     Effect.provide(makeAppLayer(db))
 *   )
 * )
 * ```
 */
export const makeAppLayer = (db: D1Database) =>
  Layer.mergeAll(
    UserServiceLive,
    CollectionServiceLive,
    ContentServiceLive,
    SettingsServiceLive,
    PluginSystemLayer
  ).pipe(
    Layer.provideMerge(makeDatabaseLayer(db)) // ✅ Provides DatabaseService AND adds it to output
  )

// Auth Service (Effect-based)
export {
  AuthService,
  AuthServiceLive,
  makeAuthServiceLayer,
  AuthError,
  TokenExpiredError,
  TokenInvalidError,
  PasswordMismatchError
} from "./auth-effect";
export type { JWTPayload } from "./auth-effect";

// Collection Loader Service (Effect-based)
export {
  CollectionLoaderService,
  makeCollectionLoaderService,
  makeCollectionLoaderServiceLayer,
  CollectionLoaderError,
  CollectionValidationError
} from "./collection-loader";
export type { ValidationResult } from "./collection-loader";

// Collection Sync Service (Effect-based)
export {
  CollectionSyncService,
  makeCollectionSyncService,
  makeCollectionSyncServiceLayer,
  CollectionSyncError
} from "./collection-sync";

// Collection Service (Effect-based)
export {
  CollectionService,
  CollectionServiceLive,
  CollectionNotFoundError,
  CollectionAlreadyExistsError,
  FieldNotFoundError,
  FieldAlreadyExistsError
} from "./collection-effect";
export type {
  Collection,
  CollectionField,
  CreateCollectionInput,
  UpdateCollectionInput,
  CreateFieldInput,
  UpdateFieldInput
} from "./collection-effect";

// Content Service (Effect-based)
export {
  ContentService,
  ContentServiceLive,
  ContentNotFoundError,
  ContentAlreadyExistsError,
  InvalidContentDataError
} from "./content-effect";
export type {
  Content,
  CreateContentInput,
  UpdateContentInput,
  ContentQueryOptions
} from "./content-effect";

// User Service (Effect-based)
export {
  UserService,
  UserServiceLive,
  UserNotFoundError,
  UserAlreadyExistsError,
  UserValidationError,
  UnauthorizedError
} from "./user-effect";
export type {
  User,
  CreateUserInput as CreateUserInputEffect,
  UpdateUserInput as UpdateUserInputEffect,
  UserQueryOptions
} from "./user-effect";

// Database Migrations (Effect-based)
export {
  MigrationService,
  makeMigrationService,
  makeMigrationServiceLayer
} from "./migrations";
export type { Migration, MigrationStatus } from "./migrations";

// Logging (Effect-based)
export {
  debug, error,
  fatal, info, LoggerService,
  makeLoggerServiceLayer, warn
} from "./logger";
export type { LogCategory, LogEntry, LogFilter, LogLevel, LogResult } from "./logger";

// Plugin Services (Legacy - DB-based plugin tracking)
export { PluginBootstrapService } from "./plugin-bootstrap";
export type { CorePlugin } from "./plugin-bootstrap";
export { PluginService } from "./plugin-service";
export type { PluginData, PluginStats } from "./plugin-service";

// Plugin System (Effect-based - NEW)
export {
  // Services
  PluginRegistryService,
  HookSystemService,
  PluginManagerService,
  // Layers
  PluginRegistryServiceLive,
  HookSystemServiceLive,
  PluginManagerServiceLive,
  PluginSystemLayer,
  // Error Types
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
  // Utilities
  PluginValidator,
  HookUtils
} from "../plugins";
export type {
  PluginSystemError,
  ScopedHookSystemService
} from "../plugins";

// Cache Service (Effect-based)
export {
  CACHE_CONFIGS,
  CacheService, CacheServiceLive, clear, deleteKey, generateKey,
  get, getOrSet, getWithSource, invalidate, makeCacheServiceLayer, set
} from "./cache";
export type { CacheConfig, CacheEntry, CacheHitResult } from "./cache";

// Settings Service (Effect-based)
export {
  SettingsService,
  SettingsServiceLive,
  SettingsError
} from "./settings";
export type { GeneralSettings, Setting, AppearanceSettings } from "./settings";

// Media Service (Effect-based)
export {
  MediaService,
  MediaServiceLive,
  makeMediaServiceLayer
} from "./media-effect";
export type {
  MediaFile,
  UploadResult,
  ImageDimensions,
  MediaError,
  FileNotFoundError,
  FileValidationError,
  StorageError,
  PermissionError,
  R2ObjectBody
} from "./media-effect";

// Database Service (Effect-based)
export {
  DatabaseService,
  makeDatabaseService,
  makeDatabaseLayer,
  DatabaseError,
  ValidationError,
  NotFoundError
} from "./database-effect";
export type {
  D1QueryResult,
  D1RunResult
} from "./database-effect";

// I18n Service (Effect-based)
export {
  I18nService,
  makeI18nService,
  makeI18nLayer,
  detectLocale,
  isValidLocale,
  getAvailableLocales,
  getLocaleDisplayName,
  TranslationError
} from "./i18n";
export type {
  Locale,
  TranslateFn,
  Translations
} from "./i18n";

