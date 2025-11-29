import { Context } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { Effect } from 'effect'
import {
  makeI18nService,
  detectLocale,
  mapCountryToLanguage,
  type Locale,
  type TranslateFn,
  type I18nService
} from '../services/i18n'
import { DatabaseService, makeDatabaseLayer } from '../services/database-effect'

/**
 * Extended Context with i18n support
 */
export interface I18nContext {
  locale: Locale
  t: TranslateFn
  i18n: I18nService
}

/**
 * I18n Data loaded from database
 */
interface I18nData {
  userLanguage: string | null
  settingsLanguage: string | null
}

/**
 * Load language preferences from database
 * Pure Effect program
 */
const loadLanguagePreferences = (userId: string): Effect.Effect<I18nData, never, DatabaseService> =>
  Effect.gen(function* (_) {
    const db = yield* DatabaseService
    
    // Get user's language preference
    const userResult = yield* 
      db.queryFirst<{ language: string }>(
        'SELECT language FROM users WHERE id = ?',
        [userId]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll((err) => {
          return Effect.succeed(null)
        })
      )
    
    
    // Get global language setting
    const settingsResult = yield* 
      db.queryFirst<{ value: string }>(
        "SELECT value FROM settings WHERE category = 'general' AND key = 'language'",
        []
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll((err) => {
          return Effect.succeed(null)
        })
      )
    
    
    // Safely parse settings language:
    // - Support both plain values like "en" and JSON-encoded values like "\"en\""
    // - Never throw here, otherwise the whole middleware falls back to Accept-Language
    let settingsLanguage: string | null = null
    if (settingsResult?.value) {
      try {
        const parsed = JSON.parse(settingsResult.value)
        settingsLanguage = typeof parsed === 'string' ? parsed : settingsResult.value
      } catch {
        settingsLanguage = settingsResult.value
      }
    }
    
    // Normalize: empty string means "auto-detect" (null for detection logic)
    const userLang = userResult?.language?.trim() || null
    
    return {
      userLanguage: userLang,
      settingsLanguage
    }
  })

/**
 * I18n Middleware - Pure Effect v3
 *
 * Detects user's preferred language and provides translation function
 * Priority: user.language > settings.language > IP geolocation > Accept-Language header > 'en'
 */
export const i18nMiddleware = (): MiddlewareHandler => {
  return (c: Context, next) => {
    const program = Effect.gen(function* (_) {
      const user = c.get('user') // From auth middleware
      const acceptLanguage = c.req.header('Accept-Language')
      
      // Get country from Cloudflare (available in Workers)
      // c.req.raw.cf is Cloudflare-specific request metadata
      const country = (c.req.raw as any)?.cf?.country as string | undefined
      
      // Default values
      let i18nData: I18nData = {
        userLanguage: null,
        settingsLanguage: null
      }
      
      // Load language preferences from database using Pure Effect
      if (user?.userId && c.env?.DB) {
        i18nData = yield* 
          loadLanguagePreferences(user.userId).pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
            Effect.catchAll((err) => {
              return Effect.succeed({ userLanguage: null, settingsLanguage: null })
            })
          )
        
      }
      
      // Detect locale based on priority (now includes IP geolocation)
      const locale = detectLocale(
        i18nData.userLanguage,
        i18nData.settingsLanguage,
        acceptLanguage,
        country
      )
      
      // Create i18n service instance for this request
      const i18n = makeI18nService(locale)
      
      // Add to context
      c.set('locale', locale)
      c.set('t', i18n.t)
      c.set('i18n', i18n)
      
      // Continue middleware chain using Effect.promise
      return yield* Effect.tryPromise({
        try: () => next(),
        catch: (error) => new Error(`Middleware chain failed: ${error}`)
      })
    })
    
    // Construct layer if DB is available
    if (!c.env?.DB) {
      // No DB - just use defaults and continue
      const country = (c.req.raw as any)?.cf?.country as string | undefined
      const locale = detectLocale(null, null, c.req.header('Accept-Language'), country)
      const i18n = makeI18nService(locale)
      c.set('locale', locale)
      c.set('t', i18n.t)
      c.set('i18n', i18n)
      return next()
    }
    
    const dbLayer = makeDatabaseLayer(c.env.DB)
    
    // Run program with Pure Effect
    return Effect.runPromise(
      program.pipe(
        Effect.provide(dbLayer),
        Effect.catchAll((error) => {
          // Fallback to Accept-Language and IP on error
          const country = (c.req.raw as any)?.cf?.country as string | undefined
          const locale = detectLocale(null, null, c.req.header('Accept-Language'), country)
          const i18n = makeI18nService(locale)
          c.set('locale', locale)
          c.set('t', i18n.t)
          c.set('i18n', i18n)
          return Effect.tryPromise({
            try: () => next(),
            catch: (error) => new Error(`Middleware chain failed: ${error}`)
          })
        })
      )
    )
  }
}

/**
 * Get translation function from context
 */
export const getTranslate = (c: Context): TranslateFn => {
  const t = c.get('t')
  if (!t) {
    console.warn('Translation function not found in context. Did you add i18nMiddleware?')
    // Return fallback function that returns the key
    return (key: string) => key
  }
  return t
}

/**
 * Get current locale from context
 */
export const getLocale = (c: Context): Locale => {
  const locale = c.get('locale')
  if (!locale) {
    console.warn('Locale not found in context. Did you add i18nMiddleware?')
    return 'en'
  }
  return locale
}

/**
 * Get i18n service from context
 */
export const getI18nService = (c: Context): I18nService | null => {
  return c.get('i18n') || null
}