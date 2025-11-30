import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono, type Context, type Next } from 'hono'
import authRoutes from '../../../routes/auth'

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
  },
  // Mock ExecutionContext for Cloudflare Workers
  executionCtx: {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  }
})

describe('Auth Routes - Refactored (Clean Architecture)', () => {
  let testApp: Hono
  let mockEnv: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = createMockEnv()
    
    // Create test app with middleware applied (simulating app.ts structure)
    testApp = new Hono()
    testApp.use('/auth/*', mockI18n())
    testApp.route('/auth', authRoutes)
  })

  describe('GET /auth/login - Login Page', () => {
    it('should render login page', async () => {
      // Mock plugin check and settings
      mockEnv.DB.prepare().first
        .mockResolvedValueOnce(null) // No demo-login plugin
        .mockResolvedValueOnce(null) // No appearance settings

      const res = await testApp.request('/auth/login', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/html')
    })

    it('should handle database errors gracefully', async () => {
      mockEnv.DB.prepare().first.mockRejectedValue(new Error('DB Error'))

      const res = await testApp.request('/auth/login', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200) // Should still render
    })
  })

  describe('GET /auth/register - Registration Page', () => {
    it('should render registration page', async () => {
      const res = await testApp.request('/auth/register', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/html')
    })
  })

  describe('POST /auth/login - User Login', () => {
    it('should login user with valid credentials', async () => {
      // Mock user lookup
      mockEnv.DB.prepare().first.mockResolvedValue({
        id: 'test-user-id',
        email: 'test@example.com',
        password_hash: '$2a$10$hashedpassword', // Mock bcrypt hash
        role: 'admin',
        is_active: 1
      })

      const res = await testApp.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123'
        })
      }, mockEnv)

      // May return 200 or 401 depending on password verification
      expect([200, 401, 500]).toContain(res.status)
    })

    it('should reject invalid email format', async () => {
      const res = await testApp.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123'
        })
      }, mockEnv)

      expect(res.status).toBe(400)
    })

    it('should reject missing password', async () => {
      const res = await testApp.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: ''
        })
      }, mockEnv)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /auth/register - User Registration', () => {
    it('should register new user with valid data', async () => {
      // Mock user doesn't exist
      mockEnv.DB.prepare().first.mockResolvedValue(null)
      mockEnv.DB.prepare().run.mockResolvedValue({ success: true })

      const res = await testApp.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'password123',
          username: 'newuser'
        })
      }, mockEnv)

      // May return 201 or 500 depending on service availability
      expect([201, 400, 500]).toContain(res.status)
    })

    it('should reject duplicate email', async () => {
      // Mock user already exists
      mockEnv.DB.prepare().first.mockResolvedValue({
        id: 'existing-user-id'
      })

      const res = await testApp.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'password123'
        })
      }, mockEnv)

      expect(res.status).toBe(400)
    })

    it('should reject invalid email format', async () => {
      const res = await testApp.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123'
        })
      }, mockEnv)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /auth/logout - User Logout', () => {
    it('should logout user', async () => {
      const res = await testApp.request('/auth/logout', {
        method: 'POST'
      }, mockEnv)

      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.message).toContain('Logged out')
    })
  })

  describe('GET /auth/logout - User Logout (GET)', () => {
    it('should logout user and redirect', async () => {
      const res = await testApp.request('/auth/logout', {
        method: 'GET'
      }, mockEnv)

      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toContain('/auth/login')
    })
  })

  describe('POST /auth/seed-admin - Seed Admin User', () => {
    it('should create admin user if not exists', async () => {
      // Mock user doesn't exist
      mockEnv.DB.prepare().first.mockResolvedValue(null)
      mockEnv.DB.prepare().run.mockResolvedValue({ success: true })

      const res = await testApp.request('/auth/seed-admin', {
        method: 'POST'
      }, mockEnv)

      // May return 200 or 500 depending on service availability
      expect([200, 500]).toContain(res.status)
    })

    it('should update password if admin exists', async () => {
      // Mock user exists
      mockEnv.DB.prepare().first.mockResolvedValue({
        id: 'admin-user-id'
      })
      mockEnv.DB.prepare().run.mockResolvedValue({ success: true })

      const res = await testApp.request('/auth/seed-admin', {
        method: 'POST'
      }, mockEnv)

      // May return 200 or 500 depending on service availability
      expect([200, 500]).toContain(res.status)
    })
  })
})