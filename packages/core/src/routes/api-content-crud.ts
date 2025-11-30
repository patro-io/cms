/**
 * API Content CRUD Routes - Pure Effect Implementation
 * Public API for content management using ContentService
 */

import { Effect } from 'effect'
import { Hono } from 'hono'
import type { Bindings, Variables } from '../app'
import { requireAuth } from '../middleware'
import {
  ContentService,
  ContentNotFoundError,
  ContentAlreadyExistsError
} from '../services/content-effect'
import {
  DatabaseService,
  ValidationError
} from '../services/database-effect'
import { CACHE_CONFIGS, CacheService, makeCacheServiceLayer } from '../services/cache'
import { makeAppLayer } from '../services'
import { runInBackground } from '../utils/waitUntil'

const apiContentCrudRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * Helper to generate slug from title
 */
const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// GET /api/content/:id - Get single content item by ID with translations
apiContentCrudRoutes.get('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const db = yield* DatabaseService
    const contentService = yield* ContentService
    
    const content = yield* contentService.getContentById(id)
    
    // Build translations map
    const translations: Record<string, string> = {}
    
    if (content.translation_group_id) {
      const relatedContent = yield* 
        db.query<{ language: string; slug: string }>(
          `SELECT language, slug FROM content
           WHERE translation_group_id = ? AND collection_id = ?
           ORDER BY language ASC`,
          [content.translation_group_id, content.collection_id]
        )
      
      
      for (const item of relatedContent) {
        const lang = item.language || 'en'
        translations[lang] = item.slug
      }
    } else {
      const currentLang = content.language || 'en'
      translations[currentLang] = content.slug
    }
    
    return {
      data: {
        id: content.id,
        title: content.title || (content.data as any)?.title,
        slug: content.slug,
        lang: content.language || 'en',
        status: content.status,
        collectionId: content.collection_id,
        data: content.data,
        translations: translations,
        created_at: content.created_at,
        updated_at: content.updated_at
      }
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error fetching content:', error)
        
        if (error instanceof ContentNotFoundError) {
          return Effect.succeed({
            error: 'Content not found',
            status: 404
          })
        }
        
        return Effect.succeed({
          error: 'Failed to fetch content',
          details: error instanceof Error ? error.message : String(error),
          status: 500
        })
      })
    )
  ).then(result => {
    if ('error' in result) {
      return c.json({ error: result.error, details: (result as any).details }, (result as any).status || 500)
    }
    return c.json(result)
  })
})

// GET /api/content/:collection/:slug - Get content by collection and slug with translations
apiContentCrudRoutes.get('/:collection/:slug', (c) => {
  const program = Effect.gen(function* (_) {
    const collectionName = c.req.param('collection')
    const slug = c.req.param('slug')
    
    const db = yield* DatabaseService
    const contentService = yield* ContentService
    
    // Get collection ID from name
    const collection = yield* 
      db.queryFirst<{ id: string }>(
        'SELECT id FROM collections WHERE name = ?',
        [collectionName]
      ).pipe(
        Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    
    
    if (!collection) {
      return {
        error: 'Collection not found',
        status: 404
      }
    }
    
    // Get content with translations
    const content = yield* 
      contentService.getContentBySlugWithTranslations(collection.id, slug)
    
    
    return {
      data: {
        id: content.id,
        title: content.title || (content.data as any)?.title,
        slug: content.slug,
        lang: content.language || 'en',
        status: content.status,
        collectionId: content.collection_id,
        data: content.data,
        translations: content.translations,
        created_at: content.created_at,
        updated_at: content.updated_at
      }
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)),
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error fetching content:', error)
        
        if (error instanceof ContentNotFoundError) {
          return Effect.succeed({
            error: 'Content not found',
            status: 404
          })
        }
        
        return Effect.succeed({
          error: 'Failed to fetch content',
          details: error instanceof Error ? error.message : String(error),
          status: 500
        })
      })
    )
  ).then(result => {
    if ('error' in result) {
      return c.json({ error: result.error, details: (result as any).details }, (result as any).status || 500)
    }
    return c.json(result)
  })
})

// POST /api/content - Create new content (requires authentication)
apiContentCrudRoutes.post('/', requireAuth(), (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: () => new ValidationError('Invalid JSON body')
      })
    
    
    const { collectionId, title, slug, status, data, language, linkToId } = body
    
    // Validate required fields
    if (!collectionId) {
      return yield* Effect.fail(new ValidationError('collectionId is required'))
    }
    
    if (!title) {
      return yield* Effect.fail(new ValidationError('title is required'))
    }
    
    // Generate slug from title if not provided
    const finalSlug = slug ? generateSlug(slug) : generateSlug(title)
    
    const contentService = yield* ContentService
    
    // Create content with proper data structure
    const contentData = {
      title,
      ...data
    }
    
    const content = yield* 
      contentService.createContent({
        collection_id: collectionId,
        slug: finalSlug,
        data: contentData,
        status: status || 'draft',
        author_id: user?.userId || 'system',
        language: language,
        linkToId: linkToId
      })
    
    
    // Invalidate cache (fire-and-forget)
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.api!)
    const invalidateProgram = Effect.gen(function* (_) {
      const cache = yield* CacheService
      yield* cache.invalidate(`content:list:${collectionId}:*`)
      yield* cache.invalidate('content-filtered:*')
    })
    runInBackground(c, Effect.provide(invalidateProgram, cacheLayer))
    
    return {
      data: {
        id: content.id,
        title: (content.data as any)?.title,
        slug: content.slug,
        status: content.status,
        collectionId: content.collection_id,
        data: content.data,
        created_at: content.created_at,
        updated_at: content.updated_at
      },
      status: 201
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error creating content:', error)
        
        if (error instanceof ValidationError) {
          return Effect.succeed({
            error: error.message,
            status: 400
          })
        }
        
        if (error instanceof ContentAlreadyExistsError) {
          return Effect.succeed({
            error: 'A content item with this slug already exists in this collection',
            status: 409
          })
        }
        
        return Effect.succeed({
          error: 'Failed to create content',
          details: error instanceof Error ? error.message : String(error),
          status: 500
        })
      })
    )
  ).then(result => {
    if ('error' in result) {
      return c.json({ error: result.error, details: (result as any).details }, (result as any).status || 500)
    }
    return c.json(result, (result as any).status || 200)
  })
})

// PUT /api/content/:id - Update content (requires authentication)
apiContentCrudRoutes.put('/:id', requireAuth(), (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const user = c.get('user')
    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: () => new ValidationError('Invalid JSON body')
      })
    
    
    const contentService = yield* ContentService
    
    // Build update data
    const updateData: any = {
      updated_by: user?.userId || 'system'
    }
    
    if (body.title !== undefined || body.data !== undefined) {
      // Merge title into data if provided
      updateData.data = {
        ...(body.data || {}),
        ...(body.title !== undefined ? { title: body.title } : {})
      }
    }
    
    if (body.slug !== undefined) {
      updateData.slug = generateSlug(body.slug)
    }
    
    if (body.status !== undefined) {
      updateData.status = body.status
    }
    
    const content = yield* 
      contentService.updateContent(id, updateData)
    
    
    // Invalidate cache (fire-and-forget)
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.api!)
    const invalidateProgram = Effect.gen(function* (_) {
      const cache = yield* CacheService
      const key = yield* cache.generateKey('content', id)
      yield* cache.delete(key)
      yield* cache.invalidate(`content:list:${content.collection_id}:*`)
      yield* cache.invalidate('content-filtered:*')
    })
    runInBackground(c, Effect.provide(invalidateProgram, cacheLayer))
    
    return {
      data: {
        id: content.id,
        title: (content.data as any)?.title,
        slug: content.slug,
        status: content.status,
        collectionId: content.collection_id,
        data: content.data,
        created_at: content.created_at,
        updated_at: content.updated_at
      }
    }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error updating content:', error)
        
        if (error instanceof ContentNotFoundError) {
          return Effect.succeed({
            error: 'Content not found',
            status: 404
          })
        }
        
        if (error instanceof ValidationError) {
          return Effect.succeed({
            error: error.message,
            status: 400
          })
        }
        
        if (error instanceof ContentAlreadyExistsError) {
          return Effect.succeed({
            error: 'A content item with this slug already exists',
            status: 409
          })
        }
        
        return Effect.succeed({
          error: 'Failed to update content',
          details: error instanceof Error ? error.message : String(error),
          status: 500
        })
      })
    )
  ).then(result => {
    if ('error' in result) {
      return c.json({ error: result.error, details: (result as any).details }, (result as any).status || 500)
    }
    return c.json(result)
  })
})

// DELETE /api/content/:id - Delete content (requires authentication)
apiContentCrudRoutes.delete('/:id', requireAuth(), (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const contentService = yield* ContentService
    
    // Get content first to know collection_id for cache invalidation
    const content = yield* contentService.getContentById(id)
    const collectionId = content.collection_id
    
    yield* contentService.deleteContent(id)
    
    // Invalidate cache (fire-and-forget)
    const cacheLayer = makeCacheServiceLayer(CACHE_CONFIGS.api!)
    const invalidateProgram = Effect.gen(function* (_) {
      const cache = yield* CacheService
      const key = yield* cache.generateKey('content', id)
      yield* cache.delete(key)
      yield* cache.invalidate(`content:list:${collectionId}:*`)
      yield* cache.invalidate('content-filtered:*')
    })
    runInBackground(c, Effect.provide(invalidateProgram, cacheLayer))
    
    return { success: true }
  })
  
  const db = c.env.DB
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error deleting content:', error)
        
        if (error instanceof ContentNotFoundError) {
          return Effect.succeed({
            error: 'Content not found',
            status: 404
          })
        }
        
        return Effect.succeed({
          error: 'Failed to delete content',
          details: error instanceof Error ? error.message : String(error),
          status: 500
        })
      })
    )
  ).then(result => {
    if ('error' in result) {
      return c.json({ error: result.error, details: (result as any).details }, (result as any).status || 500)
    }
    return c.json(result)
  })
})

export default apiContentCrudRoutes