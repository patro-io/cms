/**
 * Logger Service for PatroCMS
 * Provides structured logging with database persistence
 * 
 * Effect-TS Version with type-safe error handling and dependency injection
 */

import type { D1Database } from '@cloudflare/workers-types'
import { and, asc, count, desc, eq, gte, inArray, like, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Context, Data, Effect, Layer, Option, Ref } from "effect"
import { logConfig, systemLogs, type LogConfig, type NewSystemLog } from '../db/schema'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type LogCategory = 'auth' | 'api' | 'workflow' | 'plugin' | 'media' | 'system' | 'security' | 'error'

export interface LogEntry {
  level: LogLevel
  category: LogCategory
  message: string
  data?: any
  userId?: string
  sessionId?: string
  requestId?: string
  ipAddress?: string
  userAgent?: string
  method?: string
  url?: string
  statusCode?: number
  duration?: number
  stackTrace?: string
  tags?: string[]
  source?: string
}

export interface LogFilter {
  level?: LogLevel[]
  category?: LogCategory[]
  userId?: string
  source?: string
  search?: string
  startDate?: Date
  endDate?: Date
  tags?: string[]
  limit?: number
  offset?: number
  sortBy?: 'created_at' | 'level' | 'category'
  sortOrder?: 'asc' | 'desc'
}

export interface LogResult {
  logs: any[]
  total: number
}

// ============================================================================
// Effect-TS Error Types
// ============================================================================

export class LoggerError extends Data.TaggedError("LoggerError")<{
  message: string
  cause?: unknown
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  message: string
  operation: string
  cause?: unknown
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  message: string
  category: LogCategory
}> {}

// ============================================================================
// Effect-TS Service Definition
// ============================================================================

interface LoggerState {
  enabled: boolean
  configCache: Map<string, LogConfig>
  lastConfigRefresh: number
}

export interface LoggerServiceOps {
  debug: (category: LogCategory, message: string, data?: any, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  info: (category: LogCategory, message: string, data?: any, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  warn: (category: LogCategory, message: string, data?: any, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  error: (category: LogCategory, message: string, error?: Error | any, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  fatal: (category: LogCategory, message: string, error?: Error | any, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  logRequest: (method: string, url: string, statusCode: number, duration: number, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  logAuth: (action: string, userId?: string, success?: boolean, context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  logSecurity: (event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: Partial<LogEntry>) => Effect.Effect<void, LoggerError>
  getLogs: (filter?: LogFilter) => Effect.Effect<LogResult, DatabaseError>
  updateConfig: (category: LogCategory, updates: Partial<LogConfig>) => Effect.Effect<void, DatabaseError>
  getAllConfigs: () => Effect.Effect<LogConfig[], DatabaseError>
  cleanupByRetention: () => Effect.Effect<void, DatabaseError>
  setEnabled: (enabled: boolean) => Effect.Effect<void, never>
  isEnabled: () => Effect.Effect<boolean, never>
}

export class LoggerService extends Context.Tag("LoggerService")<
  LoggerService,
  LoggerServiceOps
>() {}

// ============================================================================
// Internal Helper Functions
// ============================================================================

const CONFIG_REFRESH_INTERVAL = 60000 // 1 minute

/**
 * Check if a log level should be recorded based on configuration
 */
function shouldLog(level: LogLevel, configLevel: string): boolean {
  const levels = ['debug', 'info', 'warn', 'error', 'fatal']
  const levelIndex = levels.indexOf(level)
  const configLevelIndex = levels.indexOf(configLevel)
  
  return levelIndex >= configLevelIndex
}

/**
 * Get log configuration from cache or database
 */
const getConfigEffect = (
  db: ReturnType<typeof drizzle>,
  stateRef: Ref.Ref<LoggerState>,
  category: LogCategory
): Effect.Effect<Option.Option<LogConfig>, ConfigError> =>
  Effect.gen(function* (_) {
    try {
      const state = yield* Ref.get(stateRef)
      const now = Date.now()

      // Check cache first
      if (state.configCache.has(category) && (now - state.lastConfigRefresh) < CONFIG_REFRESH_INTERVAL) {
        return Option.some(state.configCache.get(category)!)
      }

      // Refresh from database
      const configs = yield* 
        Effect.tryPromise({
          try: () => db.select().from(logConfig).where(eq(logConfig.category, category)),
          catch: (error) => new ConfigError({
            message: `Failed to fetch config for category: ${category}`,
            category
          })
        })
      

      const config = configs[0]
      
      if (config) {
        yield* Ref.update(stateRef, state => ({
          ...state,
          configCache: new Map(state.configCache).set(category, config),
          lastConfigRefresh: now
        }))
        return Option.some(config)
      }

      return Option.none()
    } catch (error) {
      return yield* Effect.fail(new ConfigError({
        message: `Error getting config: ${error}`,
        category
      }))
    }
  })

/**
 * Core logging implementation
 */
const logEffect = (
  db: ReturnType<typeof drizzle>,
  stateRef: Ref.Ref<LoggerState>,
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: any,
  context?: Partial<LogEntry>
): Effect.Effect<void, LoggerError> =>
  Effect.gen(function* (_) {
    const state = yield* Ref.get(stateRef)
    
    if (!state.enabled) {
      return
    }

    // Get config and check if logging is enabled
    const configOption = yield* 
      Effect.catchAll(
        getConfigEffect(db, stateRef, category),
        () => Effect.succeed(Option.none())
      )
    

    if (Option.isNone(configOption)) {
      return
    }

    const config = configOption.value
    if (!config.enabled || !shouldLog(level, config.level)) {
      return
    }

    // Create log entry
    const logEntry: NewSystemLog = {
      id: crypto.randomUUID(),
      level,
      category,
      message,
      data: data ? JSON.stringify(data) : null,
      userId: context?.userId || null,
      sessionId: context?.sessionId || null,
      requestId: context?.requestId || null,
      ipAddress: context?.ipAddress || null,
      userAgent: context?.userAgent || null,
      method: context?.method || null,
      url: context?.url || null,
      statusCode: context?.statusCode || null,
      duration: context?.duration || null,
      stackTrace: context?.stackTrace || null,
      tags: context?.tags ? JSON.stringify(context.tags) : null,
      source: context?.source || null,
      createdAt: new Date()
    }

    // Insert log entry
    yield* 
      Effect.tryPromise({
        try: () => db.insert(systemLogs).values(logEntry),
        catch: (error) => new LoggerError({
          message: `Failed to insert log entry: ${error}`,
          cause: error
        })
      })
    

    // Cleanup if needed
    if (config.maxSize) {
      yield* 
        Effect.catchAll(
          cleanupCategoryEffect(db, category, config.maxSize),
          () => Effect.succeed(undefined)
        )
      
    }
  })

/**
 * Clean up old logs for a category
 */
const cleanupCategoryEffect = (
  db: ReturnType<typeof drizzle>,
  category: LogCategory,
  maxSize: number
): Effect.Effect<void, DatabaseError> =>
  Effect.gen(function* (_) {
    // Count current logs
    const countResult = yield* 
      Effect.tryPromise({
        try: () => db
          .select({ count: count() })
          .from(systemLogs)
          .where(eq(systemLogs.category, category)),
        catch: (error) => new DatabaseError({
          message: 'Failed to count logs',
          operation: 'count',
          cause: error
        })
      })
    

    const currentCount = countResult[0]?.count || 0

    if (currentCount > maxSize) {
      // Get cutoff date
      const cutoffLogs = yield* 
        Effect.tryPromise({
          try: () => db
            .select({ createdAt: systemLogs.createdAt })
            .from(systemLogs)
            .where(eq(systemLogs.category, category))
            .orderBy(desc(systemLogs.createdAt))
            .limit(1)
            .offset(maxSize - 1),
          catch: (error) => new DatabaseError({
            message: 'Failed to get cutoff date',
            operation: 'select',
            cause: error
          })
        })
      

      const cutoffLog = cutoffLogs[0]
      if (cutoffLog) {
        yield* 
          Effect.tryPromise({
            try: () => db
              .delete(systemLogs)
              .where(
                and(
                  eq(systemLogs.category, category),
                  lte(systemLogs.createdAt, cutoffLog.createdAt)
                )
              ),
            catch: (error) => new DatabaseError({
              message: 'Failed to delete old logs',
              operation: 'delete',
              cause: error
            })
          })
        
      }
    }
  })

// ============================================================================
// Effect-TS Service Implementation
// ============================================================================

/**
 * Create Logger service layer
 */
export const makeLoggerServiceLayer = (
  database: D1Database
): Layer.Layer<LoggerService> =>
  Layer.effect(
    LoggerService,
    Effect.gen(function* (_) {
      const db = drizzle(database)
      const stateRef = yield* Ref.make<LoggerState>({
        enabled: true,
        configCache: new Map(),
        lastConfigRefresh: 0
      })

      return {
        debug: (category, message, data?, context?) =>
          logEffect(db, stateRef, 'debug', category, message, data, context),

        info: (category, message, data?, context?) =>
          logEffect(db, stateRef, 'info', category, message, data, context),

        warn: (category, message, data?, context?) =>
          logEffect(db, stateRef, 'warn', category, message, data, context),

        error: (category, message, error?, context?) => {
          const errorData = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error

          return logEffect(db, stateRef, 'error', category, message, errorData, {
            ...context,
            stackTrace: error instanceof Error ? error.stack : undefined
          })
        },

        fatal: (category, message, error?, context?) => {
          const errorData = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error

          return logEffect(db, stateRef, 'fatal', category, message, errorData, {
            ...context,
            stackTrace: error instanceof Error ? error.stack : undefined
          })
        },

        logRequest: (method, url, statusCode, duration, context?) => {
          const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
          
          return logEffect(db, stateRef, level, 'api', `${method} ${url} - ${statusCode}`, {
            method,
            url,
            statusCode,
            duration
          }, {
            ...context,
            method,
            url,
            statusCode,
            duration
          })
        },

        logAuth: (action, userId?, success = true, context?) => {
          const level: LogLevel = success ? 'info' : 'warn'
          
          return logEffect(db, stateRef, level, 'auth', `Authentication ${action}: ${success ? 'success' : 'failed'}`, {
            action,
            success,
            userId
          }, {
            ...context,
            userId,
            tags: ['authentication', action]
          })
        },

        logSecurity: (event, severity, context?) => {
          const level: LogLevel = severity === 'critical' ? 'fatal' : severity === 'high' ? 'error' : 'warn'
          
          return logEffect(db, stateRef, level, 'security', `Security event: ${event}`, {
            event,
            severity
          }, {
            ...context,
            tags: ['security', severity]
          })
        },

        getLogs: (filter = {}) =>
          Effect.gen(function* (_) {
            const conditions = []
            
            if (filter.level && filter.level.length > 0) {
              conditions.push(inArray(systemLogs.level, filter.level))
            }
            
            if (filter.category && filter.category.length > 0) {
              conditions.push(inArray(systemLogs.category, filter.category))
            }
            
            if (filter.userId) {
              conditions.push(eq(systemLogs.userId, filter.userId))
            }
            
            if (filter.source) {
              conditions.push(eq(systemLogs.source, filter.source))
            }
            
            if (filter.search) {
              conditions.push(like(systemLogs.message, `%${filter.search}%`))
            }
            
            if (filter.startDate) {
              conditions.push(gte(systemLogs.createdAt, filter.startDate))
            }
            
            if (filter.endDate) {
              conditions.push(lte(systemLogs.createdAt, filter.endDate))
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined

            // Get total count
            const totalResult = yield* 
              Effect.tryPromise({
                try: () => db
                  .select({ count: count() })
                  .from(systemLogs)
                  .where(whereClause),
                catch: (error) => new DatabaseError({
                  message: 'Failed to count logs',
                  operation: 'count',
                  cause: error
                })
              })
            

            const total = totalResult[0]?.count || 0

            // Get logs with pagination
            const sortColumn = filter.sortBy === 'level' ? systemLogs.level :
                              filter.sortBy === 'category' ? systemLogs.category :
                              systemLogs.createdAt

            const sortFn = filter.sortOrder === 'asc' ? asc : desc

            const logs = yield* 
              Effect.tryPromise({
                try: () => db
                  .select()
                  .from(systemLogs)
                  .where(whereClause)
                  .orderBy(sortFn(sortColumn))
                  .limit(filter.limit || 50)
                  .offset(filter.offset || 0),
                catch: (error) => new DatabaseError({
                  message: 'Failed to fetch logs',
                  operation: 'select',
                  cause: error
                })
              })
            

            return { logs, total }
          }),

        updateConfig: (category, updates) =>
          Effect.gen(function* (_) {
            yield* 
              Effect.tryPromise({
                try: () => db
                  .update(logConfig)
                  .set({
                    ...updates,
                    updatedAt: new Date()
                  })
                  .where(eq(logConfig.category, category)),
                catch: (error) => new DatabaseError({
                  message: 'Failed to update config',
                  operation: 'update',
                  cause: error
                })
              })
            

            // Clear cache
            yield* Ref.update(stateRef, state => ({
              ...state,
              configCache: new Map([...state.configCache].filter(([k]) => k !== category))
            }))
          }),

        getAllConfigs: () =>
          Effect.tryPromise({
            try: () => db.select().from(logConfig),
            catch: (error) => new DatabaseError({
              message: 'Failed to fetch configs',
              operation: 'select',
              cause: error
            })
          }),

        cleanupByRetention: () =>
          Effect.gen(function* (_) {
            const configs = yield* 
              Effect.tryPromise({
                try: () => db.select().from(logConfig),
                catch: (error) => new DatabaseError({
                  message: 'Failed to fetch configs',
                  operation: 'select',
                  cause: error
                })
              })
            
            
            for (const config of configs) {
              if (config.retention > 0) {
                const cutoffDate = new Date()
                cutoffDate.setDate(cutoffDate.getDate() - config.retention)

                yield* 
                  Effect.tryPromise({
                    try: () => db
                      .delete(systemLogs)
                      .where(
                        and(
                          eq(systemLogs.category, config.category),
                          lte(systemLogs.createdAt, cutoffDate)
                        )
                      ),
                    catch: (error) => new DatabaseError({
                      message: `Failed to cleanup logs for ${config.category}`,
                      operation: 'delete',
                      cause: error
                    })
                  })
                
              }
            }
          }),

        setEnabled: (enabled) =>
          Ref.update(stateRef, state => ({ ...state, enabled })),

        isEnabled: () =>
          Effect.map(Ref.get(stateRef), state => state.enabled)
      }
    })
  )

// ============================================================================
// Convenience Functions (Effect-based)
// ============================================================================

export const debug = (
  category: LogCategory,
  message: string,
  data?: any,
  context?: Partial<LogEntry>
): Effect.Effect<void, LoggerError, LoggerService> =>
  Effect.flatMap(LoggerService, service => service.debug(category, message, data, context))

export const info = (
  category: LogCategory,
  message: string,
  data?: any,
  context?: Partial<LogEntry>
): Effect.Effect<void, LoggerError, LoggerService> =>
  Effect.flatMap(LoggerService, service => service.info(category, message, data, context))

export const warn = (
  category: LogCategory,
  message: string,
  data?: any,
  context?: Partial<LogEntry>
): Effect.Effect<void, LoggerError, LoggerService> =>
  Effect.flatMap(LoggerService, service => service.warn(category, message, data, context))

export const error = (
  category: LogCategory,
  message: string,
  error?: Error | any,
  context?: Partial<LogEntry>
): Effect.Effect<void, LoggerError, LoggerService> =>
  Effect.flatMap(LoggerService, service => service.error(category, message, error, context))

export const fatal = (
  category: LogCategory,
  message: string,
  error?: Error | any,
  context?: Partial<LogEntry>
): Effect.Effect<void, LoggerError, LoggerService> =>
  Effect.flatMap(LoggerService, service => service.fatal(category, message, error, context))
