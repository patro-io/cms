/**
 * Cache Service
 * Refactored to use Effect-TS for type-safe caching with proper error handling
 * 
 * Provides basic caching functionality for the core package
 * Can be extended with KV or other storage backends
 */

import { Context, Data, Effect, Layer, Option, Ref } from "effect"

/**
 * Cache configuration
 */
export interface CacheConfig {
  readonly ttl: number // Time to live in seconds
  readonly keyPrefix: string
}

/**
 * Cached entry with metadata
 */
export interface CacheEntry<T> {
  readonly value: T
  readonly expires: number
}

/**
 * Cache hit result with metadata
 */
export interface CacheHitResult<T> {
  readonly hit: boolean
  readonly data: T | null
  readonly source: 'memory' | 'expired' | 'none'
  readonly ttl?: number
}

/**
 * Cache error types
 */
export class CacheError extends Data.TaggedError("CacheError")<{
  readonly message: string
  readonly key?: string
  readonly cause?: unknown
}> {}

export class CacheKeyError extends Data.TaggedError("CacheKeyError")<{
  readonly message: string
  readonly key: string
}> {}

/**
 * Cache service operations interface
 */
export interface CacheServiceOps {
  /**
   * Generate cache key with prefix
   */
  readonly generateKey: (type: string, identifier?: string) => Effect.Effect<string>
  
  /**
   * Get value from cache
   */
  readonly get: <T>(key: string) => Effect.Effect<Option.Option<T>, CacheError>
  
  /**
   * Get value from cache with source information
   */
  readonly getWithSource: <T>(key: string) => Effect.Effect<CacheHitResult<T>, CacheError>
  
  /**
   * Set value in cache
   */
  readonly set: <T>(key: string, value: T, ttl?: number) => Effect.Effect<void, CacheError>
  
  /**
   * Delete specific key from cache
   */
  readonly delete: (key: string) => Effect.Effect<void, CacheError>
  
  /**
   * Invalidate cache keys matching a pattern
   */
  readonly invalidate: (pattern: string) => Effect.Effect<number, CacheError>
  
  /**
   * Clear all cache
   */
  readonly clear: () => Effect.Effect<void, CacheError>
  
  /**
   * Get value from cache or set it using a callback
   */
  readonly getOrSet: <T, E, R = never>(
    key: string,
    callback: () => Effect.Effect<T, E, R>,
    ttl?: number
  ) => Effect.Effect<T, E | CacheError, R>
}

/**
 * Cache service tag for dependency injection
 */
export class CacheService extends Context.Tag("CacheService")<
  CacheService,
  CacheServiceOps
>() {}

/**
 * Create cache service implementation
 */
const makeCacheService = (config: CacheConfig): Effect.Effect<CacheServiceOps> =>
  Ref.make<Map<string, CacheEntry<unknown>>>(new Map()).pipe(
    Effect.map((cacheRef) => {
      /**
       * Generate cache key with prefix
       */
      const generateKey = (type: string, identifier?: string): Effect.Effect<string> =>
        Effect.sync(() => {
          const parts = [config.keyPrefix, type]
          if (identifier) {
            parts.push(identifier)
          }
          return parts.join(':')
        })
      
      /**
       * Check if entry is expired
       */
      const isExpired = (entry: CacheEntry<unknown>): boolean =>
        Date.now() > entry.expires
      
      /**
       * Cleanup expired entries
       */
      const cleanupExpired = (): Effect.Effect<void> =>
        Ref.update(cacheRef, (cache) => {
          const now = Date.now()
          const newCache = new Map(cache)
          
          for (const [key, entry] of Array.from(newCache.entries())) {
            if (now > entry.expires) {
              newCache.delete(key)
            }
          }
          
          return newCache
        })
      
      /**
       * Get value from cache
       */
      const get = <T>(key: string): Effect.Effect<Option.Option<T>, CacheError> =>
        Ref.get(cacheRef).pipe(
          Effect.flatMap((cache) => {
            const entry = cache.get(key) as CacheEntry<T> | undefined
            
            if (!entry) {
              return Effect.succeed(Option.none())
            }
            
            if (isExpired(entry)) {
              return Ref.update(cacheRef, (c) => {
                const newCache = new Map(c)
                newCache.delete(key)
                return newCache
              }).pipe(
                Effect.map(() => Option.none())
              )
            }
            
            return Effect.succeed(Option.some(entry.value))
          }),
          Effect.catchAll((error) =>
            Effect.fail(new CacheError({
              message: "Failed to get value from cache",
              key,
              cause: error
            }))
          )
        )
      
      /**
       * Get value from cache with source information
       */
      const getWithSource = <T>(key: string): Effect.Effect<CacheHitResult<T>, CacheError> =>
        Ref.get(cacheRef).pipe(
          Effect.map((cache) => {
            const entry = cache.get(key) as CacheEntry<T> | undefined
            
            if (!entry) {
              return {
                hit: false,
                data: null,
                source: 'none' as const
              }
            }
            
            const now = Date.now()
            if (now > entry.expires) {
              return {
                hit: false,
                data: null,
                source: 'expired' as const
              }
            }
            
            return {
              hit: true,
              data: entry.value,
              source: 'memory' as const,
              ttl: (entry.expires - now) / 1000
            }
          }),
          Effect.tap((result) => {
            if (result.source === 'expired') {
              return Ref.update(cacheRef, (c) => {
                const newCache = new Map(c)
                newCache.delete(key)
                return newCache
              })
            }
            return Effect.void
          }),
          Effect.catchAll((error) =>
            Effect.fail(new CacheError({
              message: "Failed to get value with source from cache",
              key,
              cause: error
            }))
          )
        )
      
      /**
       * Set value in cache
       */
      const set = <T>(key: string, value: T, ttl?: number): Effect.Effect<void, CacheError> =>
        Effect.try({
          try: () => {
            const expires = Date.now() + ((ttl || config.ttl) * 1000)
            return { value, expires }
          },
          catch: (error) => new CacheError({
            message: "Failed to prepare cache entry",
            key,
            cause: error
          })
        }).pipe(
          Effect.flatMap((entry) =>
            Ref.update(cacheRef, (cache) => {
              const newCache = new Map(cache)
              newCache.set(key, entry as CacheEntry<unknown>)
              return newCache
            })
          ),
          Effect.catchAll((error) =>
            Effect.fail(error instanceof CacheError ? error : new CacheError({
              message: "Failed to set value in cache",
              key,
              cause: error
            }))
          )
        )
      
      /**
       * Delete specific key from cache
       */
      const deleteKey = (key: string): Effect.Effect<void, CacheError> =>
        Ref.update(cacheRef, (cache) => {
          const newCache = new Map(cache)
          newCache.delete(key)
          return newCache
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(new CacheError({
              message: "Failed to delete key from cache",
              key,
              cause: error
            }))
          )
        )
      
      /**
       * Invalidate cache keys matching a pattern
       */
      const invalidate = (pattern: string): Effect.Effect<number, CacheError> =>
        Effect.try({
          try: () => {
            const regexPattern = pattern
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.')
            return new RegExp(`^${regexPattern}$`)
          },
          catch: (error) => new CacheError({
            message: "Invalid pattern for cache invalidation",
            cause: error
          })
        }).pipe(
          Effect.flatMap((regex) =>
            Ref.modify(cacheRef, (cache) => {
              const newCache = new Map(cache)
              let deletedCount = 0
              
              for (const key of Array.from(newCache.keys())) {
                if (regex.test(key)) {
                  newCache.delete(key)
                  deletedCount++
                }
              }
              
              return [deletedCount, newCache]
            })
          ),
          Effect.catchAll((error) =>
            Effect.fail(error instanceof CacheError ? error : new CacheError({
              message: "Failed to invalidate cache keys",
              cause: error
            }))
          )
        )
      
      /**
       * Clear all cache
       */
      const clear = (): Effect.Effect<void, CacheError> =>
        Ref.set(cacheRef, new Map()).pipe(
          Effect.catchAll((error) =>
            Effect.fail(new CacheError({
              message: "Failed to clear cache",
              cause: error
            }))
          )
        )
      
      /**
       * Get value from cache or set it using a callback
       */
      const getOrSet = <T, E, R = never>(
        key: string,
        callback: () => Effect.Effect<T, E, R>,
        ttl?: number
      ): Effect.Effect<T, E | CacheError, R> =>
        get<T>(key).pipe(
          Effect.flatMap((cached) =>
            Option.match(cached, {
              onNone: () =>
                callback().pipe(
                  Effect.flatMap((value) =>
                    set(key, value, ttl).pipe(
                      Effect.map(() => value)
                    )
                  )
                ),
              onSome: (value) => Effect.succeed(value)
            })
          )
        )
      
      return {
        generateKey,
        get,
        getWithSource,
        set,
        delete: deleteKey,
        invalidate,
        clear,
        getOrSet
      }
    })
  )

/**
 * Cache configurations for different data types
 */
export const CACHE_CONFIGS = {
  api: {
    ttl: 300, // 5 minutes
    keyPrefix: 'api'
  },
  user: {
    ttl: 600, // 10 minutes
    keyPrefix: 'user'
  },
  content: {
    ttl: 300, // 5 minutes
    keyPrefix: 'content'
  },
  collection: {
    ttl: 600, // 10 minutes
    keyPrefix: 'collection'
  }
} as const

/**
 * Create cache service layer with specific configuration
 */
export const makeCacheServiceLayer = (config: CacheConfig): Layer.Layer<CacheService> =>
  Layer.effect(CacheService, makeCacheService(config))

/**
 * Default cache service layer (API cache)
 */
export const CacheServiceLive: Layer.Layer<CacheService> =
  makeCacheServiceLayer(CACHE_CONFIGS.api)

/**
 * Convenience functions for using cache service
 */

export const generateKey = (type: string, identifier?: string): Effect.Effect<string, never, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.generateKey(type, identifier))
  )

export const get = <T>(key: string): Effect.Effect<Option.Option<T>, CacheError, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.get<T>(key))
  )

export const getWithSource = <T>(key: string): Effect.Effect<CacheHitResult<T>, CacheError, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.getWithSource<T>(key))
  )

export const set = <T>(key: string, value: T, ttl?: number): Effect.Effect<void, CacheError, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.set(key, value, ttl))
  )

export const deleteKey = (key: string): Effect.Effect<void, CacheError, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.delete(key))
  )

export const invalidate = (pattern: string): Effect.Effect<number, CacheError, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.invalidate(pattern))
  )

export const clear = (): Effect.Effect<void, CacheError, CacheService> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.clear())
  )

export const getOrSet = <T, E, R = never>(
  key: string,
  callback: () => Effect.Effect<T, E, R>,
  ttl?: number
): Effect.Effect<T, E | CacheError, CacheService | R> =>
  CacheService.pipe(
    Effect.flatMap(cache => cache.getOrSet(key, callback, ttl))
  )

