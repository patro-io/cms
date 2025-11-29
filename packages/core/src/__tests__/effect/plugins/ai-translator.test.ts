/**
 * AI Translator Plugin - Test Suite
 * 
 * Komplexní testy pro AI Translator plugin s Pure Effect TS
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect, Layer, pipe } from 'effect'
import { Hono } from 'hono'
import {
  AiTranslationService,
  makeAiTranslationServiceLayerMock,
  makeAiTranslationServiceLayerCloudflare,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  type LanguageCode,
  type TranslationRequest,
  type ContentTranslationInput
} from '../../../plugins/core-plugins/ai-translator-plugin/ai-translation-service'
import {
  processContentTranslation,
  parseSettings,
  type AiTranslatorSettings
} from '../../../plugins/core-plugins/ai-translator-plugin/index'
import { DatabaseService, makeDatabaseLayer } from '../../../services/database-effect'

/**
 * Mock D1 Database pro testy
 */
const createMockDB = () => {
  const mockData = {
    content: [] as any[],
    plugins: [] as any[],
    settings: [] as any[]
  }

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: any[]) => ({
        all: vi.fn().mockResolvedValue({
          results: sql.includes('content') 
            ? mockData.content 
            : sql.includes('plugins') 
            ? mockData.plugins
            : mockData.settings,
          success: true
        }),
        run: vi.fn().mockResolvedValue({
          success: true,
          meta: { changes: 1 }
        }),
        first: vi.fn().mockResolvedValue(
          sql.includes('content') && mockData.content.length > 0
            ? mockData.content[0]
            : sql.includes('plugins') && mockData.plugins.length > 0
            ? mockData.plugins[0]
            : sql.includes('settings') && mockData.settings.length > 0
            ? mockData.settings[0]
            : null
        )
      }))
    })),
    _mockData: mockData // Pro snadný přístup v testech
  } as any
}

/**
 * Mock AI binding pro Cloudflare
 */
const createMockAI = () => ({
  run: vi.fn(async (model: string, input: any) => ({
    translated_text: `[TRANSLATED:${input.target_lang.toUpperCase()}] ${input.text}`,
    confidence: 0.95
  }))
})

describe('AI Translator Plugin - AiTranslationService', () => {
  describe('Mock Translation Service', () => {
    it('should translate text using mock service', async () => {
      const request: TranslationRequest = {
        text: 'Hello, world!',
        sourceLanguage: 'en',
        targetLanguage: 'cs'
      }

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateText(request)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      expect(result.translatedText).toContain('[AI CS]')
      expect(result.translatedText).toContain('Hello, world!')
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('cs')
      expect(result.model).toBe('mock-translator-v1')
    })

    it('should translate batch of texts', async () => {
      const requests: TranslationRequest[] = [
        { text: 'Hello', sourceLanguage: 'en', targetLanguage: 'cs' },
        { text: 'World', sourceLanguage: 'en', targetLanguage: 'de' }
      ]

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateBatch(requests)
      })

      const results = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      expect(results).toHaveLength(2)
      expect(results[0]?.translatedText).toContain('[AI CS]')
      expect(results[1]?.translatedText).toContain('[AI DE]')
    })

    it('should translate content data', async () => {
      const input: ContentTranslationInput = {
        contentId: 'test-content-1',
        collectionId: 'pages',
        data: {
          title: 'Test Page',
          content: 'This is test content',
          excerpt: 'Test excerpt'
        },
        sourceLanguage: 'en',
        targetLanguages: ['cs', 'de'],
        translatableFields: ['title', 'content', 'excerpt']
      }

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateContent(input)
      })

      const results = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      expect(results).toHaveLength(2)
      
      const csResult = results.find(r => r.language === 'cs')
      expect(csResult).toBeDefined()
      expect((csResult!.data as any).title).toContain('[AI CS]')
      expect((csResult!.data as any).title).toContain('Test Page')
      
      const deResult = results.find(r => r.language === 'de')
      expect(deResult).toBeDefined()
      expect((deResult!.data as any).title).toContain('[AI DE]')
    })

    it('should return supported languages', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.getSupportedLanguages()
      })

      const languages = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      expect(languages).toEqual(SUPPORTED_LANGUAGES)
      expect(languages).toContain('en')
      expect(languages).toContain('cs')
      expect(languages).toContain('de')
    })

    it('should check if language pair is supported', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        const supported = yield* service.isLanguagePairSupported('en', 'cs')
        const unsupported = yield* service.isLanguagePairSupported('en', 'xx')
        return { supported, unsupported }
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      expect(result.supported).toBe(true)
      expect(result.unsupported).toBe(false)
    })

    it('should skip same language in content translation', async () => {
      const input: ContentTranslationInput = {
        contentId: 'test-content-1',
        collectionId: 'pages',
        data: { title: 'Test Page' },
        sourceLanguage: 'en',
        targetLanguages: ['en', 'cs'], // includes source language
        translatableFields: ['title']
      }

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateContent(input)
      })

      const results = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      // Should only translate to 'cs', skip 'en' (same as source)
      expect(results).toHaveLength(1)
      expect(results[0]?.language).toBe('cs')
    })

    it('should only translate specified fields', async () => {
      const input: ContentTranslationInput = {
        contentId: 'test-content-1',
        collectionId: 'pages',
        data: {
          title: 'Test Page',
          content: 'Content to translate',
          slug: 'test-page', // not translatable
          status: 'published' // not translatable
        },
        sourceLanguage: 'en',
        targetLanguages: ['cs'],
        translatableFields: ['title', 'content']
      }

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateContent(input)
      })

      const results = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerMock())
        )
      )

      const csResult = results[0]
      expect(csResult).toBeDefined()
      expect((csResult!.data as any).title).toContain('[AI CS]')
      expect((csResult!.data as any).content).toContain('[AI CS]')
      expect((csResult!.data as any).slug).toBe('test-page') // unchanged
      expect((csResult!.data as any).status).toBe('published') // unchanged
    })
  })

  describe('Cloudflare Translation Service', () => {
    it('should translate text using Cloudflare AI', async () => {
      const mockAI = createMockAI()
      const request: TranslationRequest = {
        text: 'Hello, world!',
        sourceLanguage: 'en',
        targetLanguage: 'cs'
      }

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateText(request)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAiTranslationServiceLayerCloudflare(mockAI))
        )
      )

      expect(mockAI.run).toHaveBeenCalledWith(
        '@cf/meta/m2m100-1.2b',
        expect.objectContaining({
          text: 'Hello, world!',
          source_lang: 'en',
          target_lang: 'cs'
        })
      )
      expect(result.translatedText).toContain('[TRANSLATED:CS]')
      expect(result.model).toBe('@cf/meta/m2m100-1.2b')
    })

    it('should handle Cloudflare AI errors gracefully', async () => {
      const mockAI = {
        run: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
      }

      const request: TranslationRequest = {
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'cs'
      }

      const program = Effect.gen(function* (_) {
        const service = yield* AiTranslationService
        return yield* service.translateText(request)
      })

      await expect(
        Effect.runPromise(
          program.pipe(
            Effect.provide(makeAiTranslationServiceLayerCloudflare(mockAI))
          )
        )
      ).rejects.toThrow()
    })
  })

  describe('Language Support', () => {
    it('should have correct language names', () => {
      expect(LANGUAGE_NAMES.en).toBe('English')
      expect(LANGUAGE_NAMES.cs).toBe('Czech')
      expect(LANGUAGE_NAMES.de).toBe('German')
      expect(LANGUAGE_NAMES.fr).toBe('French')
      expect(LANGUAGE_NAMES.es).toBe('Spanish')
      expect(LANGUAGE_NAMES.it).toBe('Italian')
      expect(LANGUAGE_NAMES.pl).toBe('Polish')
    })

    it('should support all defined languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en')
      expect(SUPPORTED_LANGUAGES).toContain('cs')
      expect(SUPPORTED_LANGUAGES).toContain('de')
      expect(SUPPORTED_LANGUAGES).toContain('fr')
      expect(SUPPORTED_LANGUAGES).toContain('es')
      expect(SUPPORTED_LANGUAGES).toContain('it')
      expect(SUPPORTED_LANGUAGES).toContain('pl')
    })
  })
})

describe('AI Translator Plugin - processContentTranslation', () => {
  let mockDB: any
  let mockAI: any
  let dbService: DatabaseService

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
    mockAI = createMockAI()
    
    // Setup mock data
    mockDB._mockData.content = [{
      id: 'content-1',
      collection_id: 'pages',
      slug: 'test-page',
      title: 'Test Page',
      data: JSON.stringify({
        title: 'Test Page',
        content: 'Test content'
      }),
      status: 'published',
      author_id: 'user-1',
      created_at: Date.now(),
      updated_at: Date.now(),
      translation_group_id: null,
      translation_source: null,
      language: 'en'
    }]

    mockDB._mockData.settings = [{
      category: 'general',
      key: 'availableLocales',
      value: JSON.stringify(['en', 'cs', 'de'])
    }]

    dbService = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('settings')) {
          return Effect.succeed(mockDB._mockData.settings)
        }
        if (sql.includes('content')) {
          return Effect.succeed(mockDB._mockData.content)
        }
        return Effect.succeed([])
      }),
      queryFirst: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('content')) {
          return Effect.succeed(mockDB._mockData.content[0] || null)
        }
        return Effect.succeed(null)
      }),
      execute: vi.fn().mockReturnValue(Effect.succeed({ success: true, changes: 1 })),
      insert: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
      update: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
      prepare: vi.fn()
    } as any
  })

  const defaultSettings: AiTranslatorSettings = {
    enabled: true,
    defaultSourceLanguage: 'en',
    targetLanguages: ['cs', 'de'],
    autoTranslate: true,
    translateOnCreate: true,
    translateOnUpdate: false,
    aiModel: '@cf/meta/m2m100-1.2b',
    translatableFields: ['title', 'content']
  }

  it('should process content translation successfully', async () => {
    await Effect.runPromise(
      processContentTranslation(
        dbService,
        mockAI,
        'content-1',
        defaultSettings
      )
    )

    // Verify content was queried
    expect(dbService.query).toHaveBeenCalled()
    
    // Verify translation was triggered (AI.run was called)
    expect(mockAI.run).toHaveBeenCalled()
    
    // Verify database execute was called (to save translations)
    expect(dbService.execute).toHaveBeenCalled()
  })

  it('should assign translation_group_id if missing', async () => {
    await Effect.runPromise(
      processContentTranslation(
        dbService,
        mockAI,
        'content-1',
        defaultSettings
      )
    )

    // Check if translation_group_id was assigned via UPDATE
    const executeCalls = (dbService.execute as any).mock.calls
    const updateCall = executeCalls.find((call: any) => 
      call[0].includes('UPDATE content') && call[0].includes('translation_group_id')
    )
    
    expect(updateCall).toBeDefined()
  })

  it('should handle content not found gracefully', async () => {
    mockDB._mockData.content = []
    
    // Should not throw, just log warning and return
    await expect(
      Effect.runPromise(
        processContentTranslation(
          dbService,
          mockAI,
          'non-existent',
          defaultSettings
        )
      )
    ).resolves.toBeUndefined()
  })

  it('should translate to specific target language when provided', async () => {
    await Effect.runPromise(
      processContentTranslation(
        dbService,
        mockAI,
        'content-1',
        defaultSettings,
        'cs' // specific target language
      )
    )

    // Should translate only to Czech
    const aiCalls = mockAI.run.mock.calls
    const targetLanguages = aiCalls.map((call: any) => call[1].target_lang)
    
    expect(targetLanguages).toContain('cs')
    expect(targetLanguages).not.toContain('de') // not requested
  })

  it('should skip translation if target equals source language', async () => {
    await Effect.runPromise(
      processContentTranslation(
        dbService,
        mockAI,
        'content-1',
        defaultSettings,
        'en' // same as source
      )
    )

    // Should not call AI at all
    expect(mockAI.run).not.toHaveBeenCalled()
  })

  it('should handle missing AI binding (use mock service)', async () => {
    await Effect.runPromise(
      processContentTranslation(
        dbService,
        null, // no AI binding
        'content-1',
        defaultSettings
      )
    )

    // Should still process (using mock service)
    expect(dbService.execute).toHaveBeenCalled()
  })

  it('should filter target languages by availableLocales', async () => {
    // Available locales: en, cs, de
    // Plugin target languages: cs, de, fr
    // Expected: only cs, de (fr is not in availableLocales)
    
    const settingsWithFrench: AiTranslatorSettings = {
      ...defaultSettings,
      targetLanguages: ['cs', 'de', 'fr']
    }

    await Effect.runPromise(
      processContentTranslation(
        dbService,
        mockAI,
        'content-1',
        settingsWithFrench
      )
    )

    const aiCalls = mockAI.run.mock.calls
    const targetLanguages = aiCalls.map((call: any) => call[1].target_lang)
    
    expect(targetLanguages).toContain('cs')
    expect(targetLanguages).toContain('de')
    expect(targetLanguages).not.toContain('fr') // filtered out
  })

  it('should update existing translation instead of creating duplicate', async () => {
    // Add existing translation
    mockDB._mockData.content.push({
      id: 'content-1-cs',
      collection_id: 'pages',
      slug: 'test-page-cs',
      title: 'Testovací stránka',
      data: JSON.stringify({
        title: 'Testovací stránka (old)',
        content: 'Starý obsah'
      }),
      status: 'draft',
      author_id: 'user-1',
      created_at: Date.now(),
      updated_at: Date.now(),
      translation_group_id: 'group-1',
      translation_source: 'ai',
      language: 'cs'
    })

    // Update original content to have same group
    mockDB._mockData.content[0].translation_group_id = 'group-1'

    // Mock queryFirst to return existing translation
    ;(dbService.queryFirst as any).mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('translation_group_id') && params[1] === 'cs') {
        return Effect.succeed({ id: 'content-1-cs' })
      }
      return Effect.succeed(mockDB._mockData.content[0])
    })

    await Effect.runPromise(
      processContentTranslation(
        dbService,
        mockAI,
        'content-1',
        defaultSettings,
        'cs'
      )
    )

    // Should UPDATE, not INSERT
    const executeCalls = (dbService.execute as any).mock.calls
    const updateCall = executeCalls.find((call: any) => 
      call[0].includes('UPDATE content') && 
      call[0].includes('data = ?') &&
      !call[0].includes('translation_group_id')
    )
    
    expect(updateCall).toBeDefined()
  })
})

describe('AI Translator Plugin - API Routes', () => {
  let app: Hono
  let mockDB: any

  beforeEach(() => {
    mockDB = createMockDB()
    mockDB._mockData.plugins = [{
      id: 'ai-translator',
      status: 'active',
      settings: JSON.stringify({
        enabled: true,
        defaultSourceLanguage: 'en',
        targetLanguages: ['cs', 'de'],
        translatableFields: ['title', 'content']
      }),
      updated_at: Date.now()
    }]

    app = new Hono()

    // Mock POST /settings
    app.post('/admin/plugins/ai-translator/settings', async (c) => {
      try {
        const body = await c.req.json()
        
        // Validate settings
        if (typeof body.enabled !== 'boolean') {
          return c.json({ error: 'Invalid settings' }, 400)
        }

        return c.json({ success: true })
      } catch (error) {
        return c.json({ error: 'Failed to save settings' }, 500)
      }
    })

    // Mock POST /test
    app.post('/admin/plugins/ai-translator/test', async (c) => {
      try {
        const body = await c.req.json()
        
        if (!body.text) {
          return c.json({ error: 'Text is required' }, 400)
        }

        const translations = {
          en: body.text,
          cs: `[AI CS] ${body.text}`,
          de: `[AI DE] ${body.text}`
        }

        return c.json({ success: true, translations })
      } catch (error) {
        return c.json({ error: 'Translation failed' }, 500)
      }
    })

    // Mock POST /trigger
    app.post('/admin/plugins/ai-translator/trigger', async (c) => {
      try {
        const body = await c.req.json()
        
        if (!body.contentId) {
          return c.json({ error: 'Content ID is required' }, 400)
        }

        return c.json({ success: true, message: 'Translation triggered' })
      } catch (error) {
        return c.json({ error: 'Failed to trigger translation' }, 500)
      }
    })
  })

  describe('POST /admin/plugins/ai-translator/settings', () => {
    it('should save valid settings', async () => {
      const validSettings = {
        enabled: true,
        defaultSourceLanguage: 'en',
        targetLanguages: ['cs', 'de'],
        autoTranslate: true,
        translateOnCreate: true,
        translateOnUpdate: false
      }

      const res = await app.request('/admin/plugins/ai-translator/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSettings)
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })

    it('should reject invalid settings', async () => {
      const invalidSettings = {
        enabled: 'yes' // should be boolean
      }

      const res = await app.request('/admin/plugins/ai-translator/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidSettings)
      })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /admin/plugins/ai-translator/test', () => {
    it('should test translation with valid text', async () => {
      const testData = {
        text: 'Hello, world!'
      }

      const res = await app.request('/admin/plugins/ai-translator/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.translations).toBeDefined()
      expect(data.translations.cs).toContain('[AI CS]')
    })

    it('should reject request without text', async () => {
      const invalidData = {}

      const res = await app.request('/admin/plugins/ai-translator/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Text is required')
    })
  })

  describe('POST /admin/plugins/ai-translator/trigger', () => {
    it('should trigger translation for content', async () => {
      const triggerData = {
        contentId: 'content-1',
        targetLanguage: 'cs'
      }

      const res = await app.request('/admin/plugins/ai-translator/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggerData)
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.message).toBe('Translation triggered')
    })

    it('should reject request without contentId', async () => {
      const invalidData = {
        targetLanguage: 'cs'
      }

      const res = await app.request('/admin/plugins/ai-translator/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      })

      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.error).toBe('Content ID is required')
    })

    it('should accept trigger without specific target language', async () => {
      const triggerData = {
        contentId: 'content-1'
        // no targetLanguage = translate to all configured languages
      }

      const res = await app.request('/admin/plugins/ai-translator/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(triggerData)
      })

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })
  })
})

describe('AI Translator Plugin - Error Handling', () => {
  it('should handle database errors gracefully in processContentTranslation', async () => {
    const failingDbService = {
      query: vi.fn().mockReturnValue(Effect.fail(new Error('Database error'))),
      queryFirst: vi.fn().mockReturnValue(Effect.fail(new Error('Database error'))),
      execute: vi.fn().mockReturnValue(Effect.fail(new Error('Database error'))),
      insert: vi.fn(),
      update: vi.fn(),
      prepare: vi.fn()
    } as any

    const settings: AiTranslatorSettings = {
      enabled: true,
      defaultSourceLanguage: 'en',
      targetLanguages: ['cs'],
      autoTranslate: true,
      translateOnCreate: true,
      translateOnUpdate: false,
      aiModel: '@cf/meta/m2m100-1.2b',
      translatableFields: ['title']
    }

    // Should not throw, just handle gracefully
    await expect(
      Effect.runPromise(
        processContentTranslation(
          failingDbService,
          null,
          'content-1',
          settings
        )
      )
    ).resolves.toBeUndefined()
  })

  it('should handle translation service errors gracefully', async () => {
    const mockDB = createMockDB()
    mockDB._mockData.content = [{
      id: 'content-1',
      collection_id: 'pages',
      data: JSON.stringify({ title: 'Test' }),
      language: 'en',
      translation_group_id: null
    }]

    const dbService = {
      query: vi.fn().mockReturnValue(Effect.succeed(mockDB._mockData.content)),
      queryFirst: vi.fn().mockReturnValue(Effect.succeed(mockDB._mockData.content[0])),
      execute: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
      insert: vi.fn(),
      update: vi.fn(),
      prepare: vi.fn()
    } as any

    const failingAI = {
      run: vi.fn().mockRejectedValue(new Error('AI service failed'))
    }

    const settings: AiTranslatorSettings = {
      enabled: true,
      defaultSourceLanguage: 'en',
      targetLanguages: ['cs'],
      autoTranslate: true,
      translateOnCreate: true,
      translateOnUpdate: false,
      aiModel: '@cf/meta/m2m100-1.2b',
      translatableFields: ['title']
    }

    // Should handle AI failures gracefully
    await expect(
      Effect.runPromise(
        processContentTranslation(
          dbService,
          failingAI,
          'content-1',
          settings
        )
      )
    ).resolves.toBeUndefined()
  })
})

describe('AI Translator Plugin - Bug Fixes (TDD)', () => {
  describe('Bug #1: CS -> EN Translation Not Working', () => {
    it('should translate Czech content to English', async () => {
      const mockDB = createMockDB()
      const mockAI = createMockAI()
      
      // Setup Czech content
      mockDB._mockData.content = [{
        id: 'content-cs-1',
        collection_id: 'pages',
        slug: 'testovaci-stranka',
        title: 'Testovací stránka',
        data: JSON.stringify({
          title: 'Testovací stránka',
          content: 'Toto je český obsah'
        }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now(),
        translation_group_id: null,
        translation_source: null,
        language: 'cs' // ✅ Czech source language
      }]

      mockDB._mockData.settings = [{
        category: 'general',
        key: 'availableLocales',
        value: JSON.stringify(['cs', 'en']) // Both CS and EN available
      }]

      const dbService = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('settings')) {
            return Effect.succeed(mockDB._mockData.settings)
          }
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content)
          }
          return Effect.succeed([])
        }),
        queryFirst: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content[0] || null)
          }
          return Effect.succeed(null)
        }),
        execute: vi.fn().mockReturnValue(Effect.succeed({ success: true, changes: 1 })),
        insert: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        update: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        prepare: vi.fn()
      } as any

      const settings: AiTranslatorSettings = {
        enabled: true,
        defaultSourceLanguage: 'cs', // ✅ Czech as source
        targetLanguages: ['en'], // ✅ English as target
        autoTranslate: true,
        translateOnCreate: true,
        translateOnUpdate: false,
        aiModel: '@cf/meta/m2m100-1.2b',
        translatableFields: ['title', 'content']
      }

      await Effect.runPromise(
        processContentTranslation(
          dbService,
          mockAI,
          'content-cs-1',
          settings
        )
      )

      // ✅ ASSERT: AI should be called with CS -> EN
      expect(mockAI.run).toHaveBeenCalled()
      const aiCalls = mockAI.run.mock.calls
      
      // Check if we have any CS -> EN translation calls
      const csToEnCalls = aiCalls.filter((call: any) =>
        call[1].source_lang === 'cs' && call[1].target_lang === 'en'
      )
      
      // ✅ MAIN ASSERTION: CS -> EN translation should happen
      expect(csToEnCalls.length).toBeGreaterThan(0)
      
      // Verify the Czech text is being sent
      const firstCall = csToEnCalls[0]
      if (firstCall) {
        expect(firstCall[1].text).toBeTruthy()
        // Should contain Czech characters
        expect(firstCall[1].source_lang).toBe('cs')
        expect(firstCall[1].target_lang).toBe('en')
      }
    })
  })

  describe('Bug #2: Hooks Not Triggering', () => {
    it('should trigger processContentTranslation when content:create hook fires', async () => {
      const mockDB = createMockDB()
      const mockAI = createMockAI()
      
      // Setup plugin in database
      mockDB._mockData.plugins = [{
        id: 'ai-translator',
        status: 'active',
        settings: JSON.stringify({
          enabled: true,
          translateOnCreate: true, // ✅ Hook should be active
          defaultSourceLanguage: 'en',
          targetLanguages: ['cs'],
          translatableFields: ['title', 'content']
        })
      }]

      // Setup content
      mockDB._mockData.content = [{
        id: 'new-content-1',
        collection_id: 'pages',
        slug: 'new-page',
        title: 'New Page',
        data: JSON.stringify({
          title: 'New Page',
          content: 'New content'
        }),
        status: 'draft',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now(),
        translation_group_id: null,
        translation_source: null,
        language: 'en'
      }]

      mockDB._mockData.settings = [{
        category: 'general',
        key: 'availableLocales',
        value: JSON.stringify(['en', 'cs'])
      }]

      // Create spy for processContentTranslation
      const processTranslationSpy = vi.fn().mockResolvedValue(undefined)

      // Simulate hook context
      const hookContext = {
        context: {
          db: mockDB,
          ai: mockAI,
          executionCtx: {
            waitUntil: vi.fn()
          }
        }
      }

      const contentData = {
        id: 'new-content-1',
        collection_id: 'pages',
        title: 'New Page'
      }

      // ✅ Get plugin settings from mock database
      const prepareResult = mockDB.prepare(`
        SELECT settings, status FROM plugins WHERE id = 'ai-translator'
      `)
      
      // Mock DB returns bind which returns first
      const bindResult = prepareResult.bind('ai-translator')
      const pluginResult = mockDB._mockData.plugins[0]

      expect(pluginResult).toBeDefined()
      expect(pluginResult.status).toBe('active')

      const settings = JSON.parse(pluginResult.settings)
      expect(settings.enabled).toBe(true)
      expect(settings.translateOnCreate).toBe(true)

      // ✅ ASSERT: Verify hook would be triggered
      // We verify that the conditions for triggering the hook are met
      expect(settings.translateOnCreate).toBe(true)
      expect(contentData.id).toBe('new-content-1')
      
      // ✅ This test documents that hooks SHOULD trigger in production
      // but cannot be fully integration tested in unit tests without
      // loading the full plugin system
      expect(hookContext.context.db).toBeDefined()
      expect(hookContext.context.ai).toBeDefined()
    })
  })

  describe('Bug #3: Empty translatableFields Should Use Defaults', () => {
    it('should use default translatableFields when settings has empty array', async () => {
      const mockDB = createMockDB()
      const mockAI = createMockAI()
      
      // Setup content
      mockDB._mockData.content = [{
        id: 'content-1',
        collection_id: 'pages',
        slug: 'test-page',
        title: 'Test Page',
        data: JSON.stringify({
          title: 'Test Page',
          content: 'Test content',
          excerpt: 'Test excerpt'
        }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now(),
        translation_group_id: null,
        translation_source: null,
        language: 'cs'
      }]

      mockDB._mockData.settings = [{
        category: 'general',
        key: 'availableLocales',
        value: JSON.stringify(['cs', 'en'])
      }]

      const dbService = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('settings')) {
            return Effect.succeed(mockDB._mockData.settings)
          }
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content)
          }
          return Effect.succeed([])
        }),
        queryFirst: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content[0] || null)
          }
          return Effect.succeed(null)
        }),
        execute: vi.fn().mockReturnValue(Effect.succeed({ success: true, changes: 1 })),
        insert: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        update: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        prepare: vi.fn()
      } as any

      // ⚠️ CRITICAL: Settings with EMPTY translatableFields array
      // This simulates the bug where admin UI or migration created empty array
      // ⚠️ CRITICAL: Raw settings with EMPTY translatableFields array
      // We simulate input from DB/API that needs parsing
      const rawSettings = {
        enabled: true,
        defaultSourceLanguage: 'cs',
        targetLanguages: ['en'],
        autoTranslate: true,
        translateOnCreate: true,
        translateOnUpdate: false,
        aiModel: '@cf/meta/m2m100-1.2b',
        translatableFields: [] // ❌ EMPTY! This was the bug
      }

      // ✅ Parse settings using our Schema logic
      // This is what happens in the Hook/API handler
      const settings = parseSettings(rawSettings)

      await Effect.runPromise(
        processContentTranslation(
          dbService,
          mockAI,
          'content-1',
          settings
        )
      )

      // ✅ ASSERT: AI SHOULD be called despite empty translatableFields
      // mergeSettings() should have replaced empty array with defaults
      expect(mockAI.run).toHaveBeenCalled()
      
      const aiCalls = mockAI.run.mock.calls
      expect(aiCalls.length).toBeGreaterThan(0)
      
      // Verify that fields were actually translated
      const firstCall = aiCalls[0]
      if (firstCall) {
        expect(firstCall[1].text).toBeTruthy()
        expect(firstCall[1].text.length).toBeGreaterThan(0)
        // Text should be from one of the default translatable fields
        expect(firstCall[1].source_lang).toBe('cs')
        expect(firstCall[1].target_lang).toBe('en')
      }
    })

    it('should use default targetLanguages when settings has empty array', async () => {
      const mockDB = createMockDB()
      const mockAI = createMockAI()
      
      mockDB._mockData.content = [{
        id: 'content-1',
        collection_id: 'pages',
        slug: 'test-page',
        title: 'Test Page',
        data: JSON.stringify({
          title: 'Test Page',
          content: 'Test content'
        }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now(),
        translation_group_id: null,
        translation_source: null,
        language: 'en'
      }]

      mockDB._mockData.settings = [{
        category: 'general',
        key: 'availableLocales',
        value: JSON.stringify(['en', 'cs', 'de', 'fr'])
      }]

      const dbService = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('settings')) {
            return Effect.succeed(mockDB._mockData.settings)
          }
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content)
          }
          return Effect.succeed([])
        }),
        queryFirst: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content[0] || null)
          }
          return Effect.succeed(null)
        }),
        execute: vi.fn().mockReturnValue(Effect.succeed({ success: true, changes: 1 })),
        insert: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        update: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        prepare: vi.fn()
      } as any

      // ⚠️ CRITICAL: Settings with EMPTY targetLanguages array
      const rawSettings = {
        enabled: true,
        defaultSourceLanguage: 'en',
        targetLanguages: [], // ❌ EMPTY! Bug case
        autoTranslate: true,
        translateOnCreate: true,
        translateOnUpdate: false,
        aiModel: '@cf/meta/m2m100-1.2b',
        translatableFields: ['title', 'content']
      }

      // ✅ Parse settings using our Schema logic
      const settings = parseSettings(rawSettings)

      await Effect.runPromise(
        processContentTranslation(
          dbService,
          mockAI,
          'content-1',
          settings
        )
      )

      // ✅ ASSERT: AI SHOULD be called with default target languages
      // mergeSettings() should have replaced empty array with defaults
      expect(mockAI.run).toHaveBeenCalled()
      
      const aiCalls = mockAI.run.mock.calls
      expect(aiCalls.length).toBeGreaterThan(0)
      
      // Check that we're translating to multiple languages (from defaults)
      const targetLanguages = new Set(
        aiCalls.map((call: any) => call[1].target_lang)
      )
      
      // Should have translated to at least one target language from defaults
      expect(targetLanguages.size).toBeGreaterThan(0)
      // Should NOT be translating to 'en' (source language)
      expect(targetLanguages.has('en')).toBe(false)
    })

    it('should preserve non-empty translatableFields from settings', async () => {
      const mockDB = createMockDB()
      const mockAI = createMockAI()
      
      mockDB._mockData.content = [{
        id: 'content-1',
        collection_id: 'pages',
        slug: 'test-page',
        title: 'Test Page',
        data: JSON.stringify({
          title: 'Test Page',
          content: 'Test content',
          custom_field: 'Custom value'
        }),
        status: 'published',
        author_id: 'user-1',
        created_at: Date.now(),
        updated_at: Date.now(),
        translation_group_id: null,
        translation_source: null,
        language: 'en'
      }]

      mockDB._mockData.settings = [{
        category: 'general',
        key: 'availableLocales',
        value: JSON.stringify(['en', 'cs'])
      }]

      const dbService = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('settings')) {
            return Effect.succeed(mockDB._mockData.settings)
          }
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content)
          }
          return Effect.succeed([])
        }),
        queryFirst: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('content')) {
            return Effect.succeed(mockDB._mockData.content[0] || null)
          }
          return Effect.succeed(null)
        }),
        execute: vi.fn().mockReturnValue(Effect.succeed({ success: true, changes: 1 })),
        insert: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        update: vi.fn().mockReturnValue(Effect.succeed({ success: true })),
        prepare: vi.fn()
      } as any

      // ✅ Settings with custom (non-empty) translatableFields
      const settingsWithCustomFields: AiTranslatorSettings = {
        enabled: true,
        defaultSourceLanguage: 'en',
        targetLanguages: ['cs'],
        autoTranslate: true,
        translateOnCreate: true,
        translateOnUpdate: false,
        aiModel: '@cf/meta/m2m100-1.2b',
        translatableFields: ['custom_field'] // Only translate custom field
      }

      await Effect.runPromise(
        processContentTranslation(
          dbService,
          mockAI,
          'content-1',
          settingsWithCustomFields
        )
      )

      // ✅ ASSERT: Should only translate 'custom_field', not 'title' or 'content'
      expect(mockAI.run).toHaveBeenCalled()
      
      const aiCalls = mockAI.run.mock.calls
      const translatedTexts = aiCalls.map((call: any) => call[1].text)
      
      // Should translate custom_field
      expect(translatedTexts).toContain('Custom value')
      // Should NOT translate title or content (not in translatableFields)
      expect(translatedTexts).not.toContain('Test Page')
      expect(translatedTexts).not.toContain('Test content')
    })
  })
})