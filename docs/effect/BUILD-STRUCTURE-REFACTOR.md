# Refaktoring Build Struktury - @patro-io/cms Core Package

**Datum:** 2025-12-01  
**Autor:** Effect TS Migrator  
**Status:** ✅ Implementováno

## Přehled

Reorganizace výstupní struktury build procesu v `packages/core` pro lepší přehlednost a profesionální vzhled distribučních souborů.

## Motivace

### Problémy původní struktury:
- **84+ souborů** na jedné úrovni v `dist/` složce
- **Nepřehledné hash-ované názvy**: `chunk-2TGYZJTN.js`, `config-provider-LCOWX45Y.cjs`
- **Promíchané formáty**: ESM (`.js`) a CJS (`.cjs`) soubory bez oddělení
- **Ztížená navigace** pro vývojáře i build nástroje
- **Neprofesionální vzhled** pro open-source distribuci

## Implementace

### Nová Struktura `dist/`

```
dist/
├── esm/                    # ES Modules
│   ├── index.js
│   ├── services.js
│   ├── middleware.js
│   ├── routes.js
│   ├── templates.js
│   ├── plugins.js
│   ├── utils.js
│   ├── types.js
│   └── *.js.map           # sourcemapy
│
├── cjs/                    # CommonJS
│   ├── index.cjs
│   ├── services.cjs
│   ├── middleware.cjs
│   ├── routes.cjs
│   ├── templates.cjs
│   ├── plugins.cjs
│   ├── utils.cjs
│   ├── types.cjs
│   └── *.cjs.map          # sourcemapy
│
├── chunks/                 # Sdílené chunky (code-splitting)
│   ├── chunk-*.js         # ESM chunky
│   ├── chunk-*.cjs        # CJS chunky
│   ├── config-provider-*.js
│   └── config-provider-*.cjs
│
└── types/                  # TypeScript definice
    ├── index.d.ts
    ├── services.d.ts
    ├── middleware.d.ts
    ├── routes.d.ts
    ├── templates.d.ts
    ├── plugins.d.ts
    ├── utils.d.ts
    └── types.d.ts
```

### Změny v Souborech

#### 1. [`packages/core/tsup.config.ts`](../../packages/core/tsup.config.ts)

**Klíčové změny:**
- Přidán `outDir: 'dist'` parametr
- Konfigurace `chunkNames` v `esbuildOptions` pro organizaci chunků
- Rozšířený `onSuccess` hook pro organizaci souborů:
  - Vytvoření složek `esm/`, `cjs/`, `types/`
  - Přesun `.js` souborů do `esm/`
  - Přesun `.cjs` souborů do `cjs/`
  - Přesun `.d.ts` souborů do `types/`
  - Aktualizované cesty v type definition souborech (`../src` → `../../src`)

**Kód přesunovací logiky:**
```typescript
// Vytvořit strukturu složek
const esmDir = path.join(distDir, 'esm')
const cjsDir = path.join(distDir, 'cjs')
const typesDir = path.join(distDir, 'types')

// Přesunout soubory podle přípony
for (const file of files) {
  if (file.endsWith('.js')) {
    fs.renameSync(filePath, path.join(esmDir, file))
  } else if (file.endsWith('.cjs')) {
    fs.renameSync(filePath, path.join(cjsDir, file))
  }
  // ... další logika
}
```

#### 2. [`packages/core/package.json`](../../packages/core/package.json)

**Aktualizované cesty:**
```json
{
  "main": "./dist/cjs/index.cjs",      // was: ./dist/index.cjs
  "module": "./dist/esm/index.js",     // was: ./dist/index.js
  "types": "./dist/types/index.d.ts",  // was: ./dist/index.d.ts
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.cjs"
    },
    "./services": {
      "types": "./dist/types/services.d.ts",
      "import": "./dist/esm/services.js",
      "require": "./dist/cjs/services.cjs"
    }
    // ... všechny ostatní exporty aktualizovány
  }
}
```

## Výhody Nové Struktury

### ✅ Přehlednost
- Jasné oddělení formátů (ESM vs CJS)
- Snadná navigace ve složkové struktuře
- Chunky izolované ve vlastní složce

### ✅ Profesionalita
- Standardní struktura používaná v moderních knihovnách (Effect TS, Vitest, Vite)
- Čisté oddělení concerns (kód vs typy vs sourcemapy)

### ✅ Developer Experience
- Rychlejší nalezení specifických souborů
- Lepší debugging díky logické organizaci sourcemap
- Snadnější analýza bundle size per format

### ✅ Maintenance
- Jasné patternы pro budoucí rozšíření
- Snadnější troubleshooting build issues
- Lepší integrace s toolingem (IDE, bundlery)

## Testování

### Build proces:
```bash
cd packages/core
pnpm build
```

**Výsledek:**
```
✓ Build artifacts organized:
  - ESM files → dist/esm/
  - CJS files → dist/cjs/
  - Type definitions → dist/types/
✓ Build complete!
```

### Verifikace struktury:
```bash
ls -la dist/
# Mělo by ukázat: cjs/, esm/, types/, chunks/
```

## Kompatibilita

### ✅ Zpětná Kompatibilita
- Package.json `exports` jsou správně aktualizované
- Node.js module resolution funguje bez změn
- Všechny existující importy zůstávají funkční:
  ```typescript
  import { createApp } from '@patro-io/cms'
  import { UserService } from '@patro-io/cms/services'
  ```

### 📦 Bundle Size
- Žádný dopad na velikost bundlů
- Code-splitting a tree-shaking funguje stejně

## Další Kroky

### Možná Vylepšení (Budoucnost):
1. **Sémantické názvy chunků**: Místo `chunk-HASH` použít `shared-database.js`, `shared-config.js`
2. **Separátní sourcemap složka**: Přesunout všechny `.map` soubory do `dist/maps/`
3. **Build stats**: Přidat reporting o velikosti per format
4. **Bundle analysis**: Integrovat visualizaci dependency grafu

## Závěr

Refaktoring úspěšně implementován a otestován. Nová struktura poskytuje čistší, profesionálnější organizaci build výstupu s jasným oddělením concerns a lepší developer experience.

---

**Poznámky:**
- Všechny testy prošly úspěšně
- Build proces funguje bez chyb
- Zpětná kompatibilita zachována