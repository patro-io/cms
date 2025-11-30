# Zadání: Effect.Config Refactor

**Priorita:** Střední  
**Složitost:** Vysoká  
**Odhadovaný čas:** 4-6 hodin  
**Prerekvizity:** Dokončená Effect TS migrace (Sprint 1 & 2)

---

## 🎯 Cíl

Refaktorovat konfigurační systém projektu na **Effect.Config** pro type-safe a composable konfiguraci environment variables. Eliminovat manuální předávání `c.env` napříč závislostmi a nahradit ho deklarativním Config systémem.

## 📋 Kontext

### Současný stav
- Konfigurace je přístupná přes `c.env` (Hono Context)
- Environment variables se manuálně předávají do služeb
- Žádná validace ENV variables při startu
- Není jasné které ENV vars jsou required vs optional

### Cílový stav
- Deklarativní Config schémata pro všechny ENV variables
- Type-safe přístup k ENV vars pomocí `yield* Config.string("VAR")`
- Validace všech ENV vars při startu aplikace
- Custom ConfigProvider napojený na `c.env` (Cloudflare Workers bindings)
- Jasná dokumentace required/optional/default hodnot

---

## 📚 Důležité reference

### Dokumentace
1. **Effect Config docs:** https://effect.website/docs/configuration
2. **Lokální reference:** [`/home/pefen/Projekty/GitHub/cms/llms-effect.txt`](../../llms-effect.txt) - Effect TS best practices
3. **Roadmap:** [`internal-docs/architecture/effect-migration-roadmap.md`](../../internal-docs/architecture/effect-migration-roadmap.md) - sekce 2.3

### Klíčové soubory
- **Services:** `packages/core/src/services/` - všechny služby používající ENV vars
- **App entry:** `packages/core/src/app.ts` - hlavní entry point, zde se nastaví ConfigProvider
- **Types:** `packages/core/src/app.ts` (Bindings interface) - definice ENV variables

---

## 🔨 Implementační kroky

### Krok 1: Analýza současných ENV variables

**Úkol:** Projdi všechny soubory a identifikuj ENV variables

```bash
# V packages/core/
grep -r "c\.env\." src/ --include="*.ts" | grep -v test
```

**Očekávaný výstup:** Seznam ENV vars jako:
- `c.env.DB` - D1 Database (required)
- `c.env.JWT_SECRET` - JWT secret (required)
- `c.env.CACHE_KV` - KV namespace (optional)
- `c.env.AI` - Cloudflare AI binding (optional)
- atd.

**Výsledek:** Vytvoř markdown dokument `docs/effect/ENV_VARIABLES.md` s kompletním seznamem.

---

### Krok 2: Vytvoř Config schémata

**Soubor:** `packages/core/src/config/app-config.ts`

**Implementace:**

```typescript
import { Config } from 'effect'

/**
 * JWT Configuration
 */
export const JwtConfig = Config.all({
  secret: Config.string('JWT_SECRET'),
  expiresIn: Config.string('JWT_EXPIRES_IN').pipe(
    Config.withDefault('24h')
  )
})

/**
 * Database Configuration
 * Poznámka: D1 Database je Cloudflare binding, ne string!
 * Proto použijeme custom handling v ConfigProvider
 */
export const DbConfig = Config.succeed('DB') // Placeholder - bude resolved custom ConfigProviderem

/**
 * Cache Configuration
 */
export const CacheConfig = Config.all({
  enabled: Config.boolean('CACHE_ENABLED').pipe(
    Config.withDefault(true)
  ),
  ttl: Config.number('CACHE_TTL').pipe(
    Config.withDefault(3600)
  )
})

/**
 * AI Translation Configuration (optional)
 */
export const AiConfig = Config.optional(
  Config.succeed('AI') // Cloudflare AI binding
)

/**
 * Complete App Configuration
 */
export const AppConfig = Config.all({
  jwt: JwtConfig,
  db: DbConfig,
  cache: CacheConfig,
  ai: AiConfig
})

// Type inference
export type AppConfig = Config.Config.Success<typeof AppConfig>
```

---

### Krok 3: Vytvoř Custom ConfigProvider

**Soubor:** `packages/core/src/config/config-provider.ts`

**Účel:** Napojit Effect.Config na Cloudflare Workers `c.env`

```typescript
import { ConfigProvider, ConfigError } from 'effect'
import type { Bindings } from '../app'

/**
 * Vytvoří ConfigProvider pro Cloudflare Workers environment
 * 
 * Tento provider:
 * - Mapuje ENV variables z c.env (Cloudflare bindings)
 * - Podporuje Cloudflare-specific bindings (D1, KV, AI)
 * - Failuje s jasnou chybou pokud required config chybí
 */
export function makeCloudflareConfigProvider(env: Bindings): ConfigProvider.ConfigProvider {
  return ConfigProvider.fromMap(
    new Map([
      // String configs
      ['JWT_SECRET', env.JWT_SECRET || ''],
      ['JWT_EXPIRES_IN', '24h'],
      
      // Boolean configs
      ['CACHE_ENABLED', 'true'],
      
      // Number configs  
      ['CACHE_TTL', '3600'],
      
      // Cloudflare bindings - speciální handling
      // Poznámka: Tyto se předávají přímo do Layer, ne přes Config
    ])
  )
}

/**
 * Layer pro AppConfig napojený na Cloudflare environment
 */
export function makeAppConfigLayer(env: Bindings) {
  return ConfigProvider.layer(makeCloudflareConfigProvider(env))
}
```

---

### Krok 4: Refaktoruj služby na Effect.Config

**Příklad:** AuthService používající JWT config

**PŘED:**
```typescript
// packages/core/src/services/auth-effect.ts
export const makeAuthServiceLayer = () => 
  Layer.succeed(
    AuthService,
    AuthService.of({
      generateToken: (userId, email, role) =>
        Effect.gen(function* (_) {
          const secret = 'hardcoded-secret' // PROBLÉM!
          // ...
        })
    })
  )
```

**PO:**
```typescript
import { JwtConfig } from '../config/app-config'

export const makeAuthServiceLayer = () => 
  Layer.effect(
    AuthService,
    Effect.gen(function* (_) {
      // Získej JWT config z Effect.Config
      const jwtConfig = yield* JwtConfig
      
      return AuthService.of({
        generateToken: (userId, email, role) =>
          Effect.gen(function* (_) {
            const secret = jwtConfig.secret // Type-safe!
            const expiresIn = jwtConfig.expiresIn
            // ...
          })
      })
    })
  )
```

---

### Krok 5: Integrace do app.ts

**Soubor:** `packages/core/src/app.ts`

**Změny:**

```typescript
import { makeAppConfigLayer } from './config/config-provider'

// V každém route handleru:
app.get('/some-route', (c) => {
  const program = Effect.gen(function* (_) {
    const authService = yield* AuthService
    // authService už má access k JWT config!
    // ...
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAuthServiceLayer()),
      Effect.provide(makeAppConfigLayer(c.env)), // ✅ Poskytni config
      Effect.catchAll(handleError)
    )
  )
})
```

---

### Krok 6: Migrace všech služeb

**Services k migraci:**
- ✅ `AuthService` - JWT config
- ✅ `LoggerService` - pokud používá ENV vars
- ✅ `CacheService` - cache TTL config
- ✅ `MediaService` - pokud používá storage config
- ✅ Všechny další služby s ENV dependencies

**Pro každou službu:**
1. Identifikuj které ENV vars používá
2. Vytvoř/použij příslušné Config schema
3. Refaktoruj Layer na `Layer.effect` s `yield* Config`
4. Otestuj že všechny testy stále procházejí

---

### Krok 7: Validace při startu

**Soubor:** `packages/core/src/app.ts`

**Přidej startup validation:**

```typescript
import { AppConfig } from './config/app-config'

// Na začátku aplikace
const validateConfig = (env: Bindings) =>
  Effect.gen(function* (_) {
    // Zkus načíst celou config - failne pokud něco chybí
    const config = yield* AppConfig
    
    console.log('✅ Configuration validated successfully')
    console.log('Cache enabled:', config.cache.enabled)
    console.log('JWT expires in:', config.jwt.expiresIn)
    
    return config
  }).pipe(
    Effect.provide(makeAppConfigLayer(env)),
    Effect.catchAll((error) => {
      console.error('❌ Configuration validation failed:', error)
      return Effect.fail(error)
    })
  )

// Použij při startu (nebo v prvním requestu)
```

---

## ✅ Acceptance Criteria

### Funkční požadavky
- [ ] Všechny ENV variables jsou definovány v Config schématech
- [ ] Custom ConfigProvider funguje s Cloudflare bindings
- [ ] Všechny služby používají `yield* Config` místo `c.env`
- [ ] Config je validována při startu (nebo prvním requestu)
- [ ] Cloudflare-specific bindings (D1, KV, AI) jsou správně handleny

### Testování
- [ ] Všechny unit testy procházejí
- [ ] Config validace failne s jasnou chybou pokud required ENV var chybí
- [ ] Mock testy mají mock ConfigProvider

### Dokumentace
- [ ] `ENV_VARIABLES.md` - seznam všech ENV vars s popisem
- [ ] Komentáře v Config schématech vysvětlují required/optional/default
- [ ] README update s instrukcemi pro ENV setup

---

## 🚧 Potenciální problémy

### 1. Cloudflare Bindings nejsou stringy
**Problém:** D1, KV, AI jsou objekty, ne ENV variables  
**Řešení:** Předávej je přímo do Layers, ne přes Config. Config použij jen pro string/number/boolean ENV vars.

```typescript
// SPRÁVNĚ:
export function makeDatabaseLayer(db: D1Database) {
  return Layer.succeed(DatabaseService, DatabaseService.of({ db }))
}

// V handleru:
Effect.provide(makeDatabaseLayer(c.env.DB))
```

### 2. Test environment
**Problém:** Testy nemají `c.env`  
**Řešení:** Mock ConfigProvider v testech:

```typescript
const mockConfigProvider = ConfigProvider.fromMap(
  new Map([
    ['JWT_SECRET', 'test-secret'],
    ['JWT_EXPIRES_IN', '1h']
  ])
)

const testLayer = ConfigProvider.layer(mockConfigProvider)
```

### 3. Migration complexity
**Problém:** Změna všech services najednou je riskantní  
**Řešení:** Migruj postupně:
1. AuthService (malá, izolovaná)
2. LoggerService
3. Ostatní služby
4. Po každé změně spusť testy

---

## 📖 Best Practices

1. **Type-safe defaults:**
   ```typescript
   Config.string('VAR').pipe(
     Config.withDefault('default-value')
   )
   ```

2. **Validace hodnot:**
   ```typescript
   Config.number('PORT').pipe(
     Config.validate({
       message: 'Port must be between 1024 and 65535',
       validation: (port) => port >= 1024 && port <= 65535
     })
   )
   ```

3. **Environment-specific config:**
   ```typescript
   const isDev = Config.string('NODE_ENV').pipe(
     Config.withDefault('development'),
     Config.map(env => env === 'development')
   )
   ```

4. **Dokumentuj každý Config:**
   ```typescript
   /**
    * JWT Secret pro signing tokens
    * 
    * @required
    * @example "my-super-secret-key-change-in-production"
    */
   export const JwtSecret = Config.string('JWT_SECRET')
   ```

---

## 📦 Deliverables

1. **Code:**
   - `packages/core/src/config/app-config.ts` - Config schémata
   - `packages/core/src/config/config-provider.ts` - Custom provider
   - Refaktorované services v `packages/core/src/services/`
   - Updated `packages/core/src/app.ts`

2. **Documentation:**
   - `docs/effect/ENV_VARIABLES.md` - Seznam ENV vars
   - `README.md` update - ENV setup instrukce
   - Komentáře v Config schématech

3. **Tests:**
   - Mock ConfigProvider v test helpers
   - Config validation testy
   - Všechny existující testy procházejí

---

## 🎓 Learning Resources

1. **Effect Config Tutorial:**
   ```bash
   # Přečti si v llms-effect.txt sekci o Config
   cat /home/pefen/Projekty/GitHub/cms/llms-effect.txt | grep -A 50 "Config"
   ```

2. **Effect Config Examples:**
   - https://effect.website/docs/guides/configuration
   - https://effect.website/docs/guides/configuration/providers

3. **Cloudflare Workers ENV:**
   - https://developers.cloudflare.com/workers/configuration/environment-variables/

---

## 🚀 Getting Started

```bash
# 1. Nastuduj Effect.Config docs
cat llms-effect.txt | grep -A 100 "Effect.Config"

# 2. Analyzuj současné ENV usage
cd packages/core
grep -r "c\.env\." src/ --include="*.ts" | grep -v test > /tmp/env-usage.txt

# 3. Vytvoř Config strukturu
mkdir -p src/config
touch src/config/app-config.ts
touch src/config/config-provider.ts

# 4. Začni s AuthService refactorem (nejmenší)
# ... implementuj postupně ...

# 5. Po každé změně spusť testy
pnpm test
```

---

## ❓ Otázky před začátkem

Pokud něco není jasné, zeptej se:

1. Mají všechny ENV variables default hodnoty nebo jsou některé required?
2. Používá projekt development vs production environment?
3. Jsou nějaké ENV variables secret (nelogovat je)?
4. Existují ENV variables specifické pro testy?

---

**Vytvořeno:** 2025-11-30  
**Autor:** Effect TS Migrator  
**Status:** Ready for implementation  