#!/usr/bin/env node

import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_PROJECT = 'test-patro-project';
const testDir = path.resolve(process.cwd(), TEST_PROJECT);

console.log('🧪 Testing @patro-io/create-cms-app CLI\n');

async function cleanup() {
  if (fs.existsSync(testDir)) {
    console.log('🧹 Cleaning up previous test directory...');
    await fs.remove(testDir);
  }
}

async function runTest() {
  try {
    await cleanup();

    console.log('📦 Running @patro-io/create-cms-app...');
    const cliArgs = [
      'packages/create-app/bin/create-cms-app.js',
      TEST_PROJECT,
      '--template=starter',
      '--database=test-db',
      '--bucket=test-media',
      '--include-example',
      '--skip-git',
      '--skip-cloudflare',
      '--skip-install',
      '--adminEmail=test@example.com',
      '--adminPassword=password123',
    ];

    console.log(`   Command: node ${cliArgs.join(' ')}\n`);

    const { stdout, stderr } = await execa('node', cliArgs, {
      cwd: process.cwd(),
      timeout: 30000, // 30 second timeout (reduced since no installation)
    });

    console.log(stdout);
    if (stderr) console.error('STDERR:', stderr);

    console.log('\n✅ Verifying project structure...');
    const checks = [
      'package.json',
      'wrangler.jsonc',
      'tsconfig.json',
      'src/index.ts',
      'src/collections/blog-posts.collection.ts',
      'README.md',
    ];

    let allPass = true;
    for (const file of checks) {
      const filePath = path.join(testDir, file);
      const exists = fs.existsSync(filePath);
      console.log(`   ${exists ? '✓' : '✗'} ${file}`);
      if (!exists) allPass = false;
    }

    if (!allPass) {
      throw new Error('Project structure verification failed.');
    }

    console.log('\n📋 Verifying package.json content...');
    const pkgJson = await fs.readJson(path.join(testDir, 'package.json'));
    console.log(`   Name: ${pkgJson.name} (expected: ${TEST_PROJECT})`);
    if (pkgJson.name !== TEST_PROJECT) throw new Error('Incorrect package name');
    
    console.log(`   Has @patro-io/cms dependency: ${!!pkgJson.dependencies['@patro-io/cms']}`);
    if (!pkgJson.dependencies['@patro-io/cms']) throw new Error('Missing @patro-io/cms dependency');
    
    console.log(`   Has seed script: ${!!pkgJson.scripts?.seed}`);
    if (!pkgJson.scripts?.seed) throw new Error('Missing seed script in package.json');

    console.log('\n⚙️  Verifying wrangler.jsonc content...');
    const wranglerContent = await fs.readFile(path.join(testDir, 'wrangler.jsonc'), 'utf-8');
    console.log(`   Has database config: ${wranglerContent.includes('"database_name": "test-db"')}`);
    if (!wranglerContent.includes('"database_name": "test-db"'))
      throw new Error('Wrangler config missing database name');
    
    console.log(`   Has bucket config: ${wranglerContent.includes('"bucket_name": "test-media"')}`);
    if (!wranglerContent.includes('"bucket_name": "test-media"'))
        throw new Error('Wrangler config missing bucket name');

    // Seed script verification removed
    if (!seedScriptContent.includes("from 'effect'"))
        throw new Error('Seed script does not import Effect');
    
    console.log(`   Uses AuthService: ${seedScriptContent.includes('yield* AuthService')}`);
    if (!seedScriptContent.includes('yield* AuthService'))
        throw new Error('Seed script does not use AuthService');

    console.log(`   Has admin email: ${seedScriptContent.includes("test@example.com")}`);
    if (!seedScriptContent.includes("test@example.com"))
        throw new Error('Seed script is missing admin email');
    
    console.log(`   Has admin password: ${seedScriptContent.includes("password123")}`);
    if (!seedScriptContent.includes("password123"))
        throw new Error('Seed script is missing admin password');
    
    console.log(`   Uses authService.hashPassword: ${seedScriptContent.includes('authService.hashPassword')}`);
    if (!seedScriptContent.includes('authService.hashPassword'))
        throw new Error('Seed script does not use authService.hashPassword');

    console.log('\n✅ All checks passed!');
    console.log('\n🎉 CLI test successful!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  } finally {
    await cleanup();
    console.log('🧹 Cleaned up test directory\n');
  }
}

runTest();
