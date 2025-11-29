import { Schema } from 'effect'
import { SUPPORTED_LANGUAGES, type LanguageCode } from './ai-translation-service'

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS = {
  enabled: true,
  defaultSourceLanguage: 'en' as const,
  targetLanguages: ['cs', 'en', 'de', 'fr', 'es', 'it', 'pl'] as LanguageCode[],
  autoTranslate: true,
  translateOnCreate: true,
  translateOnUpdate: false,
  aiModel: '@cf/meta/m2m100-1.2b',
  translatableFields: ['title', 'content', 'excerpt', 'description', 'meta_title', 'meta_description']
}

/**
 * Schema pro LanguageCode
 */
const LanguageCodeSchema = Schema.Literal(...SUPPORTED_LANGUAGES)

/**
 * Helper pro pole, které musí být robustní vůči nevalidním datům.
 * Pokud vstup není pole, nebo je prázdné pole, vrátí defaultní hodnotu.
 * Toto řeší problém, kdy DB obsahuje "" nebo null místo [].
 */
const fallbackIfEmpty = <A>(itemSchema: Schema.Schema<A>, defaultValue: readonly A[]) => {
  return Schema.transform(
    Schema.Unknown, // Akceptujeme cokoliv na vstupu (string, null, array, ...)
    Schema.Array(itemSchema), // Výstup garantujeme jako pole
    {
      decode: (input) => {
        // Pokud je to pole a má prvky, zkusíme ho použít
        if (Array.isArray(input) && input.length > 0) {
          // Zde by ideálně měla proběhnout validace prvků, ale pro 'forgiving' parsing
          // předpokládáme, že pokud je to pole, chceme ho zachovat (nebo se validace stane později).
          // Pro maximální bezpečnost bychom mohli filtrovat jen validní itemy, 
          // ale to by vyžadovalo parse pro každý item.
          // V tomto kontextu (settings) stačí vrátit input a nechat Schema validovat strukturu,
          // ale protože Unknown -> Array transformace je "brutální", musíme si být jistí.
          
          // Jednoduchý hack: pokud je to pole stringů (pro naše případy), vrátíme ho.
          return input as any
        }
        
        // Pro vše ostatní (null, undefined, "", [], {}, 123...) vracíme default
        return defaultValue
      },
      encode: (val) => val,
      strict: false
    }
  )
}

/**
 * Schema pro nastavení pluginu
 */
export const AiTranslatorSettingsSchema = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => DEFAULT_SETTINGS.enabled }),
  
  defaultSourceLanguage: Schema.optionalWith(LanguageCodeSchema, { default: () => DEFAULT_SETTINGS.defaultSourceLanguage }),
  
  targetLanguages: Schema.optionalWith(
    fallbackIfEmpty(
      LanguageCodeSchema,
      DEFAULT_SETTINGS.targetLanguages
    ),
    { default: () => DEFAULT_SETTINGS.targetLanguages }
  ),
  
  autoTranslate: Schema.optionalWith(Schema.Boolean, { default: () => DEFAULT_SETTINGS.autoTranslate }),
  
  translateOnCreate: Schema.optionalWith(Schema.Boolean, { default: () => DEFAULT_SETTINGS.translateOnCreate }),
  
  translateOnUpdate: Schema.optionalWith(Schema.Boolean, { default: () => DEFAULT_SETTINGS.translateOnUpdate }),
  
  aiModel: Schema.optionalWith(Schema.String, { default: () => DEFAULT_SETTINGS.aiModel }),
  
  translatableFields: Schema.optionalWith(
    fallbackIfEmpty(
      Schema.String,
      DEFAULT_SETTINGS.translatableFields
    ),
    { default: () => DEFAULT_SETTINGS.translatableFields }
  )
})

// Export type derived from Schema
export type AiTranslatorSettings = Schema.Schema.Type<typeof AiTranslatorSettingsSchema>