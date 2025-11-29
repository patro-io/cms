/**
 * AI Translation Service - Effect TS Implementation
 * 
 * Provides AI-driven translation using Cloudflare Workers AI
 * Currently implements a mock version for local development
 */

import { Context, Effect, Layer, Data } from 'effect'

/**
 * Supported language codes
 */
export type LanguageCode = 'cs' | 'en' | 'de' | 'fr' | 'es' | 'it' | 'pl'

/**
 * Translation request input
 */
export interface TranslationRequest {
  text: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
}

/**
 * Translation result
 */
export interface TranslationResult {
  translatedText: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  confidence?: number
  model: string
}

/**
 * Content translation input (for translating entire content items)
 */
export interface ContentTranslationInput {
  contentId: string
  collectionId: string
  data: Record<string, unknown>
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  translatableFields: string[]
}

/**
 * Translated content result
 */
export interface TranslatedContent {
  language: LanguageCode
  data: Record<string, unknown>
  translationSource: 'ai' | 'manual'
}

/**
 * Cloudflare AI response shape
 */
interface CloudflareTranslationResult {
  translated_text?: string
  confidence?: number
}

/**
 * AI Translation Service Error types
 */
export class TranslationError extends Data.TaggedError('TranslationError')<{
  message: string
  cause?: unknown
}> {}

export class UnsupportedLanguageError extends Data.TaggedError('UnsupportedLanguageError')<{
  language: string
}> {}

export class TranslationQuotaExceededError extends Data.TaggedError('TranslationQuotaExceededError')<{
  message: string
}> {}

/**
 * AI Translation Service Interface
 */
export interface AiTranslationService {
  /**
   * Translate a single text string
   */
  readonly translateText: (
    request: TranslationRequest
  ) => Effect.Effect<TranslationResult, TranslationError | UnsupportedLanguageError>

  /**
   * Translate multiple texts in batch
   */
  readonly translateBatch: (
    requests: TranslationRequest[]
  ) => Effect.Effect<TranslationResult[], TranslationError | UnsupportedLanguageError>

  /**
   * Translate content data for all target languages
   */
  readonly translateContent: (
    input: ContentTranslationInput
  ) => Effect.Effect<TranslatedContent[], TranslationError | UnsupportedLanguageError>

  /**
   * Get list of supported languages
   */
  readonly getSupportedLanguages: () => Effect.Effect<LanguageCode[], never>

  /**
   * Check if a language pair is supported
   */
  readonly isLanguagePairSupported: (
    source: string,
    target: string
  ) => Effect.Effect<boolean, never>
}

/**
 * AI Translation Service Tag for dependency injection
 */
export const AiTranslationService = Context.GenericTag<AiTranslationService>('@services/AiTranslationService')

/**
 * Language names for display
 */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  cs: 'Czech',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pl: 'Polish'
}

/**
 * Supported language codes
 */
export const SUPPORTED_LANGUAGES: LanguageCode[] = ['cs', 'en', 'de', 'fr', 'es', 'it', 'pl']

/**
 * Check if a language code is supported
 */
const isSupported = (lang: string): lang is LanguageCode => {
  return SUPPORTED_LANGUAGES.includes(lang as LanguageCode)
}

/**
 * Mock AI Translation Service Implementation
 * 
 * This implementation simulates AI translation by prefixing text with language code.
 * In production, this would be replaced with actual Cloudflare Workers AI calls.
 */
export const makeAiTranslationServiceMock = (): AiTranslationService => ({
  translateText: (request: TranslationRequest) =>
    Effect.gen(function* (_) {
      // Validate languages
      if (!isSupported(request.sourceLanguage)) {
        return yield* Effect.fail(new UnsupportedLanguageError({ language: request.sourceLanguage }))
      }
      if (!isSupported(request.targetLanguage)) {
        return yield* Effect.fail(new UnsupportedLanguageError({ language: request.targetLanguage }))
      }

      // Mock translation: prefix with target language code
      const prefix = `[AI ${request.targetLanguage.toUpperCase()}]`
      const translatedText = `${prefix} ${request.text}`

      return {
        translatedText,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        confidence: 0.95,
        model: 'mock-translator-v1'
      }
    }),

  translateBatch: (requests: TranslationRequest[]) =>
    Effect.gen(function* (_) {
      const results: TranslationResult[] = []

      for (const request of requests) {
        // Validate languages
        if (!isSupported(request.sourceLanguage)) {
          return yield* Effect.fail(new UnsupportedLanguageError({ language: request.sourceLanguage }))
        }
        if (!isSupported(request.targetLanguage)) {
          return yield* Effect.fail(new UnsupportedLanguageError({ language: request.targetLanguage }))
        }

        // Mock translation
        const prefix = `[AI ${request.targetLanguage.toUpperCase()}]`
        results.push({
          translatedText: `${prefix} ${request.text}`,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          confidence: 0.95,
          model: 'mock-translator-v1'
        })
      }

      return results
    }),

  translateContent: (input: ContentTranslationInput) =>
    Effect.gen(function* (_) {
      const results: TranslatedContent[] = []

      for (const targetLang of input.targetLanguages) {
        // Skip if target is same as source
        if (targetLang === input.sourceLanguage) {
          continue
        }

        // Validate target language
        if (!isSupported(targetLang)) {
          return yield* Effect.fail(new UnsupportedLanguageError({ language: targetLang }))
        }

        // Translate each translatable field
        const translatedData: Record<string, unknown> = { ...input.data }
        const prefix = `[AI ${targetLang.toUpperCase()}]`

        for (const field of input.translatableFields) {
          const value = input.data[field]
          if (typeof value === 'string' && value.trim()) {
            translatedData[field] = `${prefix} ${value}`
          }
        }

        results.push({
          language: targetLang,
          data: translatedData,
          translationSource: 'ai'
        })
      }

      return results
    }),

  getSupportedLanguages: () => Effect.succeed(SUPPORTED_LANGUAGES),

  isLanguagePairSupported: (source: string, target: string) =>
    Effect.succeed(isSupported(source) && isSupported(target))
})

/**
 * Real Cloudflare Workers AI Translation Service Implementation
 * 
 * This implementation uses Cloudflare Workers AI for actual translation.
 * Requires AI binding to be available in the environment.
 */
export const makeAiTranslationServiceCloudflare = (ai: any): AiTranslationService => ({
  translateText: (request: TranslationRequest) =>
    Effect.gen(function* (_) {
      // Validate languages
      if (!isSupported(request.sourceLanguage)) {
        return yield* Effect.fail(new UnsupportedLanguageError({ language: request.sourceLanguage }))
      }
      if (!isSupported(request.targetLanguage)) {
        return yield* Effect.fail(new UnsupportedLanguageError({ language: request.targetLanguage }))
      }

            // Call Cloudflare Workers AI (Promise-based, Effect-only)
            const result = yield*
              Effect.tryPromise<CloudflareTranslationResult>(async () => {
                const response = await ai.run('@cf/meta/m2m100-1.2b', {
                  text: request.text,
                  source_lang: request.sourceLanguage,
                  target_lang: request.targetLanguage
                });
                
                // ⚠️ WARNING: Detekce prázdného výsledku
                if (!response?.translated_text || response.translated_text.trim() === '') {
                  console.warn(`[AI Translator] ⚠️ AI returned empty translation!`);
                  console.warn(`[AI Translator] This may indicate unsupported language pair: ${request.sourceLanguage} -> ${request.targetLanguage}`);
                  console.warn(`[AI Translator] Model @cf/meta/m2m100-1.2b may not support this direction`);
                }
                
                return response;
              }).pipe(
                Effect.tapError((error: unknown) =>
                  Effect.sync(() => {
                    console.error('[AI Translator] Cloudflare translateText failed:', error)
                  })
                ),
                Effect.mapError((error: unknown) =>
                  new TranslationError({
                    message: 'Cloudflare AI translation failed',
                    cause: error
                  })
                )
              )
            

      return {
        translatedText: result.translated_text || request.text,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        confidence: result.confidence,
        model: '@cf/meta/m2m100-1.2b'
      }
    }),

  translateBatch: (requests: TranslationRequest[]) =>
    Effect.gen(function* (_) {
      const results: TranslationResult[] = []

      for (const request of requests) {
        // Validate languages
        if (!isSupported(request.sourceLanguage)) {
          return yield* Effect.fail(new UnsupportedLanguageError({ language: request.sourceLanguage }))
        }
        if (!isSupported(request.targetLanguage)) {
          return yield* Effect.fail(new UnsupportedLanguageError({ language: request.targetLanguage }))
        }

                // Call Cloudflare Workers AI (Promise-based, Effect-only)
                const result = yield* 
                  Effect.tryPromise<CloudflareTranslationResult>(() =>
                    ai.run('@cf/meta/m2m100-1.2b', {
                      text: request.text,
                      source_lang: request.sourceLanguage,
                      target_lang: request.targetLanguage
                    })
                  ).pipe(
                    Effect.tapError((error: unknown) =>
                      Effect.sync(() => {
                        console.error('[AI Translator] Cloudflare translateBatch item failed:', error)
                      })
                    ),
                    Effect.mapError((error: unknown) =>
                      new TranslationError({
                        message: 'Cloudflare AI translation failed',
                        cause: error
                      })
                    )
                  )
                

        results.push({
          translatedText: result.translated_text || request.text,
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          confidence: result.confidence,
          model: '@cf/meta/m2m100-1.2b'
        })
      }

      return results
    }),

  translateContent: (input: ContentTranslationInput) =>
    Effect.gen(function* (_) {
      const results: TranslatedContent[] = []

      for (const targetLang of input.targetLanguages) {
        // Skip if target is same as source
        if (targetLang === input.sourceLanguage) {
          continue
        }

        // Validate target language
        if (!isSupported(targetLang)) {
          return yield* Effect.fail(new UnsupportedLanguageError({ language: targetLang }))
        }

        // Translate each translatable field
        const translatedData: Record<string, unknown> = { ...input.data }

        for (const field of input.translatableFields) {
          const value = input.data[field]
          if (typeof value === 'string' && value.trim()) {
            try {
              const result = yield*
                Effect.tryPromise<CloudflareTranslationResult>(async () => {
                  const response = await ai.run('@cf/meta/m2m100-1.2b', {
                    text: value,
                    source_lang: input.sourceLanguage,
                    target_lang: targetLang
                  });
                  
                  // ⚠️ WARNING: Detekce prázdného výsledku
                  if (!response?.translated_text || response.translated_text.trim() === '') {
                    console.warn(`[AI Translator] ⚠️ Field ${field}: AI returned empty translation!`);
                    console.warn(`[AI Translator] Language pair ${input.sourceLanguage} -> ${targetLang} may not be supported by model`);
                  }
                  
                  return response;
                }).pipe(
                  Effect.tapError((error: unknown) =>
                    Effect.sync(() => {
                      console.error(`[AI Translator] Cloudflare field translation failed for ${field}:`, error)
                    })
                  ),
                  Effect.catchAll((error) => {
                    // Log error but return fallback to keep processing other fields
                    console.error(`[AI Translator] Failed to translate field ${field}, keeping original:`, error);
                    return Effect.succeed({ translated_text: value } as CloudflareTranslationResult);
                  })
                )
              
              translatedData[field] = result.translated_text || value
            } catch (err) {
               // Fallback catch block for any unexpected issues
               console.error(`[AI Translator] Unexpected error translating field ${field}:`, err)
               translatedData[field] = value
            }
          }
        }

        results.push({
          language: targetLang,
          data: translatedData,
          translationSource: 'ai'
        })
      }

      return results
    }),

  getSupportedLanguages: () => Effect.succeed(SUPPORTED_LANGUAGES),

  isLanguagePairSupported: (source: string, target: string) =>
    Effect.succeed(isSupported(source) && isSupported(target))
})

/**
 * Create a Layer for providing AiTranslationService (Mock implementation)
 */
export const makeAiTranslationServiceLayerMock = (): Layer.Layer<AiTranslationService> =>
  Layer.succeed(AiTranslationService, makeAiTranslationServiceMock())

/**
 * Create a Layer for providing AiTranslationService (Cloudflare implementation)
 */
export const makeAiTranslationServiceLayerCloudflare = (ai: any): Layer.Layer<AiTranslationService> =>
  Layer.succeed(AiTranslationService, makeAiTranslationServiceCloudflare(ai))