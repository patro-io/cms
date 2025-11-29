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
 * Code Example data type
 */
interface CodeExample {
  id?: number
  title: string
  description?: string | null
  code: string
  language: string
  category?: string | null
  tags?: string | null
  isPublished: number
  sortOrder: number
  created_at?: number
  updated_at?: number
}

/**
 * Code Example Schema for validation
 */
const codeExampleSchema = Schema.Struct({
  id: Schema.optional(Schema.Number),
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Title is required' }),
    Schema.maxLength(200, { message: () => 'Title must be under 200 characters' })
  ),
  description: Schema.optional(
    Schema.String.pipe(Schema.maxLength(500, { message: () => 'Description must be under 500 characters' }))
  ),
  code: Schema.String.pipe(Schema.minLength(1, { message: () => 'Code is required' })),
  language: Schema.String.pipe(Schema.minLength(1, { message: () => 'Language is required' })),
  category: Schema.optional(
    Schema.String.pipe(Schema.maxLength(50, { message: () => 'Category must be under 50 characters' }))
  ),
  tags: Schema.optional(
    Schema.String.pipe(Schema.maxLength(200, { message: () => 'Tags must be under 200 characters' }))
  ),
  isPublished: Schema.Boolean,
  sortOrder: Schema.Number,
  createdAt: Schema.optional(Schema.Number),
  updatedAt: Schema.optional(Schema.Number)
})

type CodeExampleInput = Schema.Schema.Type<typeof codeExampleSchema>

/**
 * Database migration SQL
 */
const codeExampleMigration = `
CREATE TABLE IF NOT EXISTS code_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  isPublished INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_code_examples_published ON code_examples(isPublished);
CREATE INDEX IF NOT EXISTS idx_code_examples_sort_order ON code_examples(sortOrder);
CREATE INDEX IF NOT EXISTS idx_code_examples_language ON code_examples(language);
CREATE INDEX IF NOT EXISTS idx_code_examples_category ON code_examples(category);

CREATE TRIGGER IF NOT EXISTS code_examples_updated_at
  AFTER UPDATE ON code_examples
BEGIN
  UPDATE code_examples SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
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
const codeExampleAPIRoutes = new Hono()

/**
 * GET / - List all code examples with optional filters
 */
codeExampleAPIRoutes.get('/', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const { published, language, category } = c.req.query()
    
    let query = 'SELECT * FROM code_examples WHERE 1=1'
    const params: unknown[] = []
    
    if (published !== undefined) {
      query += ' AND isPublished = ?'
      params.push(published === 'true' ? 1 : 0)
    }
    
    if (language) {
      query += ' AND language = ?'
      params.push(language)
    }
    
    if (category) {
      query += ' AND category = ?'
      params.push(category)
    }
    
    query += ' ORDER BY sortOrder ASC, created_at DESC'
    
    const results = yield* dbService.query<CodeExample>(query, params)
    
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
            ? 'Failed to fetch code examples'
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
 * GET /:id - Get a single code example by ID
 */
codeExampleAPIRoutes.get('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const id = parseInt(c.req.param('id'))
    
    const result = yield* 
      dbService.queryFirst<CodeExample>(
        'SELECT * FROM code_examples WHERE id = ?',
        [id]
      )
    
    
    if (!result) {
      return yield* Effect.fail(new NotFoundError('Code example not found'))
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
          error: 'Failed to fetch code example',
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
 * POST / - Create a new code example
 */
codeExampleAPIRoutes.post('/', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const body = yield* parseJsonBody(c)
    const validatedData = yield* validateInput(codeExampleSchema, body)
    
    const result = yield* 
      dbService.insert<CodeExample>(
        `INSERT INTO code_examples (title, description, code, language, category, tags, isPublished, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        [
          validatedData.title,
          validatedData.description || null,
          validatedData.code,
          validatedData.language,
          validatedData.category || null,
          validatedData.tags || null,
          validatedData.isPublished ? 1 : 0,
          validatedData.sortOrder
        ]
      )
    
    
    return {
      success: true,
      data: result,
      message: 'Code example created successfully'
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
          error: 'Failed to create code example',
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
 * PUT /:id - Update an existing code example
 */
codeExampleAPIRoutes.put('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const id = parseInt(c.req.param('id'))
    const body = yield* parseJsonBody(c)
    const validatedData = yield* validateInput(Schema.partial(codeExampleSchema), body)
    
    const updateFields: string[] = []
    const updateValues: unknown[] = []
    
    if (validatedData.title !== undefined) {
      updateFields.push('title = ?')
      updateValues.push(validatedData.title)
    }
    if (validatedData.description !== undefined) {
      updateFields.push('description = ?')
      updateValues.push(validatedData.description)
    }
    if (validatedData.code !== undefined) {
      updateFields.push('code = ?')
      updateValues.push(validatedData.code)
    }
    if (validatedData.language !== undefined) {
      updateFields.push('language = ?')
      updateValues.push(validatedData.language)
    }
    if (validatedData.category !== undefined) {
      updateFields.push('category = ?')
      updateValues.push(validatedData.category)
    }
    if (validatedData.tags !== undefined) {
      updateFields.push('tags = ?')
      updateValues.push(validatedData.tags)
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
      dbService.update<CodeExample>(
        `UPDATE code_examples
         SET ${updateFields.join(', ')}
         WHERE id = ?
         RETURNING *`,
        updateValues
      )
    
    
    return {
      success: true,
      data: result,
      message: 'Code example updated successfully'
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
            error: 'Code example not found',
            statusCode: 404
          })
        }
        return Effect.succeed({
          success: false,
          error: 'Failed to update code example',
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
 * DELETE /:id - Delete a code example
 */
codeExampleAPIRoutes.delete('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const db = yield* getDatabase(c)
    const dbService = yield* DatabaseService
    
    const id = parseInt(c.req.param('id'))
    
    const result = yield* 
      dbService.execute('DELETE FROM code_examples WHERE id = ?', [id])
    
    
    if (result.changes === 0) {
      return yield* Effect.fail(new NotFoundError('Code example not found'))
    }
    
    return {
      success: true,
      message: 'Code example deleted successfully'
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
          error: 'Failed to delete code example',
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
 * Plugin factory function
 */
export function createCodeExamplesPlugin(): Plugin {
  const builder = PluginBuilder.create({
    name: 'code-examples-plugin',
    version: '1.0.0-beta.1',
    description: 'Code examples and snippets management plugin'
  })

  builder.metadata({
    author: {
      name: 'PatroCMS',
      email: 'info@patro.io'
    },
    license: 'MIT',
    compatibility: '^1.0.0'
  })

  builder.addModel('CodeExample', {
    tableName: 'code_examples',
    schema: codeExampleSchema,
    migrations: [codeExampleMigration]
  })

  builder.addRoute('/api/code-examples', codeExampleAPIRoutes, {
    description: 'Code Examples API endpoints',
    requiresAuth: false
  })

  builder.addAdminPage('/code-examples', 'Code Examples', 'CodeExamplesListView', {
    description: 'Manage code snippets and examples',
    icon: 'code',
    permissions: ['admin', 'editor']
  })

  builder.addAdminPage('/code-examples/new', 'New Code Example', 'CodeExamplesFormView', {
    description: 'Create a new code example',
    permissions: ['admin', 'editor']
  })

  builder.addAdminPage('/code-examples/:id', 'Edit Code Example', 'CodeExamplesFormView', {
    description: 'Edit an existing code example',
    permissions: ['admin', 'editor']
  })

  builder.addMenuItem('Code Examples', '/admin/code-examples', {
    icon: 'code',
    order: 65,
    permissions: ['admin', 'editor']
  })

  builder.lifecycle({
    install: async (context) => {
      const { db } = context
      await db.prepare(codeExampleMigration).run()
      console.log('Code Examples plugin installed successfully')
    },
    uninstall: async (context) => {
      const { db } = context
      await db.prepare('DROP TABLE IF EXISTS code_examples').run()
      console.log('Code Examples plugin uninstalled successfully')
    },
    activate: async () => {
      console.log('Code Examples plugin activated')
    },
    deactivate: async () => {
      console.log('Code Examples plugin deactivated')
    }
  })

  return builder.build() as Plugin
}

export const codeExamplesPlugin = createCodeExamplesPlugin()
