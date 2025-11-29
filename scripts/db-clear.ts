import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const CONFIG_FILE = "my-patro-app/wrangler.jsonc";

interface D1Database {
    binding: string;
    database_name: string;
    database_id: string;
}

function runCommand(command: string): string {
    try {
        return execSync(command, { encoding: "utf-8", stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e: any) {
        const output = e.stdout || e.stderr || "";
        try {
            const jsonError = JSON.parse(output);
            if (jsonError.error) {
                console.error(`❌ Chyba Cloudflare API: ${jsonError.error.text}`);
            }
        } catch {
            console.error(`❌ Chyba příkazu:\n${output}`);
        }
        process.exit(1);
    }
}

function parseJsonc(content: string): any {
    // Odstranit komentáře ze JSONC
    const withoutComments = content
        .replace(/\/\/.*$/gm, '') // single-line komentáře
        .replace(/\/\*[\s\S]*?\*\//g, ''); // multi-line komentáře
    return JSON.parse(withoutComments);
}

function loadDatabases(): D1Database[] {
    console.log(`📖 Načítám konfiguraci z ${CONFIG_FILE}...`);
    const configPath = resolve(process.cwd(), CONFIG_FILE);
    const configContent = readFileSync(configPath, 'utf-8');
    const config = parseJsonc(configContent);
    
    const databases: D1Database[] = [];
    
    // Defaultní databáze
    if (config.d1_databases && Array.isArray(config.d1_databases)) {
        databases.push(...config.d1_databases);
    }
    
    // Production databáze
    if (config.env?.production?.d1_databases && Array.isArray(config.env.production.d1_databases)) {
        for (const prodDb of config.env.production.d1_databases) {
            // Přidat pouze pokud ještě není v seznamu (kontrola podle database_id)
            if (!databases.some(db => db.database_id === prodDb.database_id)) {
                databases.push(prodDb);
            }
        }
    }
    
    return databases;
}

function clearDatabase(dbName: string) {
    console.log(`\n🔍 Načítám tabulky z databáze: ${dbName}...`);
    
    const jsonOutput = runCommand(
        `wrangler d1 execute ${dbName} --remote --command "SELECT name FROM sqlite_schema WHERE type ='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" --json`
    );
    
    const parsed = JSON.parse(jsonOutput);
    const tables = parsed[0]?.results?.map((r: any) => r.name) as string[] || [];
    
    if (tables.length === 0) {
        console.log("✅ Databáze je již prázdná (žádné tabulky).");
        return;
    }
    
    console.log(`🗑️  Odstraňuji ${tables.length} tabulek...`);
    
    // Vytvořit dočasný SQL soubor s DROP TABLE příkazy
    const dropStatements = tables.map(table => `DROP TABLE IF EXISTS "${table}";`).join('\n');
    const batchSQL = `PRAGMA foreign_keys = OFF;
${dropStatements}
PRAGMA foreign_keys = ON;`;
    
    const tmpFile = join(tmpdir(), `db-clear-${Date.now()}.sql`);
    
    try {
        // Zapsat SQL do dočasného souboru
        writeFileSync(tmpFile, batchSQL, 'utf-8');
        console.log(`📝 SQL příkazy připraveny (${tables.length} tabulek)`);
        
        // Spustit pomocí --file parametru
        runCommand(`wrangler d1 execute ${dbName} --remote --file="${tmpFile}"`);
        
        console.log(`✅ Odstraněno ${tables.length} tabulek`);
    } finally {
        // Smazat dočasný soubor
        try {
            unlinkSync(tmpFile);
        } catch (e) {
            // Ignorovat chyby při mazání temp souboru
        }
    }
    
    console.log("✨ Všechny tabulky odstraněny (databáze připravena pro nové migrace).");
}

console.log("🚀 Čištění D1 databází (DROP TABLE)...\n");
console.log("⚠️  POZOR: Tato operace ODSTRANÍ VŠECHNY TABULKY z databází!");
console.log("⚠️  Po této operaci bude nutné spustit migrace znovu.\n");

const databases = loadDatabases();

if (databases.length === 0) {
    console.log("❌ Nenalezeny žádné D1 databáze v konfiguraci.");
    process.exit(1);
}

console.log(`📊 Nalezeno ${databases.length} databází:`);
databases.forEach(db => {
    console.log(`   - ${db.database_name} (${db.database_id})`);
});

// Vyprázdnit každou databázi
for (const db of databases) {
    clearDatabase(db.database_name);
}

console.log("\n✅ Všechny databáze byly úspěšně vyčištěny!");
console.log("💡 Nyní můžeš spustit migrace: pnpm db:migrate:local");