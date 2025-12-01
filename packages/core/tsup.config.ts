import { defineConfig } from 'tsup'

export default defineConfig({
  // Entry points
  entry: {
    index: 'src/index.ts',
    services: 'src/services/index.ts',
    middleware: 'src/middleware/index.ts',
    routes: 'src/routes/index.ts',
    templates: 'src/templates/index.ts',
    plugins: 'src/plugins/index.ts',
    utils: 'src/utils/index.ts',
    types: 'src/types/index.ts',
  },

  // Output formats
  format: ['esm', 'cjs'],

  // Output directory
  outDir: 'dist',

  // Generate TypeScript definitions
  // Temporarily disabled - needs type error fixes in routes
  dts: false,

  // Code splitting for better tree-shaking
  splitting: true,

  // Generate sourcemaps for debugging
  sourcemap: true,

  // Clean dist folder before build
  clean: true,

  // Don't minify for better debugging (can enable for production)
  minify: false,

  // Tree-shaking
  treeshake: true,

  // External dependencies (not bundled)
  external: [
    '@cloudflare/workers-types',
    'hono',
    'drizzle-orm',
    'zod',
  ],

  // Configure esbuild to drop unused imports
  esbuildOptions(options) {
    options.treeShaking = true
    options.ignoreAnnotations = false
    // Configure chunk naming for better readability
    options.chunkNames = 'chunks/[name]-[hash]'
  },

  // Bundle these dependencies (included in package)
  noExternal: [
    'drizzle-zod',
    'marked',
    'highlight.js',
    'semver'
  ],

  // Target environment
  target: 'es2022',
  platform: 'neutral',

  // Output extension and directory structure
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js'
    }
  },

  // TypeScript options
  tsconfig: './tsconfig.json',

  // Build hooks
  onSuccess: async () => {
    const fs = await import('fs')
    const path = await import('path')

    const distDir = path.resolve(process.cwd(), 'dist')
    
    // Vytvořit strukturu složek
    const esmDir = path.join(distDir, 'esm')
    const cjsDir = path.join(distDir, 'cjs')
    const typesDir = path.join(distDir, 'types')

    // Vytvořit složky pokud neexistují
    for (const dir of [esmDir, cjsDir, typesDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }

    // Přesunout ESM soubory (.js a .js.map)
    const files = fs.readdirSync(distDir)
    for (const file of files) {
      const filePath = path.join(distDir, file)
      const stat = fs.statSync(filePath)
      
      if (stat.isFile()) {
        if (file.endsWith('.js')) {
          // Přesunout .js soubory do esm/
          fs.renameSync(filePath, path.join(esmDir, file))
        } else if (file.endsWith('.js.map')) {
          // Přesunout sourcemapy do esm/
          fs.renameSync(filePath, path.join(esmDir, file))
        } else if (file.endsWith('.cjs')) {
          // Přesunout .cjs soubory do cjs/
          fs.renameSync(filePath, path.join(cjsDir, file))
        } else if (file.endsWith('.cjs.map')) {
          // Přesunout sourcemapy do cjs/
          fs.renameSync(filePath, path.join(cjsDir, file))
        }
      }
    }

    // Vyčistit bare zod importy z ESM souborů
    const indexJs = path.join(esmDir, 'index.js')
    if (fs.existsSync(indexJs)) {
      let content = fs.readFileSync(indexJs, 'utf-8')
      content = content.replace(/^import 'zod';?\n/gm, '')
      fs.writeFileSync(indexJs, content, 'utf-8')
    }

    // Vyčistit bare zod importy z CJS souborů
    const indexCjs = path.join(cjsDir, 'index.cjs')
    if (fs.existsSync(indexCjs)) {
      let content = fs.readFileSync(indexCjs, 'utf-8')
      content = content.replace(/^require\(['"]zod['"]\);?\n/gm, '')
      fs.writeFileSync(indexCjs, content, 'utf-8')
    }

    // Vytvořit type definition soubory
    const typeFiles = {
      'index.d.ts': `// Main exports from @patro-io/cms package
export * from '../../src/index'

// Explicitly re-export key types and classes
export type { Plugin, PluginContext } from '../../src/types/index'
export { TemplateRenderer, templateRenderer, renderTemplate } from '../../src/utils/template-renderer'
`,
      'templates.d.ts': `// Template exports from core package
export * from '../../src/templates/index'
`,
      'routes.d.ts': `// Route exports from core package
export * from '../../src/routes/index'
`,
      'middleware.d.ts': `// Middleware exports from core package
export * from '../../src/middleware/index'
`,
      'services.d.ts': `// Service exports from core package
export * from '../../src/services/index'
`,
      'plugins.d.ts': `// Plugin exports from core package
export * from '../../src/plugins/index'
`,
      'utils.d.ts': `// Utility exports from core package
export * from '../../src/utils/index'
`,
      'types.d.ts': `// Type exports from core package
export * from '../../src/types/index'
`,
    }

    for (const [filename, content] of Object.entries(typeFiles)) {
      const filePath = path.join(typesDir, filename)
      fs.writeFileSync(filePath, content, 'utf-8')
    }

    console.log('✓ Build artifacts organized:')
    console.log('  - ESM files → dist/esm/')
    console.log('  - CJS files → dist/cjs/')
    console.log('  - Type definitions → dist/types/')
    console.log('✓ Build complete!')
  },
})
