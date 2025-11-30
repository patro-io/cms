import { Effect } from 'effect';
import { Hono } from 'hono';
import { recordRequest } from '../utils/metrics';
import { MetricsServiceLive } from '../utils/metrics';
import { runInBackground } from '../utils/waitUntil';

/**
 * Middleware to record incoming requests for real-time metrics.
 */
export const metricsMiddleware = () => {
  return async (c: any, next: any) => {
    const program = recordRequest();
    
    // Run the Effect program on background using Cloudflare Workers waitUntil
    // This ensures the metric recording completes even after response is sent
    runInBackground(
      c,
      program.pipe(
        Effect.provide(MetricsServiceLive),
        Effect.catchAll((error) => {
          console.error("Failed to record metric:", error);
          return Effect.succeed(undefined);
        })
      )
    );
    
    await next();
  };
};
