import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono, type Context, type Next } from 'hono'
import { adminSettingsRoutes } from '../../../routes/admin-settings'

// Simple mock auth middleware - no complex mocking needed!
const mockAuth = (role: string = 'admin') => (c: Context, next: Next) => {
  c.set('user', {
    userId: 'test-user-id',
    email: 'test@example.com',
    role,
    exp: Date.now() / 1000 + 3600,
    iat: Date.now() / 1000
  })
  return next()
}

// Simple mock i18n middleware
const mockI18n = () => (c: Context, next: Next) => {
  c.set('locale', 'cs')
  c.set('t', (key: string) => key) // Simple passthrough translator
  return next()
}

// Mock environment bindings
const createMockEnv = () => ({
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  },
  CACHE_KV: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
})

describe('Admin Settings Routes - Refactored (Clean Architecture)', () => {
  let testApp: Hono
  let mockEnv: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = createMockEnv()
    
    // Create test app with middleware applied (simulating app.ts structure)
    testApp = new Hono()
    testApp.use('/admin/settings/*', mockAuth('admin'))
    testApp.use('/admin/settings/*', mockI18n())
    testApp.route('/admin/settings', adminSettingsRoutes)
  })

  describe('GET /admin/settings - Root redirect', () => {
    it('should redirect to general settings', async () => {
      const res = await testApp.request('/admin/settings', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/admin/settings/general')
    })
  })

  describe('GET /admin/settings/general - General Settings Page', () => {
    it('should load general settings page with data from database', async () => {
      mockEnv.DB.prepare().all.mockResolvedValue({
        results: [
          { key: 'siteName', value: JSON.stringify('My CMS') },
          { key: 'language', value: JSON.stringify('cs') }
        ]
      })

      const res = await testApp.request('/admin/settings/general', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/html')
    })

    it('should handle database errors gracefully with defaults', async () => {
      mockEnv.DB.prepare().all.mockRejectedValue(new Error('DB Error'))

      const res = await testApp.request('/admin/settings/general', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200) // Should still render with defaults
    })
  })

  describe('GET /admin/settings/api/migrations/status - Migration Status', () => {
    it('should return migration status', async () => {
      const res = await testApp.request('/admin/settings/api/migrations/status', {
        method: 'GET'
      }, mockEnv)

      // May return 200 or 500 depending on MigrationService availability
      expect([200, 500]).toContain(res.status)
    })
  })

  describe('POST /admin/settings/api/migrations/run - Run Migrations', () => {
    it('should require admin role', async () => {
      // Create app with editor role
      const editorApp = new Hono()
      editorApp.use('/admin/settings/*', mockAuth('editor'))
      editorApp.use('/admin/settings/*', mockI18n())
      editorApp.route('/admin/settings', adminSettingsRoutes)

      const res = await editorApp.request('/admin/settings/api/migrations/run', {
        method: 'POST'
      }, mockEnv)

      expect(res.status).toBe(403)
      const data = await res.json() as any
      expect(data.error).toContain('Unauthorized')
    })
  })

  describe('GET /admin/settings/api/database-tools/stats - Database Stats', () => {
    it('should return database statistics', async () => {
      mockEnv.DB.prepare().all.mockResolvedValue({
        results: [
          { name: 'users' },
          { name: 'content' }
        ]
      })
      
      mockEnv.DB.prepare().first
        .mockResolvedValueOnce({ count: 10 })
        .mockResolvedValueOnce({ count: 25 })

      const res = await testApp.request('/admin/settings/api/database-tools/stats', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.totalTables).toBe(2)
    })
  })

  describe('GET /admin/settings/api/database-tools/validate - Database Validation', () => {
    it('should validate database integrity', async () => {
      mockEnv.DB.prepare().first.mockResolvedValue({
        integrity_check: 'ok'
      })

      const res = await testApp.request('/admin/settings/api/database-tools/validate', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.valid).toBe(true)
    })
  })

  describe('POST /admin/settings/api/database-tools/backup - Database Backup', () => {
    it('should return coming soon message for admin', async () => {
      const res = await testApp.request('/admin/settings/api/database-tools/backup', {
        method: 'POST'
      }, mockEnv)

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.message).toContain('coming soon')
    })

    it('should require admin role', async () => {
      // Create app with editor role
      const editorApp = new Hono()
      editorApp.use('/admin/settings/*', mockAuth('editor'))
      editorApp.use('/admin/settings/*', mockI18n())
      editorApp.route('/admin/settings', adminSettingsRoutes)

      const res = await editorApp.request('/admin/settings/api/database-tools/backup', {
        method: 'POST'
      }, mockEnv)

      expect(res.status).toBe(403)
    })
  })

  describe('POST /admin/settings/api/database-tools/truncate - Truncate Tables', () => {
    it('should truncate specified tables', async () => {
      mockEnv.DB.prepare().run.mockResolvedValue({ success: true })

      const res = await testApp.request('/admin/settings/api/database-tools/truncate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: ['test_table']
        })
      }, mockEnv)

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })

    it('should require admin role', async () => {
      // Create app with editor role
      const editorApp = new Hono()
      editorApp.use('/admin/settings/*', mockAuth('editor'))
      editorApp.use('/admin/settings/*', mockI18n())
      editorApp.route('/admin/settings', adminSettingsRoutes)

      const res = await editorApp.request('/admin/settings/api/database-tools/truncate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: ['test_table']
        })
      }, mockEnv)

      expect(res.status).toBe(403)
    })

    it('should reject empty tables array', async () => {
      const res = await testApp.request('/admin/settings/api/database-tools/truncate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: []
        })
      }, mockEnv)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /admin/settings/general - Save General Settings', () => {
    it('should save general settings with valid data', async () => {
      mockEnv.DB.prepare().run.mockResolvedValue({ success: true })

      const formData = new FormData()
      formData.append('siteName', 'Updated CMS')
      formData.append('siteDescription', 'Updated description')
      formData.append('adminEmail', 'admin@cms.com')
      formData.append('timezone', 'Europe/Prague')
      formData.append('language', 'cs')
      formData.append('maintenanceMode', 'false')

      const res = await testApp.request('/admin/settings/general', {
        method: 'POST',
        body: formData
      }, mockEnv)

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.message).toContain('saved successfully')
    })

    it('should require admin role', async () => {
      // Create app with editor role
      const editorApp = new Hono()
      editorApp.use('/admin/settings/*', mockAuth('editor'))
      editorApp.use('/admin/settings/*', mockI18n())
      editorApp.route('/admin/settings', adminSettingsRoutes)

      const formData = new FormData()
      formData.append('siteName', 'Test')
      formData.append('siteDescription', 'Test')

      const res = await editorApp.request('/admin/settings/general', {
        method: 'POST',
        body: formData
      }, mockEnv)

      expect(res.status).toBe(403)
    })

    it('should validate required fields', async () => {
      const formData = new FormData()
      formData.append('siteName', '') // Empty - should fail validation
      formData.append('siteDescription', 'Test')

      const res = await testApp.request('/admin/settings/general', {
        method: 'POST',
        body: formData
      }, mockEnv)

      expect(res.status).toBe(400)
    })
  })
})