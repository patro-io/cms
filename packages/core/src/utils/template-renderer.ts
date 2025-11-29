/**
 * Template renderer compatible with Cloudflare Workers
 * No filesystem access available
 * 
 * Effect-TS Version with type-safe error handling and state management
 */

import { Context, Data, Effect, Layer, Ref } from "effect"

interface TemplateData {
  [key: string]: any
}

// ============================================================================
// Effect-TS Error Types
// ============================================================================

export class TemplateRenderError extends Data.TaggedError("TemplateRenderError")<{
  message: string
  template?: string
  path?: string
}> {}

export class TemplateParseError extends Data.TaggedError("TemplateParseError")<{
  message: string
  template: string
}> {}

// ============================================================================
// Effect-TS Service Definition
// ============================================================================

export interface TemplateRendererOps {
  render: (template: string, data?: TemplateData) => Effect.Effect<string, TemplateRenderError>
  clearCache: () => Effect.Effect<void, never>
}

export class TemplateRendererService extends Context.Tag("TemplateRendererService")<
  TemplateRendererService,
  TemplateRendererOps
>() {}

// ============================================================================
// Internal Helper Functions (Pure)
// ============================================================================

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || path === '') return undefined
  
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined
    return current[key]
  }, obj)
}

/**
 * Title case helper function
 */
function titleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * Render template with data (Effect version)
 */
const renderTemplateEffect = (
  template: string,
  data: TemplateData
): Effect.Effect<string, TemplateRenderError> =>
  Effect.gen(function* (_) {
    let rendered = template

    // Handle each loops - process outermost loops first for proper nesting
    // Use a more careful regex that doesn't match nested each blocks
    let eachCount = 0
    while (rendered.includes('{{#each ') && eachCount < 100) {
      const previousRendered = rendered
      // Match the innermost each block first
      rendered = rendered.replace(/\{\{#each\s+([^}]+)\}\}((?:(?!\{\{#each)[\s\S])*?)\{\{\/each\}\}/g, (_match, arrayName, content) => {
        const array = getNestedValue(data, arrayName.trim())
        if (!Array.isArray(array)) return ''
        
        return array.map((item, index) => {
          // Create context with array item and special variables
          const itemContext = {
            ...data,
            // Handle primitive items (for {{.}} syntax)
            '.': item,
            // Spread item properties if it's an object
            ...(typeof item === 'object' && item !== null ? item : {}),
            '@index': index,
            '@first': index === 0,
            '@last': index === array.length - 1
          }
          // Note: Recursive call needs to be sync for replace callback
          return Effect.runSync(renderTemplateEffect(content, itemContext))
        }).join('')
      })
      if (previousRendered === rendered) break
      eachCount++
    }

    // Second pass: Handle conditionals
    let ifCount = 0
    while (rendered.includes('{{#if ') && ifCount < 100) {
      const previousRendered = rendered
      rendered = rendered.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, condition, content) => {
        const value = getNestedValue(data, condition.trim())
        // Handle boolean values properly - @first/@last are explicitly boolean
        const isTruthy = value === true || (value && value !== 0 && value !== '' && value !== null && value !== undefined)
        return isTruthy ? Effect.runSync(renderTemplateEffect(content, data)) : ''
      })
      if (previousRendered === rendered) break
      ifCount++
    }

    if (ifCount >= 100) {
      return yield* Effect.fail(new TemplateRenderError({
        message: 'Maximum recursion depth reached in conditional rendering',
        template
      }))
    }

    // Third pass: Handle triple braces for raw HTML {{{variable}}}
    rendered = rendered.replace(/\{\{\{([^}]+)\}\}\}/g, (_match, variable) => {
      const value = getNestedValue(data, variable.trim())
      return value !== undefined && value !== null ? String(value) : ''
    })

    // Fourth pass: Handle helper functions like {{titleCase field}}
    rendered = rendered.replace(/\{\{([^}#\/]+)\s+([^}]+)\}\}/g, (match, helper, variable) => {
      const helperName = helper.trim()
      const varName = variable.trim()
      
      if (helperName === 'titleCase') {
        const value = getNestedValue(data, varName)
        if (value !== undefined && value !== null) {
          return titleCase(String(value))
        }
      }
      
      return match // Return original if helper not found
    })

    // Final pass: Handle simple variables {{variable}}
    rendered = rendered.replace(/\{\{([^}#\/]+)\}\}/g, (match, variable) => {
      const trimmed = variable.trim()
      
      // Skip if it's a helper function (has spaces)
      if (trimmed.includes(' ')) {
        return match
      }
      
      // Special handling for {{.}} - current item in iteration
      if (trimmed === '.') {
        const value = data['.']
        if (value === null) return ''
        if (value === undefined) return ''
        return String(value)
      }
      
      const value = getNestedValue(data, trimmed)
      if (value === null) return ''
      if (value === undefined) return ''
      return String(value)
    })

    return rendered
  })

// ============================================================================
// Effect-TS Service Implementation
// ============================================================================

/**
 * Create TemplateRenderer service layer
 */
export const makeTemplateRendererServiceLayer = (): Layer.Layer<TemplateRendererService> =>
  Layer.effect(
    TemplateRendererService,
    Effect.gen(function* (_) {
      const cacheRef = yield* Ref.make(new Map<string, string>())

      return {
        render: (template: string, data: TemplateData = {}) =>
          renderTemplateEffect(template, data),

        clearCache: () =>
          Ref.set(cacheRef, new Map<string, string>())
      }
    })
  )

/**
 * Default TemplateRenderer service layer
 */
export const TemplateRendererServiceLive: Layer.Layer<TemplateRendererService> =
  makeTemplateRendererServiceLayer()

// ============================================================================
// Convenience Functions (Effect-based)
// ============================================================================

/**
 * Render template with data (Effect version)
 */
export const render = (
  template: string,
  data: TemplateData = {}
): Effect.Effect<string, TemplateRenderError, TemplateRendererService> =>
  Effect.flatMap(
    TemplateRendererService,
    service => service.render(template, data)
  )

/**
 * Clear template cache (Effect version)
 */
export const clearCache = (): Effect.Effect<void, never, TemplateRendererService> =>
  Effect.flatMap(
    TemplateRendererService,
    service => service.clearCache()
  )

/**
 * Render template directly without service context (standalone Effect)
 */
export const renderTemplateStandalone = (
  template: string,
  data: TemplateData = {}
): Effect.Effect<string, TemplateRenderError> =>
  renderTemplateEffect(template, data)
