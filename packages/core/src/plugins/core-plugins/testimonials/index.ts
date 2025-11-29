import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import { Plugin } from '@patro-io/cms'
import { PluginBuilder } from '../../sdk/plugin-builder'
import {
  DatabaseService,
  makeDatabaseLayer,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../services/database-effect'
import type { Context as HonoContext } from 'hono'

/**
 * Testimonial data type
 */
interface Testimonial {
  id?: number
  author_name: string
  author_title?: string | null
  author_company?: string | null
  testimonial_text: string
  rating?: number | null
  isPublished: number
  sortOrder: number
  created_at?: number
  updated_at?: number
}

/**
 * Testimonial Schema for validation
 */
const testimonialSchema = Schema.Struct({
  id: Schema.optional(Schema.Number),
  authorName: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Author name is required' }),
    Schema.maxLength(100, { message: () => 'Author name must be under 100 characters' })
  ),
  authorTitle: Schema.optional(
    Schema.String.pipe(Schema.maxLength(100, { message: () => 'Author title must be under 100 characters' }))
  ),
  authorCompany: Schema.optional(
    Schema.String.pipe(Schema.maxLength(100, { message: () => 'Company must be under 100 characters' }))
  ),
  testimonialText: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Testimonial text is required' }),
    Schema.maxLength(1000, { message: () => 'Testimonial must be under 1000 characters' })
  ),
  rating: Schema.optional(Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(5)
  )),
  isPublished: Schema.Boolean,
  sortOrder: Schema.Number,
  createdAt: Schema.optional(Schema.Number),
  updatedAt: Schema.optional(Schema.Number)
})

type TestimonialInput = Schema.Schema.Type<typeof testimonialSchema>

const testimonialMigration = `
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_name TEXT NOT NULL,
  author_title TEXT,
  author_company TEXT,
  testimonial_text TEXT NOT NULL,
  rating INTEGER CHECK(rating >= 1 AND rating <= 5),
  isPublished INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_testimonials_published ON testimonials(isPublished);
CREATE INDEX IF NOT EXISTS idx_testimonials_sort_order ON testimonials(sortOrder);
CREATE INDEX IF NOT EXISTS idx_testimonials_rating ON testimonials(rating);

CREATE TRIGGER IF NOT EXISTS testimonials_updated_at
  AFTER UPDATE ON testimonials
BEGIN
  UPDATE testimonials SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
`

/**
 * Helper to get D1Database from Hono context
 */
const getDatabase = (c: HonoContext): Effect.Effect<D1Database, DatabaseError> =>
  Effect.gen(function* (_) {
    const db = (c.env as Record<string, unknown>)?.DB as D1Database | undefined
    if (!db) {
      return yield* Effect.fail(new DatabaseError({ message: 'Database not available' }))
    }
    return db
  })

/**
 * Helper to parse JSON body
 */
const parseJsonBody = (c: HonoContext): Effect.Effect<unknown, DatabaseError> =>
  Effect.tryPromise({
    try: () => c.req.json(),
    catch: (error) => new DatabaseError({ message: 'Failed to parse JSON body', cause: error })
  })

/**
 * Helper to validate input with Schema
 */
const validateInput = <A, I>(
  schema: Schema.Schema<A, I, never>,
  data: unknown
): Effect.Effect<A, ValidationError> =>
  Effect.gen(function* (_) {
    const result = Schema.decodeUnknownEither(schema)(data)
    if (result._tag === 'Left') {
      return yield* Effect.fail(new ValidationError('Validation failed', result.left.message))
    }
    return result.right
  })

/**
 * API Routes with Pure Effect
 */
const testimonialAPIRoutes = new Hono()

/**
 * GET / - List all testimonials with optional filters
 */
testimonialAPIRoutes.get('/', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const { published, minRating } = c.req.query()
    
    let query = 'SELECT * FROM testimonials WHERE 1=1'
    const params: unknown[] = []
    
    if (published !== undefined) {
      query += ' AND isPublished = ?'
      params.push(published === 'true' ? 1 : 0)
    }
    
    if (minRating) {
      query += ' AND rating >= ?'
      params.push(parseInt(minRating, 10))
    }
    
    query += ' ORDER BY sortOrder ASC, created_at DESC'
    
    const results = yield* dbService.query<Testimonial>(query, params)
    
    return {
      success: true,
      data: results
    }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer((c.env as Record<string, unknown>).DB as D1Database)),
      Effect.catchAll((error) =>
        Effect.succeed({
          success: false,
          error: error._tag === 'DatabaseError'
            ? 'Failed to fetch testimonials'
            : error.message
        })
      )
    )
  ).then(result =>
    'error' in result
      ? c.json(result, 500)
      : c.json(result)
  )
})

/**
 * GET /:id - Get a single testimonial by ID
 */
testimonialAPIRoutes.get('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const id = parseInt(c.req.param('id'))
    
    const result = yield* 
      dbService.queryFirst<Testimonial>(
        'SELECT * FROM testimonials WHERE id = ?',
        [id]
      )
    
    
    if (!result) {
      return yield* Effect.fail(new NotFoundError('Testimonial not found'))
    }
    
    return {
      success: true,
      data: result
    }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer((c.env as Record<string, unknown>).DB as D1Database)),
      Effect.catchAll((error) => {
        if (error._tag === 'NotFoundError') {
          return Effect.succeed({ error: error.message, statusCode: 404 })
        }
        return Effect.succeed({
          success: false,
          error: 'Failed to fetch testimonial',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      return c.json({ error: result.error }, result.statusCode as 404 | 500)
    }
    return c.json(result)
  })
})

/**
 * POST / - Create a new testimonial
 */
testimonialAPIRoutes.post('/', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const body = yield* parseJsonBody(c)
    const validatedData = yield* validateInput(testimonialSchema, body)
    
    const result = yield* 
      dbService.insert<Testimonial>(
        `INSERT INTO testimonials (author_name, author_title, author_company, testimonial_text, rating, isPublished, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        [
          validatedData.authorName,
          validatedData.authorTitle || null,
          validatedData.authorCompany || null,
          validatedData.testimonialText,
          validatedData.rating || null,
          validatedData.isPublished ? 1 : 0,
          validatedData.sortOrder
        ]
      )
    
    
    return {
      success: true,
      data: result,
      message: 'Testimonial created successfully'
    }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer((c.env as Record<string, unknown>).DB as D1Database)),
      Effect.catchAll((error) => {
        if (error._tag === 'ValidationError') {
          return Effect.succeed({
            success: false,
            error: error.message,
            details: error.details,
            statusCode: 400
          })
        }
        return Effect.succeed({
          success: false,
          error: 'Failed to create testimonial',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      return c.json(result, result.statusCode as 400 | 500)
    }
    return c.json(result, 201)
  })
})

/**
 * PUT /:id - Update an existing testimonial
 */
testimonialAPIRoutes.put('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const id = parseInt(c.req.param('id'))
    const body = yield* parseJsonBody(c)
    const validatedData = yield* validateInput(Schema.partial(testimonialSchema), body)
    
    const updateFields: string[] = []
    const updateValues: unknown[] = []
    
    if (validatedData.authorName !== undefined) {
      updateFields.push('author_name = ?')
      updateValues.push(validatedData.authorName)
    }
    if (validatedData.authorTitle !== undefined) {
      updateFields.push('author_title = ?')
      updateValues.push(validatedData.authorTitle)
    }
    if (validatedData.authorCompany !== undefined) {
      updateFields.push('author_company = ?')
      updateValues.push(validatedData.authorCompany)
    }
    if (validatedData.testimonialText !== undefined) {
      updateFields.push('testimonial_text = ?')
      updateValues.push(validatedData.testimonialText)
    }
    if (validatedData.rating !== undefined) {
      updateFields.push('rating = ?')
      updateValues.push(validatedData.rating)
    }
    if (validatedData.isPublished !== undefined) {
      updateFields.push('isPublished = ?')
      updateValues.push(validatedData.isPublished ? 1 : 0)
    }
    if (validatedData.sortOrder !== undefined) {
      updateFields.push('sortOrder = ?')
      updateValues.push(validatedData.sortOrder)
    }
    
    if (updateFields.length === 0) {
      return yield* Effect.fail(new ValidationError('No fields to update'))
    }
    
    updateValues.push(id)
    
    const result = yield* 
      dbService.update<Testimonial>(
        `UPDATE testimonials
         SET ${updateFields.join(', ')}
         WHERE id = ?
         RETURNING *`,
        updateValues
      )
    
    
    return {
      success: true,
      data: result,
      message: 'Testimonial updated successfully'
    }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer((c.env as Record<string, unknown>).DB as D1Database)),
      Effect.catchAll((error) => {
        if (error._tag === 'ValidationError') {
          return Effect.succeed({
            error: error.message,
            statusCode: 400
          })
        }
        if (error._tag === 'NotFoundError') {
          return Effect.succeed({
            error: 'Testimonial not found',
            statusCode: 404
          })
        }
        return Effect.succeed({
          success: false,
          error: 'Failed to update testimonial',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      return c.json({ error: result.error }, result.statusCode as 400 | 404 | 500)
    }
    return c.json(result)
  })
})

/**
 * DELETE /:id - Delete a testimonial
 */
testimonialAPIRoutes.delete('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const id = parseInt(c.req.param('id'))
    
    const result = yield* 
      dbService.execute('DELETE FROM testimonials WHERE id = ?', [id])
    
    
    if (result.changes === 0) {
      return yield* Effect.fail(new NotFoundError('Testimonial not found'))
    }
    
    return {
      success: true,
      message: 'Testimonial deleted successfully'
    }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer((c.env as Record<string, unknown>).DB as D1Database)),
      Effect.catchAll((error) => {
        if (error._tag === 'NotFoundError') {
          return Effect.succeed({
            error: error.message,
            statusCode: 404
          })
        }
        return Effect.succeed({
          success: false,
          error: 'Failed to delete testimonial',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    if ('statusCode' in result) {
      return c.json({ error: result.error }, result.statusCode as 404 | 500)
    }
    return c.json(result)
  })
})

export function createTestimonialPlugin(): Plugin {
  const builder = PluginBuilder.create({
    name: 'testimonials-plugin',
    version: '1.0.0-beta.1',
    description: 'Customer testimonials management plugin'
  })

  builder.metadata({
    author: {
      name: 'PatroCMS',
      email: 'info@patro.io'
    },
    license: 'MIT',
    compatibility: '^1.0.0'
  })

  builder.addModel('Testimonial', {
    tableName: 'testimonials',
    schema: testimonialSchema,
    migrations: [testimonialMigration]
  })

  builder.addRoute('/api/testimonials', testimonialAPIRoutes, {
    description: 'Testimonials API endpoints',
    requiresAuth: false
  })

  builder.addAdminPage('/testimonials', 'Testimonials', 'TestimonialsListView', {
    description: 'Manage customer testimonials',
    icon: 'star',
    permissions: ['admin', 'editor']
  })

  builder.addAdminPage('/testimonials/new', 'New Testimonial', 'TestimonialsFormView', {
    description: 'Create a new testimonial',
    permissions: ['admin', 'editor']
  })

  builder.addAdminPage('/testimonials/:id', 'Edit Testimonial', 'TestimonialsFormView', {
    description: 'Edit an existing testimonial',
    permissions: ['admin', 'editor']
  })

  builder.addMenuItem('Testimonials', '/admin/testimonials', {
    icon: 'star',
    order: 60,
    permissions: ['admin', 'editor']
  })

  builder.lifecycle({
    install: async (context) => {
      const { db } = context
      await db.prepare(testimonialMigration).run()
      console.log('Testimonials plugin installed successfully')
    },
    uninstall: async (context) => {
      const { db } = context
      await db.prepare('DROP TABLE IF EXISTS testimonials').run()
      console.log('Testimonials plugin uninstalled successfully')
    },
    activate: async () => {
      console.log('Testimonials plugin activated')
    },
    deactivate: async () => {
      console.log('Testimonials plugin deactivated')
    }
  })

  return builder.build() as Plugin
}

export const testimonialsPlugin = createTestimonialPlugin()
