/**
 * Effect Schema Validator Middleware for Hono
 *
 * This middleware provides validation using Effect Schema instead of Zod.
 * It's designed to be a drop-in replacement for @hono/zod-validator.
 */

import { Context, MiddlewareHandler } from 'hono'
import { Schema, ParseResult } from 'effect'
import { Either } from 'effect'

type Hook<T, E, Target = string> = (
  result: Either.Either<T, E>,
  c: Context
) => Response | Promise<Response> | void | Promise<void>

type HasUndefined<T> = undefined extends T ? true : false

/**
 * Validator function that validates request data using Effect Schema
 */
export const effectValidator = <
  T extends Schema.Schema.Any,
  Target extends keyof ValidationTargets = 'json',
  E = Schema.Schema.Encoded<T>,
  P extends string = string,
  I = Schema.Schema.Type<T>,
  V extends {
    in: { [K in Target]: I }
    out: { [K in Target]: Schema.Schema.Type<T> }
  } = {
    in: { [K in Target]: I }
    out: { [K in Target]: Schema.Schema.Type<T> }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  U = HasUndefined<I> extends true ? { [K in Target]?: I } : { [K in Target]: I }
>(
  target: Target,
  schema: T,
  hook?: Hook<Schema.Schema.Type<T>, ParseResult.ParseError, Target>
): MiddlewareHandler<any, P, V> => {
  return async (c, next) => {
    let value: unknown = {}

    // Extract data based on target
    switch (target) {
      case 'json':
        try {
          value = await c.req.json()
        } catch {
          value = {}
        }
        break
      case 'form':
        {
          const formData = await c.req.formData()
          const formObject: Record<string, unknown> = {}
          
          for (const [key, val] of formData.entries()) {
            if (key.endsWith('[]')) {
              const arrayKey = key.slice(0, -2)
              if (!formObject[arrayKey]) {
                formObject[arrayKey] = []
              }
              ;(formObject[arrayKey] as unknown[]).push(val)
            } else {
              formObject[key] = val
            }
          }
          
          value = formObject
        }
        break
      case 'query':
        {
          const queryObject: Record<string, unknown> = {}
          const url = new URL(c.req.url)
          
          for (const [key, val] of url.searchParams.entries()) {
            queryObject[key] = val
          }
          
          value = queryObject
        }
        break
      case 'param':
        value = c.req.param()
        break
      case 'header':
        {
          const headerObject: Record<string, unknown> = {}
          for (const [key, val] of c.req.raw.headers.entries()) {
            headerObject[key] = val
          }
          value = headerObject
        }
        break
      case 'cookie':
        // Note: Hono doesn't have built-in cookie parsing in req
        // You might need to parse cookies manually or use a cookie middleware
        value = {}
        break
    }

    // Validate using Effect Schema
    const result = Schema.decodeUnknownEither(schema as any)(value)

    // Handle validation result
    if (Either.isLeft(result)) {
      // Validation failed
      if (hook) {
        const hookResult = await hook(result as any, c)
        if (hookResult) {
          return hookResult
        }
      }

      // Default error response
      const error = result.left
      const issues = ParseResult.TreeFormatter.formatErrorSync(error)
      
      return c.json(
        {
          success: false,
          error: 'Validation failed',
          issues: issues
        },
        400
      )
    }

    // Validation succeeded
    const validatedData = result.right

    // Store validated data in context
    const req = c.req as any
    req.valid = req.valid || {}
    req.valid[target] = validatedData

    return await next()
  }
}

/**
 * Validation target types
 */
type ValidationTargets = {
  json: unknown
  form: Record<string, string | File>
  query: Record<string, string>
  param: Record<string, string>
  header: Record<string, string>
  cookie: Record<string, string>
}

/**
 * Type helper to extract validated data from context
 */
declare module 'hono' {
  interface HonoRequest {
    valid<T extends keyof ValidationTargets>(
      target: T
    ): ValidationTargets[T]
  }
}