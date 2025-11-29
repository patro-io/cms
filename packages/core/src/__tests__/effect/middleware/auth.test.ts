import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context } from 'hono'
import * as HonoCookie from 'hono/cookie'
import { requireAuth, requireRole, optionalAuth } from '../../../middleware/auth'
import { Effect, Layer, Option } from 'effect'

// Mock dependencies
const mockAuthService = {
  verifyToken: vi.fn()
}

const mockCacheService = {
  get: vi.fn(),
  set: vi.fn()
}

const mockLoggerService = {
  warn: vi.fn().mockReturnValue(Effect.succeed(undefined)),
  info: vi.fn().mockReturnValue(Effect.succeed(undefined)),
  error: vi.fn().mockReturnValue(Effect.succeed(undefined))
}

// Mock makeAuthServiceLayer
vi.mock('../../../services/auth-effect', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../services/auth-effect')>()
  return {
    ...mod,
    makeAuthServiceLayer: () => Layer.succeed(mod.AuthService, {
        generateToken: vi.fn(),
        verifyToken: (token: string) => mockAuthService.verifyToken(token),
        hashPassword: vi.fn(),
        verifyPassword: vi.fn()
    })
  }
})

// Mock makeCacheServiceLayer
vi.mock('../../../services/cache', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../../services/cache')>()
    return {
        ...mod,
        makeCacheServiceLayer: () => Layer.succeed(mod.CacheService, {
            get: (key: string) => mockCacheService.get(key),
            set: (key: string, value: any) => mockCacheService.set(key, value),
            delete: vi.fn(),
            clear: vi.fn(),
            invalidate: vi.fn(),
            getOrSet: vi.fn(),
            getWithSource: vi.fn(),
            generateKey: vi.fn()
        })
    }
})

// Mock Logger
vi.mock('../../../services/logger', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../../../services/logger')>()
    return {
        ...mod,
        makeLoggerServiceLayer: () => Layer.succeed(mod.LoggerService, {
            warn: (...args: any[]) => mockLoggerService.warn(...args),
            info: (...args: any[]) => mockLoggerService.info(...args),
            error: (...args: any[]) => mockLoggerService.error(...args),
            debug: vi.fn(),
            fatal: vi.fn(),
            logRequest: vi.fn(),
            logAuth: vi.fn(),
            logSecurity: vi.fn(),
            getLogs: vi.fn(),
            updateConfig: vi.fn(),
            getAllConfigs: vi.fn(),
            cleanupByRetention: vi.fn(),
            setEnabled: vi.fn(),
            isEnabled: vi.fn()
        })
    }
})

// Mock Hono Cookie
vi.mock('hono/cookie', () => ({
    getCookie: vi.fn(),
    setCookie: vi.fn()
}))


describe('Auth Middleware', () => {
  let c: any
  let next: any

  beforeEach(() => {
    vi.clearAllMocks()
    c = {
      req: {
        header: vi.fn(),
        url: 'http://localhost',
        method: 'GET'
      },
      env: {
          DB: {} // Mock DB
      },
      set: vi.fn(),
      get: vi.fn(),
      json: vi.fn((data, status) => ({ data, status })),
      redirect: vi.fn((url) => ({ redirect: url }))
    }
    next = vi.fn().mockResolvedValue(undefined)
  })

  describe('requireAuth', () => {
    it('should return 401 if no token provided', async () => {
      c.req.header.mockReturnValue(null)
      vi.mocked(HonoCookie.getCookie).mockReturnValue(undefined)
      
      const middleware = requireAuth()
      await middleware(c, next)

      expect(c.json).toHaveBeenCalledWith({ error: 'Authentication required' }, 401)
      expect(next).not.toHaveBeenCalled()
    })

    it('should verify token and call next if valid', async () => {
      c.req.header.mockReturnValue('Bearer valid-token')
      mockCacheService.get.mockReturnValue(Effect.succeed(Option.none()))
      mockAuthService.verifyToken.mockReturnValue(Effect.succeed({ userId: '123', role: 'admin' }))
      mockCacheService.set.mockReturnValue(Effect.succeed(undefined))

      const middleware = requireAuth()
      await middleware(c, next)

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith('valid-token')
      expect(c.set).toHaveBeenCalledWith('user', { userId: '123', role: 'admin' })
      expect(next).toHaveBeenCalled()
    })

    it('should use cached token if available', async () => {
        c.req.header.mockReturnValue('Bearer cached-token')
        mockCacheService.get.mockReturnValue(Effect.succeed(Option.some({ userId: 'cached', role: 'user' })))
  
        const middleware = requireAuth()
        await middleware(c, next)
  
        expect(mockAuthService.verifyToken).not.toHaveBeenCalled()
        expect(c.set).toHaveBeenCalledWith('user', { userId: 'cached', role: 'user' })
        expect(next).toHaveBeenCalled()
      })

    it('should return 401 if token is invalid', async () => {
      c.req.header.mockReturnValue('Bearer invalid-token')
      mockCacheService.get.mockReturnValue(Effect.succeed(Option.none()))
      mockAuthService.verifyToken.mockReturnValue(Effect.fail(new Error('Invalid token')))

      const middleware = requireAuth()
      await middleware(c, next)

      // Updated expectation based on actual implementation behavior
      expect(c.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' }, 401)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('requireRole', () => {
      it('should allow access if user has required role', async () => {
          c.get.mockReturnValue({ userId: '1', role: 'admin' })
          
          const middleware = requireRole('admin')
          await middleware(c, next)
          
          expect(next).toHaveBeenCalled()
      })

      it('should deny access if user does not have required role', async () => {
        c.get.mockReturnValue({ userId: '1', role: 'editor' })
        
        const middleware = requireRole('admin')
        await middleware(c, next)
        
        expect(c.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' }, 403)
        expect(next).not.toHaveBeenCalled()
    })
  })
})