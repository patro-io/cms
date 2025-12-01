# Admin User Security - Dokumentace změn

## Přehled

Tato dokumentace popisuje bezpečnostní vylepšení admin uživatele v PatroCMS. Všechna natvrdo nastavená hesla byla odstraněna a nahrazena náhodně generovanými hesly při každé instalaci.

## Problém

**Před změnami:**
- Admin uživatel měl natvrdo nastavené heslo `'patro!'` v několika místech
- Každá instalace měla stejné admin credentials
- Bezpečnostní riziko pro produkční nasazení
- Demo-login plugin používal admin účet

## Řešení

### 1. Odstranění natvrdo nastavených hesel

#### `packages/core/migrations/001_initial_schema.sql`
**Před:**
```sql
INSERT OR IGNORE INTO users (...) VALUES (
  'admin-user-id',
  'admin@patro.io',
  'admin',
  'Admin',
  'User',
  'd1c379e871838f44e21d5a55841349e50636f06df139bfef11870eec74c381db', -- SHA-256 hash of 'patro!'
  'admin',
  ...
);
```

**Po:**
```sql
-- Admin user is NO LONGER created in migrations for security reasons
-- Instead, use one of these methods to create an admin user:
--
-- 1. During installation: pnpm create @patro-io/cms creates admin with random password
-- 2. Manual seeding: pnpm run seed (creates admin with random password)
-- 3. Custom credentials: ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=YourPass pnpm run seed
-- 4. First user registration: Visit /auth/register (becomes admin automatically)
```

### 2. Náhodné generování hesel

#### `packages/create-app/src/cli.js`
```javascript
/**
 * Generuje náhodné bezpečné heslo
 * @returns {string} Náhodné heslo (16 znaků)
 */
function generateSecurePassword() {
  const length = 16;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const randomBytes = crypto.randomBytes(length);
  let password = "";
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  
  return password;
}
```

### 3. Automatické vytvoření admin při instalaci

#### `packages/create-app/src/cli.js`
```javascript
// 7. Seed admin user
if (!skipInstall && answers.migrationsRan) {
  spinner.start("Creating admin user...");
  try {
    const adminPassword = generateSecurePassword();
    await seedAdminUser(targetDir, adminPassword);
    answers.adminPassword = adminPassword;
    answers.adminSeeded = true;
    spinner.succeed("Admin user created");
  } catch (error) {
    spinner.warn("Failed to seed admin user");
    console.log(kleur.dim(`${error.message}`));
    console.log(kleur.dim("You can create admin manually after: pnpm run seed"));
    answers.adminSeeded = false;
  }
}
```

### 4. Zobrazení credentials po instalaci

```javascript
if (adminSeeded && adminPassword) {
  console.log();
  console.log(kleur.bold().green("✓ Admin user credentials:"));
  console.log(kleur.cyan("  Email:    admin@patro.io"));
  console.log(kleur.cyan(`  Password: ${adminPassword}`));
  console.log();
  console.log(kleur.yellow("⚠ IMPORTANT: Save these credentials! Password won't be shown again."));
  console.log(kleur.dim("  You can change the password after first login in admin settings."));
}
```

### 5. Demo-login plugin security fix

#### `packages/core/src/plugins/core-plugins/demo-login/index.ts`
**Před:**
```javascript
emailInput.value = 'admin@patro.io';
passwordInput.value = 'patro!';
```

**Po:**
```javascript
emailInput.value = 'demo@example.com';
passwordInput.value = 'demo123!';
```

**Důvod:** Demo-login plugin nyní používá separátní demo účet místo admin účtu pro bezpečnost.

## Jak to funguje

### Instalace s automatickým seedingem

```bash
pnpm create @patro-io/cms my-app

# Výstup:
✔ Database migrations completed
✔ Admin user created

✓ Admin user credentials:
  Email:    admin@patro.io
  Password: kL8p#Zm2Bx9tRw4Q  ← náhodné při každé instalaci

⚠ IMPORTANT: Save these credentials! Password won't be shown again.
```

### Manuální seeding

#### S náhodným heslem:
```bash
pnpm run seed

# Výstup:
✓ Admin user created successfully
  Email:    admin@patro.io
  Password: X9m#Kp2Wt5Bz8Lq7
  Role:     admin

⚠ IMPORTANT: Save this password! It was randomly generated.
```

#### S vlastními credentials:
```bash
ADMIN_EMAIL=my@email.com ADMIN_PASSWORD=MySecurePass123! pnpm run seed
```

### Development/Testing endpoint

```bash
# POST /auth/seed-admin
curl -X POST http://localhost:8787/auth/seed-admin

# Response:
{
  "message": "Admin user created successfully",
  "user": {
    "id": "uuid-here",
    "email": "admin@patro.io",
    "username": "admin",
    "role": "admin"
  },
  "password": "randomPassword123!",
  "warning": "SAVE THIS PASSWORD! It will not be shown again."
}
```

## Testování

### Lokální test celé instalace

```bash
# Z rootu cms projektu
cd /home/pefen/Projekty/GitHub/cms

# Spusť CLI s cloudflare resources (doporučeno)
node packages/create-app/src/cli.js test-app

# Nebo bez cloudflare (pak musíš spustit migrace manuálně)
node packages/create-app/src/cli.js test-app --skip-cloudflare
cd test-app
pnpm run db:migrate:local
pnpm run seed
pnpm dev
```

### Test credentials

```bash
# 1. Poznamenej si heslo z instalace
# 2. Otevři http://localhost:8787/auth/login
# 3. Přihlaš se s:
#    Email: admin@patro.io
#    Password: [heslo z instalace]
```

## Bezpečnostní vylepšení

✅ **Odstranění natvrdo nastavených hesel**
- Žádné heslo není v kódu ani v migraci
- Každá instalace má unikátní heslo

✅ **Náhodné generování hesel**
- 16-znakové heslo s velkými/malými písmeny, číslicemi a speciálními znaky
- Kryptograficky bezpečné pomocí `crypto.randomBytes()`

✅ **Jasná varování pro uživatele**
- Zobrazí se heslo s upozorněním
- Instrukce jak heslo změnit

✅ **Demo-login plugin oddělen od admin účtu**
- Plugin používá `demo@example.com` místo admin účtu
- Bezpečnostní varování v UI

✅ **Možnost vlastních credentials**
- Přes environment variables
- Flexibilní pro různé prostředí

## Změněné soubory

1. `packages/core/migrations/001_initial_schema.sql` - Odstraněn INSERT s heslem
2. `packages/create-app/src/cli.js` - Přidáno generování a seeding admina
3. `my-patro-app/scripts/seed-admin.ts` - Náhodné heslo místo natvrdo
4. `packages/core/src/routes/auth.ts` - Endpoint generuje náhodné heslo
5. `packages/core/src/plugins/core-plugins/demo-login/index.ts` - Demo účet místo admin
6. `packages/core/src/templates/pages/auth-login.template.ts` - Demo účet v prefill
7. `my-patro-app/README.md` - Aktualizované instrukce

## Migrace pro existující projekty

Pokud máš existující projekt s natvrdo nastaveným heslem:

```bash
# 1. Resetuj admin heslo
ADMIN_EMAIL=admin@patro.io ADMIN_PASSWORD=NewSecurePass123! pnpm run seed

# 2. Nebo vytvoř nového admina s jiným emailem
ADMIN_EMAIL=newemail@example.com ADMIN_PASSWORD=SecurePass123! pnpm run seed

# 3. Nebo použij /auth/register na čistém projektu
# První registrovaný uživatel se stane admin automaticky
```

## FAQ

**Q: Co když zapomenu heslo z instalace?**  
A: Můžeš použít `pnpm run seed` aby se vytvořil nový admin nebo změnit heslo v admin settings po přihlášení.

**Q: Funguje demo-login plugin ještě?**  
A: Ano, ale používá `demo@example.com/demo123!` místo admin účtu. Musíš si vytvořit tento demo účet manuálně.

**Q: Jak změním admin heslo po první instalaci?**  
A: Přihlaš se do admin interface → Settings → Change Password

**Q: Mohu použít vlastní email pro admin?**  
A: Ano, při seedingu: `ADMIN_EMAIL=your@email.com pnpm run seed`

**Q: Je heslo vidět v logu instalace?**  
A: Ano, záměrně - aby uživatel měl jedinečnou příležitost si ho poznamenat. Po tom už se nikde nezobrazuje.

## Autor

Implementováno jako část Effect TS migrace PatroCMS  
Datum: 2025-12-01