#!/usr/bin/env node

import { execa } from "execa";
import fs from "fs-extra";
import kleur from "kleur";
import ora from "ora";
import path from "path";
import prompts from "prompts";
import { fileURLToPath } from "url";
import validatePackageName from "validate-npm-package-name";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const VERSION = packageJson.version;

// Templates available
const TEMPLATES = {
  starter: {
    name: "Starter (Blog & Content)",
    description: "Perfect for blogs, documentation, and content sites",
    color: "blue",
  },
};

// Banner
console.log();
console.log(kleur.bold().cyan("✨ Create patro App"));
console.log(kleur.dim(` v${VERSION}`));
console.log();

// Parse arguments
const args = process.argv.slice(2);
const projectName = args[0];
const flags = {
  skipInstall: args.includes("--skip-install"),
  skipGit: args.includes("--skip-git"),
  skipCloudflare: args.includes("--skip-cloudflare"),
  template: args.find((arg) => arg.startsWith("--template="))?.split("=")[1],
  databaseName: args
    .find((arg) => arg.startsWith("--database="))
    ?.split("=")[1],
  bucketName: args.find((arg) => arg.startsWith("--bucket="))?.split("=")[1],
  skipExample: args.includes("--skip-example"),
  includeExample: args.includes("--include-example"),
  adminEmail: args.find((arg) => arg.startsWith("--adminEmail="))?.split("=")[1],
  adminPassword: args.find((arg) => arg.startsWith("--adminPassword="))?.split("=")[1],
};

async function main() {
  // const startTime = Date.now(); // Už není potřeba pro telemetrii

  try {
    // 3. Sledování: SMAZÁNO (track)

    // 4. Zeptá se na vše
    const answers = await getProjectDetails(projectName);

    // 5. Vytvoří projekt
    await createProject(answers, flags);

    // 6. Sledování: SMAZÁNO (track)

    // 7. Vypíše hlášku
    printSuccessMessage(answers);

    // 8. Spuštění dev serveru
    if (answers.runDev && !answers.skipInstall) {
      const projectDir = path.resolve(process.cwd(), answers.projectName);
      process.chdir(projectDir);

      console.log();
      console.log(
        kleur.cyan(`🚀 Starting development server... (pnpm run dev)`)
      );
      console.log(kleur.dim(`(Press Ctrl+C to stop)`));
      console.log();

      await execa("pnpm", ["run", "dev"], {
        stdio: "inherit",
      });
    }

    // 9. Ukončení telemetrie: SMAZÁNO (shutdown)
    
  } catch (error) {
    // 10. Chyba
    // Telemetrie SMAZÁNA
    
    if (error.message === "cancelled") {
      // Telemetrie SMAZÁNA
      console.log();
      console.log(kleur.yellow("⚠ Cancelled"));
      process.exit(0);
    }

    // Telemetrie SMAZÁNA
    console.error();
    console.error(kleur.red("✖ Error:"), error.message);
    console.error();
    process.exit(1);
  }
}

async function getProjectDetails(initialName) {
  const questions = [];

  // Project name
  if (!initialName) {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project name:",
      initial: "my-patro-app",
      validate: (value) => {
        if (!value) return "Project name is required";
        const validation = validatePackageName(value);
        if (!validation.validForNewPackages) {
          return validation.errors?.[0] || "Invalid package name";
        }
        if (fs.existsSync(value)) {
          return `Directory "${value}" already exists`;
        }
        return true;
      },
    });
  }

  // Database name
  if (!flags.databaseName) {
    questions.push({
      type: "text",
      name: "databaseName",
      message: "Database name:",
      initial: (prev, values) => `${values.projectName || initialName}-db`,
      validate: (value) => (value ? true : "Database name is required"),
    });
  }

  // R2 bucket name
  if (!flags.bucketName) {
    questions.push({
      type: "text",
      name: "bucketName",
      message: "R2 bucket name:",
      initial: (prev, values) => `${values.projectName || initialName}-media`,
      validate: (value) => (value ? true : "Bucket name is required"),
    });
  }

  // Seed admin user - REMOVED

  // Include example collection
  if (!flags.skipExample && !flags.includeExample) {
    questions.push({
      type: "confirm",
      name: "includeExample",
      message: "Include example blog collection?",
      initial: true,
    });
  }

  // Create Cloudflare resources
  if (!flags.skipCloudflare) {
    questions.push({
      type: "confirm",
      name: "createResources",
      message: "Create Cloudflare resources now? (requires wrangler)",
      initial: true,
    });
  }

  // Initialize git
  if (!flags.skipGit) {
    questions.push({
      type: "confirm",
      name: "initGit",
      message: "Initialize git repository?",
      initial: true,
    });
  }

  if (!flags.skipInstall) {
    questions.push({
      type: "confirm",
      name: "runDev",
      message: "Start development server after installation?",
      initial: true,
    });
  }

  const answers = await prompts(questions, {
    onCancel: () => {
      throw new Error("cancelled");
    },
  });

  return {
    projectName: initialName || answers.projectName,
    template: flags.template || "starter",
    databaseName:
      flags.databaseName ||
      answers.databaseName ||
      `${initialName || answers.projectName}-db`,
    bucketName:
      flags.bucketName ||
      answers.bucketName ||
      `${initialName || answers.projectName}-media`,
    adminEmail: null,
    adminPassword: null,
    includeExample: flags.skipExample
      ? false
      : flags.includeExample
      ? true
      : answers.includeExample !== undefined
      ? answers.includeExample
      : true,
    createResources: flags.skipCloudflare ? false : answers.createResources,
    runMigrations: true,
    initGit: flags.skipGit ? false : answers.initGit,
    skipInstall: flags.skipInstall,
    runDev: flags.skipInstall ? false : answers.runDev,
  };
}

async function createProject(answers, flags) {
  const {
    projectName,
    template,
    databaseName,
    bucketName,
    adminEmail,
    adminPassword,
    includeExample,
    createResources,
    runMigrations,
    initGit,
    skipInstall,
  } = answers;

  const targetDir = path.resolve(process.cwd(), projectName);

  console.log();
  const spinner = ora("Creating project...").start();

  try {
    // 1. Copy template
    spinner.text = "Copying template files...";
    await copyTemplate(template, targetDir, {
      projectName,
      databaseName,
      bucketName,
      adminEmail,
      adminPassword,
      includeExample,
    });
    spinner.succeed("Copied template files");

    // 2. Create Cloudflare resources
    let databaseId = "YOUR_DATABASE_ID";
    let resourcesCreated = false;
    if (createResources) {
      spinner.start("Creating Cloudflare resources...");
      try {
        const result = await createCloudflareResources(
          databaseName,
          bucketName,
          targetDir
        );
        databaseId = result.databaseId || "YOUR_DATABASE_ID";
        resourcesCreated = result.success;
        if (resourcesCreated) {
          spinner.succeed("Created Cloudflare resources");
        } else {
          spinner.warn(
            "Cloudflare resources partially created - see details above"
          );
        }
      } catch (error) {
        spinner.warn("Failed to create Cloudflare resources");
        console.log(kleur.dim("You can create them manually later"));
      }
    }

    // Store resources status
    answers.resourcesCreated = resourcesCreated;
    answers.databaseIdSet = databaseId !== "YOUR_DATABASE_ID";

    // 3. Update wrangler.jsonc
    spinner.start("Updating configuration...");
    await updateWranglerConfig(targetDir, {
      databaseName,
      databaseId,
      bucketName,
    });
    spinner.succeed("Updated configuration");

    // 4. Install dependencies
    if (!skipInstall) {
      spinner.start("Installing dependencies...");
      await installDependencies(targetDir);
      spinner.succeed("Installed dependencies");

      spinner.start("Copying database migrations...");
      await copyMigrationsFromCore(targetDir);
      spinner.succeed("Copied database migrations");
    }

    // 5. Initialize git
    if (initGit) {
      spinner.start("Initializing git repository...");
      await initializeGit(targetDir);
      spinner.succeed("Initialized git repository");
    }

    // 6. Run migrations
    if (runMigrations && !skipInstall && resourcesCreated) {
      spinner.start("Running database migrations...");
      try {
        await runDatabaseMigrations(targetDir);
        spinner.succeed("Database migrations completed");
        answers.migrationsRan = true;
      } catch (error) {
        spinner.warn("Failed to run migrations");
        console.log(kleur.dim(`${error.message}`));
        console.log(
          kleur.dim("You can run them manually with: pnpm db:migrate:local")
        );
        answers.migrationsRan = false;
      }
    } else if (runMigrations && skipInstall) {
      spinner.info("Skipping migrations - run after pnpm install");
      answers.migrationsRan = false;
    } else if (runMigrations && !resourcesCreated) {
      spinner.info("Skipping migrations - database not created yet");
      answers.migrationsRan = false;
    }

    // 7. Seed admin user - REMOVED

    spinner.succeed(kleur.bold().green("✓ Project created successfully!"));
  } catch (error) {
    spinner.fail("Failed to create project");
    throw error;
  }
}

async function copyTemplate(templateName, targetDir, options) {
  const templateDir = path.resolve(__dirname, "..", "templates", templateName);

  if (!fs.existsSync(templateDir)) {
    throw new Error(
      `Template "${templateName}" not found at path: ${templateDir}`
    );
  }

  await fs.copy(templateDir, targetDir, {
    filter: (src) => {
      const name = path.basename(src);
      if ([".git", "node_modules", "dist", ".wrangler", ".mf"].includes(name)) {
        return false;
      }
      return true;
    },
  });

  // Update package.json
  const targetPackageJsonPath = path.join(targetDir, "package.json");
  const targetPackageJson = await fs.readJson(targetPackageJsonPath);
  
  targetPackageJson.name = options.projectName;
  targetPackageJson.version = "0.0.1";
  targetPackageJson.private = true;

  // ZMĚNA ZDE: Použití globální proměnné VERSION načtené na začátku souboru
  targetPackageJson.dependencies = {
    "@patro-io/cms": `^${VERSION}`, 
    ...targetPackageJson.dependencies,
  };

  await fs.writeJson(targetPackageJsonPath, targetPackageJson, { spaces: 2 });

  // Rename gitignore.template to .gitignore
  const gitignoreTemplatePath = path.join(targetDir, "gitignore.template");
  const gitignorePath = path.join(targetDir, ".gitignore");
  if (fs.existsSync(gitignoreTemplatePath)) {
    await fs.rename(gitignoreTemplatePath, gitignorePath);
  }

  // Update index.ts based on includeExample option
  const indexTsPath = path.join(targetDir, "src/index.ts");
  if (!options.includeExample) {
    // Remove example collection file
    const examplePath = path.join(
      targetDir,
      "src/collections/blog-posts.collection.ts"
    );
    if (fs.existsSync(examplePath)) {
      await fs.remove(examplePath);
    }
    
    // Remove import and registerCollections from index.ts
    let indexContent = await fs.readFile(indexTsPath, 'utf-8');
    indexContent = indexContent
      .replace(/import blogPostsCollection from '\.\/collections\/blog-posts\.collection'\n/, '')
      .replace(/\n\/\/ Register collections before app creation[\s\S]*?registerCollections\(\[blogPostsCollection\]\)\n/, '\n');
    await fs.writeFile(indexTsPath, indexContent);
  }

  // Create admin seed script - REMOVED
}

async function copyMigrationsFromCore(targetDir) {
  const coreMigrationsPath = path.join(
    targetDir,
    "node_modules",
    "@patro-io/cms",
    "migrations"
  );
  const projectMigrationsPath = path.join(targetDir, "migrations");

  if (fs.existsSync(coreMigrationsPath)) {
    await fs.copy(coreMigrationsPath, projectMigrationsPath);
  } else {
    await fs.ensureDir(projectMigrationsPath);
    const noteContent = `# Migrations

Migrations will be copied from @patro-io/cms after running npm install.

To manually copy migrations:
1. Install dependencies: npm install
2. Copy from: node_modules/@patro-io/cms/migrations/
3. Copy to: migrations/

Or they should be automatically available after installation.
`;
    await fs.writeFile(
      path.join(projectMigrationsPath, "README.md"),
      noteContent
    );
  }
}

async function createCloudflareResources(databaseName, bucketName, targetDir) {
  // Check if wrangler is installed
  try {
    await execa("wrangler", ["--version"], {
      cwd: targetDir,
      stdio: "ignore", // ZMĚNA
    });
  } catch (error) {
    throw new Error(
      "wrangler is not installed or not in PATH. Install with: npm install -g wrangler"
    );
  }

  let databaseId;
  let dbCreated = false;
  let bucketCreated = false;

  // Create D1 database
  try {
    const { stdout, stderr } = await execa(
      "wrangler",
      ["d1", "create", databaseName],
      {
        cwd: targetDir,
        stdio: ["ignore", "pipe", "pipe"], // ZMĚNA
      }
    );

    // Try multiple patterns to parse database_id
    // Pattern 1: TOML format: database_id = "xxx"
    let match = stdout.match(/database_id\s*=\s*["']([^"']+)["']/);

    // Pattern 2: JSON format: "database_id": "xxx"
    if (!match) {
      match = stdout.match(/["']database_id["']\s*:\s*["']([^"']+)["']/);
    }

    // Pattern 3: Just the UUID pattern anywhere in output
    if (!match) {
      match = stdout.match(
        /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
      );
    }

    if (match) {
      databaseId = match[1];
      dbCreated = true;
    } else {
      console.log("");
      console.log(
        kleur.yellow(
          "⚠ Warning: Could not parse database_id from wrangler output"
        )
      );
      console.log(kleur.dim("Output was:"));
      console.log(kleur.dim(`${stdout.substring(0, 200)}`));
      console.log(kleur.dim("You may need to manually update wrangler.jsonc"));
    }
  } catch (error) {
    console.log("");
    console.log(kleur.yellow("⚠ D1 database creation failed:"));
    console.log(kleur.dim(`${error.message}`));
    if (error.stderr) {
      console.log(kleur.dim(`${error.stderr}`));
    }
    console.log("");
    console.log(kleur.dim("Create manually with:"));
    console.log(kleur.dim(`wrangler d1 create ${databaseName}`));
  }

  // Create R2 bucket
  try {
    await execa("wrangler", ["r2", "bucket", "create", bucketName], {
      cwd: targetDir,
      stdio: "ignore", // ZMĚNA
    });
    bucketCreated = true;
  } catch (error) {
    console.log("");
    console.log(kleur.yellow("⚠ R2 bucket creation failed:"));
    console.log(kleur.dim(`${error.message}`));
    if (error.stderr) {
      console.log(kleur.dim(`${error.stderr}`));
    }
    console.log("");
    console.log(kleur.dim("Create manually with:"));
    console.log(kleur.dim(`wrangler r2 bucket create ${bucketName}`));
  }

  return {
    databaseId,
    success: dbCreated && bucketCreated,
  };
}

async function updateWranglerConfig(
  targetDir,
  { databaseName, databaseId, bucketName }
) {
  const wranglerPath = path.join(targetDir, "wrangler.jsonc");
  let content = await fs.readFile(wranglerPath, "utf-8");

  // Use string replacement to preserve comments
  content = content.replace(
    /"database_id"\s*:\s*"[^"]*"/,
    `"database_id": "${databaseId}"`
  );
  content = content.replace(
    /"database_name"\s*:\s*"[^"]*"/,
    `"database_name": "${databaseName}"`
  );
  content = content.replace(
    /"bucket_name"\s*:\s*"[^"]*"/,
    `"bucket_name": "${bucketName}"`
  );

  await fs.writeFile(wranglerPath, content);

  // Add dev config to ensure persistent local storage
  try {
    const wranglerJson = await fs.readJson(wranglerPath);
    wranglerJson.dev = {
      ...wranglerJson.dev,
      persist_to: ".wrangler/dev-storage",
    };
    await fs.writeJson(wranglerPath, wranglerJson, { spaces: 4 });
  } catch (error) {
    // Silently fail if JSON is invalid, as it's a non-critical enhancement
  }
}

async function installDependencies(targetDir) {
  const packageManager = await detectPackageManager();

  await execa(packageManager, ["install"], {
    cwd: targetDir,
    stdio: "ignore", // ZMĚNA (z "pipe" na "ignore")
  });
}

async function detectPackageManager() {
  // Check if pnpm is available
  try {
    await execa("pnpm", ["--version"], { stdio: "ignore" }); // ZMĚNA
    return "pnpm";
  } catch {}

  // Check parent directories for lock files
  let dir = process.cwd();

  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
    if (fs.existsSync(path.join(dir, "package-lock.json"))) return "npm";
    dir = path.dirname(dir);
  }

  return "npm";
}

async function initializeGit(targetDir) {
  try {
    await execa("git", ["init"], { cwd: targetDir, stdio: "ignore" }); // ZMĚNA
    await execa("git", ["add", "."], { cwd: targetDir, stdio: "ignore" }); // ZMĚNA
    await execa("git", ["commit", "-m", "Initial commit from @patro-io/create-cms"], {
      cwd: targetDir,
      stdio: "ignore", // ZMĚNA
    });
  } catch (error) {
    // Git init is optional, don't fail
  }
}

async function runDatabaseMigrations(targetDir) {
  const packageManager = await detectPackageManager();
  const runCmd =
    packageManager === "npm" ? "run" : packageManager === "yarn" ? "" : "run";

  try {
    const { stdout, stderr } = await execa(
      packageManager,
      [runCmd, "db:migrate:local"].filter(Boolean),
      {
        cwd: targetDir,
        reject: false,
        stdio: ["ignore", "pipe", "pipe"], // ZMĚNA
      }
    );

    if (
      stderr &&
      (stderr.toLowerCase().includes("error:") ||
        stderr.toLowerCase().includes("failed"))
    ) {
      if (!stderr.includes("Migrations were successfully applied")) {
        throw new Error(stderr);
      }
    }

    return stdout;
  } catch (error) {
    throw new Error(`Migration failed: ${error.message}`);
  }
}

// seedAdminUser function REMOVED

function printSuccessMessage(answers) {
  const {
    projectName,
    createResources,
    skipInstall,
    resourcesCreated,
    databaseIdSet,
    migrationsRan,
    adminSeeded, // Will be removed
  } = answers;

  console.log();
  console.log(kleur.bold().green("🎉 Success!"));
  console.log();
  console.log(kleur.bold("Next steps:"));
  console.log();
  console.log(kleur.cyan(`cd ${projectName}`));

  if (skipInstall) {
    console.log(kleur.cyan("pnpm install"));
    console.log();
    console.log(
      kleur.yellow("⚠ Important: After pnpm install, copy migrations:")
    );
    console.log(kleur.dim("cp -r node_modules/@patro-io/cms/migrations ./"));
  }

  // Show resource creation steps if needed
  if (!createResources || !resourcesCreated) {
    console.log();
    console.log(kleur.bold("Create Cloudflare resources:"));
    if (!databaseIdSet) {
      console.log(kleur.cyan(`wrangler d1 create ${answers.databaseName}`));
      console.log(kleur.dim("# Copy database_id to wrangler.jsonc"));
    }
    console.log(kleur.cyan(`wrangler r2 bucket create ${answers.bucketName}`));
  }

  // Show migration/seed steps if needed
  const needsMigrations = !migrationsRan;
  const needsSeeding = false; // Always false now

  if (needsMigrations || needsSeeding) {
    console.log();
    console.log(kleur.bold("Complete setup:"));
    if (needsMigrations) {
      console.log(kleur.cyan("pnpm run db:migrate:local"));
    }
    if (needsSeeding) {
      console.log(kleur.cyan("pnpm run seed"));
    }
  }

  console.log();
  if (migrationsRan) {
    console.log(kleur.bold().green("✓ Database is ready! Start development:"));
  } else {
    console.log(kleur.bold("Start development:"));
  }
  console.log(kleur.cyan("pnpm run dev"));

  if (migrationsRan) {
    console.log();
    console.log(
      kleur.green("✓ Everything is set up! Just run pnpm dev and create your first user.")
    );
  }

  console.log();
  console.log(kleur.bold("Visit to create first user:"));
  console.log(kleur.cyan("http://localhost:8787/auth/register"));

  console.log();
  console.log(kleur.dim("Need help? Visit https://docs.patro.io"));
  console.log();
}

// Run
main();
