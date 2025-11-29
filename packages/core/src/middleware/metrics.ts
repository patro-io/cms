import { Effect } from 'effect';
import { Hono } from 'hono';
import { recordRequest } from '../utils/metrics';
import { MetricsServiceLive } from '../utils/metrics';

/**
 * Middleware to record incoming requests for real-time metrics.
 */
export const metricsMiddleware = () => {
  return async (c: any, next: any) => {
    const program = recordRequest();
    
    // Run the Effect program, but don't block the request pipeline.
    // We provide the live service layer here.
    Effect.runFork(
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
