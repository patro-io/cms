import { execSync } from "node:child_process";

const DB_CONFIG_NAME = "my-patro-app-db";
const CONFIG_FILE = "wrangler.jsonc";

function runCommand(command: string) {
    try {
        // Přidán flag -c pro explicitní config
        return execSync(`${command} -c ${CONFIG_FILE}`, { encoding: "utf-8", stdio: ['pipe', 'pipe', 'pipe'] });
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

console.log(`🔍 Načítám tabulky z ${DB_CONFIG_NAME} (config: ${CONFIG_FILE})...`);

const jsonOutput = runCommand(`wrangler d1 execute ${DB_CONFIG_NAME} --remote --command "SELECT name FROM sqlite_schema WHERE type ='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';" --json`);
const parsed = JSON.parse(jsonOutput);
const tables = parsed[0]?.results?.map((r: any) => r.name) as string[] || [];

if (tables.length === 0) {
    console.log("✅ Databáze je prázdná.");
    process.exit(0);
}

console.log(`🗑️  Mažu ${tables.length} tabulek...`);

runCommand(`wrangler d1 execute ${DB_CONFIG_NAME} --remote --command "PRAGMA foreign_keys = OFF;"`);

for (const table of tables) {
    process.stdout.write(`   - Mažu ${table}... `);
    runCommand(`wrangler d1 execute ${DB_CONFIG_NAME} --remote --command "DROP TABLE IF EXISTS \\"${table}\\";"`);
    console.log("OK");
}

console.log("✨ Hotovo.");