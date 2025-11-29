import { Hono } from 'hono'
// Import from templates package is not working due to tsconfig rootDir restriction
// Using stub implementation instead
type DesignPageData = {
  user?: {
    name: string
    email: string
    role: string
  }
  version?: string
}

function renderDesignPage(data: DesignPageData): string {
  return `
    <html>
      <body>
        <h1>Design System</h1>
        <p>Design system page for ${data.user?.email || 'unknown user'}</p>
      </body>
    </html>
  `
}

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
  appVersion?: string
}

export const designRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

designRoutes.get('/', (c) => {
  const user = c.get('user')

  const pageData: DesignPageData = {
    user: user ? {
      name: user.email,
      email: user.email,
      role: user.role
    } : undefined,
    version: c.get('appVersion')
  }

  return c.html(renderDesignPage(pageData))
})
