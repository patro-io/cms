/**
 * @@patro-io/cms - Main Entry Point
 *
 * Core framework for PatroCMS headless CMS
 * Built for Cloudflare's edge platform with TypeScript
 *
 * Phase 2 Migration Status:
 * - Week 1: Types, Utils, Database (COMPLETED ✓)
 * - Week 2: Services, Middleware, Plugins (COMPLETED ✓)
 * - Week 3: Routes, Templates (COMPLETED ✓)
 * - Week 4: Integration & Testing (COMPLETED ✓)
 *
 * Test Coverage:
 * - Utilities: 48 tests (sanitize, query-filter, metrics)
 * - Middleware: 51 tests (auth, logging, security, performance)
 * - Total: 99 tests passing
 */

// ============================================================================
// Main Application API (Phase 2 Week 1)
// ============================================================================

export { createPatroCMSApp, setupCoreMiddleware, setupCoreRoutes } from './app'
export type { Bindings, PatroCMSApp, PatroCMSConfig, Variables } from './app'
export { CollectionLoaderService, makeCollectionLoaderServiceLayer } from './services'

// ============================================================================
// Placeholders - To be populated in Phase 2
// ============================================================================

// Services - Week 2 (COMPLETED)
export {
  debug, error,
  fatal, info,
  // Logging (Effect-based)
  LoggerService,
  makeLoggerServiceLayer,
  // Database Migrations
  MigrationService, PluginBootstrapService,
  // Plugin Services - Class implementations
  PluginService as PluginServiceClass, warn
} from './services'

export type { CorePlugin, LogCategory, LogEntry, LogFilter, LogLevel, Migration, MigrationStatus } from './services'

// Middleware - Week 2 (COMPLETED)
export {
  // Authentication
  AuthManager,
  // Bootstrap
  bootstrapMiddleware,
  // Performance
  cacheHeaders,
  compressionMiddleware, detailedLoggingMiddleware, getActivePlugins,
  isPluginActive, logActivity,
  // Logging
  loggingMiddleware, optionalAuth, performanceLoggingMiddleware,
  // Permissions
  PermissionManager,
  // Plugin middleware
  requireActivePlugin,
  requireActivePlugins, requireAnyPermission, requireAuth, requirePermission, requireRole, securityHeaders, securityLoggingMiddleware
} from './middleware'

export type { Permission, UserPermissions } from './middleware'

// Plugins - Week 2 (COMPLETED)
export {
  // Hook System - Class implementations
  HookSystemImpl, HookUtils,
  // Plugin Manager - Class implementation
  PluginManager as PluginManagerClass,
  // Plugin Registry
  PluginRegistryImpl,
  // Plugin Validator - Class implementation
  PluginValidator as PluginValidatorClass, ScopedHookSystem as ScopedHookSystemClass
} from './plugins'

// Routes - Week 3 (COMPLETED)
export {
  adminApiRoutes, adminCheckboxRoutes, adminCodeExamplesRoutes, adminCollectionsRoutes, adminContentRoutes, adminDashboardRoutes, adminDesignRoutes, adminLogsRoutes, adminMediaRoutes, adminPluginRoutes, adminSettingsRoutes, adminTestimonialsRoutes, adminUsersRoutes, apiContentCrudRoutes,
  apiMediaRoutes, apiRoutes, apiSystemRoutes, authRoutes, ROUTES_INFO
} from './routes'

// Templates - Week 3 (COMPLETED)
export {
  getConfirmationDialogScript,
  // Alert templates
  renderAlert,
  // Confirmation dialog templates
  renderConfirmationDialog,
  // Filter bar templates
  renderFilterBar,
  // Form templates
  renderForm,
  renderFormField,
  // Pagination templates
  renderPagination,
  // Table templates
  renderTable
} from './templates'

export type {
  AlertData,
  ConfirmationDialogOptions, Filter, FilterBarData, FilterOption, FormData, FormField, PaginationData, TableColumn,
  TableData
} from './templates'

// Types - Week 1 (COMPLETED)
export type {
  AuthService, CollectionConfig,
  CollectionConfigModule, CollectionSchema, CollectionSyncResult, ContentService, FieldConfig,
  // Collection types
  FieldType, HookContext, HookHandler, HookName, HookSystem, MediaService,
  // Plugin types
  Plugin, PluginAdminPage, PluginBuilderOptions, PluginComponent, PluginConfig, PluginContext, PluginHook, PluginLogger, PluginManager,
  // Plugin manifest
  PluginManifest, PluginMenuItem, PluginMiddleware,
  PluginModel, PluginRegistry, PluginRoutes, PluginService, PluginStatus, PluginValidationResult, PluginValidator, ScopedHookSystem
} from './types'

export { HOOKS } from './types'

// Utils - Week 1 (COMPLETED) - Effect-based API
export {
  // Query filtering (Effect-based)
  buildQueryEffect, buildQueryFromFilter, clearCache, clearMetrics,
  // Sanitization (Effect-based)
  escapeHtml, getAverageRPS, getCoreVersion, getRequestsPerSecond,
  getTotalRequests, makeMetricsServiceLayer, makeTemplateRendererServiceLayer,
  // Metrics (Effect-based)
  MetricsService,
  MetricsServiceLive, parseFromQueryEffect, recordRequest, render,
  // Template rendering (Effect-based)
  renderTemplateStandalone, sanitizeInput,
  sanitizeObject,
  // Version
  PATROCMS_VERSION, TemplateRendererService,
  TemplateRendererServiceLive
} from './utils'

export type {
  FilterCondition,
  FilterGroup, FilterOperator, QueryFilter,
  QueryResult
} from './utils'

// Database - Week 1 (COMPLETED)
export {
  apiTokens, collections,
  content,
  contentVersions, createDb, logConfig, media, pluginActivityLog, pluginAssets, pluginHooks,
  pluginRoutes, plugins, systemLogs,
  // Schema exports
  users, workflowHistory
} from './db'

export type {
  Collection, Content, Plugin as DbPlugin, PluginHook as DbPluginHook, LogConfig, Media, NewCollection, NewContent, NewLogConfig, NewMedia, NewPlugin, NewPluginActivityLog, NewPluginAsset, NewPluginHook, NewPluginRoute, NewSystemLog, NewUser, NewWorkflowHistory, PluginActivityLog, PluginAsset, PluginRoute, SystemLog, User, WorkflowHistory
} from './db'

// Plugins - Week 2
// export { PluginBuilder, HookSystem } from './plugins/sdk'

// ============================================================================
// Version
// ============================================================================

// Import version from package.json
import packageJson from '../package.json'
export const VERSION = packageJson.version

// ============================================================================
// Phase 2 Migration Notes
// ============================================================================

/**
 * This is a work-in-progress package being extracted from the main PatroCMS codebase.
 *
 * Current Phase: 2 (Core Module Migration)
 * Current Week: 1 (Types, Utils, Database)
 *
 * Expected completion: 4 weeks from 2025-01-17
 *
 * DO NOT USE IN PRODUCTION - Alpha release for development only
 */
