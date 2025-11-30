/**
 * Cloudflare Workers waitUntil Helper pro Effect TS
 * 
 * Tento helper zajišťuje, že fire-and-forget Effect programy dokončí
 * svou práci i po odeslání HTTP odpovědi v Cloudflare Workers prostředí.
 * 
 * **Proč je to důležité:**
 * - Cloudflare Workers ukončují procesy hned po odeslání HTTP odpovědi
 * - Effect.runFork může být přerušen uprostřed práce
 * - ExecutionContext.waitUntil() říká Workers runtime, že má čekat na dokončení Promise
 * 
 * **Použití:**
 * ```typescript
 * import { runInBackground } from '../utils/waitUntil'
 * 
 * // V Hono route handleru:
 * const logProgram = Effect.gen(function* (_) {
 *   const logger = yield* LoggerService
 *   yield* logger.info('api', 'User logged in', { userId })
 * })
 * 
 * runInBackground(c, logProgram.pipe(Effect.provide(loggerLayer)))
 * ```
 */

import { Effect } from 'effect'
import type { Context } from 'hono'

/**
 * Spustí Effect program na pozadí s podporou Cloudflare Workers waitUntil
 * 
 * Tato funkce:
 * 1. Převede Effect program na Promise pomocí Effect.runPromise
 * 2. Registruje Promise u Cloudflare Workers ExecutionContext
 * 3. Tiše pohlcuje chyby (loguje je do console.error)
 * 
 * **CRITICAL:** V Cloudflare Workers je NUTNÉ použít executionCtx.waitUntil()
 * pro fire-and-forget operace, jinak mohou být přerušeny po odeslání response.
 * 
 * @param c - Hono Context obsahující executionCtx
 * @param program - Effect program ke spuštění na pozadí
 * 
 * @example
 * ```typescript
 * // Logování na pozadí
 * runInBackground(c, 
 *   logAuthEvent(db, 'User logged in', 'info', { userId })
 * )
 * 
 * // Cache invalidation na pozadí
 * runInBackground(c,
 *   Effect.gen(function* (_) {
 *     const cache = yield* CacheService
 *     yield* cache.invalidate('content:*')
 *   }).pipe(Effect.provide(cacheLayer))
 * )
 * ```
 */
export function runInBackground<A, E>(
  c: Context,
  program: Effect.Effect<A, E, never>
): void {
  // Převedeme Effect program na Promise
  const promise = Effect.runPromise(program).catch((error) => {
    // Tichá chyba - vypíšeme do console, ale neblokujeme request
    console.error('[runInBackground] Background task failed:', error)
  })

  // Try to get executionCtx - it may throw in test environments
  try {
    const execCtx = c.executionCtx
    if (execCtx && typeof execCtx.waitUntil === 'function') {
      execCtx.waitUntil(promise)
      return
    }
  } catch (e) {
    // executionCtx not available (test environment)
    // Just let the promise run without waitUntil
  }
  
  // If we get here, executionCtx wasn't available
  // In production this shouldn't happen, in tests it's expected
}

/**
 * Alternativní verze pro použití mimo Hono context
 * Použijte pouze když máte přímý přístup k ExecutionContext
 * 
 * @param executionCtx - Cloudflare Workers ExecutionContext
 * @param program - Effect program ke spuštění na pozadí
 */
export function runInBackgroundWithContext<A, E>(
  executionCtx: ExecutionContext | undefined,
  program: Effect.Effect<A, E, never>
): void {
  const promise = Effect.runPromise(program).catch((error) => {
    console.error('[runInBackground] Background task failed:', error)
  })

  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(promise)
  } else {
    console.warn('[runInBackground] executionCtx not available')
  }
}