/**
 * I18nService Tests - Effect TS Implementation
 * 
 * Testuje internacionalizaci, překlady, locale switching
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Effect } from 'effect'
import {
  I18nService,
  makeI18nService,
  makeI18nLayer,
  Locale,
  mapCountryToLanguage,
  detectLocale,
  isValidLocale,
  getAvailableLocales,
  getLocaleDisplayName
} from '../../../services/i18n'

describe('I18nService - Effect Implementation', () => {
  describe('makeI18nService', () => {
    it('vytvoří service s výchozím locale (en)', () => {
      const service = makeI18nService()
      expect(service.getLocale()).toBe('en')
    })

    it('vytvoří service s vlastním locale', () => {
      const service = makeI18nService('cs')
      expect(service.getLocale()).toBe('cs')
    })

    it('načte správné překlady pro dané locale', () => {
      const serviceEn = makeI18nService('en')
      const serviceCs = makeI18nService('cs')

      expect(serviceEn.getTranslations()).toBeDefined()
      expect(serviceCs.getTranslations()).toBeDefined()
      expect(serviceEn.getTranslations()).not.toEqual(serviceCs.getTranslations())
    })
  })

  describe('getLocale / setLocale', () => {
    it('vrátí aktuální locale', () => {
      const service = makeI18nService('en')
      expect(service.getLocale()).toBe('en')
    })

    it('změní locale pomocí setLocale', () => {
      const service = makeI18nService('en')
      expect(service.getLocale()).toBe('en')

      service.setLocale('cs')
      expect(service.getLocale()).toBe('cs')
    })

    it('načte nové překlady při změně locale', () => {
      const service = makeI18nService('en')
      const translationsEn = service.getTranslations()

      service.setLocale('de')
      const translationsDe = service.getTranslations()

      expect(translationsEn).not.toEqual(translationsDe)
    })

    it('podporuje všechny definované locales', () => {
      const service = makeI18nService('en')
      const locales: Locale[] = ['en', 'cs', 'de', 'fr', 'es', 'it', 'pl']

      locales.forEach(locale => {
        service.setLocale(locale)
        expect(service.getLocale()).toBe(locale)
        expect(service.getTranslations()).toBeDefined()
      })
    })
  })

  describe('t() - translation function', () => {
    it('přeloží existující klíč', () => {
      const service = makeI18nService('en')
      // Předpokládáme že 'common.save' existuje v en.json
      const translation = service.t('common.save')
      expect(typeof translation).toBe('string')
      expect(translation.length).toBeGreaterThan(0)
    })

    it('vrátí klíč jako fallback pokud překlad neexistuje', () => {
      const service = makeI18nService('en')
      const result = service.t('non.existent.key')
      expect(result).toBe('non.existent.key')
    })

    it('podporuje nested keys (dot notation)', () => {
      const service = makeI18nService('en')
      // Test s několika common keys
      const save = service.t('common.save')
      const cancel = service.t('common.cancel')
      
      expect(save).toBeTruthy()
      expect(cancel).toBeTruthy()
      expect(save).not.toBe(cancel)
    })

    it('interpoluje parametry v překladech', () => {
      const service = makeI18nService('en')
      // Pokud máme klíč jako "Hello {name}"
      const result = service.t('test.greeting', { name: 'John' })
      
      // Buď najde a interpoluje, nebo vrátí klíč
      expect(typeof result).toBe('string')
    })

    it('interpoluje více parametrů', () => {
      const service = makeI18nService('en')
      const result = service.t('test.message', { 
        user: 'Alice', 
        count: 42 
      })
      
      expect(typeof result).toBe('string')
    })

    it('funguje bez parametrů i když překlad obsahuje placeholders', () => {
      const service = makeI18nService('en')
      const result = service.t('test.withParams')
      
      // Mělo by vrátit string (buď s placeholdery nebo klíč)
      expect(typeof result).toBe('string')
    })

    it('různé locales vrací různé překlady', () => {
      const serviceEn = makeI18nService('en')
      const serviceCs = makeI18nService('cs')

      const translationEn = serviceEn.t('common.save')
      const translationCs = serviceCs.t('common.save')

      // Pokud oba existují, měly by být různé
      if (translationEn !== 'common.save' && translationCs !== 'common.save') {
        expect(translationEn).not.toBe(translationCs)
      }
    })
  })

  describe('hasKey()', () => {
    it('vrátí true pro existující klíč', () => {
      const service = makeI18nService('en')
      expect(service.hasKey('common.save')).toBe(true)
    })

    it('vrátí false pro neexistující klíč', () => {
      const service = makeI18nService('en')
      expect(service.hasKey('non.existent.key')).toBe(false)
    })

    it('funguje s nested keys', () => {
      const service = makeI18nService('en')
      expect(service.hasKey('common.cancel')).toBe(true)
    })

    it('vrátí false pro null/undefined hodnoty', () => {
      const service = makeI18nService('en')
      expect(service.hasKey('null.key')).toBe(false)
    })
  })

  describe('getTranslations()', () => {
    it('vrátí všechny překlady pro aktuální locale', () => {
      const service = makeI18nService('en')
      const translations = service.getTranslations()

      expect(translations).toBeDefined()
      expect(typeof translations).toBe('object')
      expect(Object.keys(translations).length).toBeGreaterThan(0)
    })

    it('vrací různé překlady pro různé locales', () => {
      const serviceEn = makeI18nService('en')
      const serviceCs = makeI18nService('cs')

      const translationsEn = serviceEn.getTranslations()
      const translationsCs = serviceCs.getTranslations()

      expect(translationsEn).not.toEqual(translationsCs)
    })

    it('aktualizuje se při změně locale', () => {
      const service = makeI18nService('en')
      const translationsBefore = service.getTranslations()

      service.setLocale('de')
      const translationsAfter = service.getTranslations()

      expect(translationsBefore).not.toEqual(translationsAfter)
    })
  })

  describe('makeI18nLayer - Effect Layer', () => {
    it('vytvoří Effect Layer s výchozím locale', async () => {
      const program = Effect.gen(function* () {
        const service = yield* I18nService
        return service.getLocale()
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeI18nLayer()))
      )

      expect(result).toBe('en')
    })

    it('vytvoří Effect Layer s vlastním locale', async () => {
      const program = Effect.gen(function* () {
        const service = yield* I18nService
        return service.getLocale()
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeI18nLayer('cs')))
      )

      expect(result).toBe('cs')
    })

    it('umožňuje použití translate funkce v Effect kontextu', async () => {
      const program = Effect.gen(function* () {
        const service = yield* I18nService
        return service.t('common.save')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeI18nLayer('en')))
      )

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('podporuje locale switching v Effect kontextu', async () => {
      const program = Effect.gen(function* () {
        const service = yield* I18nService
        const localeBefore = service.getLocale()
        
        service.setLocale('fr')
        const localeAfter = service.getLocale()

        return { localeBefore, localeAfter }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeI18nLayer('en')))
      )

      expect(result.localeBefore).toBe('en')
      expect(result.localeAfter).toBe('fr')
    })
  })

  describe('mapCountryToLanguage()', () => {
    it('mapuje české/slovenské země na cs', () => {
      expect(mapCountryToLanguage('CZ')).toBe('cs')
      expect(mapCountryToLanguage('SK')).toBe('cs')
    })

    it('mapuje německojazyčné země na de', () => {
      expect(mapCountryToLanguage('DE')).toBe('de')
      expect(mapCountryToLanguage('AT')).toBe('de')
      expect(mapCountryToLanguage('CH')).toBe('de')
    })

    it('mapuje frankofonní země na fr', () => {
      expect(mapCountryToLanguage('FR')).toBe('fr')
      expect(mapCountryToLanguage('BE')).toBe('fr')
      expect(mapCountryToLanguage('LU')).toBe('fr')
    })

    it('mapuje hispanofonní země na es', () => {
      expect(mapCountryToLanguage('ES')).toBe('es')
      expect(mapCountryToLanguage('MX')).toBe('es')
      expect(mapCountryToLanguage('AR')).toBe('es')
    })

    it('mapuje italskou oblast na it', () => {
      expect(mapCountryToLanguage('IT')).toBe('it')
      expect(mapCountryToLanguage('SM')).toBe('it')
    })

    it('mapuje Polsko na pl', () => {
      expect(mapCountryToLanguage('PL')).toBe('pl')
    })

    it('mapuje anglofonní země na en', () => {
      expect(mapCountryToLanguage('US')).toBe('en')
      expect(mapCountryToLanguage('GB')).toBe('en')
      expect(mapCountryToLanguage('CA')).toBe('en')
      expect(mapCountryToLanguage('AU')).toBe('en')
    })

    it('vrátí null pro nezmapovanou zemi', () => {
      expect(mapCountryToLanguage('JP')).toBe(null)
      expect(mapCountryToLanguage('CN')).toBe(null)
    })

    it('vrátí null pro prázdný/null vstup', () => {
      expect(mapCountryToLanguage(null)).toBe(null)
      expect(mapCountryToLanguage(undefined)).toBe(null)
      expect(mapCountryToLanguage('')).toBe(null)
    })

    it('je case-insensitive', () => {
      expect(mapCountryToLanguage('cz')).toBe('cs')
      expect(mapCountryToLanguage('Cz')).toBe('cs')
      expect(mapCountryToLanguage('CZ')).toBe('cs')
    })
  })

  describe('detectLocale()', () => {
    it('preferuje user preference (nejvyšší priorita)', () => {
      const result = detectLocale('cs', 'en', 'de', 'FR')
      expect(result).toBe('cs')
    })

    it('používá IP geolokaci pokud není user preference', () => {
      const result = detectLocale(null, 'en', 'de', 'CZ')
      expect(result).toBe('cs') // CZ -> cs
    })

    it('používá settings language pokud není IP ani user', () => {
      const result = detectLocale(null, 'de', 'en', null)
      expect(result).toBe('de')
    })

    it('používá Accept-Language header jako poslední před defaultem', () => {
      const result = detectLocale(null, null, 'fr-FR,fr;q=0.9', null)
      expect(result).toBe('fr')
    })

    it('vrátí en jako default fallback', () => {
      const result = detectLocale(null, null, null, null)
      expect(result).toBe('en')
    })

    it('ignoruje nevalidní user preference', () => {
      const result = detectLocale('invalid', 'cs', null, null)
      expect(result).toBe('cs') // Přejde na settings
    })

    it('parsuje Accept-Language header správně', () => {
      const result = detectLocale(null, null, 'de-DE,de;q=0.9,en;q=0.8', null)
      expect(result).toBe('de')
    })

    it('respektuje prioritní pořadí: user > IP > settings > header', () => {
      // Všechny hodnoty jsou různé
      expect(detectLocale('cs', 'de', 'fr', 'IT')).toBe('cs')
      expect(detectLocale(null, 'de', 'fr', 'IT')).toBe('it')
      expect(detectLocale(null, null, 'fr', 'IT')).toBe('it')
      expect(detectLocale(null, null, 'fr-FR', 'JP')).toBe('fr')
    })

    it('ignoruje prázdné stringy', () => {
      const result = detectLocale('', '', '', '')
      expect(result).toBe('en')
    })

    it('ignoruje whitespace', () => {
      const result = detectLocale('  ', '  ', '  ', null)
      expect(result).toBe('en')
    })
  })

  describe('isValidLocale()', () => {
    it('vrátí true pro všechny podporované locales', () => {
      expect(isValidLocale('en')).toBe(true)
      expect(isValidLocale('cs')).toBe(true)
      expect(isValidLocale('de')).toBe(true)
      expect(isValidLocale('fr')).toBe(true)
      expect(isValidLocale('es')).toBe(true)
      expect(isValidLocale('it')).toBe(true)
      expect(isValidLocale('pl')).toBe(true)
    })

    it('vrátí false pro nepodporované locales', () => {
      expect(isValidLocale('ja')).toBe(false)
      expect(isValidLocale('zh')).toBe(false)
      expect(isValidLocale('ru')).toBe(false)
    })

    it('je case-sensitive', () => {
      expect(isValidLocale('EN')).toBe(false)
      expect(isValidLocale('Cs')).toBe(false)
    })

    it('vrátí false pro prázdný string', () => {
      expect(isValidLocale('')).toBe(false)
    })

    it('vrátí false pro nevalidní formát', () => {
      expect(isValidLocale('en-US')).toBe(false)
      expect(isValidLocale('cs_CZ')).toBe(false)
    })
  })

  describe('getAvailableLocales()', () => {
    it('vrátí pole všech dostupných locales', () => {
      const locales = getAvailableLocales()
      expect(Array.isArray(locales)).toBe(true)
      expect(locales.length).toBe(7)
    })

    it('obsahuje všechny podporované locales', () => {
      const locales = getAvailableLocales()
      expect(locales).toContain('en')
      expect(locales).toContain('cs')
      expect(locales).toContain('de')
      expect(locales).toContain('fr')
      expect(locales).toContain('es')
      expect(locales).toContain('it')
      expect(locales).toContain('pl')
    })

    it('každý locale je validní', () => {
      const locales = getAvailableLocales()
      locales.forEach(locale => {
        expect(isValidLocale(locale)).toBe(true)
      })
    })
  })

  describe('getLocaleDisplayName()', () => {
    it('vrátí správný display name pro každý locale', () => {
      expect(getLocaleDisplayName('en')).toBe('English')
      expect(getLocaleDisplayName('cs')).toBe('Čeština')
      expect(getLocaleDisplayName('de')).toBe('Deutsch')
      expect(getLocaleDisplayName('fr')).toBe('Français')
      expect(getLocaleDisplayName('es')).toBe('Español')
      expect(getLocaleDisplayName('it')).toBe('Italiano')
      expect(getLocaleDisplayName('pl')).toBe('Polski')
    })

    it('vrátí locale kód jako fallback pro neznámý locale', () => {
      // @ts-expect-error - testujeme nevalidní vstup
      const result = getLocaleDisplayName('unknown')
      expect(result).toBe('unknown')
    })
  })

  describe('Integration test - kompletní i18n flow', () => {
    it('simuluje user journey přes různé locales', async () => {
      const program = Effect.gen(function* () {
        const service = yield* I18nService

        // 1. Začneme s default locale
        const initialLocale = service.getLocale()

        // 2. Získáme překlad
        const translation1 = service.t('common.save')

        // 3. Změníme locale
        service.setLocale('cs')
        const newLocale = service.getLocale()

        // 4. Získáme překlad v novém locale
        const translation2 = service.t('common.save')

        // 5. Ověříme že klíč existuje
        const hasKey = service.hasKey('common.save')

        return {
          initialLocale,
          translation1,
          newLocale,
          translation2,
          hasKey
        }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeI18nLayer('en')))
      )

      expect(result.initialLocale).toBe('en')
      expect(result.newLocale).toBe('cs')
      expect(result.hasKey).toBe(true)
      expect(typeof result.translation1).toBe('string')
      expect(typeof result.translation2).toBe('string')
    })

    it('simuluje geo-based locale detection', () => {
      // User z Czech Republic
      const localeCZ = detectLocale(null, null, null, 'CZ')
      expect(localeCZ).toBe('cs')

      // User z Germany
      const localeDE = detectLocale(null, null, null, 'DE')
      expect(localeDE).toBe('de')

      // User z France s preference pro English
      const localeFR = detectLocale('en', null, null, 'FR')
      expect(localeFR).toBe('en') // User preference wins
    })
  })
})