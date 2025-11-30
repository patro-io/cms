import { Effect, Layer } from 'effect'
import { Context } from 'hono'
import { vi, type Mock } from 'vitest'
import { AuthService, type AuthServiceInterface, type JWTPayload } from '../../services/auth-effect'
import { DatabaseService } from '../../services/database-effect'

export const mockAuthMiddleware = (user?: JWTPayload) => {
  return async (c: Context, next: () => Promise<void>) => {
    c.set('user', user ?? {
      userId: 'test-user',
      email: 'test@example.com',
      role: 'admin',
      exp: Date.now() / 1000 + 3600,
      iat: Date.now() / 1000
    })
    await next()
  }
}

const runMock = vi.fn()
const prepareMock = vi.fn(() => ({ run: runMock, bind: () => ({ run: runMock }) })) // Add bind mock

export type MockedDb = {
  query: Mock,
  queryFirst: Mock,
  execute: Mock,
  insert: Mock,
  update: Mock,
  prepare: Mock,
}

export const mockDatabaseService: MockedDb = {
  query: vi.fn(),
  queryFirst: vi.fn(),
  execute: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  prepare: prepareMock,
}

export const mockAuthService: AuthServiceInterface = {
    generateToken: (userId: string, email: string, role: string) => Effect.succeed(`mock-token-${userId}-${email}-${role}`),
    verifyToken: (token: string) => Effect.succeed({
        userId: 'test-user',
        email: 'test@example.com',
        role: 'admin',
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000
    }),
    hashPassword: (password: string) => Effect.succeed(`hashed-${password}`),
    verifyPassword: (password: string, hash: string) => Effect.succeed(hash === `hashed-${password}`),
}

export function setupTestMocks() {
  vi.clearAllMocks()

  const authLayer = Layer.succeed(AuthService, mockAuthService)
  const dbLayer = Layer.succeed(DatabaseService, mockDatabaseService as any)
  
  // Default return values
  mockDatabaseService.query.mockReturnValue(Effect.succeed([]))
  mockDatabaseService.queryFirst.mockReturnValue(Effect.succeed(null))
  mockDatabaseService.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
  runMock.mockResolvedValue({ success: true })

  return {
    authLayer,
    dbLayer,
    mocks: {
      auth: mockAuthService,
      db: mockDatabaseService
    }
  }
}