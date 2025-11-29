import { Context, Effect, Layer } from 'effect'

/**
 * D1 Query Result types
 */
export interface D1QueryResult<T = unknown> {
  results: T[]
  success: boolean
  meta?: {
    duration?: number
    size_after?: number
    rows_read?: number
    rows_written?: number
  }
}

export interface D1RunResult {
  success: boolean
  changes: number
  duration?: number
  lastRowId?: number
}

/**
 * Database Service Error types
 */
import { Data } from 'effect'

// ... (ostatní třídy chyb)

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  message: string
  cause?: unknown
}> {}

export class ValidationError {
  readonly _tag = 'ValidationError'
  constructor(readonly message: string, readonly details?: string) {}
}

export class NotFoundError {
  readonly _tag = 'NotFoundError'
  constructor(readonly message: string) {}
}

/**
 * Database Service Interface
 */
export interface DatabaseService {
  /**
   * Execute a SELECT query and return all results
   */
  readonly query: <T = unknown>(
    sql: string,
    params?: unknown[]
  ) => Effect.Effect<T[], DatabaseError>

  /**
   * Execute a SELECT query and return first result
   */
  readonly queryFirst: <T = unknown>(
    sql: string,
    params?: unknown[]
  ) => Effect.Effect<T | null, DatabaseError>

  /**
   * Execute an INSERT/UPDATE/DELETE query
   */
  readonly execute: (
    sql: string,
    params?: unknown[]
  ) => Effect.Effect<D1RunResult, DatabaseError>

  /**
   * Execute an INSERT query and return the created row
   */
  readonly insert: <T = unknown>(
    sql: string,
    params?: unknown[]
  ) => Effect.Effect<T, DatabaseError | NotFoundError>

  /**
   * Execute an UPDATE query and return the updated row
   */
  readonly update: <T = unknown>(
    sql: string,
    params?: unknown[]
  ) => Effect.Effect<T, DatabaseError | NotFoundError>
}

/**
 * Database Service Tag for dependency injection
 */
export const DatabaseService = Context.GenericTag<DatabaseService>('@services/DatabaseService')

/**
 * Create a Database Service implementation from D1Database
 */
export const makeDatabaseService = (db: D1Database): DatabaseService => ({
  query: <T = unknown>(sql: string, params: unknown[] = []) =>
    Effect.tryPromise({
      try: async () => {
        const stmt = db.prepare(sql)
        const bound = params.length > 0 ? stmt.bind(...params) : stmt
        const result = await bound.all<T>()
        return result.results || []
      },
      catch: (error) => new DatabaseError({ message: 'Query failed', cause: error })
    }),

  queryFirst: <T = unknown>(sql: string, params: unknown[] = []) =>
    Effect.tryPromise({
      try: async () => {
        const stmt = db.prepare(sql)
        const bound = params.length > 0 ? stmt.bind(...params) : stmt
        const result = await bound.first<T>()
        return result || null
      },
      catch: (error) => new DatabaseError({ message: 'Query failed', cause: error })
    }),

  execute: (sql: string, params: unknown[] = []) =>
    Effect.tryPromise({
      try: async () => {
        const stmt = db.prepare(sql)
        const bound = params.length > 0 ? stmt.bind(...params) : stmt
        const result = await bound.run()
        return {
          success: result.success || true,
          changes: (result as any).changes || 0,
          duration: result.meta?.duration,
          lastRowId: (result.meta as any)?.last_row_id
        }
      },
      catch: (error) => new DatabaseError({ message: 'Execute failed', cause: error })
    }),

  insert: <T = unknown>(sql: string, params: unknown[] = []) =>
    Effect.gen(function* (_) {
      const stmt = db.prepare(sql)
      const bound = params.length > 0 ? stmt.bind(...params) : stmt
      
      const result = yield* 
        Effect.tryPromise({
          try: async () => await bound.all<T>(),
          catch: (error) => new DatabaseError({ message: 'Insert failed', cause: error })
        })
      

      const inserted = result.results?.[0]
      if (!inserted) {
        return yield* Effect.fail(new NotFoundError('Insert did not return a row'))
      }

      return inserted
    }),

  update: <T = unknown>(sql: string, params: unknown[] = []) =>
    Effect.gen(function* (_) {
      const stmt = db.prepare(sql)
      const bound = params.length > 0 ? stmt.bind(...params) : stmt
      
      const result = yield* 
        Effect.tryPromise({
          try: async () => await bound.all<T>(),
          catch: (error) => new DatabaseError({ message: 'Update failed', cause: error })
        })
      

      const updated = result.results?.[0]
      if (!updated) {
        return yield* Effect.fail(new NotFoundError('Update did not return a row'))
      }

      return updated
    })
})

/**
 * Create a Layer for providing DatabaseService
 *
 * ⚠️ IMPORTANT: This is a low-level Layer factory.
 * For application route handlers and normal development, prefer using `makeAppLayer(db)`
 * which provides DatabaseService along with all core services (User, Content, Collection, Settings).
 *
 * Use `makeDatabaseLayer` only when:
 * 1. You need ONLY database access without other services (e.g., migrations, specialized scripts)
 * 2. You are testing services in isolation
 * 3. You are building a custom Layer composition that doesn't need the full AppLayer
 */
export const makeDatabaseLayer = (db: D1Database): Layer.Layer<DatabaseService> =>
  Layer.succeed(DatabaseService, makeDatabaseService(db))