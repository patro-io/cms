import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import { DatabaseService } from '../services/database-effect'
import { SettingsService } from '../services/settings'
import { makeAppLayer } from '../services'
import { getTranslate } from '../middleware'
import { renderTestimonialsList } from '../templates/pages/admin-testimonials-list.template'
import { renderTestimonialsForm } from '../templates/pages/admin-testimonials-form.template'

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

const testimonialSchema = Schema.Struct({
  authorName: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Author name is required' }),
    Schema.maxLength(100, { message: () => 'Author name must be under 100 characters' })
  ),
  authorTitle: Schema.optional(Schema.String),
  authorCompany: Schema.optional(Schema.String),
  testimonialText: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Testimonial is required' }),
    Schema.maxLength(1000, { message: () => 'Testimonial must be under 1000 characters' })
  ),
  rating: Schema.optional(Schema.String),
  isPublished: Schema.String,
  sortOrder: Schema.String
})

const adminTestimonialsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

adminTestimonialsRoutes.get('/', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)
  const { published, minRating, search, page = '1' } = c.req.query()
  const currentPage = parseInt(page, 10) || 1
  const limit = 20
  const offset = (currentPage - 1) * limit
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    let whereClause = 'WHERE 1=1'
    const params: any[] = []

    if (published !== undefined) {
      whereClause += ' AND isPublished = ?'
      params.push(published === 'true' ? 1 : 0)
    }

    if (minRating) {
      whereClause += ' AND rating >= ?'
      params.push(parseInt(minRating, 10))
    }

    if (search) {
      whereClause += ' AND (author_name LIKE ? OR testimonial_text LIKE ? OR author_company LIKE ?)'
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }

    const countQuery = `SELECT COUNT(*) as count FROM testimonials ${whereClause}`
    const countResults = yield* dbService.query<{ count: number }>(countQuery, params)
    const totalCount = countResults[0]?.count || 0

    const dataQuery = `
      SELECT * FROM testimonials
      ${whereClause}
      ORDER BY sortOrder ASC, created_at DESC
      LIMIT ? OFFSET ?
    `
    const testimonials = yield* dbService.query<any>(dataQuery, [...params, limit, offset])

    const totalPages = Math.ceil(totalCount / limit)

    return c.html(renderTestimonialsList({
      testimonials: testimonials as any[] || [],
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
        console.error('Error fetching testimonials:', error)
        return Effect.succeed(
          c.html(renderTestimonialsList({
            testimonials: [],
            totalCount: 0,
            currentPage: 1,
            totalPages: 1,
            user: user ? {
              name: user.email,
              email: user.email,
              role: user.role
            } : undefined,
            message: 'Failed to load testimonials',
            messageType: 'error'
          }, t))
        )
      })
    )
  )
})

adminTestimonialsRoutes.get('/new', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    return c.html(renderTestimonialsForm({
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
        console.error('Error rendering new testimonial form:', error)
        return Effect.succeed(c.html(renderTestimonialsForm({
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

adminTestimonialsRoutes.post('/', (c) => {
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

    const validation = Schema.decodeUnknownEither(testimonialSchema)(data)
    if (validation._tag === 'Left') {
      return yield* Effect.succeed(c.html(renderTestimonialsForm({
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
    
    const rating = validatedData.rating ? parseInt(validatedData.rating, 10) : undefined
    const isPublished = validatedData.isPublished === 'true'
    const sortOrder = parseInt(validatedData.sortOrder, 10)

    const results = yield* dbService.query<any>(`
      INSERT INTO testimonials (author_name, author_title, author_company, testimonial_text, rating, isPublished, sortOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      validatedData.authorName,
      validatedData.authorTitle || null,
      validatedData.authorCompany || null,
      validatedData.testimonialText,
      rating || null,
      isPublished ? 1 : 0,
      sortOrder
    ])

    if (results && results.length > 0) {
      return c.redirect('/admin/testimonials?message=Testimonial created successfully')
    } else {
      return c.html(renderTestimonialsForm({
        isEdit: false,
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        message: 'Failed to create testimonial',
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
        console.error('Error creating testimonial:', error)
        return Effect.succeed(c.html(renderTestimonialsForm({
          isEdit: false,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to create testimonial',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminTestimonialsRoutes.get('/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const t = getTranslate(c)
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const results = yield* dbService.query<any>('SELECT * FROM testimonials WHERE id = ?', [id])

    if (!results || results.length === 0) {
      return c.redirect('/admin/testimonials?message=Testimonial not found&type=error')
    }

    const testimonial = results[0]

    return c.html(renderTestimonialsForm({
      testimonial: {
        id: testimonial.id,
        authorName: testimonial.author_name,
        authorTitle: testimonial.author_title,
        authorCompany: testimonial.author_company,
        testimonialText: testimonial.testimonial_text,
        rating: testimonial.rating,
        isPublished: Boolean(testimonial.isPublished),
        sortOrder: testimonial.sortOrder
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
        console.error('Error fetching testimonial:', error)
        return Effect.succeed(c.html(renderTestimonialsForm({
          isEdit: true,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to load testimonial',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminTestimonialsRoutes.put('/:id', (c) => {
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

    const validation = Schema.decodeUnknownEither(testimonialSchema)(data)
    if (validation._tag === 'Left') {
      return yield* Effect.succeed(c.html(renderTestimonialsForm({
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
    
    const rating = validatedData.rating ? parseInt(validatedData.rating, 10) : undefined
    const isPublished = validatedData.isPublished === 'true'
    const sortOrder = parseInt(validatedData.sortOrder, 10)

    const results = yield* dbService.query<any>(`
      UPDATE testimonials
      SET author_name = ?, author_title = ?, author_company = ?, testimonial_text = ?, rating = ?, isPublished = ?, sortOrder = ?
      WHERE id = ?
      RETURNING *
    `, [
      validatedData.authorName,
      validatedData.authorTitle || null,
      validatedData.authorCompany || null,
      validatedData.testimonialText,
      rating || null,
      isPublished ? 1 : 0,
      sortOrder,
      id
    ])

    if (results && results.length > 0) {
      return c.redirect('/admin/testimonials?message=Testimonial updated successfully')
    } else {
      return c.html(renderTestimonialsForm({
        testimonial: {
          id,
          authorName: validatedData.authorName,
          authorTitle: validatedData.authorTitle,
          authorCompany: validatedData.authorCompany,
          testimonialText: validatedData.testimonialText,
          rating: rating,
          isPublished: isPublished,
          sortOrder: sortOrder
        },
        isEdit: true,
        user: user ? {
          name: user.email,
          email: user.email,
          role: user.role
        } : undefined,
        message: 'Testimonial not found',
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
        console.error('Error updating testimonial:', error)
        return Effect.succeed(c.html(renderTestimonialsForm({
          testimonial: {
            id,
            authorName: '',
            authorTitle: '',
            authorCompany: '',
            testimonialText: '',
            rating: undefined,
            isPublished: true,
            sortOrder: 0
          },
          isEdit: true,
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined,
          message: 'Failed to update testimonial',
          messageType: 'error'
        }, t)))
      })
    )
  )
})

adminTestimonialsRoutes.delete('/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const result = yield* dbService.execute('DELETE FROM testimonials WHERE id = ?', [id])

    if (result.changes === 0) {
      return c.json({ error: 'Testimonial not found' }, 404)
    }

    return c.redirect('/admin/testimonials?message=Testimonial deleted successfully')
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) => {
        console.error('Error deleting testimonial:', error)
        return Effect.succeed(c.json({ error: 'Failed to delete testimonial' }, 500))
      })
    )
  )
})

export default adminTestimonialsRoutes
