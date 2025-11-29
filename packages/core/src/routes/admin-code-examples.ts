import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import { DatabaseService } from '../services/database-effect'
import { SettingsService } from '../services/settings'
import { makeAppLayer } from '../services'
import { getTranslate } from '../middleware'
import { renderCodeExamplesList } from '../templates/pages/admin-code-examples-list.template'
import { renderCodeExamplesForm } from '../templates/pages/admin-code-examples-form.template'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
}

type Variables = {
  user?: {
    userId: string
    email: string
    role: string
    exp: number
    iat: number
  }
}

const codeExampleSchema = Schema.Struct({
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Title is required' }),
    Schema.maxLength(200, { message: () => 'Title must be under 200 characters' })
  ),
  description: Schema.optional(
    Schema.String.pipe(
      Schema.maxLength(500, { message: () => 'Description must be under 500 characters' })
    )
  ),
  code: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Code is required' })
  ),
  language: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Language is required' })
  ),
  category: Schema.optional(
    Schema.String.pipe(
      Schema.maxLength(50, { message: () => 'Category must be under 50 characters' })
    )
  ),
  tags: Schema.optional(
    Schema.String.pipe(
      Schema.maxLength(200, { message: () => 'Tags must be under 200 characters' })
    )
  ),
  isPublished: Schema.String,
  sortOrder: Schema.String
})

const adminCodeExamplesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware now applied in app.ts

adminCodeExamplesRoutes.get('/', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)
  const { published, language, search, page = '1' } = c.req.query()
  const currentPage = parseInt(page, 10) || 1
  const limit = 20
  const offset = (currentPage - 1) * limit
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    let whereClause = 'WHERE 1=1'
    const params: any[] = []

    if (published !== undefined) {
      whereClause += ' AND isPublished = ?'
      params.push(published === 'true' ? 1 : 0)
    }

    if (language) {
      whereClause += ' AND language = ?'
      params.push(language)
    }

    if (search) {
      whereClause += ' AND (title LIKE ? OR description LIKE ? OR code LIKE ? OR tags LIKE ?)'
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm, searchTerm)
    }

    const countQuery = `SELECT COUNT(*) as count FROM code_examples ${whereClause}`
    const countResults = yield* dbService.query<{ count: number }>(countQuery, params)
    const totalCount = countResults[0]?.count || 0

    const dataQuery = `
      SELECT * FROM code_examples
      ${whereClause}
      ORDER BY sortOrder ASC, created_at DESC
      LIMIT ? OFFSET ?
    `
    const codeExamples = yield* dbService.query<any>(dataQuery, [...params, limit, offset])
    const totalPages = Math.ceil(totalCount / limit)

    return c.html(renderCodeExamplesList({
      codeExamples: codeExamples as any[] || [],
      totalCount,
      currentPage,
      totalPages,
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      logoUrl: appearanceSettings.logoUrl
    }, t))
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error fetching code examples:', error)
        return Effect.succeed(c.html(renderCodeExamplesList({
          codeExamples: [],
          totalCount: 0,
          currentPage: 1,
          totalPages: 1,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to load code examples',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminCodeExamplesRoutes.get('/new', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return c.html(renderCodeExamplesForm({
      isEdit: false,
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      logoUrl: appearanceSettings.logoUrl
    }, t))
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error rendering new code example form:', error)
        return Effect.succeed(c.html(renderCodeExamplesForm({
          isEdit: false,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to load form',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminCodeExamplesRoutes.post('/', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })
    const data = Object.fromEntries(formData.entries())

    const validation = Schema.decodeUnknownEither(codeExampleSchema)(data)
    if (validation._tag === 'Left') {
      return yield* Effect.succeed(c.html(renderCodeExamplesForm({
        isEdit: false,
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        message: 'Validation failed: ' + validation.left.message,
        messageType: 'error',
        logoUrl: appearanceSettings.logoUrl
      }, t)))
    }
    const validatedData = validation.right as any
    
    const isPublished = validatedData.isPublished === 'true'
    const sortOrder = parseInt(validatedData.sortOrder, 10)

    const results = yield* dbService.query<any>(`
      INSERT INTO code_examples (title, description, code, language, category, tags, isPublished, sortOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      validatedData.title,
      validatedData.description || null,
      validatedData.code,
      validatedData.language,
      validatedData.category || null,
      validatedData.tags || null,
      isPublished ? 1 : 0,
      sortOrder
    ])

    if (results && results.length > 0) {
      return c.redirect('/admin/code-examples?message=Code example created successfully')
    } else {
      return c.html(renderCodeExamplesForm({
        isEdit: false,
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        message: 'Failed to create code example',
        messageType: 'error',
        logoUrl: appearanceSettings.logoUrl
      }, t))
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error creating code example:', error)
        return Effect.succeed(c.html(renderCodeExamplesForm({
          isEdit: false,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to create code example',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminCodeExamplesRoutes.get('/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const t = getTranslate(c)
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const results = yield* dbService.query<any>('SELECT * FROM code_examples WHERE id = ?', [id])

    if (!results || results.length === 0) {
      return c.redirect('/admin/code-examples?message=Code example not found&type=error')
    }

    const example = results[0]

    return c.html(renderCodeExamplesForm({
      codeExample: {
        id: example.id,
        title: example.title,
        description: example.description,
        code: example.code,
        language: example.language,
        category: example.category,
        tags: example.tags,
        isPublished: Boolean(example.isPublished),
        sortOrder: example.sortOrder
      },
      isEdit: true,
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      logoUrl: appearanceSettings.logoUrl
    }, t))
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error fetching code example:', error)
        return Effect.succeed(c.html(renderCodeExamplesForm({
          isEdit: true,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to load code example',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminCodeExamplesRoutes.put('/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const t = getTranslate(c)
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })
    const data = Object.fromEntries(formData.entries())

    const validation = Schema.decodeUnknownEither(codeExampleSchema)(data)
    if (validation._tag === 'Left') {
      return yield* Effect.succeed(c.html(renderCodeExamplesForm({
        isEdit: true,
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        message: 'Validation failed: ' + validation.left.message,
        messageType: 'error',
        logoUrl: appearanceSettings.logoUrl
      }, t)))
    }
    const validatedData = validation.right as any
    
    const isPublished = validatedData.isPublished === 'true'
    const sortOrder = parseInt(validatedData.sortOrder, 10)

    const results = yield* dbService.query<any>(`
      UPDATE code_examples
      SET title = ?, description = ?, code = ?, language = ?, category = ?, tags = ?, isPublished = ?, sortOrder = ?
      WHERE id = ?
      RETURNING *
    `, [
      validatedData.title,
      validatedData.description || null,
      validatedData.code,
      validatedData.language,
      validatedData.category || null,
      validatedData.tags || null,
      isPublished ? 1 : 0,
      sortOrder,
      id
    ])

    if (results && results.length > 0) {
      return c.redirect('/admin/code-examples?message=Code example updated successfully')
    } else {
      return c.html(renderCodeExamplesForm({
        codeExample: {
          id,
          title: validatedData.title,
          description: validatedData.description,
          code: validatedData.code,
          language: validatedData.language,
          category: validatedData.category,
          tags: validatedData.tags,
          isPublished: isPublished,
          sortOrder: sortOrder
        },
        isEdit: true,
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        message: 'Code example not found',
        messageType: 'error',
        logoUrl: appearanceSettings.logoUrl
      }, t))
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error updating code example:', error)
        return Effect.succeed(c.html(renderCodeExamplesForm({
          codeExample: {
            id,
            title: '',
            description: '',
            code: '',
            language: '',
            category: '',
            tags: '',
            isPublished: true,
            sortOrder: 0
          },
          isEdit: true,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to update code example',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminCodeExamplesRoutes.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const result = yield* dbService.execute('DELETE FROM code_examples WHERE id = ?', [id])

    if (result.changes === 0) {
      return c.json({ error: 'Code example not found' }, 404)
    }

    return c.redirect('/admin/code-examples?message=Code example deleted successfully')
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error deleting code example:', error)
        return Effect.succeed(c.json({ error: 'Failed to delete code example' }, 500))
      })
    )
  )
})

export default adminCodeExamplesRoutes
