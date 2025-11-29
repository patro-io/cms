# My PatroCMS Application 🚀

[![Effect](https://img.shields.io/badge/Effect-100%25-blue)](https://effect.website)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-yellow.svg)](LICENSE)

A modern, enterprise-grade headless CMS built with [PatroCMS](https://github.com/patro-io/cms) on Cloudflare's edge platform.

**Powered by 100% Pure Effect TypeScript architecture for unmatched reliability.**

## Getting Started

### Prerequisites

- Node.js 18 or higher
- [pnpm](https://pnpm.io/) (recommended)
- A Cloudflare account (free tier works great)

### Installation

1.  **Install dependencies:**
    ```bash
    pnpm install
    ```

2.  **Create your D1 database:**
    ```bash
    pnpm wrangler d1 create my-patro-db
    ```

    Copy the `database_id` from the output and update it in `wrangler.jsonc`.

3.  **Create your R2 bucket:**
    ```bash
    pnpm wrangler r2 bucket create my-patro-media
    ```

4.  **Run migrations:**
    ```bash
    pnpm db:migrate:local
    ```

5.  **Start the development server:**
    ```bash
    pnpm dev
    ```

6.  **Open your browser:**
    Navigate to `http://localhost:8787/admin` to access the admin interface.

    **Default credentials:**
    - Email: `admin@patro.io`
    - Password: `admin`

## Project Structure

```
my-patro-app/
├── src/
│   ├── collections/          # Content schema definitions
│   │   └── blog-posts.collection.ts
│   └── index.ts             # Application entry point
├── wrangler.jsonc            # Cloudflare Workers configuration
├── package.json
└── tsconfig.json
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm deploy` - Deploy to Cloudflare
- `pnpm db:migrate` - Run migrations on production database
- `pnpm db:migrate:local` - Run migrations locally
- `pnpm type-check` - Check TypeScript types
- `pnpm test` - Run tests

## Creating Collections

Collections define your content types using a type-safe schema. Create a new file in `src/collections/`:

```typescript
// src/collections/products.collection.ts
import type { CollectionConfig } from '@patro-io/cms'

export default {
  name: 'products',
  label: 'Products',
  fields: {
    name: { type: 'text', required: true },
    price: { type: 'number', required: true },
    description: { type: 'markdown' },
    image: { type: 'media' }
  }
} satisfies CollectionConfig
```

## API Access

Your collections are automatically available via a high-performance REST API:

- `GET /api/content/blog-posts` - List all blog posts
- `GET /api/content/blog-posts/:id` - Get a single post
- `POST /api/content/blog-posts` - Create a post (requires auth)
- `PUT /api/content/blog-posts/:id` - Update a post (requires auth)
- `DELETE /api/content/blog-posts/:id` - Delete a post (requires auth)

## Deployment

1.  **Login to Cloudflare:**
    ```bash
    pnpm wrangler login
    ```

2.  **Deploy your application:**
    ```bash
    pnpm deploy
    ```

3.  **Run migrations on production:**
    ```bash
    pnpm db:migrate
    ```

## Documentation

- [PatroCMS Repository](https://github.com/patro-io/cms)
- [Effect Documentation](https://effect.website/docs/introduction)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)

## Support

- [GitHub Issues](https://github.com/patro-io/cms/issues)
- [Community Discussions](https://github.com/patro-io/cms/discussions)

## License

FSL-1.1-MIT