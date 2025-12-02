# @patro-io/cms

> A Pure Effect TypeScript headless CMS framework engineered for Cloudflare's edge platform

[![npm version](https://img.shields.io/npm/v/@patro-io/cms)](https://www.npmjs.com/package/@patro-io/cms)
[![License](https://img.shields.io/npm/l/@patro-io/cms)](./LICENSE)
[![Effect](https://img.shields.io/badge/Effect-TS-blue)](https://effect.website)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow)](../../README.md)

---

## 🎯 Why PatroCMS?

PatroCMS is a **100% Pure Effect TypeScript** framework that brings functional programming principles to content management. Built from the ground up with [Effect](https://effect.website), it provides:

- **Type-Safe Everything** - Effect Schema validation throughout the entire stack
- **Composable Architecture** - Effect services with dependency injection via Context API
- **Zero Runtime Errors** - Compile-time guarantees and exhaustive error handling
- **Edge-Native** - Runs on Cloudflare Workers with sub-50ms response times globally
- **Plugin Ecosystem** - Extensible architecture with Effect-based hooks and middleware
- **Multilingual & AI** - Built-in support for multilingual content and AI-powered translations

> **⚠️ Beta Software:** PatroCMS is currently in active development (Beta). While the core architecture is stable, APIs and features may evolve. Use with caution in production environments.

**This is not your typical CMS.** PatroCMS embraces functional programming concepts while remaining practical for real-world applications.

---

## 🚀 Quick Start

### Create a New Project

```bash
pnpm create patro-app my-cms
cd my-cms
pnpm dev
```

Visit `http://localhost:8787/admin` to access the admin interface.

### Manual Installation

```bash
pnpm add @patro-io/cms effect hono drizzle-orm
pnpm add -D @cloudflare/workers-types wrangler
```

---

## 📖 Core Concepts

### Effect Services Layer

PatroCMS uses **Effect's Context API** for dependency injection. All core services are Effect-based:

```typescript
import { Effect } from 'effect'
import { DatabaseService, AuthService } from '@patro-io/cms'

// Services are provided via Effect Layers
const program = Effect.gen(function* (_) {
  const db = yield* _(DatabaseService)
  const auth = yield* _(AuthService)
  
  // All operations return Effect Types
  const users = yield* _(db.query('SELECT * FROM users'))
  const token = yield* _(auth.generateToken(userId, email, role))
  
  return { users, token }
})
```

### Effect Schema Validation

All validation uses **Effect Schema** instead of Zod:

```typescript
import { Schema } from 'effect'

const PostSchema = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  content: Schema.String,
  published: Schema.Boolean,
  tags: Schema.optional(Schema.Array(Schema.String))
})

// Decode with Effect
const result = Schema.decodeUnknownEither(PostSchema)(data)
```

### Pure Effect Routes

Route handlers follow the **Effect.gen pattern** for composability:

```typescript
import { Hono } from 'hono'
import { Effect } from 'effect'
import { DatabaseService, makeDatabaseLayer } from '@patro-io/cms'

const app = new Hono()

app.get('/posts', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* _(DatabaseService)
    const posts = yield* _(db.query('SELECT * FROM posts'))
    
    return posts
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.map(posts => c.json({ posts })),
      Effect.catchAll(error => 
        Effect.succeed(c.json({ error: error.message }, 500))
      )
    )
  )
})
```

---

## 🏗️ Architecture Overview

### Service-Based Design

PatroCMS provides **15 Pure Effect services** for all core functionality:

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| `DatabaseService` | D1 database operations | `query`, `queryFirst`, `execute`, `insert`, `update` |
| `AuthService` | JWT authentication | `generateToken`, `verifyToken`, `hashPassword`, `verifyPassword` |
| `ContentService` | Content CRUD | `create`, `update`, `delete`, `publish`, `duplicate` |
| `MediaService` | R2 file storage | `upload`, `delete`, `search`, `cleanup` |
| `CollectionService` | Collection management | `create`, `update`, `addField`, `removeField` |
| `UserService` | User management | `create`, `update`, `updateRole`, `setPermissions` |
| `PluginService` | Plugin lifecycle | `install`, `activate`, `deactivate`, `execute` |
| `LoggerService` | Structured logging | `info`, `warn`, `error`, `debug` |
| `CacheService` | Multi-tier caching | `get`, `set`, `delete`, `invalidate` |

### Effect Layers Pattern

Services are provided using Effect's **Layer** system:

```typescript
import { Layer } from 'effect'
import { makeDatabaseLayer, makeAuthServiceLayer } from '@patro-io/cms'

// Compose layers for your application
const AppLayer = Layer.mergeAll(
  makeDatabaseLayer(DB),
  makeAuthServiceLayer(JWT_SECRET, PASSWORD_SALT),
  makeLoggerServiceLayer()
)

// Provide to your Effect programs
Effect.runPromise(
  program.pipe(Effect.provide(AppLayer))
)
```

---

## 💻 Practical Examples

### Define a Collection

Collections use JSON Schema syntax with automatic database sync:

```typescript
// collections/articles.collection.ts
import type { CollectionConfig } from '@patro-io/cms'

export default {
  name: 'articles',
  displayName: 'Articles',
  
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        required: true,
        maxLength: 200
      },
      slug: {
        type: 'string',
        title: 'URL Slug',
        required: true,
        pattern: '^[a-z0-9-]+$'
      },
      body: {
        type: 'markdown',
        title: 'Content',
        required: true
      },
      publishedAt: {
        type: 'datetime',
        title: 'Publish Date'
      },
      status: {
        type: 'select',
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
      },
      tags: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['title', 'slug', 'body']
  }
} satisfies CollectionConfig
```

### Create a Custom Route with Effect

```typescript
import { Hono } from 'hono'
import { Effect } from 'effect'
import { DatabaseService, ContentService } from '@patro-io/cms'
import type { Bindings } from '@patro-io/cms'

const customRoutes = new Hono<{ Bindings: Bindings }>()

customRoutes.get('/api/popular-posts', (c) => {
  const program = Effect.gen(function* (_) {
    // Inject dependencies via Effect Context
    const db = yield* _(DatabaseService)
    const content = yield* _(ContentService)
    
    // Query popular posts
    const posts = yield* _(
      db.query<Post>(
        `SELECT * FROM content 
         WHERE collection_name = ? AND status = ?
         ORDER BY views DESC LIMIT 10`,
        ['articles', 'published']
      )
    )
    
    // Transform data
    const enriched = yield* _(
      Effect.forEach(posts, post => content.enrich(post))
    )
    
    return enriched
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.map(posts => c.json({ posts })),
      Effect.catchTag('DatabaseError', error =>
        Effect.succeed(c.json({ error: 'Database error' }, 500))
      ),
      Effect.catchAll(error =>
        Effect.succeed(c.json({ error: error.message }, 500))
      )
    )
  )
})
```

### Build a Plugin with Effect Schema

```typescript
import { PluginBuilder, PluginHelpers } from '@patro-io/cms'
import { Schema } from 'effect'
import { Hono } from 'hono'

// Define plugin schema
const CommentSchema = Schema.Struct({
  postId: Schema.String,
  author: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  email: Schema.String.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  content: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(1000)),
  approved: Schema.Boolean
})

// Create plugin routes
const commentRoutes = new Hono()

commentRoutes.post('/', async (c) => {
  // Validation happens via Effect Schema
  const validation = Schema.decodeUnknownEither(CommentSchema)(await c.req.json())
  
  if (validation._tag === 'Left') {
    return c.json({ error: 'Validation failed' }, 400)
  }
  
  // Handle comment creation...
  return c.json({ success: true })
})

// Build the plugin
export default PluginBuilder.create({
  name: 'comments-plugin',
  version: '1.0.0',
  description: 'Comment system for articles'
})
  .addModel('comment', {
    tableName: 'comments',
    schema: CommentSchema,
    migrations: [
      PluginHelpers.createMigration('comments', [
        { name: 'id', type: 'TEXT', primaryKey: true },
        { name: 'post_id', type: 'TEXT' },
        { name: 'author', type: 'TEXT' },
        { name: 'email', type: 'TEXT' },
        { name: 'content', type: 'TEXT' },
        { name: 'approved', type: 'INTEGER', defaultValue: '0' }
      ])
    ]
  })
  .addRoute('/api/comments', commentRoutes, {
    description: 'Comment management API',
    requiresAuth: false
  })
  .addMenuItem('Comments', '/admin/comments', { icon: 'comment' })
  .build()
```

### Error Handling with Effect

PatroCMS provides **typed errors** for exhaustive handling:

```typescript
import { Effect, pipe } from 'effect'
import { DatabaseService, DatabaseError, NotFoundError } from '@patro-io/cms'

const getUser = (userId: string) =>
  Effect.gen(function* (_) {
    const db = yield* _(DatabaseService)
    
    const user = yield* _(
      db.queryFirst(`SELECT * FROM users WHERE id = ?`, [userId])
    )
    
    if (!user) {
      return yield* _(Effect.fail(new NotFoundError('User not found')))
    }
    
    return user
  })

// Handle specific error types
const program = pipe(
  getUser('123'),
  Effect.catchTag('NotFoundError', error =>
    Effect.succeed({ error: error.message, status: 404 })
  ),
  Effect.catchTag('DatabaseError', error =>
    Effect.succeed({ error: 'Database unavailable', status: 500 })
  )
)
```

---

## 🔌 Plugin System

### Plugin Architecture

Plugins are **first-class citizens** with full access to Effect services:

```typescript
import type { Plugin, PluginContext } from '@patro-io/cms'
import { Effect } from 'effect'

export default {
  name: 'analytics',
  version: '1.0.0',
  
  async activate(context: PluginContext) {
    // Access Effect services
    context.logger.info('Analytics plugin activated')
    
    // Register hooks
    await context.hooks.register('content:create', async (data) => {
      // Track content creation
      return data
    })
  },
  
  hooks: [
    {
      name: 'content:save',
      handler: async (content, context) => {
        // Transform content before saving
        content.metadata = {
          ...content.metadata,
          lastModified: new Date().toISOString()
        }
        return content
      },
      priority: 10
    }
  ]
} satisfies Plugin
```

### Available Hooks

PatroCMS provides **20+ lifecycle hooks**:

- `app:init`, `app:ready`, `app:shutdown`
- `content:create`, `content:update`, `content:delete`, `content:publish`
- `media:upload`, `media:delete`, `media:transform`
- `auth:login`, `auth:logout`, `auth:register`
- `plugin:install`, `plugin:activate`, `plugin:deactivate`

---

## 📦 Package Exports

### Organized Subpath Imports

```typescript
// Main application
import { createPatroCMSApp } from '@patro-io/cms'

// Services only
import { DatabaseService, AuthService } from '@patro-io/cms/services'

// Middleware only
import { requireAuth, requireRole } from '@patro-io/cms/middleware'

// Types only
import type { CollectionConfig, Plugin } from '@patro-io/cms/types'

// Templates only
import { renderForm, renderTable } from '@patro-io/cms/templates'

// Utils only
import { sanitizeInput, buildQueryEffect } from '@patro-io/cms/utils'

// Plugins SDK
import { PluginBuilder, PluginHelpers } from '@patro-io/cms/plugins'
```

---

## ⚙️ Configuration

### Application Setup

```typescript
// src/index.ts
import { createPatroCMSApp } from '@patro-io/cms'
import type { PatroCMSConfig } from '@patro-io/cms'

const config: PatroCMSConfig = {
  collections: {
    directory: './collections',
    autoSync: true  // Auto-sync schema changes to database
  },
  
  plugins: {
    directory: './plugins',
    autoLoad: false  // Manual plugin loading for control
  },
  
  version: '1.0.0',
  name: 'My CMS'
}

export default createPatroCMSApp(config)
```

### Cloudflare Workers Setup

```toml
# wrangler.toml
name = "my-patro-cms"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "my-cms-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "my-cms-media"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "your-kv-id"
```

---

## 🧪 Testing

PatroCMS is built with testability in mind. Effect programs are **pure and composable**:

```typescript
import { Effect } from 'effect'
import { describe, it, expect } from 'vitest'
import { DatabaseService, makeDatabaseService } from '@patro-io/cms'

describe('Content Creation', () => {
  it('should create content with valid data', async () => {
    // Mock database service
    const mockDb = makeDatabaseService(mockD1Database)
    
    const program = Effect.gen(function* (_) {
      const db = yield* _(DatabaseService)
      return yield* _(db.insert(
        'INSERT INTO content (title, body) VALUES (?, ?)',
        ['Test', 'Content']
      ))
    })
    
    // Run with mocked layer
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.succeed(DatabaseService, mockDb))
      )
    )
    
    expect(result).toBeDefined()
  })
})
```

---

## 🚢 Deployment

### Build for Production

```bash
# Type check
pnpm type-check

# Build package
pnpm build

# Deploy to Cloudflare
wrangler deploy
```

### Database Migrations

```bash
# Run migrations locally
wrangler d1 migrations apply DB --local

# Run migrations in production
wrangler d1 migrations apply DB --remote
```

---

## 📊 Performance

PatroCMS is **optimized for edge computing**:

- ⚡ **<50ms** - Global response times from 300+ edge locations
- 🚀 **Zero cold starts** - V8 isolates start instantly
- 💾 **3-tier caching** - Memory → KV → Database
- 📦 **Minimal bundle** - Effect tree-shaking reduces package size
- 🔄 **Streaming** - R2 objects stream directly to clients

---

## 🛠️ Development

### Project Structure

```
@patro-io/cms/
├── src/
│   ├── app.ts                    # Application factory
│   ├── services/                 # Effect services
│   │   ├── database-effect.ts    # DatabaseService
│   │   ├── auth-effect.ts        # AuthService
│   │   ├── content-effect.ts     # ContentService
│   │   └── ...
│   ├── middleware/               # Hono middleware
│   │   ├── effect-validator.ts   # Effect Schema validation
│   │   ├── auth.ts               # Authentication
│   │   └── bootstrap.ts          # System initialization
│   ├── routes/                   # HTTP route handlers
│   ├── plugins/                  # Plugin system
│   │   ├── sdk/                  # Plugin builder SDK
│   │   └── core-plugins/         # Built-in plugins
│   ├── types/                    # TypeScript definitions
│   └── utils/                    # Utility functions
├── migrations/                   # Database migrations
└── dist/                         # Compiled output
```

---

## 🎓 Learning Resources

### Effect TypeScript

- [Effect Documentation](https://effect.website/docs/introduction)
- [Effect Schema Guide](https://effect.website/docs/schema/introduction)
- [Effect Context & Layers](https://effect.website/docs/context-management/services)

### PatroCMS Documentation

- [Getting Started](https://docs.patro.io/getting-started)
- [Effect Architecture Guide](https://docs.patro.io/architecture)
- [Plugin Development](https://docs.patro.io/plugins)
- [API Reference](https://docs.patro.io/api)

---

## 🤝 Contributing

We welcome contributions! PatroCMS follows **functional programming principles**:

- All services must be Effect-based
- Use Effect Schema for validation (not Zod)
- No `async/await` in Effect programs
- Exhaustive error handling with typed errors
- Layer composition for dependency injection

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

---

## 📄 License

Fair Source License 1.1 (FSL-1.1-MIT) - See [LICENSE](./LICENSE)

Converts to MIT after 2 years.

---

## 💬 Community

- **GitHub**: [patro-io/cms](https://github.com/patro-io/cms)
- **Issues**: [Bug Reports & Features](https://github.com/patro-io/cms/issues)
- **Discussions**: [Community Forum](https://github.com/patro-io/cms/discussions)
- **Discord**: [Join Community](https://discord.gg/patro)

---

## 🏆 Status

**Current Version**: `0.1.0` (Beta)
**Effect Coverage**: 100% ✅
**Production Ready**: Use with caution (Beta)
**Effect TS Version**: `^3.19.4`

---

**Built with ❤️ using Pure Effect TypeScript**

*For edge computing. For functional programming. For the future.*
