# Effect Schema Tests

Tato složka obsahuje všechny testy pro kód migrovaný na **Effect Schema** architektur u.

## 📁 Struktura

```
effect/
├── routes/          # Testy pro core routes (admin-api, auth, media, atd.)
├── plugins/         # Testy pro plugin system
└── README.md        # Tento soubor
```

## 🎯 Účel

Oddělení Effect testů od legacy testů umožňuje:
- ✅ Spouštět pouze Effect testy: `pnpm test effect/`
- ✅ Jasné oddělení "nové éry" (Effect) od "staré éry" (Legacy)
- ✅ Lepší organizaci a přehlednost
- ✅ Snadnější údržbu a rozšiřování

## 🧪 Spuštění testů

```bash
# Všechny Effect testy
pnpm test -- --run src/__tests__/effect/

# Pouze routes testy
pnpm test -- --run src/__tests__/effect/routes/

# Pouze plugin testy
pnpm test -- --run src/__tests__/effect/plugins/
```

## 📊 Pokrytí

### Routes (Fáze 1)
- ✅ `admin-api.test.ts` - Admin API endpoints
- ✅ `admin-code-examples.test.ts` - Code examples management
- ✅ `admin-media.test.ts` - Media management
- ✅ `admin-testimonials.test.ts` - Testimonials management
- ✅ `api-media.test.ts` - Public media API
- ✅ `auth.test.ts` - Authentication routes

### Plugins (Fáze 2)
- ✅ `code-examples.test.ts` - Code examples plugin
- ✅ `testimonials.test.ts` - Testimonials plugin
- ✅ `magic-link-auth.test.ts` - Magic link authentication
- ✅ `otp-login.test.ts` - OTP login plugin

## 🔧 Technické detaily

Všechny testy používají:
- **Effect Schema** pro validaci (`Schema.decodeUnknownEither()`)
- **Vitest** jako test runner
- **Hono** framework pro HTTP testování
- **Mockování** databáze a služeb

## 📝 Konvence

### Struktura testu
```typescript
import { Schema } from 'effect'

const mySchema = Schema.Struct({
  field: Schema.String.pipe(Schema.minLength(1))
})

describe('Feature - Schema Validation', () => {
  describe('Valid input', () => {
    it('should validate correct data', () => {
      const result = Schema.decodeUnknownEither(mySchema)(validData)
      expect(result._tag).toBe('Right')
    })
  })

  describe('Invalid input', () => {
    it('should reject invalid data', () => {
      const result = Schema.decodeUnknownEither(mySchema)(invalidData)
      expect(result._tag).toBe('Left')
    })
  })
})
```

### Import paths
Všechny importy používají relativní cesty od `effect/` složky:
```typescript
// Z effect/routes/
import route from '../../../routes/my-route'

// Z effect/plugins/
import plugin from '../../../plugins/my-plugin'
```

## 📈 Historie

- **PR #2**: Infrastruktura (middleware, services)
- **PR #3 - Fáze 1**: Core Routes migration (6 route testů)
- **PR #3 - Fáze 2**: Plugin System migration (infrastruktura)
- **PR #3 - Fáze 2.5**: Plugin tests (4 plugin testy)
- **PR #3 - Refactoring**: Reorganizace do effect/ složky

## 🔗 Související dokumenty

- [`docs/EFFECT_MIGRATION_STATUS.md`](../../../../docs/EFFECT_MIGRATION_STATUS.md) - Roadmapa migrace
- [`docs/EFFECT_REVOLUTION_ANALYSIS.md`](../../../../docs/EFFECT_REVOLUTION_ANALYSIS.md) - Analýza budoucích kroků