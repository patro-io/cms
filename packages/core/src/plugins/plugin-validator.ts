/**
 * Plugin Validator
 * 
 * Validates plugin definitions, dependencies, and compatibility
 */

import { Schema } from 'effect'
import { Plugin, PluginValidator as IPluginValidator, PluginValidationResult, PluginRegistry } from '../types'
import semver from 'semver'

// Effect schemas for plugin validation
const PluginAuthorSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  email: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
})

const PluginRoutesSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1)),
  handler: Schema.Unknown, // Hono instance
  description: Schema.optional(Schema.String),
  requiresAuth: Schema.optional(Schema.Boolean),
  roles: Schema.optional(Schema.Array(Schema.String)),
  priority: Schema.optional(Schema.Number),
})

const PluginMiddlewareSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  handler: Schema.Unknown, // Function
  description: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Number),
  routes: Schema.optional(Schema.Array(Schema.String)),
  global: Schema.optional(Schema.Boolean),
})

const PluginModelSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  tableName: Schema.String.pipe(Schema.minLength(1)),
  schema: Schema.Unknown, // Effect schema
  migrations: Schema.Array(Schema.String),
  relationships: Schema.optional(Schema.Array(Schema.Struct({
    type: Schema.Literal('oneToOne', 'oneToMany', 'manyToMany'),
    target: Schema.String,
    foreignKey: Schema.optional(Schema.String),
    joinTable: Schema.optional(Schema.String),
  }))),
  extendsContent: Schema.optional(Schema.Boolean),
})

const PluginServiceSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  implementation: Schema.Unknown,
  description: Schema.optional(Schema.String),
  dependencies: Schema.optional(Schema.Array(Schema.String)),
  singleton: Schema.optional(Schema.Boolean),
})

const PluginAdminPageSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1)),
  title: Schema.String.pipe(Schema.minLength(1)),
  component: Schema.String.pipe(Schema.minLength(1)),
  description: Schema.optional(Schema.String),
  permissions: Schema.optional(Schema.Array(Schema.String)),
  menuItem: Schema.optional(Schema.Struct({
    label: Schema.String,
    path: Schema.String,
    icon: Schema.optional(Schema.String),
    order: Schema.optional(Schema.Number),
    parent: Schema.optional(Schema.String),
    permissions: Schema.optional(Schema.Array(Schema.String)),
    active: Schema.optional(Schema.Boolean),
  })),
  icon: Schema.optional(Schema.String),
})

const PluginComponentSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  template: Schema.Unknown, // Function
  description: Schema.optional(Schema.String),
  propsSchema: Schema.optional(Schema.Unknown), // Effect schema
})

const PluginHookSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  handler: Schema.Unknown, // Function
  priority: Schema.optional(Schema.Number),
  description: Schema.optional(Schema.String),
})

const PluginSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(1),
    Schema.filter((s): s is string => /^[a-z0-9-]+$/.test(s), {
      message: () => 'Plugin name must be lowercase with hyphens'
    })
  ),
  version: Schema.String.pipe(
    Schema.filter((v): v is string => !!semver.valid(v), {
      message: () => 'Version must be valid semver'
    })
  ),
  description: Schema.optional(Schema.String),
  author: Schema.optional(PluginAuthorSchema),
  dependencies: Schema.optional(Schema.Array(Schema.String)),
  compatibility: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  
  // Extension points
  routes: Schema.optional(Schema.Array(PluginRoutesSchema)),
  middleware: Schema.optional(Schema.Array(PluginMiddlewareSchema)),
  models: Schema.optional(Schema.Array(PluginModelSchema)),
  services: Schema.optional(Schema.Array(PluginServiceSchema)),
  adminPages: Schema.optional(Schema.Array(PluginAdminPageSchema)),
  adminComponents: Schema.optional(Schema.Array(PluginComponentSchema)),
  menuItems: Schema.optional(Schema.Array(Schema.Struct({
    label: Schema.String,
    path: Schema.String,
    icon: Schema.optional(Schema.String),
    order: Schema.optional(Schema.Number),
    parent: Schema.optional(Schema.String),
    permissions: Schema.optional(Schema.Array(Schema.String)),
    active: Schema.optional(Schema.Boolean),
  }))),
  hooks: Schema.optional(Schema.Array(PluginHookSchema)),
  
  // Lifecycle hooks
  install: Schema.optional(Schema.Unknown),
  uninstall: Schema.optional(Schema.Unknown),
  activate: Schema.optional(Schema.Unknown),
  deactivate: Schema.optional(Schema.Unknown),
  configure: Schema.optional(Schema.Unknown),
})

export class PluginValidator implements IPluginValidator {
  private static readonly RESERVED_NAMES = [
    'core', 'system', 'admin', 'api', 'auth', 'content', 'media', 'users', 'collections'
  ]

  private static readonly RESERVED_PATHS = [
    '/admin', '/api', '/auth', '/docs', '/media', '/_assets'
  ]

  /**
   * Validate plugin definition
   */
  validate(plugin: Plugin): PluginValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Schema validation
      const result = Schema.decodeUnknownEither(PluginSchema)(plugin)
      if (result._tag === 'Left') {
        errors.push(`Validation failed: ${result.left.message}`)
      }

      // Reserved name validation
      if (PluginValidator.RESERVED_NAMES.includes(plugin.name)) {
        errors.push(`Plugin name "${plugin.name}" is reserved`)
      }

      // Route path validation
      if (plugin.routes) {
        for (const route of plugin.routes) {
          if (PluginValidator.RESERVED_PATHS.some(path => route.path.startsWith(path))) {
            errors.push(`Route path "${route.path}" conflicts with reserved system path`)
          }
          
          if (!route.path.startsWith('/')) {
            errors.push(`Route path "${route.path}" must start with /`)
          }
        }
      }

      // Model validation
      if (plugin.models) {
        const modelNames = new Set<string>()
        const tableNames = new Set<string>()
        
        for (const model of plugin.models) {
          // Check for duplicate model names
          if (modelNames.has(model.name)) {
            errors.push(`Duplicate model name: ${model.name}`)
          }
          modelNames.add(model.name)
          
          // Check for duplicate table names
          if (tableNames.has(model.tableName)) {
            errors.push(`Duplicate table name: ${model.tableName}`)
          }
          tableNames.add(model.tableName)
          
          // Validate table name format
          if (!/^[a-z][a-z0-9_]*$/.test(model.tableName)) {
            errors.push(`Invalid table name format: ${model.tableName}`)
          }
          
          // Check for system table conflicts
          const systemTables = ['users', 'collections', 'content', 'content_versions', 'media', 'api_tokens']
          if (systemTables.includes(model.tableName)) {
            errors.push(`Table name "${model.tableName}" conflicts with system table`)
          }
        }
      }

      // Service validation
      if (plugin.services) {
        const serviceNames = new Set<string>()
        
        for (const service of plugin.services) {
          if (serviceNames.has(service.name)) {
            errors.push(`Duplicate service name: ${service.name}`)
          }
          serviceNames.add(service.name)
          
          // Check for system service conflicts
          const systemServices = ['auth', 'content', 'media', 'cdn']
          if (systemServices.includes(service.name)) {
            warnings.push(`Service name "${service.name}" conflicts with system service`)
          }
        }
      }

      // Admin page validation
      if (plugin.adminPages) {
        const pagePaths = new Set<string>()
        
        for (const page of plugin.adminPages) {
          if (pagePaths.has(page.path)) {
            errors.push(`Duplicate admin page path: ${page.path}`)
          }
          pagePaths.add(page.path)
          
          if (!page.path.startsWith('/')) {
            errors.push(`Admin page path "${page.path}" must start with /`)
          }
          
          // Check for system admin page conflicts
          const systemPaths = ['/', '/collections', '/content', '/media', '/users', '/settings']
          if (systemPaths.includes(page.path)) {
            errors.push(`Admin page path "${page.path}" conflicts with system page`)
          }
        }
      }

      // Component validation
      if (plugin.adminComponents) {
        const componentNames = new Set<string>()
        
        for (const component of plugin.adminComponents) {
          if (componentNames.has(component.name)) {
            errors.push(`Duplicate component name: ${component.name}`)
          }
          componentNames.add(component.name)
          
          // Check for system component conflicts
          const systemComponents = ['table', 'form', 'alert', 'media-grid', 'pagination']
          if (systemComponents.includes(component.name)) {
            warnings.push(`Component name "${component.name}" conflicts with system component`)
          }
        }
      }

      // Hook validation
      if (plugin.hooks) {
        for (const hook of plugin.hooks) {
          if (!hook.name.includes(':')) {
            warnings.push(`Hook name "${hook.name}" should include namespace (e.g., "plugin:event")`)
          }
        }
      }

      // Dependency cycle detection (basic)
      if (plugin.dependencies?.includes(plugin.name)) {
        errors.push(`Plugin cannot depend on itself`)
      }

      // License validation
      if (plugin.license) {
        const validLicenses = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'ISC']
        if (!validLicenses.includes(plugin.license)) {
          warnings.push(`License "${plugin.license}" is not a common SPDX identifier`)
        }
      }

      // Performance warnings
      if (plugin.middleware && plugin.middleware.length > 5) {
        warnings.push(`Plugin defines ${plugin.middleware.length} middleware functions, consider consolidating`)
      }

      if (plugin.hooks && plugin.hooks.length > 10) {
        warnings.push(`Plugin defines ${plugin.hooks.length} hooks, ensure they are necessary`)
      }

    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate plugin dependencies
   */
  validateDependencies(plugin: Plugin, registry: PluginRegistry): PluginValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!plugin.dependencies || plugin.dependencies.length === 0) {
      return { valid: true, errors, warnings }
    }

    // Check if all dependencies are registered
    for (const depName of plugin.dependencies) {
      if (!registry.has(depName)) {
        errors.push(`Dependency "${depName}" is not registered`)
        continue
      }

      const dependency = registry.get(depName)!
      
      // Check dependency version compatibility
      if (dependency.compatibility && plugin.compatibility) {
        if (!this.isCompatible(dependency.compatibility, plugin.compatibility)) {
          warnings.push(`Potential compatibility issue with dependency "${depName}"`)
        }
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    const checkCircular = (name: string): boolean => {
      if (visiting.has(name)) return true
      if (visited.has(name)) return false
      
      visiting.add(name)
      
      const current = registry.get(name)
      if (current?.dependencies) {
        for (const depName of current.dependencies) {
          if (checkCircular(depName)) {
            errors.push(`Circular dependency detected: ${name} -> ${depName}`)
            return true
          }
        }
      }
      
      visiting.delete(name)
      visited.add(name)
      return false
    }

    checkCircular(plugin.name)

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate plugin compatibility with PatroCMS version
   */
  validateCompatibility(plugin: Plugin, patrocmsVersion: string): PluginValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!plugin.compatibility) {
      warnings.push('Plugin does not specify compatibility version')
      return { valid: true, errors, warnings }
    }

    try {
      if (!semver.satisfies(patrocmsVersion, plugin.compatibility)) {
        errors.push(`Plugin requires PatroCMS ${plugin.compatibility}, but current version is ${patrocmsVersion}`)
      }
    } catch (error) {
      errors.push(`Invalid compatibility version format: ${plugin.compatibility}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Check if two version ranges are compatible
   */
  private isCompatible(version1: string, version2: string): boolean {
    try {
      // Simple compatibility check - can be enhanced
      return semver.intersects(version1, version2)
    } catch {
      return false
    }
  }

  /**
   * Validate plugin security constraints
   */
  validateSecurity(plugin: Plugin): PluginValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Check for potentially dangerous patterns
    const pluginCode = JSON.stringify(plugin)
    
    // Check for eval or Function constructor usage
    if (pluginCode.includes('eval(') || pluginCode.includes('Function(')) {
      errors.push('Plugin contains potentially dangerous code execution patterns')
    }

    // Check for file system access attempts
    if (pluginCode.includes('fs.') || pluginCode.includes('require(')) {
      warnings.push('Plugin may attempt file system access (not available in Cloudflare Workers)')
    }

    // Check for network access patterns
    if (pluginCode.includes('fetch(') || pluginCode.includes('XMLHttpRequest')) {
      warnings.push('Plugin contains network access code - ensure it follows security guidelines')
    }

    // Check for sensitive data patterns
    const sensitivePatterns = ['password', 'secret', 'key', 'token', 'credential']
    for (const pattern of sensitivePatterns) {
      if (pluginCode.toLowerCase().includes(pattern)) {
        warnings.push(`Plugin code contains "${pattern}" - ensure sensitive data is properly handled`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }
}