/**
 * AI Translator Plugin - Settings Bug Fix Tests
 * 
 * Tests specifically targeting the empty fields/settings saving bug using Effect Schema.
 */

import { describe, it, expect } from 'vitest'
import {
  parseSettings,
  type AiTranslatorSettings
} from '../../../plugins/core-plugins/ai-translator-plugin/index'
import { DEFAULT_SETTINGS } from '../../../plugins/core-plugins/ai-translator-plugin/settings-schema'

describe('AI Translator Settings Logic (Schema Based)', () => {
  describe('parseSettings', () => {
    it('should use defaults when translatableFields is empty array', () => {
      const userSettings = {
        enabled: true,
        translatableFields: [] as string[] // Simulate empty array from frontend
      }

      const merged = parseSettings(userSettings)

      expect(merged.translatableFields).toEqual(DEFAULT_SETTINGS.translatableFields)
      expect(merged.translatableFields.length).toBeGreaterThan(0)
    })

    it('should use defaults when targetLanguages is empty array', () => {
      const userSettings = {
        enabled: true,
        targetLanguages: [] as any[] // Simulate empty array from frontend
      }

      const merged = parseSettings(userSettings)

      expect(merged.targetLanguages).toEqual(DEFAULT_SETTINGS.targetLanguages)
      expect(merged.targetLanguages.length).toBeGreaterThan(0)
    })

    it('should use defaults when translatableFields is missing', () => {
      const userSettings = {
        enabled: true
      }

      const merged = parseSettings(userSettings)
      expect(merged.translatableFields).toEqual(DEFAULT_SETTINGS.translatableFields)
    })

    it('should use defaults for invalid inputs (legacy DB data or UI bugs)', () => {
      // These scenarios simulate exactly what happened in production logs:
      // ParseError: Expected ReadonlyArray<string>, actual ""
      const scenarios = [
        { translatableFields: "" },
        { translatableFields: null },
        { translatableFields: "invalid" },
        { targetLanguages: "" },
        { targetLanguages: null },
        // Even mixed types
        { translatableFields: 123 },
        { targetLanguages: {} }
      ]

      scenarios.forEach(settings => {
        const merged = parseSettings(settings)
        
        // Assert that despite garbage input, we get valid default arrays
        if ('translatableFields' in settings) {
            expect(Array.isArray(merged.translatableFields)).toBe(true)
            expect(merged.translatableFields).toEqual(DEFAULT_SETTINGS.translatableFields)
        }
        if ('targetLanguages' in settings) {
            expect(Array.isArray(merged.targetLanguages)).toBe(true)
            expect(merged.targetLanguages).toEqual(DEFAULT_SETTINGS.targetLanguages)
        }
      })
    })

    it('should preserve valid custom settings', () => {
      const userSettings = {
        enabled: true,
        translatableFields: ['custom_field'],
        targetLanguages: ['cs']
      }

      const merged = parseSettings(userSettings)

      expect(merged.translatableFields).toEqual(['custom_field'])
      expect(merged.targetLanguages).toEqual(['cs'])
    })
    
    it('should fail on invalid types for strict fields', () => {
        const userSettings = {
            enabled: "not-a-boolean"
        }
        
        // enabled is strict boolean, so this should throw
        expect(() => parseSettings(userSettings)).toThrow()
    })
  })
})