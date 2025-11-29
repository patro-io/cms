/**
 * HTML sanitization utilities for preventing XSS attacks
 * Refactored to use Effect-TS for type-safe error handling
 */

import { Data, Effect } from "effect"

/**
 * Error types for sanitization operations
 */
export class SanitizeError extends Data.TaggedError("SanitizeError")<{
  readonly message: string
  readonly input: unknown
  readonly cause?: unknown
}> {}

export class InvalidInputError extends Data.TaggedError("InvalidInputError")<{
  readonly message: string
  readonly input: unknown
}> {}

/**
 * HTML character escape map
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
} as const

/**
 * Escapes HTML special characters to prevent XSS attacks
 * 
 * @param text - The text to escape
 * @returns Effect that succeeds with escaped text or fails with SanitizeError
 * 
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * 
 * const result = Effect.runSync(escapeHtml("<script>alert('xss')</script>"))
 * // result: "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"
 * ```
 */
export const escapeHtml = (text: unknown): string => {
  // Handle null/undefined
  if (text === null || text === undefined) {
    return ""
  }

  try {
    const str = String(text)
    return str.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char)
  } catch (error) {
    console.error("Failed to escape HTML", error)
    return String(text)
  }
}

/**
 * Sanitizes user input by escaping HTML special characters
 * This should be used for all user-provided text fields to prevent XSS
 * 
 * @param input - The input string to sanitize
 * @returns Effect that succeeds with sanitized string or fails with SanitizeError
 * 
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * 
 * const result = Effect.runSync(sanitizeInput("  <b>Hello</b>  "))
 * // result: "&lt;b&gt;Hello&lt;/b&gt;"
 * ```
 */
export const sanitizeInput = (input: unknown): Effect.Effect<string, SanitizeError> => {
  // Handle null/undefined
  if (input === null || input === undefined) {
    return Effect.succeed("")
  }

  // Convert to string, trim, and escape
  return Effect.try({
    try: () => {
      const trimmed = String(input).trim()
      return escapeHtml(trimmed)
    },
    catch: (error) => new SanitizeError({
      message: "Failed to sanitize input",
      input,
      cause: error
    })
  })
}

/**
 * Sanitizes an object's string properties
 * 
 * @param obj - Object with string properties to sanitize
 * @param fields - Array of field names to sanitize
 * @returns Effect that succeeds with sanitized object or fails with SanitizeError
 * 
 * @example
 * ```typescript
 * import { Effect } from "effect"
 * 
 * const user = { name: "<script>", email: "test@example.com" }
 * const result = Effect.runSync(sanitizeObject(user, ["name"]))
 * // result: { name: "&lt;script&gt;", email: "test@example.com" }
 * ```
 */
export const sanitizeObject = <T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): Effect.Effect<T, SanitizeError | InvalidInputError> => {
  // Validate input
  if (!obj || typeof obj !== 'object') {
    return Effect.fail(new InvalidInputError({
      message: "Input must be an object",
      input: obj
    }))
  }

  // Create shallow copy
  const sanitized = { ...obj }

  // Build array of Effects for each field
  const sanitizeEffects = fields
    .filter(field => typeof obj[field] === 'string')
    .map(field =>
      sanitizeInput(obj[field]).pipe(
        Effect.map(sanitizedValue => ({ field, value: sanitizedValue }))
      )
    )

  // Run all sanitizations and collect results
  return Effect.all(sanitizeEffects).pipe(
    Effect.map(results => {
      for (const { field, value } of results) {
        sanitized[field] = value as T[keyof T]
      }
      return sanitized
    })
  )
}

