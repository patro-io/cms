import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import {
  SettingsService,
  makeSettingsService,
  makeSettingsServiceLayer,
  GeneralSettings,
  SettingsError
} from '../../../services/settings'
import { DatabaseService, makeDatabaseLayer } from '../../../services/database-effect'

describe('SettingsService - Pure Effect', () => {
  const createMockDb = () => ({
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  })

  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
  })

  describe('getSetting', () => {
    it('should get a setting value by category and key', async () => {
      mockDb.prepare().first.mockResolvedValue({
        value: JSON.stringify('Test Value')
      })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getSetting<string>('general', 'siteName')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBe('Test Value')
    })

    it('should return null for non-existent setting', async () => {
      mockDb.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getSetting('general', 'nonExistent')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBeNull()
    })

    it('should handle JSON parse errors', async () => {
      mockDb.prepare().first.mockResolvedValue({
        value: 'invalid-json{'
      })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getSetting('general', 'siteName')
      })

      await expect(
        Effect.runPromise(
          program.pipe(
            Effect.provide(makeSettingsServiceLayer()),
            Effect.provide(makeDatabaseLayer(mockDb as any))
          )
        )
      ).rejects.toThrow()
    })
  })

  describe('getCategorySettings', () => {
    it('should get all settings for a category', async () => {
      mockDb.prepare().all.mockResolvedValue({
        results: [
          { key: 'siteName', value: JSON.stringify('PatroCMS') },
          { key: 'language', value: JSON.stringify('en') }
        ]
      })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getCategorySettings('general')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toEqual({
        siteName: 'PatroCMS',
        language: 'en'
      })
    })

    it('should return empty object for category with no settings', async () => {
      mockDb.prepare().all.mockResolvedValue({ results: [] })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getCategorySettings('nonExistent')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toEqual({})
    })
  })

  describe('setSetting', () => {
    it('should set a setting value', async () => {
      mockDb.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.setSetting('general', 'siteName', 'My CMS')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBe(true)
    })

    it('should handle complex values', async () => {
      mockDb.prepare().run.mockResolvedValue({ success: true })

      const complexValue = {
        nested: { value: 123 },
        array: [1, 2, 3]
      }

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.setSetting('general', 'complex', complexValue)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBe(true)
    })
  })

  describe('setMultipleSettings', () => {
    it('should set multiple settings at once', async () => {
      mockDb.prepare().run.mockResolvedValue({ success: true })

      const settings = {
        siteName: 'PatroCMS',
        language: 'cs',
        timezone: 'Europe/Prague'
      }

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.setMultipleSettings('general', settings)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBe(true)
      expect(mockDb.prepare().run).toHaveBeenCalledTimes(3)
    })
  })

  describe('getGeneralSettings', () => {
    it('should return general settings with defaults', async () => {
      mockDb.prepare().all.mockResolvedValue({
        results: [
          { key: 'siteName', value: JSON.stringify('My CMS') },
          { key: 'language', value: JSON.stringify('cs') }
        ]
      })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getGeneralSettings('admin@test.com')
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result.siteName).toBe('My CMS')
      expect(result.language).toBe('cs')
      expect(result.timezone).toBe('UTC') // default
      expect(result.adminEmail).toBe('admin@test.com')
    })

    it('should use defaults when no settings exist', async () => {
      mockDb.prepare().all.mockResolvedValue({ results: [] })

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.getGeneralSettings()
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toEqual({
        siteName: 'PatroCMS',
        siteDescription: 'A modern headless CMS powered by AI',
        adminEmail: 'admin@example.com',
        timezone: 'UTC',
        language: 'en',
        maintenanceMode: false
      })
    })
  })

  describe('saveGeneralSettings', () => {
    it('should save general settings', async () => {
      mockDb.prepare().run.mockResolvedValue({ success: true })

      const settings: Partial<GeneralSettings> = {
        siteName: 'Updated CMS',
        language: 'cs'
      }

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.saveGeneralSettings(settings)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBe(true)
      expect(mockDb.prepare().run).toHaveBeenCalledTimes(2) // siteName + language
    })

    it('should save all general settings fields', async () => {
      mockDb.prepare().run.mockResolvedValue({ success: true })

      const settings: GeneralSettings = {
        siteName: 'Full CMS',
        siteDescription: 'Complete description',
        adminEmail: 'admin@cms.com',
        timezone: 'Europe/Prague',
        language: 'cs',
        maintenanceMode: true
      }

      const program = Effect.gen(function* (_) {
        const service = yield* SettingsService
        return yield* service.saveGeneralSettings(settings)
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeSettingsServiceLayer()),
          Effect.provide(makeDatabaseLayer(mockDb as any))
        )
      )

      expect(result).toBe(true)
      expect(mockDb.prepare().run).toHaveBeenCalledTimes(6) // All 6 fields
    })
  })
})