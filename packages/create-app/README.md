# @patro-io/create-cms

> The easiest way to create a new PatroCMS application with Effect architecture.

[![Version](https://img.shields.io/npm/v/@patro-io/create-cms)](https://www.npmjs.com/package/@patro-io/create-cms)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-yellow.svg)](../../LICENSE)

## Quick Start

```bash
pnpm create @patro-io/cms my-app
```

That's it! Follow the interactive prompts and you'll have a running PatroCMS application in minutes.

## What It Does

`@patro-io/create-cms` sets up everything you need for a modern headless CMS on Cloudflare's edge:

- ✅ **Project scaffolding** - Complete project structure
- ✅ **Effect Architecture** - 100% Pure Effect TypeScript foundation
- ✅ **Cloudflare resources** - Optionally create D1 database and R2 bucket
- ✅ **Configuration** - Auto-configured wrangler.jsonc
- ✅ **Dependencies** - Installs all required packages (including `@patro-io/cms` core)
- ✅ **Git initialization** - Ready for version control
- ✅ **Example code** - Optional blog collection example

## Usage

### Interactive Mode (Recommended)

```bash
pnpm create @patro-io/cms
```

You'll be prompted for:
- Project name
- Template choice
- Database name
- R2 bucket name
- Whether to include examples
- Whether to create Cloudflare resources
- Whether to initialize git

### With Project Name

```bash
pnpm create @patro-io/cms my-blog
```

### Command Line Options

```bash
pnpm create @patro-io/cms my-app --template=starter --skip-install
```

**Available flags:**
- `--template=<name>` - Skip template selection (e.g., `--template=starter`)
- `--database=<name>` - Set database name without prompt
- `--bucket=<name>` - Set R2 bucket name without prompt
- `--include-example` - Include example blog collection (no prompt)
- `--skip-example` - Skip example blog collection (no prompt)
- `--skip-install` - Don't install dependencies
- `--skip-git` - Don't initialize git
- `--skip-cloudflare` - Don't prompt for Cloudflare resource creation

## Templates

### Starter (Default)
Perfect for blogs, documentation, and content sites.

Includes:
- Blog collection example
- Admin dashboard
- REST API
- Media management

## Requirements

- **Node.js** 18 or higher
- **pnpm** (recommended) or npm/yarn
- **wrangler** (optional, for Cloudflare resources)

## What Gets Created

```
my-app/
├── src/
│   ├── index.ts              # Application entry point
│   └── collections/          # Content type definitions
│       └── blog-posts.collection.ts
├── wrangler.jsonc             # Cloudflare Workers config
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── .gitignore
└── README.md
```

## After Creation

### 1. Navigate to your project

```bash
cd my-app
```

### 2. Create Cloudflare resources (if skipped)

```bash
pnpm wrangler d1 create my-app-db
# Copy the database_id to wrangler.jsonc

pnpm wrangler r2 bucket create my-app-media
```

### 3. Run database migrations

```bash
pnpm db:migrate:local
```

### 4. Start development server

```bash
pnpm dev
```

### 5. Open admin interface

Visit http://localhost:8787/admin

Default credentials:
- Email: `admin@patro.io`
- Password: `admin`

## Package Managers

Works with all major package managers:

```bash
# pnpm (Recommended)
pnpm create @patro-io/cms my-app

# npm
npm create @patro-io/cms my-app

# yarn
yarn create @patro-io/cms my-app
```

The CLI automatically detects your package manager.

## Environment Variables

After creation, you may want to set up environment variables:

```bash
# .dev.vars (for local development)
ENVIRONMENT=development
```

## Troubleshooting

### "wrangler is not installed"

Install wrangler globally or use via pnpm:
```bash
pnpm add -g wrangler
```

### "Directory already exists"

Choose a different project name or remove the existing directory:
```bash
rm -rf my-app
```

### Cloudflare resource creation fails

You can create resources manually after project creation. See the [After Creation](#after-creation) section.

## Advanced Usage

### Skip All Prompts (Non-Interactive Mode)

```bash
pnpm create @patro-io/cms my-app \
  --template=starter \
  --database=my-app-db \
  --bucket=my-app-media \
  --include-example \
  --skip-install \
  --skip-git \
  --skip-cloudflare
```

## Related

- [@patro-io/cms](../core) - Core framework
- [PatroCMS Documentation](https://docs.patro.io)
- [Cloudflare Workers](https://workers.cloudflare.com)

## License

FSL-1.1-MIT © The Patro Authors
