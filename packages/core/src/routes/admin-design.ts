import { Hono } from 'hono'
import { Effect } from 'effect'
import { renderDesignPage, DesignPageData } from '../templates/pages/admin-design.template'
import { SettingsService } from '../services/settings'
import { makeAppLayer } from '../services'
import { getTranslate } from '../middleware'

type Bindings = {
  DB: D1Database
  KV: KVNamespace
}

type Variables = {
  user: {
    userId: string
    email: string
    role: string
  }
}

export const adminDesignRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware now applied in app.ts

adminDesignRoutes.get('/', (c) => {
  const user = c.get('user')
  const db = c.env.DB
  const t = getTranslate(c)
  
  const program = Effect.gen(function* (_) {
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const pageData: DesignPageData = {
      user: user ? {
        name: user.email,
        email: user.email,
        role: user.role
      } : undefined,
      logoUrl: appearanceSettings.logoUrl
    }
    
    return pageData
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error rendering design page:', error)
        return Effect.succeed({
          user: user ? {
            name: user.email,
            email: user.email,
            role: user.role
          } : undefined
        } as DesignPageData)
      })
    )
  ).then(pageData => c.html(renderDesignPage(pageData, t)))
})