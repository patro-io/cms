# Oprava: Vytváření administrátora během `create-cms` instalace

## Problém
Uživatel zadaný během interaktivní instalace pomocí `create-cms` CLI se nevytvořil v databázi. Po instalaci a přihlášení v seznamu uživatelů chyběl očekávaný admin účet.

## Identifikované příčiny

### 1. **Hlavní problém: Hardcodované hodnoty v seed scriptu**
V [`packages/create-app/src/cli.js:469-603`](packages/create-app/src/cli.js:469) funkce `createAdminSeedScript()` generovala seed script s hardcodovanými hodnotami namísto použití parametrů z interpolace:

```javascript
// ❌ CHYBA - hardcodované hodnoty
const existingUser = await db
  .select()
  .from(users)
  .where(eq(users.email, 'admin@patro.io'))  // Hardcoded!
  .get()

const passwordHash = await hashPassword('patro!', passwordSalt)  // Hardcoded!

await db.insert(users).values({
  email: 'admin@patro.io',  // Hardcoded!
  username: 'admin',  // Hardcoded!
  // ...
})
```

### 2. **Vedlejší problém: Špatný import getPlatformProxy**
Seed script používal neexistující import:
```typescript
// ❌ CHYBA
const { env } = await import('@cloudflare/workers-types/experimental')
const platform = (env as any).getPlatformProxy?.() || { env: {} }
```

Správně by měl používat oficiální wrangler API:
```typescript
// ✅ SPRÁVNĚ
import { getPlatformProxy } from 'wrangler'
const platform = await getPlatformProxy<Env>()
```

### 3. **Chybějící cleanup: Memory leak**
Seed script nevolal `platform.dispose()` po dokončení, což způsobovalo memory leaks.

## Řešení

### Změny v `packages/create-app/src/cli.js`

#### 1. Správné použití interpolace parametrů (řádky 502-503, 542-543, 563-564)
```javascript
// ✅ OPRAVENO - použití parametrů z CLI
const adminEmail = process.env.ADMIN_EMAIL || '${email}'
const adminPassword = process.env.ADMIN_PASSWORD || '${password}'

const existingUser = await db
  .select()
  .from(users)
  .where(eq(users.email, adminEmail))  // Použití proměnné
  .get()

const passwordHash = await hashPassword(adminPassword, passwordSalt)  // Použití proměnné

await db.insert(users).values({
  email: adminEmail,  // Použití proměnné
  username: adminEmail.split('@')[0],  // Dynamické
  // ...
})
```

#### 2. Správný import a error handling (řádky 472, 509-519)
```typescript
// ✅ OPRAVENO
import { getPlatformProxy } from 'wrangler'

let platform: Awaited<ReturnType<typeof getPlatformProxy<Env>>>

try {
  platform = await getPlatformProxy<Env>()
} catch (error) {
  console.error('❌ Error: Failed to get platform proxy')
  console.error('Make sure you are running this with tsx/node and wrangler is installed')
  console.error('')
  console.error(error)
  process.exit(1)
}
```

#### 3. Správný cleanup (řádky 531, 551, 582, 587)
```typescript
// ✅ OPRAVENO - dispose po každém konci
if (!platform.env?.DB) {
  // ...
  await platform.dispose()
  process.exit(1)
}

if (existingUser) {
  // ...
  await platform.dispose()
  return
}

// Po úspěšném seedu
await platform.dispose()

// Při chybě
catch (error) {
  // ...
  await platform.dispose()
  process.exit(1)
}
```

### Změny v `my-patro-app/scripts/seed-admin.ts`

Aplikoval jsem stejné opravy na existující seed script pro konzistenci.

## Ověření oprav

### Před opravou:
- ❌ Seed script vytvářel vždy uživatele `admin@patro.io` s heslem `patro!`
- ❌ CLI parametry (zadaný email/heslo) byly ignorovány
- ❌ Import selhal s chybou o chybějícím modulu
- ❌ Memory leaks kvůli nevolání dispose()

### Po opravě:
- ✅ Seed script používá email a heslo zadané během CLI instalace
- ✅ Fallback na environment proměnné nebo defaultní hodnoty
- ✅ Správný import z `wrangler` balíčku
- ✅ Správný cleanup s `platform.dispose()`
- ✅ Lepší error messages s jasným řešením

## Testování

Pro test funkčnosti:

```bash
# 1. Spusť create-cms CLI
npx @patro-io/create-cms test-app

# 2. Během interaktivní instalace zadej:
# - Admin email: petr@patro.io
# - Admin password: testPassword123

# 3. Po dokončení instalace zkontroluj:
cd test-app
pnpm db:studio

# 4. V D1 Studio zkontroluj tabulku users
# Měl by existovat uživatel s emailem: petr@patro.io

# 5. Vyzkoušej přihlášení:
pnpm dev
# Otevři http://localhost:8787/auth/login
# Přihlas se s: petr@patro.io / testPassword123
```

## Ovlivněné soubory
- [`packages/create-app/src/cli.js`](packages/create-app/src/cli.js) - Hlavní CLI logika
- [`my-patro-app/scripts/seed-admin.ts`](my-patro-app/scripts/seed-admin.ts) - Existující seed script

## Související
- Error handling v CLI: [`packages/create-app/src/cli.js:373-389`](packages/create-app/src/cli.js:373)
- Seed funkce: [`packages/create-app/src/cli.js:848-881`](packages/create-app/src/cli.js:848)