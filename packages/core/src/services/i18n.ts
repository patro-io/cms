import { Context, Effect, Layer } from 'effect'
import { Data } from 'effect'
import enTranslations from '../locales/en.json'
import csTranslations from '../locales/cs.json'
import deTranslations from '../locales/de.json'
import frTranslations from '../locales/fr.json'
import esTranslations from '../locales/es.json'
import itTranslations from '../locales/it.json'
import plTranslations from '../locales/pl.json'

/**
 * I18n Error types
 */
export class TranslationError extends Data.TaggedError('TranslationError')<{
  message: string
  cause?: unknown
}> {}

/**
 * Translation function type
 */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

/**
 * Supported locales
 */
export type Locale = 'en' | 'cs' | 'de' | 'fr' | 'es' | 'it' | 'pl'

/**
 * Translation data structure
 */
export type Translations = Record<string, any>

/**
 * I18n Service Interface
 */
export interface I18nService {
  /**
   * Get current locale
   */
  readonly getLocale: () => Locale

  /**
   * Set current locale
   */
  readonly setLocale: (locale: Locale) => void

  /**
   * Translate a key
   */
  readonly t: (key: string, params?: Record<string, string | number>) => string

  /**
   * Check if a translation key exists
   */
  readonly hasKey: (key: string) => boolean

  /**
   * Get all translations for current locale
   */
  readonly getTranslations: () => Translations
}

/**
 * I18n Service Tag for dependency injection
 */
export const I18nService = Context.GenericTag<I18nService>('@services/I18nService')

/**
 * Load translations for a given locale
 */
const loadTranslations = (locale: Locale): Translations => {
  switch (locale) {
    case 'en':
      return enTranslations
    case 'cs':
      return csTranslations
    case 'de':
      return deTranslations
    case 'fr':
      return frTranslations
    case 'es':
      return esTranslations
    case 'it':
      return itTranslations
    case 'pl':
      return plTranslations
    default:
      return enTranslations
  }
}

/**
 * Get nested value from object using dot notation
 */
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

/**
 * Replace placeholders in translation string
 */
const interpolate = (template: string, params?: Record<string, string | number>): string => {
  if (!params) return template
  
  return Object.entries(params).reduce((result, [key, value]) => {
    return result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  }, template)
}

/**
 * Create an I18n Service implementation
 */
export const makeI18nService = (initialLocale: Locale = 'en'): I18nService => {
  let currentLocale: Locale = initialLocale
  let translations: Translations = loadTranslations(initialLocale)

  return {
    getLocale: () => currentLocale,

    setLocale: (locale: Locale) => {
      currentLocale = locale
      translations = loadTranslations(locale)
    },

    t: (key: string, params?: Record<string, string | number>): string => {
      const value = getNestedValue(translations, key)
      
      if (value === undefined || value === null) {
        console.warn(`Translation key not found: ${key}`)
        return key // Return key as fallback
      }

      if (typeof value !== 'string') {
        console.warn(`Translation value is not a string for key: ${key}`)
        return key
      }

      return interpolate(value, params)
    },

    hasKey: (key: string): boolean => {
      const value = getNestedValue(translations, key)
      return value !== undefined && value !== null
    },

    getTranslations: (): Translations => translations
  }
}

/**
 * Create a Layer for providing I18nService
 */
export const makeI18nLayer = (locale: Locale = 'en'): Layer.Layer<I18nService> =>
  Layer.succeed(I18nService, makeI18nService(locale))

/**
 * Map ISO country code to locale
 * Used for IP-based geolocation
 */
export const mapCountryToLanguage = (countryCode?: string | null): Locale | null => {
  if (!countryCode) return null
  
  const countryToLocale: Record<string, Locale> = {
    // Czech & Slovak
    'CZ': 'cs',
    'SK': 'cs',
    
    // German-speaking countries
    'DE': 'de',
    'AT': 'de',
    'CH': 'de',
    'LI': 'de',
    
    // French-speaking countries
    'FR': 'fr',
    'BE': 'fr',
    'LU': 'fr',
    'MC': 'fr',
    
    // Spanish-speaking countries
    'ES': 'es',
    'MX': 'es',
    'AR': 'es',
    'CO': 'es',
    'CL': 'es',
    'PE': 'es',
    'VE': 'es',
    'EC': 'es',
    'GT': 'es',
    'CU': 'es',
    'BO': 'es',
    'DO': 'es',
    'HN': 'es',
    'PY': 'es',
    'SV': 'es',
    'NI': 'es',
    'CR': 'es',
    'PA': 'es',
    'UY': 'es',
    
    // Italian-speaking countries
    'IT': 'it',
    'SM': 'it',
    'VA': 'it',
    
    // Polish
    'PL': 'pl',
    
    // English-speaking countries (explicit mapping for clarity)
    'US': 'en',
    'GB': 'en',
    'CA': 'en',
    'AU': 'en',
    'NZ': 'en',
    'IE': 'en',
    'ZA': 'en',
    'IN': 'en'
  }
  
  return countryToLocale[countryCode.toUpperCase()] || null
}

/**
 * Helper to get locale from various sources
 * Priority: user preference > IP geolocation > global settings > accept-language header > default
 */
export const detectLocale = (
  userLanguage?: string | null,
  settingsLanguage?: string | null,
  acceptLanguageHeader?: string | null,
  ipCountry?: string | null
): Locale => {
  // 1. User preference has HIGHEST priority (even if empty string, we check for actual value)
  if (userLanguage) {
    const trimmed = userLanguage.trim()
    if (trimmed && isValidLocale(trimmed)) {
      return trimmed as Locale
    }
  }

  // 2. IP-based geolocation (automatic detection based on visitor's country)
  if (ipCountry) {
    const ipLanguage = mapCountryToLanguage(ipCountry)
    if (ipLanguage) {
      return ipLanguage
    }
  }

  // 3. Global settings (fallback when IP geolocation is not available)
  if (settingsLanguage) {
    const trimmed = settingsLanguage.trim()
    if (trimmed && isValidLocale(trimmed)) {
      return trimmed as Locale
    }
  }

  // 4. Accept-Language header (browser preference)
  if (acceptLanguageHeader) {
    const primaryLang = acceptLanguageHeader.split(',')[0]?.split('-')[0]?.toLowerCase()
    if (primaryLang && isValidLocale(primaryLang)) {
      return primaryLang as Locale
    }
  }

  // 5. Default fallback
  return 'en'
}

/**
 * Check if a string is a valid locale
 */
export const isValidLocale = (locale: string): locale is Locale => {
  return locale === 'en' || locale === 'cs' || locale === 'de' || locale === 'fr' || locale === 'es' || locale === 'it' || locale === 'pl'
}

/**
 * Get available locales
 */
export const getAvailableLocales = (): Locale[] => {
  return ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl']
}

/**
 * Get locale display name
 */
export const getLocaleDisplayName = (locale: Locale): string => {
  const names: Record<Locale, string> = {
    en: 'English',
    cs: 'Čeština',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    pl: 'Polski'
  }
  return names[locale] || locale
}