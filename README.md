# PatroCMS 🚀

[![Effect](https://img.shields.io/badge/Effect-100%25-blue)](https://effect.website)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-yellow.svg)](LICENSE)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow)](https://github.com/patro-io/cms)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/patro-io/cms/tree/main/my-patro-app)

**The First 100% Pure Effect Headless CMS for Cloudflare Workers.**

> **⚠️ Beta Software:** PatroCMS is currently in active development (Beta). While the core architecture is stable, APIs and features may evolve. Use with caution in production environments.

PatroCMS is a modern, enterprise-grade headless CMS built specifically for the edge. It leverages the power of **Effect** (TypeScript) to provide unmatched type safety, error handling, and resilience, all running on **Cloudflare's global network**.

> **⚠️ Developer Note:** This repository is the core package development monorepo. To build an application with PatroCMS, use `npx @patro-io/create-cms@latest my-app`.

---

## 🌟 Why Effect Revolution?

PatroCMS stands out by being built with a **significant portion of its codebase in Pure Effect**. We have undergone a complete architectural rewrite ("Effect Revolution") to eliminate `async/await` and `Promise` unpredictability in favor of a purely functional, effect-based architecture.

- **🛡️ Bulletproof Error Handling**: Every error is typed and tracked. No more unhandled promise rejections or unknown exceptions.
- **🧩 Dependency Injection**: Native service composition using Effect Context.
- **⚡ Async-Free Core**: Business logic is pure, synchronous-like, and composable.
- **🔍 Observability**: Built-in tracing, logging, and metrics throughout the stack.

## ✨ Features

### 🏗️ Core Architecture
- **Pure Effect TS**: 100% coverage of Routes, Services, and Middleware.
- **Edge-Native**: Built for Cloudflare Workers, D1 (SQLite), R2 (Object Storage), and KV.
- **Hono.js Integration**: Ultrafast web framework adapter for Effect.
- **Modular Plugin System**: Extensible architecture with safe plugin isolation.

### 🔧 Content Management
- **Dynamic Fields**: Text, RichText, Number, Boolean, Date, Select, Media.
- **Versioning**: Complete revision history with restore capabilities.
- **Workflow**: Draft → Review → Published → Archived states.
- **Media Library**: R2-backed storage with automatic image optimization.
- **Live Preview**: Real-time content previewing.

### 🌍 Globalization & AI
- **Multilingual Administration**: The admin interface is fully localized, supporting multiple languages for a global editorial team.
- **AI-Powered Content**: Native integration with AI tools to generate, translate, and enhance content across languages automatically.

## 🛠️ Technology Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Core Logic**: [Effect](https://effect.website/) (Services, Error Handling, Concurrency)
- **Web Framework**: [Hono](https://hono.dev/)
- **Database**: [Drizzle ORM](https://orm.drizzle.team/) + Cloudflare D1
- **Storage**: Cloudflare R2
- **UI**: HTMX + Server-Side Rendering (Hypermedia-driven)

## 🏁 Quick Start

### For Application Developers

To create a new project with PatroCMS:

```bash
# Create a new app
pnpm create cms@latest my-app

# Start development
cd my-app
pnpm dev
```

### For Core Contributors

To contribute to the PatroCMS core package (this repository):

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/patro-io/cms.git
    cd cms
    pnpm install
    ```

2.  **Build Core**:
    ```bash
    pnpm build:core
    ```

3.  **Run Test App**:
    ```bash
    # Create a local test instance
    pnpm create cms@latest my-patro-app
    
    # Run migrations locally
    cd my-patro-app
    pnpm db:migrate:local
    
    # Start dev server
    pnpm dev
    ```

## 🚀 Deployment

### One-Click Deploy

Deploy a starter instance of PatroCMS directly to your Cloudflare account:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/patro-io/cms/tree/main/my-patro-app)

**Prerequisites:**
- **Cloudflare Account**: You need an active Cloudflare account.
- **R2 Subscription**: An active R2 plan is required (the Free Tier with 10GB/month is sufficient).

**Deployment Steps:**
1.  **Git Account**: Connect your GitHub account to create a new repository.
2.  **Resources**: The wizard will ask to create the following bindings:
    - **KV namespace**: Create new (e.g., `patrocms`)
    - **D1 database**: Create new (e.g., `my-patro-app-db`)
    - **R2 bucket**: Create new (e.g., `my-patro-app-media`)
3.  **Environment**: Set to `development` or `production`.
4.  **Deploy Command**: Ensure the command is set to `pnpm run deploy` (or `npm run deploy` if pnpm is not detected).

### Manual Deployment

1.  **Configure `wrangler.jsonc`**: Set up your D1 database and R2 bucket bindings.
2.  **Migrate Database**: `pnpm db:migrate:prod`
3.  **Deploy**: `pnpm deploy`

## 🧩 Architecture Overview

The codebase follows strict Effect patterns:

- **Services**: Define capabilities as `Context.Tag`. Implemented as layers (`makeServiceLayer`).
- **Routes**: Define HTTP endpoints using `Effect.gen`. Returns an `Effect` that is run by the runtime adapter.
- **Middleware**: Pure Effect validators and context providers.

Example of a Route Handler:
```typescript
// No async/await! Pure Effect generator.
app.get('/api/content', (c) => {
  const program = Effect.gen(function* (_) {
    const contentService = yield* _(ContentService);
    const content = yield* _(contentService.getAll());
    return c.json(content);
  });
  
  // Runtime execution handled at the edge
  return Effect.runPromise(program.pipe(
    Effect.provide(MainLayer),
    Effect.catchAll(handleError)
  ));
});
```

## 📚 Documentation

- [**Effect Revolution Status**](docs/effect/EFFECT_REVOLUTION_STATUS.md) - Current state of the migration.
- [**Architecture**](docs/architecture.md) - System design and patterns.
- [**Contributing**](CONTRIBUTING.md) - Guidelines for contributors.

## 📄 License

FSL-1.1-MIT © [PatroCMS](https://github.com/patro-io)