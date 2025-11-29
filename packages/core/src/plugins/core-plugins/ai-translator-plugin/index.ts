/**
 * AI Translator Plugin - Pure Effect TS Implementation
 *
 * AI-driven automatic content translation using Cloudflare Workers AI
 * Implements Phase 3 of the Content Localization Strategy
 */

import { Hono } from 'hono'
import { Effect, pipe, Schema } from 'effect'
import { PluginBuilder } from '../../sdk/plugin-builder'
import type { Plugin } from '@patro-io/cms'
import {
  AiTranslationService,
  makeAiTranslationServiceLayerMock,
  makeAiTranslationServiceLayerCloudflare,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  type LanguageCode,
  type ContentTranslationInput
} from './ai-translation-service'
import {
  AiTranslatorSettingsSchema,
  DEFAULT_SETTINGS,
  type AiTranslatorSettings
} from './settings-schema'
import {
  DatabaseService,
  makeDatabaseService,
  DatabaseError
} from '../../../services/database-effect'

export type { AiTranslatorSettings }

/**
 * Parses and validates settings using Effect Schema.
 * Automatically handles defaults and fallback logic for empty arrays.
 */
export const parseSettings = (input: unknown): AiTranslatorSettings => {
  return Schema.decodeUnknownSync(AiTranslatorSettingsSchema)(input)
}

/**
 * @deprecated Use parseSettings instead. Kept for backward compatibility during migration.
 */
export const mergeSettings = (userSettings: unknown): AiTranslatorSettings => {
  return parseSettings(userSettings)
}

/**
 * Získá dostupné lokality z nastavení
 */
const getAvailableLocales = (db: DatabaseService): Effect.Effect<LanguageCode[], never, never> =>
  pipe(
    db.query<{ value: string }>(`
      SELECT value FROM settings
      WHERE category = 'general' AND key = 'availableLocales'
    `),
    Effect.map((results) => {
      if (results.length > 0) {
        const value = results[0]?.value
        if (value) {
          try {
            const locales = JSON.parse(value)
            return Array.isArray(locales) ? locales : SUPPORTED_LANGUAGES
          } catch {
            return SUPPORTED_LANGUAGES
          }
        }
      }
      return SUPPORTED_LANGUAGES
    }),
    Effect.catchAll(() => Effect.succeed(SUPPORTED_LANGUAGES))
  )

/**
 * Generuje UUID
 */
const generateUUID = (): string => crypto.randomUUID()

/**
 * Vytvoří záznamy přeloženého obsahu
 */
const createTranslatedContent = (
  db: DatabaseService,
  originalContent: any,
  translatedContents: Array<{ language: LanguageCode; data: Record<string, unknown> }>,
  translationGroupId: string
): Effect.Effect<void, DatabaseError, never> =>
  Effect.gen(function* (_) {
    for (const translated of translatedContents) {
      const contentId = generateUUID()
      const now = Date.now()
      const slug = `${originalContent.slug}-${translated.language}`
      
      // Získá title z přeložených dat
      const title = (translated.data as any).title || originalContent.title || 'Untitled'
      
      yield* db.execute(
        `INSERT INTO content (
          id, collection_id, slug, title, data, status, author_id,
          created_at, updated_at, translation_group_id, translation_source, language
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contentId,
          originalContent.collection_id,
          slug,
          title,
          JSON.stringify(translated.data),
          'draft', // AI překlady začínají jako draft
          originalContent.author_id,
          now,
          now,
          translationGroupId,
          'ai',
          translated.language
        ]
      )
    }
  })

/**
 * Zpracuje překlad obsahu
 * 
 * Tato funkce řeší hlavní logiku překladu obsahu pomocí AI služeb.
 * Používá se jak v background hoocích, tak při ručním spuštění.
 */
export const processContentTranslation = (
  db: DatabaseService,
  ai: any | null,
  contentId: string,
  settings: AiTranslatorSettings,
  targetLanguage?: LanguageCode
): Effect.Effect<void, never, never> =>
  Effect.gen(function* (_) {
    yield* Effect.log(`Starting processContentTranslation for content ${contentId}`)
    
    // Získá obsah
    const contentResults = yield* pipe(
      db.query<any>(`SELECT * FROM content WHERE id = ?`, [contentId]),
      Effect.catchAll((err) =>
        pipe(
          Effect.logError(`Failed to fetch content: ${err}`),
          Effect.andThen(Effect.succeed([]))
        )
      )
    )
    
    const content = contentResults[0]
    if (!content) {
      yield* Effect.logWarning(`Content not found: ${contentId}`)
      return
    }
    
    // Parsuje data obsahu
    let contentData = content.data
    if (typeof contentData === 'string') {
      try {
        contentData = JSON.parse(contentData)
      } catch {
        contentData = {}
      }
    }
    
    // Získá nebo vytvoří translation group ID
    let translationGroupId = content.translation_group_id
    const isNewGroup = !translationGroupId
    
    if (isNewGroup) {
      translationGroupId = generateUUID()
      yield* Effect.log(`Assigning new translation group ID: ${translationGroupId} to content: ${contentId}`)
      
      // Určí zdrojový jazyk před aktualizací
      const sourceLanguage = (content.language || settings.defaultSourceLanguage) as LanguageCode
      
      // Aktualizuje původní obsah s translation group ID a language
      yield* pipe(
        db.execute(
          `UPDATE content
           SET translation_group_id = ?,
               language = ?,
               translation_source = COALESCE(translation_source, 'manual')
           WHERE id = ?`,
          [translationGroupId, sourceLanguage, contentId]
        ),
        Effect.catchAll((err) =>
          pipe(
            Effect.logError(`Failed to update translation group: ${err}`),
            Effect.andThen(Effect.succeed(undefined))
          )
        )
      )
    } else {
      // I když už má translation group, zkontroluj a aktualizuj language pole pokud chybí
      if (!content.language) {
        const sourceLanguage = settings.defaultSourceLanguage as LanguageCode
        yield* Effect.log(`Content missing language field, setting to: ${sourceLanguage}`)
        
        yield* pipe(
          db.execute(
            `UPDATE content SET language = ? WHERE id = ?`,
            [sourceLanguage, contentId]
          ),
          Effect.catchAll((err) =>
            pipe(
              Effect.logError(`Failed to update language field: ${err}`),
              Effect.andThen(Effect.succeed(undefined))
            )
          )
        )
      }
    }
    
    // Získá dostupné lokality
    const availableLocales = yield* getAvailableLocales(db)
    
    // Určí zdrojový jazyk (nyní by měl být vždy nastaven v databázi)
    const sourceLanguage = (content.language || settings.defaultSourceLanguage) as LanguageCode
    
    // ✅ WARN: Pokud se používá fallback, je to problém
    if (!content.language) {
      yield* Effect.logWarning(`⚠️  Content ${contentId} missing language field, using fallback: ${settings.defaultSourceLanguage}`)
      console.warn(`[AI Translator] ⚠️  Content missing language field! Using fallback. This may cause incorrect translation direction.`, {
        contentId,
        fallbackTo: settings.defaultSourceLanguage,
        shouldBe: 'set explicitly in database'
      })
    }
    
    // Určí cílové jazyky
    let targetLanguages: LanguageCode[] = []
    
    if (targetLanguage) {
      yield* Effect.log(`Target language requested: ${targetLanguage}`)
      
      // Ruční trigger pro konkrétní jazyk
      if (targetLanguage === sourceLanguage) {
        yield* Effect.logWarning(`Target language ${targetLanguage} is same as source language`)
        return
      }
      
      // Zkontroluje, zda již překlad pro tento cílový jazyk existuje
      const existingTranslation = yield* pipe(
        db.queryFirst<{ id: string; status: string; translation_source: string; data: string }>(
          `SELECT id, status, translation_source, data FROM content WHERE translation_group_id = ? AND language = ?`,
          [translationGroupId, targetLanguage]
        ),
        Effect.catchAll(() => Effect.succeed(null))
      )
      
      if (existingTranslation) {
        yield* Effect.log(`Translation record exists: ${existingTranslation.id}, status: ${existingTranslation.status}`)
      }
      
      targetLanguages = [targetLanguage]
    } else {
      // Automatický překlad pro chybějící jazyky
      
      // Filtruje configured target languages podle available locales
      // Pouze jazyky, které jsou v nastavení A zároveň dostupné v systému
      const candidateTargetLanguages = settings.targetLanguages.filter(
        (lang) => availableLocales.includes(lang) && lang !== sourceLanguage
      ) as LanguageCode[]
      
      // Najde chybějící nebo draft překlady
      const existingTranslations = yield* pipe(
        db.query<{ language: string; status: string; translation_source: string }>(
          `SELECT language, status, translation_source FROM content WHERE translation_group_id = ?`,
          [translationGroupId]
        ),
        Effect.catchAll(() => Effect.succeed([]))
      )
      
      const existingLanguages = new Set(existingTranslations.map((r) => r.language))
      
      // ✅ OPRAVA: Překládat i existující drafty (které byly vytvořeny s placeholder daty)
      // Filtrujeme jen finální (published) překlady a source language
      const finalizedLanguages = new Set(
        existingTranslations
          .filter(r => r.status !== 'draft' || r.translation_source === 'manual')
          .map(r => r.language)
      )
      
      targetLanguages = candidateTargetLanguages.filter(
        (lang) => !finalizedLanguages.has(lang) && lang !== sourceLanguage
      ) as LanguageCode[]
      
      // Log pro debugging
      if (targetLanguages.length === 0 && candidateTargetLanguages.length > 0) {
        yield* Effect.log(`All candidate languages already have finalized translations`, {
          candidates: candidateTargetLanguages,
          existing: Array.from(existingLanguages),
          finalized: Array.from(finalizedLanguages)
        })
      }
    }

    if (targetLanguages.length === 0) {
      yield* Effect.logInfo(`No target languages to translate for content ${contentId}`)
      return
    }
    
    yield* Effect.logInfo(`Translating content ${contentId} to: ${targetLanguages.join(', ')}`)
    
    // Vytvoří translation service layer
    const translationLayer = ai
      ? makeAiTranslationServiceLayerCloudflare(ai)
      : makeAiTranslationServiceLayerMock()
    
    // Připraví vstup pro překlad
    const translationInput: ContentTranslationInput = {
      contentId,
      collectionId: content.collection_id,
      data: contentData,
      sourceLanguage,
      targetLanguages,
      translatableFields: [...settings.translatableFields]
    }
    
    // Spustí překlad
    const translatedContents = yield* pipe(
      Effect.gen(function* (_) {
        const translationService = yield* AiTranslationService
        return yield* translationService.translateContent(translationInput)
      }),
      Effect.provide(translationLayer),
      Effect.catchAll((error) =>
        pipe(
          Effect.logError(`Translation failed for content ${contentId}: ${error}`),
          Effect.andThen(Effect.succeed([]))
        )
      )
    )
    
    if (translatedContents.length > 0) {
      yield* Effect.log(`Saving ${translatedContents.length} translations...`)
      
      // Musí řešit jak INSERT (nový), tak UPDATE (existující draft)
      for (const translated of translatedContents) {
        // Zkontroluje, zda záznam existuje
        const existingRecord = yield* pipe(
          db.queryFirst<{ id: string }>(
            `SELECT id FROM content WHERE translation_group_id = ? AND language = ?`,
            [translationGroupId, translated.language]
          ),
          Effect.catchAll(() => Effect.succeed(null))
        )

        if (existingRecord) {
          yield* Effect.log(`Updating existing record ${existingRecord.id} for language ${translated.language}`)
          
          // Aktualizuje existující záznam
          yield* pipe(
            db.execute(
              `UPDATE content
               SET data = ?,
                   title = ?,
                   updated_at = ?,
                   translation_source = 'ai'
               WHERE id = ?`,
              [
                JSON.stringify(translated.data),
                (translated.data as any).title || content.title || 'Untitled',
                Date.now(),
                existingRecord.id
              ]
            ),
            Effect.catchAll((err) =>
              pipe(
                Effect.logError(`Failed to update content ${existingRecord.id}: ${err}`),
                Effect.andThen(Effect.succeed(undefined))
              )
            )
          )
        } else {
          yield* Effect.log(`Creating new record for language ${translated.language}`)
          
          // Vytvoří nový záznam
          yield* pipe(
            createTranslatedContent(db, content, [translated], translationGroupId),
            Effect.catchAll((err) =>
              pipe(
                Effect.logError(`Failed to save new translated content: ${err}`),
                Effect.andThen(Effect.succeed(undefined))
              )
            )
          )
        }
      }
      
      yield* Effect.logInfo(`Processed ${translatedContents.length} translations for content ${contentId}`)
    } else {
      yield* Effect.log(`No content translated (empty result from service)`)
    }
  })

export function createAiTranslatorPlugin(): Plugin {
  const builder = PluginBuilder.create({
    name: 'ai-translator',
    version: '1.0.0-beta.1',
    description: 'AI-driven automatic content translation using Cloudflare Workers AI'
  })

  // Přidá metadata pluginu
  builder.metadata({
    author: {
      name: 'Patro',
      email: 'team@patro.io',
      url: 'https://patro.io'
    },
    license: 'MIT',
    compatibility: '^2.0.0'
  })

  // Vytvoří admin routes
  const adminRoutes = new Hono()

  // POST endpoint pro ukládání nastavení
  adminRoutes.post('/settings', (c: any) => {
    const db = c.env.DB as D1Database
    const dbService = makeDatabaseService(db)

    const program = Effect.gen(function* (_) {
      const body = yield* Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => error as unknown
      })

      // ✅ FIX: Validate and merge settings using Schema
      // This ensures type safety and proper default handling
      const mergedSettings = yield* Schema.decodeUnknown(AiTranslatorSettingsSchema)(body)

      yield* dbService.execute(
        `UPDATE plugins
         SET settings = ?,
             updated_at = unixepoch()
         WHERE id = 'ai-translator'`,
        [JSON.stringify(mergedSettings)]
      )

      return { success: true as const }
    })

    return Effect.runPromise(
      pipe(
        program,
        Effect.catchAll((error) =>
          pipe(
            Effect.logError(`Error saving AI translator settings: ${error}`),
            Effect.andThen(Effect.succeed({ success: false as const, error: 'Failed to save settings' }))
          )
        )
      )
    ).then((result) => {
      const status = result.success ? 200 : 500
      return c.json(result, status)
    })
  })

  // POST endpoint pro testovací překlad
  adminRoutes.post('/test', (c: any) => {
    // Použije mock translation service pro testování
    const translationLayer = makeAiTranslationServiceLayerMock()

    const program = Effect.gen(function* (_) {
      const body = yield* pipe(
        Effect.tryPromise(() => c.req.json() as Promise<{ text?: string }>),
        Effect.catchAll(() => Effect.succeed<{ text?: string }>({}))
      )

      const text = typeof body.text === 'string' ? body.text : undefined

      if (!text) {
        return { _tag: 'validationError' as const, error: 'Text is required' }
      }

      const translations = yield* pipe(
        Effect.gen(function* (_) {
          const translationService = yield* AiTranslationService
          const resultTranslations: Record<string, string> = {}

          for (const targetLang of ['en', 'de', 'fr'] as LanguageCode[]) {
            const result = yield* translationService.translateText({
              text,
              sourceLanguage: 'en',
              targetLanguage: targetLang
            })
            
            resultTranslations[targetLang] = result.translatedText
          }

          return resultTranslations
        }),
        Effect.provide(translationLayer),
        Effect.catchAll((error) =>
          pipe(
            Effect.logError(`Test translation failed: ${error}`),
            Effect.andThen(Effect.succeed<Record<string, string>>({}))
          )
        )
      )

      return { _tag: 'ok' as const, translations }
    })

    return Effect.runPromise(program).then((result) => {
      if (result._tag === 'validationError') {
        return c.json({ error: result.error }, 400)
      }

      if (result._tag === 'ok') {
        return c.json({ success: true, translations: result.translations })
      }

      return c.json({ error: 'Translation failed' }, 500)
    })
  })

  // POST endpoint pro ruční trigger překladu
  adminRoutes.post('/trigger', (c: any) => {
    const db = c.env.DB as D1Database
    const ai = c.env.AI
    const dbService = makeDatabaseService(db)
    const user = c.get('user')
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const program = Effect.gen(function* (_) {
      const body = yield* pipe(
        Effect.tryPromise(() => c.req.json() as Promise<{ contentId: string, targetLanguage?: LanguageCode }>),
        Effect.catchAll(() => Effect.succeed<{ contentId?: string, targetLanguage?: LanguageCode }>({}))
      )

      if (!body.contentId) {
        return { success: false, error: 'Content ID is required' }
      }

      // Získá nastavení
      const results = yield* dbService.query<{ settings: string | null }>(
        `SELECT settings FROM plugins WHERE id = ?`,
        ['ai-translator']
      )

      const plugin = results[0] ?? null

      const settings: AiTranslatorSettings = plugin?.settings
        ? parseSettings(JSON.parse(plugin.settings))
        : DEFAULT_SETTINGS

      if (!settings.enabled) {
        return { success: false, error: 'AI Translator is disabled' }
      }

      yield* Effect.log(`Manual trigger for content: ${body.contentId}, Target: ${body.targetLanguage || 'all'}`)

      // Zpracuje překlad na pozadí
      const translationPromise = Effect.runPromise(
        processContentTranslation(dbService, ai, body.contentId, settings, body.targetLanguage)
      ).catch((err: unknown) => {
        console.error('[AI Translator] Manual translation failed:', err)
      })

      // Použije waitUntil pro udržení workeru naživu
      const waitUntil = c.executionCtx?.waitUntil
      if (waitUntil && typeof waitUntil === 'function') {
        waitUntil(translationPromise)
      } else {
        yield* Effect.logWarning('No waitUntil found - translation might be interrupted')
      }
      
      return { success: true, message: 'Translation triggered' }
    })

    return Effect.runPromise(program).then((result) => {
      if (!result.success) {
        return c.json(result, 400)
      }
      return c.json(result, 200)
    })
  })

  // Registruje route
  builder.addRoute('/admin/plugins/ai-translator', adminRoutes, {
    description: 'AI Translator plugin settings',
    requiresAuth: true,
    priority: 86
  })

  // Přidá položku menu
  builder.addMenuItem('AI Translator', '/admin/plugins/ai-translator', {
    icon: 'language',
    order: 86,
    permissions: ['ai-translator:manage']
  })

  // Přidá content hooky pro automatický překlad
  builder.addHook('content:create', (data: any, context: any) => {
    const d1Db = context?.context?.db as D1Database | undefined
    const ai = context?.context?.ai
    
    if (!d1Db) {
      return data
    }
    
    if (!data?.id) {
      return data
    }

    const program = Effect.gen(function* (_) {
      yield* Effect.log('Hook content:create TRIGGERED', {
        collection: data?.collection_id || data?.collection,
        id: data?.id,
        hasContext: !!context,
        hasDb: !!d1Db,
        hasAi: !!ai
      })

      if (!ai) {
        yield* Effect.logInfo('AI binding not available in content:create hook, using mock translation service')
      }

      // Získá nastavení pluginu
      const pluginResult = yield* Effect.tryPromise({
        try: () => d1Db.prepare(`
          SELECT settings, status FROM plugins WHERE id = 'ai-translator'
        `).first<{ settings: string | null; status: string } | null>(),
        catch: (error) => error as unknown
      })

      if (!pluginResult) {
        yield* Effect.log('Plugin not found in database')
        return data
      }

      if (pluginResult.status !== 'active') {
        yield* Effect.log('Plugin status is not active:', pluginResult.status)
        return data
      }

      const settings: AiTranslatorSettings = pluginResult.settings
        ? parseSettings(JSON.parse(pluginResult.settings))
        : DEFAULT_SETTINGS

      if (!settings.enabled) {
        yield* Effect.log('Plugin is disabled in settings')
        return data
      }

      if (!settings.translateOnCreate) {
        yield* Effect.log('translateOnCreate is false')
        return data
      }
      
      yield* Effect.log(`Starting background translation for ${data.id}`)
      const dbService = makeDatabaseService(d1Db)

      // Zpracuje překlad na pozadí (fire-and-forget)
      const translationPromise = Effect.runPromise(
        processContentTranslation(dbService, ai, data.id, settings)
      ).catch((err: unknown) => {
        console.error('[AI Translator] Background translation failed:', err)
      })

      // Zajistí, že worker nebude ukončen před dokončením překladu
      const waitUntil = context?.context?.executionCtx?.waitUntil || context?.waitUntil
      if (waitUntil && typeof waitUntil === 'function') {
        yield* Effect.log('Using waitUntil to keep worker alive')
        waitUntil(translationPromise)
      } else {
        yield* Effect.logWarning('No waitUntil found - translation might be interrupted')
      }

      return data
    })

    // Spustí program a vrátí data
    return Effect.runPromise(
      pipe(
        program,
        Effect.catchAll((error) =>
          pipe(
            Effect.logError(`Hook error: ${error}`),
            Effect.andThen(Effect.succeed(data))
          )
        )
      )
    )
  }, { priority: 100, description: 'Triggers AI translation after content creation' })

  builder.addHook('content:update', (data: any, context: any) => {
    const d1Db = context?.context?.db as D1Database | undefined
    const ai = context?.context?.ai
    
    if (!d1Db || !data?.id) {
      return data
    }

    const program = Effect.gen(function* (_) {
      yield* Effect.log('Hook content:update TRIGGERED', {
        collection: data?.collection_id || data?.collection,
        id: data?.id
      })

      if (!ai) {
        yield* Effect.logInfo('AI binding not available in content:update hook, using mock translation service')
      }

      // Získá nastavení pluginu
      const pluginResult = yield* Effect.tryPromise({
        try: () => d1Db.prepare(`
          SELECT settings, status FROM plugins WHERE id = 'ai-translator'
        `).first<{ settings: string | null; status: string } | null>(),
        catch: (error) => error as unknown
      })

      if (!pluginResult || pluginResult.status !== 'active') {
        yield* Effect.log('Plugin not active or not found')
        return data
      }

      const settings: AiTranslatorSettings = pluginResult.settings
        ? parseSettings(JSON.parse(pluginResult.settings))
        : DEFAULT_SETTINGS

      if (!settings.enabled || !settings.translateOnUpdate) {
        yield* Effect.log('Translation disabled or translateOnUpdate is false', { 
          enabled: settings.enabled, 
          translateOnUpdate: settings.translateOnUpdate 
        })
        return data
      }

      yield* Effect.log(`Starting background translation for ${data.id}`)
      const dbService = makeDatabaseService(d1Db)

      // Zpracuje překlad na pozadí (fire-and-forget)
      const translationPromise = Effect.runPromise(
        processContentTranslation(dbService, ai, data.id, settings)
      ).catch((err: unknown) => {
        console.error('[AI Translator] Background translation failed:', err)
      })

      // Zajistí, že worker nebude ukončen před dokončení překladu
      const waitUntil = context?.context?.executionCtx?.waitUntil || context?.waitUntil
      if (waitUntil && typeof waitUntil === 'function') {
        yield* Effect.log('Using waitUntil to keep worker alive')
        waitUntil(translationPromise)
      } else {
        yield* Effect.logWarning('No waitUntil found - translation might be interrupted')
      }

      return data
    })

    // Spustí program a vrátí data
    return Effect.runPromise(
      pipe(
        program,
        Effect.catchAll((error) =>
          pipe(
            Effect.logError(`Hook error: ${error}`),
            Effect.andThen(Effect.succeed(data))
          )
        )
      )
    )
  }, { priority: 100, description: 'Triggers AI translation after content update' })

  // Přidá lifecycle hooky
  builder.lifecycle({
    activate: async (_context) => {
      console.info('✅ AI Translator plugin activated')
    },

    deactivate: async (_context) => {
      console.info('❌ AI Translator plugin deactivated')
    }
  })

  return builder.build() as Plugin
}

// Exportuje instanci pluginu
export const aiTranslatorPlugin = createAiTranslatorPlugin()