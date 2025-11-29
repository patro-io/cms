/**
 * Query Filter Builder for PatroCMS
 * Supports comprehensive filtering with AND/OR logic
 * Compatible with D1 Database (SQLite)
 * 
 * Effect-TS Version with type-safe error handling
 */

import { Data, Effect, Ref } from "effect"

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_equal'
  | 'less_than'
  | 'less_than_equal'
  | 'like'
  | 'contains'
  | 'in'
  | 'not_in'
  | 'all'
  | 'exists'
  | 'near'
  | 'within'
  | 'intersects'

export interface FilterCondition {
  field: string
  operator: FilterOperator
  value: any
}

export interface FilterGroup {
  and?: FilterCondition[]
  or?: FilterCondition[]
}

export interface QueryFilter {
  where?: FilterGroup
  limit?: number
  offset?: number
  sort?: {
    field: string
    order: 'asc' | 'desc'
  }[]
}

export interface QueryResult {
  sql: string
  params: any[]
  errors: string[]
}

// ============================================================================
// Effect-TS Error Types
// ============================================================================

export class QueryFilterError extends Data.TaggedError("QueryFilterError")<{
  message: string
  operator?: string
}> {}

export class InvalidFieldError extends Data.TaggedError("InvalidFieldError")<{
  message: string
  field: string
}> {}

// ============================================================================
// Effect-TS Implementation
// ============================================================================

interface BuilderState {
  params: any[]
  errors: string[]
}

/**
 * Build a complete SQL query from filter object (Effect version)
 */
export const buildQueryEffect = (
  baseTable: string,
  filter: QueryFilter
): Effect.Effect<QueryResult, QueryFilterError> =>
  Effect.gen(function* (_) {
    // Initialize state
    const stateRef = yield* Ref.make<BuilderState>({ params: [], errors: [] })

    let sql = `SELECT * FROM ${baseTable}`

    // Build WHERE clause
    if (filter.where) {
      const whereClause = yield* buildWhereClauseEffect(filter.where, stateRef)
      if (whereClause) {
        sql += ` WHERE ${whereClause}`
      }
    }

    // Build ORDER BY clause
    if (filter.sort && filter.sort.length > 0) {
      const orderClauses = filter.sort
        .map(s => `${sanitizeFieldName(s.field)} ${s.order.toUpperCase()}`)
        .join(', ')
      sql += ` ORDER BY ${orderClauses}`
    }

    // Build LIMIT clause
    if (filter.limit) {
      sql += ` LIMIT ?`
      yield* Ref.update(stateRef, state => ({
        ...state,
        params: [...state.params, filter.limit]
      }))
    }

    // Build OFFSET clause
    if (filter.offset) {
      sql += ` OFFSET ?`
      yield* Ref.update(stateRef, state => ({
        ...state,
        params: [...state.params, filter.offset]
      }))
    }

    const state = yield* Ref.get(stateRef)

    return {
      sql,
      params: state.params,
      errors: state.errors
    }
  })

/**
 * Build WHERE clause from filter group (Effect version)
 */
const buildWhereClauseEffect = (
  group: FilterGroup,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, QueryFilterError> =>
  Effect.gen(function* (_) {
    const clauses: string[] = []

    // Handle AND conditions
    if (group.and && group.and.length > 0) {
      const andClauses: string[] = []
      for (const condition of group.and) {
        const clause = yield* buildConditionEffect(condition, stateRef)
        if (clause !== null) {
          andClauses.push(clause)
        }
      }

      if (andClauses.length > 0) {
        clauses.push(`(${andClauses.join(' AND ')})`)
      }
    }

    // Handle OR conditions
    if (group.or && group.or.length > 0) {
      const orClauses: string[] = []
      for (const condition of group.or) {
        const clause = yield* buildConditionEffect(condition, stateRef)
        if (clause !== null) {
          orClauses.push(clause)
        }
      }

      if (orClauses.length > 0) {
        clauses.push(`(${orClauses.join(' OR ')})`)
      }
    }

    return clauses.join(' AND ')
  })

/**
 * Build a single condition (Effect version)
 */
const buildConditionEffect = (
  condition: FilterCondition,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string | null, QueryFilterError> =>
  Effect.gen(function* (_) {
    const field = sanitizeFieldName(condition.field)

    switch (condition.operator) {
      case 'equals':
        return yield* buildEqualsEffect(field, condition.value, stateRef)

      case 'not_equals':
        return yield* buildNotEqualsEffect(field, condition.value, stateRef)

      case 'greater_than':
        return yield* buildComparisonEffect(field, '>', condition.value, stateRef)

      case 'greater_than_equal':
        return yield* buildComparisonEffect(field, '>=', condition.value, stateRef)

      case 'less_than':
        return yield* buildComparisonEffect(field, '<', condition.value, stateRef)

      case 'less_than_equal':
        return yield* buildComparisonEffect(field, '<=', condition.value, stateRef)

      case 'like':
        return yield* buildLikeEffect(field, condition.value, stateRef)

      case 'contains':
        return yield* buildContainsEffect(field, condition.value, stateRef)

      case 'in':
        return yield* buildInEffect(field, condition.value, stateRef)

      case 'not_in':
        return yield* buildNotInEffect(field, condition.value, stateRef)

      case 'all':
        return yield* buildAllEffect(field, condition.value, stateRef)

      case 'exists':
        return yield* buildExistsEffect(field, condition.value)

      case 'near':
      case 'within':
      case 'intersects':
        yield* Ref.update(stateRef, state => ({
          ...state,
          errors: [...state.errors, `'${condition.operator}' operator not supported in SQLite. Use spatial extension or application-level filtering.`]
        }))
        return null

      default:
        yield* Ref.update(stateRef, state => ({
          ...state,
          errors: [...state.errors, `Unknown operator: ${condition.operator}`]
        }))
        return null
    }
  })

/**
 * Build equals condition (Effect version)
 */
const buildEqualsEffect = (
  field: string,
  value: any,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    if (value === null) {
      return `${field} IS NULL`
    }
    yield* Ref.update(stateRef, state => ({
      ...state,
      params: [...state.params, value]
    }))
    return `${field} = ?`
  })

/**
 * Build not equals condition (Effect version)
 */
const buildNotEqualsEffect = (
  field: string,
  value: any,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    if (value === null) {
      return `${field} IS NOT NULL`
    }
    yield* Ref.update(stateRef, state => ({
      ...state,
      params: [...state.params, value]
    }))
    return `${field} != ?`
  })

/**
 * Build comparison condition (>, >=, <, <=) (Effect version)
 */
const buildComparisonEffect = (
  field: string,
  operator: string,
  value: any,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    yield* Ref.update(stateRef, state => ({
      ...state,
      params: [...state.params, value]
    }))
    return `${field} ${operator} ?`
  })

/**
 * Build LIKE condition (Effect version)
 */
const buildLikeEffect = (
  field: string,
  value: string,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    const words = value.split(/\s+/).filter(w => w.length > 0)

    if (words.length === 0) {
      return `1=1`
    }

    const conditions: string[] = []
    for (const word of words) {
      yield* Ref.update(stateRef, state => ({
        ...state,
        params: [...state.params, `%${word}%`]
      }))
      conditions.push(`${field} LIKE ?`)
    }

    return `(${conditions.join(' AND ')})`
  })

/**
 * Build CONTAINS condition (Effect version)
 */
const buildContainsEffect = (
  field: string,
  value: string,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    yield* Ref.update(stateRef, state => ({
      ...state,
      params: [...state.params, `%${value}%`]
    }))
    return `${field} LIKE ?`
  })

/**
 * Build IN condition (Effect version)
 */
const buildInEffect = (
  field: string,
  value: any,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    let values: any[]

    if (typeof value === 'string') {
      values = value.split(',').map(v => v.trim()).filter(v => v.length > 0)
    } else if (Array.isArray(value)) {
      values = value
    } else {
      values = [value]
    }

    if (values.length === 0) {
      return `1=0`
    }

    const placeholders: string[] = []
    for (const v of values) {
      yield* Ref.update(stateRef, state => ({
        ...state,
        params: [...state.params, v]
      }))
      placeholders.push('?')
    }

    return `${field} IN (${placeholders.join(', ')})`
  })

/**
 * Build NOT IN condition (Effect version)
 */
const buildNotInEffect = (
  field: string,
  value: any,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    let values: any[]

    if (typeof value === 'string') {
      values = value.split(',').map(v => v.trim()).filter(v => v.length > 0)
    } else if (Array.isArray(value)) {
      values = value
    } else {
      values = [value]
    }

    if (values.length === 0) {
      return `1=1`
    }

    const placeholders: string[] = []
    for (const v of values) {
      yield* Ref.update(stateRef, state => ({
        ...state,
        params: [...state.params, v]
      }))
      placeholders.push('?')
    }

    return `${field} NOT IN (${placeholders.join(', ')})`
  })

/**
 * Build ALL condition (Effect version)
 */
const buildAllEffect = (
  field: string,
  value: any,
  stateRef: Ref.Ref<BuilderState>
): Effect.Effect<string, never> =>
  Effect.gen(function* (_) {
    let values: any[]

    if (typeof value === 'string') {
      values = value.split(',').map(v => v.trim()).filter(v => v.length > 0)
    } else if (Array.isArray(value)) {
      values = value
    } else {
      values = [value]
    }

    if (values.length === 0) {
      return `1=1`
    }

    const conditions: string[] = []
    for (const val of values) {
      yield* Ref.update(stateRef, state => ({
        ...state,
        params: [...state.params, `%${val}%`]
      }))
      conditions.push(`${field} LIKE ?`)
    }

    return `(${conditions.join(' AND ')})`
  })

/**
 * Build EXISTS condition (Effect version)
 */
const buildExistsEffect = (
  field: string,
  value: boolean
): Effect.Effect<string, never> =>
  Effect.succeed(
    value
      ? `${field} IS NOT NULL AND ${field} != ''`
      : `(${field} IS NULL OR ${field} = '')`
  )

/**
 * Sanitize field names to prevent SQL injection
 */
function sanitizeFieldName(field: string): string {
  const sanitized = field.replace(/[^a-zA-Z0-9_$.]/g, '')

  if (sanitized.includes('.')) {
    const [table, ...path] = sanitized.split('.')
    return `json_extract(${table}, '$.${path.join('.')}')`
  }

  return sanitized
}

/**
 * Parse filter from query string (Effect version)
 */
export const parseFromQueryEffect = (
  query: Record<string, any>
): Effect.Effect<QueryFilter, QueryFilterError> =>
  Effect.gen(function* (_) {
    const filter: QueryFilter = {}

    // Parse where clause
    if (query.where) {
      try {
        filter.where = typeof query.where === 'string'
          ? JSON.parse(query.where)
          : query.where
      } catch (e) {
        return yield* Effect.fail(new QueryFilterError({
          message: `Failed to parse where clause: ${e}`
        }))
      }
    }

    // Initialize where clause if not present
    if (!filter.where) {
      filter.where = { and: [] }
    }
    if (!filter.where.and) {
      filter.where.and = []
    }

    // Parse simple field filters
    const simpleFieldMappings: Record<string, string> = {
      'status': 'status',
      'collection_id': 'collection_id'
    }

    for (const [queryParam, dbField] of Object.entries(simpleFieldMappings)) {
      if (query[queryParam]) {
        filter.where.and.push({
          field: dbField,
          operator: 'equals',
          value: query[queryParam]
        })
      }
    }

    // Parse limit
    if (query.limit) {
      filter.limit = Math.min(parseInt(query.limit), 1000)
    }

    // Parse offset
    if (query.offset) {
      filter.offset = parseInt(query.offset)
    }

    // Parse sort
    if (query.sort) {
      try {
        filter.sort = typeof query.sort === 'string'
          ? JSON.parse(query.sort)
          : query.sort
      } catch (e) {
        return yield* Effect.fail(new QueryFilterError({
          message: `Failed to parse sort clause: ${e}`
        }))
      }
    }

    return filter
  })

/**
 * Helper function to build query from filter (Effect version)
 */
export function buildQueryFromFilter(table: string, filter: QueryFilter): Effect.Effect<QueryResult, QueryFilterError> {
  return buildQueryEffect(table, filter)
}
