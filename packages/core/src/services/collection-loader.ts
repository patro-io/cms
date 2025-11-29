/**
 * Collection Loader Service - Pure Effect Implementation
 *
 * Loads collection configuration files from the collections directory.
 * Supports both development (reading from filesystem) and production (bundled).
 */

import { Context, Effect, Layer } from 'effect'
import { CollectionConfig, CollectionConfigModule } from '../types/collection-config'

/**
 * Collection Loader Error types
 */
export class CollectionLoaderError {
  readonly _tag = 'CollectionLoaderError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

export class CollectionValidationError {
  readonly _tag = 'CollectionValidationError'
  constructor(readonly message: string, readonly errors: string[]) {}
}

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Collection Loader Service Interface
 */
export interface CollectionLoaderService {
  /**
   * Register collections from application code
   */
  readonly registerCollections: (
    collections: CollectionConfig[]
  ) => Effect.Effect<void, CollectionValidationError>

  /**
   * Load all collection configurations
   */
  readonly loadCollectionConfigs: () => Effect.Effect<
    CollectionConfig[],
    CollectionLoaderError
  >

  /**
   * Load a specific collection configuration by name
   */
  readonly loadCollectionConfig: (
    name: string
  ) => Effect.Effect<CollectionConfig | null, CollectionLoaderError>

  /**
   * Get list of all available collection config file names
   */
  readonly getAvailableCollectionNames: () => Effect.Effect<
    string[],
    CollectionLoaderError
  >

  /**
   * Validate a collection configuration
   */
  readonly validateCollectionConfig: (
    config: CollectionConfig
  ) => ValidationResult
}

/**
 * Collection Loader Service Tag
 */
export const CollectionLoaderService = Context.GenericTag<CollectionLoaderService>(
  '@services/CollectionLoaderService'
)

/**
 * Global registry for externally registered collections
 * Moved outside factory to ensure singleton behavior across multiple service instances
 */
const registeredCollections: CollectionConfig[] = []

/**
 * Create Collection Loader Service implementation
 */
export const makeCollectionLoaderService = (): CollectionLoaderService => {
  return {
    registerCollections: (collections: CollectionConfig[]) =>
      Effect.gen(function* (_) {
        for (const config of collections) {
          // Validate required fields
          if (!config.name || !config.displayName || !config.schema) {
            return yield* 
              Effect.fail(
                new CollectionValidationError(
                  'Invalid collection config: missing required fields',
                  ['name, displayName, or schema is required']
                )
              )
            
          }

          // Set defaults with backward compatibility
          // If managed is set, use it for both managed and codeManaged for backward compatibility
          const managedValue = config.managed !== undefined ? config.managed : true
          const normalizedConfig: CollectionConfig = {
            ...config,
            managed: managedValue, // Keep for backward compatibility
            codeManaged: config.codeManaged !== undefined ? config.codeManaged : managedValue,
            fieldsEditable: config.fieldsEditable !== undefined ? config.fieldsEditable : true,
            isActive: config.isActive !== undefined ? config.isActive : true
          }

          registeredCollections.push(normalizedConfig)
          console.log(`✓ Registered collection: ${config.name}`)
        }

        return yield* Effect.void
      }),

    loadCollectionConfigs: () =>
      Effect.gen(function* (_) {
        const collections: CollectionConfig[] = [...registeredCollections]

        try {
          // Import all collection files dynamically from core package
          // In production, these will be bundled with the application
          const modules =
            (import.meta as any).glob?.('../collections/*.collection.ts', {
              eager: true
            }) || {}

          for (const [path, module] of Object.entries(modules)) {
            try {
              const configModule = module as CollectionConfigModule

              if (!configModule.default) {
                console.warn(
                  `Collection file ${path} does not export a default config`
                )
                continue
              }

              const config = configModule.default

              // Validate required fields
              if (!config.name || !config.displayName || !config.schema) {
                console.error(
                  `Invalid collection config in ${path}: missing required fields`
                )
                continue
              }

              // Set defaults with backward compatibility
              // If managed is set, use it for both managed and codeManaged for backward compatibility
              const managedValue = config.managed !== undefined ? config.managed : true
              const normalizedConfig: CollectionConfig = {
                ...config,
                managed: managedValue, // Keep for backward compatibility
                codeManaged: config.codeManaged !== undefined ? config.codeManaged : managedValue,
                fieldsEditable: config.fieldsEditable !== undefined ? config.fieldsEditable : true,
                isActive: config.isActive !== undefined ? config.isActive : true
              }

              collections.push(normalizedConfig)
              console.log(`✓ Loaded collection config: ${config.name}`)
            } catch (error) {
              console.error(`Error loading collection from ${path}:`, error)
            }
          }

          console.log(
            `Loaded ${collections.length} total collection configuration(s) (${registeredCollections.length} registered, ${collections.length - registeredCollections.length} from core)`
          )
          return collections
        } catch (error) {
          console.error('Error loading collection configurations:', error)
          // Return registered collections even if core loading fails
          return collections
        }
      }),

    loadCollectionConfig: (name: string) =>
      Effect.gen(function* (_) {
        try {
          // Dynamic imports are not supported in library builds
          // This should be implemented in the consuming application
          console.warn(
            'loadCollectionConfig requires implementation in consuming application'
          )
          return null
        } catch (error) {
          console.error(`Error loading collection ${name}:`, error)
          return null
        }
      }),

    getAvailableCollectionNames: () =>
      Effect.gen(function* (_) {
        try {
          const modules =
            (import.meta as any).glob?.('../collections/*.collection.ts') || {}
          const names: string[] = []

          for (const path of Object.keys(modules)) {
            // Extract collection name from path
            // e.g., '../collections/blog-posts.collection.ts' -> 'blog-posts'
            const match = path.match(/\/([^/]+)\.collection\.ts$/)
            if (match && match[1]) {
              names.push(match[1])
            }
          }

          return names
        } catch (error) {
          console.error('Error getting collection names:', error)
          return []
        }
      }),

    validateCollectionConfig: (config: CollectionConfig): ValidationResult => {
      const errors: string[] = []

      // Required fields
      if (!config.name) {
        errors.push('Collection name is required')
      } else if (!/^[a-z0-9_]+$/.test(config.name)) {
        errors.push(
          'Collection name must contain only lowercase letters, numbers, and underscores'
        )
      }

      if (!config.displayName) {
        errors.push('Display name is required')
      }

      if (!config.schema) {
        errors.push('Schema is required')
      } else {
        // Validate schema structure
        if (config.schema.type !== 'object') {
          errors.push('Schema type must be "object"')
        }

        if (
          !config.schema.properties ||
          typeof config.schema.properties !== 'object'
        ) {
          errors.push('Schema must have properties')
        }

        // Validate field types
        for (const [fieldName, fieldConfig] of Object.entries(
          config.schema.properties || {}
        )) {
          if (!fieldConfig.type) {
            errors.push(`Field "${fieldName}" is missing type`)
          }

          // Validate reference fields
          if (fieldConfig.type === 'reference' && !fieldConfig.collection) {
            errors.push(
              `Reference field "${fieldName}" is missing collection property`
            )
          }

          // Validate select fields
          if (
            ['select', 'multiselect', 'radio'].includes(fieldConfig.type) &&
            !fieldConfig.enum
          ) {
            errors.push(`Select field "${fieldName}" is missing enum options`)
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors
      }
    }
  }
}

/**
 * Create a Layer for providing CollectionLoaderService
 */
export const makeCollectionLoaderServiceLayer = (): Layer.Layer<CollectionLoaderService> =>
  Layer.succeed(CollectionLoaderService, makeCollectionLoaderService())