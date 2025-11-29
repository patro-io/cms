# My PatroCMS Application

A modern headless CMS built with [PatroCMS](https://patro.io) on Cloudflare's edge platform.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A Cloudflare account (free tier works great)
- Wrangler CLI (installed with dependencies)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create your D1 database:**
   ```bash
   npx wrangler d1 create my-patro-db
   ```

   Copy the `database_id` from the output and update it in `wrangler.jsonc`.

3. **Create your R2 bucket:**
   ```bash
   npx wrangler r2 bucket create my-patro-media
   ```

4. **Run migrations:**
   ```bash
   npm run db:migrate:local
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   Navigate to `http://localhost:8787/admin` to access the admin interface.

   Default credentials:
   - Email: `admin@patro.io`
   - Password: `admin`

## Project Structure

```
my-patro-app/
├── src/
│   ├── collections/          # Your content type definitions
│   │   └── blog-posts.collection.ts
│   └── index.ts             # Application entry point
├── wrangler.jsonc            # Cloudflare Workers configuration
├── package.json
└── tsconfig.json
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run deploy` - Deploy to Cloudflare
- `npm run db:migrate` - Run migrations on production database
- `npm run db:migrate:local` - Run migrations locally
- `npm run type-check` - Check TypeScript types
- `npm run test` - Run tests

## Creating Collections

Collections define your content types. Create a new file in `src/collections/`:

```typescript
// src/collections/products.collection.ts
import type { CollectionConfig } from '@patro-io/cms'

export default {
  name: 'products',
  label: 'Products',
  fields: {
    name: { type: 'text', required: true },
    price: { type: 'number', required: true },
    description: { type: 'markdown' }
  }
} satisfies CollectionConfig
```

## API Access

Your collections are automatically available via REST API:

- `GET /api/content/blog-posts` - List all blog posts
- `GET /api/content/blog-posts/:id` - Get a single post
- `POST /api/content/blog-posts` - Create a post (requires auth)
- `PUT /api/content/blog-posts/:id` - Update a post (requires auth)
- `DELETE /api/content/blog-posts/:id` - Delete a post (requires auth)

## Deployment

1. **Login to Cloudflare:**
   ```bash
   npx wrangler login
   ```

2. **Deploy your application:**
   ```bash
   npm run deploy
   ```

3. **Run migrations on production:**
   ```bash
   npm run db:migrate
   ```

## Documentation

- [PatroCMS Documentation](https://docs.patro.io)
- [Collection Configuration](https://docs.patro.io/collections)
- [Plugin Development](https://docs.patro.io/plugins)
- [API Reference](https://docs.patro.io/api)

## Support

- [GitHub Issues](https://github.com/patro-io/cms/issues)
- [Discord Community](https://discord.gg/patro)
- [Documentation](https://docs.patro.io)

## License

MIT
