/**
 * Custom ConfigProvider pro Cloudflare Workers
 * 
 * Tento provider mapuje ENV variables z Hono Context (c.env)
 * na Effect ConfigProvider.
 * 
 * DŮLEŽITÉ:
 * - Cloudflare bindings (DB, R2, KV) se NEPŘEDÁVAJÍ přes Config!
 * - Pouze string ENV vars se mapují do ConfigProvider
 * 
 * @see docs/effect/ENV_VARIABLES.md
 */

import { ConfigProvider, Layer } from 'effect'
import type { Bindings } from '../app'

/**
 * Vytvoří ConfigProvider pro Cloudflare Workers environment
 * 
 * Tento provider mapuje pouze string ENV variables z c.env.
 * Cloudflare-specific bindings (D1, KV, R2) se předávají
 * přímo do služeb přes dedikované Layer funkce.
 * 
 * @param env - Cloudflare Workers Bindings z Hono contextu
 * @returns ConfigProvider pro string ENV vars
 * 
 * @example
 * ```typescript
 * const provider = makeCloudflareConfigProvider(c.env)
 * const configLayer = ConfigProvider.layer(provider)
 * ```
 */
export function makeCloudflareConfigProvider(
  env: Bindings
): ConfigProvider.ConfigProvider {
  // Vytvoříme Map pouze pro string ENV variables
  const configMap = new Map<string, string>()
  
  // JWT configuration (pro AuthService)
  if ((env as any).JWT_SECRET) {
    configMap.set('JWT_SECRET', (env as any).JWT_SECRET)
  }
  if ((env as any).PASSWORD_SALT) {
    configMap.set('PASSWORD_SALT', (env as any).PASSWORD_SALT)
  }
  if ((env as any).JWT_EXPIRES_IN_HOURS) {
    configMap.set('JWT_EXPIRES_IN_HOURS', String((env as any).JWT_EXPIRES_IN_HOURS))
  }
  
  // Email configuration
  if (env.SENDGRID_API_KEY) {
    configMap.set('SENDGRID_API_KEY', env.SENDGRID_API_KEY)
  }
  if (env.DEFAULT_FROM_EMAIL) {
    configMap.set('DEFAULT_FROM_EMAIL', env.DEFAULT_FROM_EMAIL)
  }
  
  // Cloudflare Images configuration
  if (env.IMAGES_ACCOUNT_ID) {
    configMap.set('IMAGES_ACCOUNT_ID', env.IMAGES_ACCOUNT_ID)
  }
  if (env.IMAGES_API_TOKEN) {
    configMap.set('IMAGES_API_TOKEN', env.IMAGES_API_TOKEN)
  }
  
  // Application configuration
  if (env.ENVIRONMENT) {
    configMap.set('ENVIRONMENT', env.ENVIRONMENT)
  }
  if (env.BUCKET_NAME) {
    configMap.set('BUCKET_NAME', env.BUCKET_NAME)
  }
  
  // Vytvoříme ConfigProvider z Map
  return ConfigProvider.fromMap(configMap)
}

/**
 * Vytvoří Layer pro AppConfig napojený na Cloudflare environment
 * 
 * Tento Layer poskytuje ConfigProvider, který čte ENV variables
 * z Cloudflare Workers environment.
 * 
 * @param env - Cloudflare Workers Bindings z Hono contextu
 * @returns Layer poskytující ConfigProvider
 * 
 * @example
 * ```typescript
 * // V Hono route handleru:
 * const program = Effect.gen(function* () {
 *   const config = yield* FullAppConfig
 *   console.log(config.app.environment)
 * })
 * 
 * await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(makeAppConfigLayer(c.env))
 *   )
 * )
 * ```
 */
export function makeAppConfigLayer(env: Bindings) {
  return Layer.setConfigProvider(makeCloudflareConfigProvider(env))
}

/**
 * Vytvoří mock ConfigProvider pro testy
 * 
 * Umožňuje testovat kód, který používá Config, bez nutnosti
 * mít reálné Cloudflare Workers environment.
 * 
 * @param overrides - Partial mapa ENV vars pro override defaultů
 * @returns ConfigProvider s mock hodnotami
 * 
 * @example
 * ```typescript
 * // V testu:
 * const mockProvider = makeMockConfigProvider({
 *   SENDGRID_API_KEY: 'test-key-123',
 *   ENVIRONMENT: 'test'
 * })
 * 
 * const testLayer = ConfigProvider.layer(mockProvider)
 * 
 * await Effect.runPromise(
 *   program.pipe(Effect.provide(testLayer))
 * )
 * ```
 */
export function makeMockConfigProvider(
  overrides: Partial<Record<string, string>> = {}
): ConfigProvider.ConfigProvider {
  const defaultConfig = new Map<string, string>([
    // JWT defaults
    ['JWT_SECRET', 'test-jwt-secret-do-not-use-in-production'],
    ['PASSWORD_SALT', 'test-salt'],
    ['JWT_EXPIRES_IN_HOURS', '24'],
    
    // Email defaults
    ['SENDGRID_API_KEY', 'mock-sendgrid-key'],
    ['DEFAULT_FROM_EMAIL', 'test@example.com'],
    
    // Images defaults
    ['IMAGES_ACCOUNT_ID', 'mock-account-id'],
    ['IMAGES_API_TOKEN', 'mock-api-token'],
    
    // App defaults
    ['ENVIRONMENT', 'test'],
    ['BUCKET_NAME', 'test-bucket']
  ])
  
  // Aplikujeme overrides
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      defaultConfig.set(key, value)
    }
  }
  
  return ConfigProvider.fromMap(defaultConfig)
}

/**
 * Vytvoří mock Layer pro testy
 * 
 * @param overrides - Partial mapa ENV vars pro override defaultů
 * @returns Layer poskytující mock ConfigProvider
 */
export function makeMockConfigLayer(
  overrides: Partial<Record<string, string>> = {}
) {
  return Layer.setConfigProvider(makeMockConfigProvider(overrides))
}