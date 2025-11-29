/**
 * Simple in-memory metrics tracker for real-time analytics
 * Refactored to use Effect-TS for type-safe state management
 */

import { Context, Effect, Layer, Ref } from "effect"

/**
 * Request metric entry
 */
export interface RequestMetrics {
  readonly timestamp: number
}

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  readonly windowSize: number // Window size in milliseconds
}

/**
 * Metrics service operations
 */
export interface MetricsServiceOps {
  /**
   * Record a new request
   */
  readonly recordRequest: () => Effect.Effect<void>
  
  /**
   * Get current requests per second
   */
  readonly getRequestsPerSecond: () => Effect.Effect<number>
  
  /**
   * Get total requests in the current window
   */
  readonly getTotalRequests: () => Effect.Effect<number>
  
  /**
   * Get average requests per second over the window
   */
  readonly getAverageRPS: () => Effect.Effect<number>
  
  /**
   * Clear all metrics
   */
  readonly clear: () => Effect.Effect<void>
}

/**
 * Metrics service tag for dependency injection
 */
export class MetricsService extends Context.Tag("MetricsService")<
  MetricsService,
  MetricsServiceOps
>() {}

/**
 * Default metrics configuration
 */
export const defaultMetricsConfig: MetricsConfig = {
  windowSize: 10000 // 10 seconds
}

/**
 * Create metrics service implementation
 */
const makeMetricsService = (config: MetricsConfig): Effect.Effect<MetricsServiceOps> =>
  Ref.make<RequestMetrics[]>([]).pipe(
    Effect.map((requestsRef) => {
      /**
       * Clean up old requests outside the window
       */
      const cleanup = (now: number): Effect.Effect<void> =>
        Ref.update(requestsRef, (requests) => {
          const cutoff = now - config.windowSize
          return requests.filter(req => req.timestamp > cutoff)
        })
      
      /**
       * Record a new request
       */
      const recordRequest = (): Effect.Effect<void> => {
        const now = Date.now()
        return Ref.update(requestsRef, (requests) => 
          [...requests, { timestamp: now }]
        ).pipe(
          Effect.flatMap(() => cleanup(now))
        )
      }
      
      /**
       * Get current requests per second
       */
      const getRequestsPerSecond = (): Effect.Effect<number> => {
        const now = Date.now()
        return cleanup(now).pipe(
          Effect.flatMap(() => Ref.get(requestsRef)),
          Effect.map((requests) => {
            if (requests.length === 0) {
              return 0
            }
            
            // Calculate RPS over the last second
            const oneSecondAgo = now - 1000
            const recentRequests = requests.filter(req => req.timestamp > oneSecondAgo)
            
            return recentRequests.length
          })
        )
      }
      
      /**
       * Get total requests in the current window
       */
      const getTotalRequests = (): Effect.Effect<number> => {
        const now = Date.now()
        return cleanup(now).pipe(
          Effect.flatMap(() => Ref.get(requestsRef)),
          Effect.map((requests) => requests.length)
        )
      }
      
      /**
       * Get average requests per second over the window
       */
      const getAverageRPS = (): Effect.Effect<number> => {
        const now = Date.now()
        return cleanup(now).pipe(
          Effect.flatMap(() => Ref.get(requestsRef)),
          Effect.map((requests) => {
            if (requests.length === 0) {
              return 0
            }
            
            const windowSeconds = config.windowSize / 1000
            return requests.length / windowSeconds
          })
        )
      }
      
      /**
       * Clear all metrics
       */
      const clear = (): Effect.Effect<void> =>
        Ref.set(requestsRef, [])
      
      return {
        recordRequest,
        getRequestsPerSecond,
        getTotalRequests,
        getAverageRPS,
        clear
      }
    })
  )

/**
 * Singleton instance of the metrics service
 * Created once at startup and shared across all requests
 */
const globalMetricsService = Effect.runSync(makeMetricsService(defaultMetricsConfig))

/**
 * Live layer for metrics service using the global singleton
 */
export const MetricsServiceLive: Layer.Layer<MetricsService> =
  Layer.succeed(
    MetricsService,
    globalMetricsService
  )

/**
 * Create a custom metrics service layer with specific configuration
 */
export const makeMetricsServiceLayer = (config: MetricsConfig): Layer.Layer<MetricsService> =>
  Layer.effect(
    MetricsService,
    makeMetricsService(config)
  )

/**
 * Convenience functions for using metrics service
 */

/**
 * Record a request in the metrics system
 */
export const recordRequest = (): Effect.Effect<void, never, MetricsService> =>
  MetricsService.pipe(
    Effect.flatMap(metrics => metrics.recordRequest())
  )

/**
 * Get current requests per second
 */
export const getRequestsPerSecond = (): Effect.Effect<number, never, MetricsService> =>
  MetricsService.pipe(
    Effect.flatMap(metrics => metrics.getRequestsPerSecond())
  )

/**
 * Get total requests in current window
 */
export const getTotalRequests = (): Effect.Effect<number, never, MetricsService> =>
  MetricsService.pipe(
    Effect.flatMap(metrics => metrics.getTotalRequests())
  )

/**
 * Get average RPS over the window
 */
export const getAverageRPS = (): Effect.Effect<number, never, MetricsService> =>
  MetricsService.pipe(
    Effect.flatMap(metrics => metrics.getAverageRPS())
  )

/**
 * Clear all metrics
 */
export const clearMetrics = (): Effect.Effect<void, never, MetricsService> =>
  MetricsService.pipe(
    Effect.flatMap(metrics => metrics.clear())
  )

