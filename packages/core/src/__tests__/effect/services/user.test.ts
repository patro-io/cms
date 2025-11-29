/**
 * UserService Tests - Effect TS Implementation
 * 
 * Testuje všechny metody UserService včetně happy paths a error stavů
 * Používá Closed Service Pattern s mocky
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect, Layer, Context } from 'effect'
import {
  UserService,
  UserServiceLive,
  User,
  CreateUserInput,
  UpdateUserInput,
  UserQueryOptions,
  UserNotFoundError,
  UserAlreadyExistsError,
  UserValidationError,
  UnauthorizedError
} from '../../../services/user-effect'
import { DatabaseService, DatabaseError } from '../../../services/database-effect'

/**
 * Mock Database Layer pro testování
 */
const makeDatabaseLayer = (mockDb: any) =>
  Layer.succeed(
    DatabaseService,
    DatabaseService.of({
      query: mockDb.query,
      queryFirst: mockDb.queryFirst,
      execute: mockDb.execute,
      insert: mockDb.insert,
      update: mockDb.update
    })
  )

/**
 * Helper pro vytvoření UserService Layer s mock database
 */
const makeUserServiceLayer = (mockDb: any) =>
  Layer.provide(UserServiceLive, makeDatabaseLayer(mockDb))

/**
 * Mock user data pro testy
 */
const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  phone: '+420123456789',
  bio: 'Test bio',
  avatar_url: 'https://example.com/avatar.jpg',
  password_hash: 'hashed_password_123',
  role: 'admin',
  is_active: 1,
  email_verified: 1,
  two_factor_enabled: 0,
  timezone: 'Europe/Prague',
  language: 'cs',
  theme: 'dark',
  email_notifications: 1,
  invitation_token: null,
  invited_by: null,
  invited_at: null,
  created_at: Date.now(),
  updated_at: Date.now(),
  last_login_at: Date.now()
}

describe('UserService - Effect Implementation', () => {
  let mockDb: any

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      queryFirst: vi.fn(),
      execute: vi.fn(),
      insert: vi.fn(),
      update: vi.fn()
    }
  })

  describe('getUserById', () => {
    it('vrátí uživatele podle ID', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockUser))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.getUserById('user-123')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toEqual(mockUser)
      expect(mockDb.queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = ?',
        ['user-123']
      )
    })

    it('vyhodí UserNotFoundError pokud uživatel neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.getUserById('non-existent')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure') {
        expect(exit.cause._tag).toBe('Fail')
        if (exit.cause._tag === 'Fail') {
          expect(exit.cause.error).toBeInstanceOf(UserNotFoundError)
        }
      }
    })
  })

  describe('getUserByEmail', () => {
    it('vrátí uživatele podle emailu (lowercase)', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockUser))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.getUserByEmail('Test@Example.COM')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toEqual(mockUser)
      expect(mockDb.queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = ?',
        ['test@example.com'] // Lowercase conversion
      )
    })

    it('vyhodí UserNotFoundError pokud email neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.getUserByEmail('unknown@example.com')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure') {
        expect(exit.cause._tag).toBe('Fail')
        if (exit.cause._tag === 'Fail') {
          expect(exit.cause.error).toBeInstanceOf(UserNotFoundError)
        }
      }
    })
  })

  describe('getUserByUsername', () => {
    it('vrátí uživatele podle username', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockUser))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.getUserByUsername('testuser')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toEqual(mockUser)
      expect(mockDb.queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE username = ?',
        ['testuser']
      )
    })

    it('vyhodí UserNotFoundError pokud username neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.getUserByUsername('unknown')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('queryUsers', () => {
    it('vrátí seznam uživatelů s výchozími parametry', async () => {
      const users = [mockUser]
      mockDb.query.mockReturnValue(Effect.succeed(users))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.queryUsers({})
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toEqual(users)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users'),
        expect.arrayContaining([20, 0]) // default limit, offset
      )
    })

    it('filtruje podle role', async () => {
      mockDb.query.mockReturnValue(Effect.succeed([mockUser]))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.queryUsers({ role: 'admin' })
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('role = ?'),
        expect.arrayContaining(['admin'])
      )
    })

    it('filtruje podle is_active', async () => {
      mockDb.query.mockReturnValue(Effect.succeed([mockUser]))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.queryUsers({ is_active: true })
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = ?'),
        expect.arrayContaining([1])
      )
    })

    it('vyhledává podle textu ve více polích', async () => {
      mockDb.query.mockReturnValue(Effect.succeed([mockUser]))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.queryUsers({ search: 'test' })
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('first_name LIKE ?'),
        expect.arrayContaining(['%test%', '%test%', '%test%', '%test%'])
      )
    })

    it('aplikuje limit a offset', async () => {
      mockDb.query.mockReturnValue(Effect.succeed([mockUser]))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.queryUsers({ limit: 10, offset: 5 })
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        expect.arrayContaining([10, 5])
      )
    })
  })

  describe('countUsers', () => {
    it('vrátí počet všech uživatelů', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ count: 42 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.countUsers({})
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toBe(42)
      expect(mockDb.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM users'),
        []
      )
    })

    it('vrátí 0 pokud žádní uživatelé neexistují', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.countUsers({})
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toBe(0)
    })

    it('filtruje podle stejných parametrů jako queryUsers', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ count: 5 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.countUsers({ role: 'admin', is_active: true })
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('role = ?'),
        expect.arrayContaining(['admin', 1])
      )
    })
  })

  describe('createUser', () => {
    it('vytvoří nového uživatele', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'newuser',
        first_name: 'New',
        last_name: 'User',
        password_hash: 'hashed123',
        role: 'viewer'
      }

      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(null)) // Check duplicate
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 })) // Insert
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser)) // Fetch created

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createUser(input)
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toEqual(mockUser)
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'new@example.com',
          'newuser',
          'New',
          'User'
        ])
      )
    })

    it('vyhodí UserAlreadyExistsError pokud email už existuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ id: 'existing-id' }))

      const input: CreateUserInput = {
        email: 'existing@example.com',
        password_hash: 'hashed123'
      }

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createUser(input)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(UserAlreadyExistsError)
      }
    })

    it('vyhodí UserValidationError pro nevalidní email', async () => {
      const input: CreateUserInput = {
        email: 'invalid-email',
        password_hash: 'hashed123'
      }

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createUser(input)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        const error = exit.cause.error
        expect(error).toBeInstanceOf(UserValidationError)
        if (error instanceof UserValidationError) {
          expect(error.errors).toContain('email')
        }
      }
    })

    it('konvertuje email na lowercase', async () => {
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(null))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser))

      const input: CreateUserInput = {
        email: 'NEW@EXAMPLE.COM',
        password_hash: 'hashed123'
      }

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createUser(input)
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String),
          'new@example.com' // Lowercase
        ])
      )
    })

    it('nastaví výchozí hodnoty pro nepovinná pole', async () => {
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(null))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser))

      const input: CreateUserInput = {
        email: 'minimal@example.com',
        password_hash: 'hashed123'
      }

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createUser(input)
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String), // id
          'minimal@example.com',
          null, // username
          null, // first_name
          null, // last_name
          null, // phone
          null, // bio
          'hashed123',
          'viewer', // default role
          1, // is_active default
          0, // email_verified default
          expect.any(Number), // created_at
          expect.any(Number) // updated_at
        ])
      )
    })
  })

  describe('updateUser', () => {
    it('aktualizuje existujícího uživatele', async () => {
      const input: UpdateUserInput = {
        first_name: 'Updated',
        last_name: 'Name',
        role: 'editor'
      }

      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser)) // Check exists
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 })) // Update
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed({ ...mockUser, ...input })) // Fetch updated

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updateUser('user-123', input)
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result.first_name).toBe('Updated')
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining(['Updated', 'Name', 'editor'])
      )
    })

    it('vyhodí UserNotFoundError pokud uživatel neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updateUser('non-existent', { first_name: 'Test' })
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(UserNotFoundError)
      }
    })

    it('vyhodí UserValidationError pro nevalidní email při update', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockUser))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updateUser('user-123', { email: 'invalid' })
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(UserValidationError)
      }
    })

    it('vyhodí UserAlreadyExistsError pokud email je zabraný jiným uživatelem', async () => {
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser)) // Check exists
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed({ id: 'other-user' })) // Duplicate check

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updateUser('user-123', { email: 'taken@example.com' })
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(UserAlreadyExistsError)
      }
    })

    it('aktualizuje pouze poskytnutá pole', async () => {
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updateUser('user-123', { theme: 'light' })
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE users SET theme = ?, updated_at = ? WHERE id = ?',
        ['light', expect.any(Number), 'user-123']
      )
    })
  })

  describe('deleteUser', () => {
    it('provede soft delete (deaktivace)', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ id: 'user-123' }))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.deleteUser('user-123', false)
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?',
        [expect.any(Number), 'user-123']
      )
    })

    it('provede hard delete (permanentní smazání)', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ id: 'user-123' }))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.deleteUser('user-123', true)
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        'DELETE FROM users WHERE id = ?',
        ['user-123']
      )
    })

    it('vyhodí UserNotFoundError pokud uživatel neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.deleteUser('non-existent')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('toggleUserStatus', () => {
    it('aktivuje neaktivního uživatele', async () => {
      const inactiveUser = { ...mockUser, is_active: 0 }
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(inactiveUser))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed({ ...inactiveUser, is_active: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.toggleUserStatus('user-123', true)
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result.is_active).toBe(1)
      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?',
        [1, expect.any(Number), 'user-123']
      )
    })

    it('deaktivuje aktivního uživatele', async () => {
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockUser))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed({ ...mockUser, is_active: 0 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.toggleUserStatus('user-123', false)
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?',
        [0, expect.any(Number), 'user-123']
      )
    })

    it('vyhodí UserNotFoundError pokud uživatel neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.toggleUserStatus('non-existent', true)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('updatePassword', () => {
    it('aktualizuje heslo a uloží staré do historie', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({
        id: 'user-123',
        password_hash: 'old_hash'
      }))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updatePassword('user-123', 'new_hash')
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      // Uložení do historie
      expect(mockDb.execute).toHaveBeenCalledWith(
        'INSERT INTO password_history (id, user_id, password_hash, created_at) VALUES (?, ?, ?, ?)',
        [expect.any(String), 'user-123', 'old_hash', expect.any(Number)]
      )

      // Aktualizace hesla
      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        ['new_hash', expect.any(Number), 'user-123']
      )
    })

    it('vyhodí UserNotFoundError pokud uživatel neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.updatePassword('non-existent', 'new_hash')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('createInvitation', () => {
    it('vytvoří pozvánku pro nového uživatele', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null)) // User doesn't exist
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createInvitation(
          'invited@example.com',
          'John',
          'Doe',
          'editor',
          'admin-123'
        )
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toHaveProperty('userId')
      expect(result).toHaveProperty('token')
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([
          expect.any(String), // userId
          'invited@example.com',
          'John',
          'Doe',
          'editor',
          expect.any(String), // token
          'admin-123'
        ])
      )
    })

    it('vyhodí UserAlreadyExistsError pokud email už existuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ id: 'existing-user' }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.createInvitation(
          'existing@example.com',
          'John',
          'Doe',
          'editor',
          'admin-123'
        )
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(UserAlreadyExistsError)
      }
    })
  })

  describe('resendInvitation', () => {
    it('obnoví invitation token', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({
        id: 'user-123',
        invitation_token: 'old-token'
      }))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.resendInvitation('user-123')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(typeof result).toBe('string')
      expect(result).not.toBe('old-token')
      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE users SET invitation_token = ?, invited_at = ?, updated_at = ? WHERE id = ?',
        [expect.any(String), expect.any(Number), expect.any(Number), 'user-123']
      )
    })

    it('vyhodí UserNotFoundError pokud pozvánka neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.resendInvitation('non-existent')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('cancelInvitation', () => {
    it('zruší pozvánku a smaže neaktivovaného uživatele', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed({ id: 'user-123' }))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true, changes: 1 }))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.cancelInvitation('user-123')
      })

      await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(mockDb.execute).toHaveBeenCalledWith(
        'DELETE FROM users WHERE id = ?',
        ['user-123']
      )
    })

    it('vyhodí UserNotFoundError pokud pozvánka neexistuje', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.cancelInvitation('non-existent')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('canDeleteUser', () => {
    it('povolí smazání jiného uživatele', async () => {
      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.canDeleteUser('user-123', 'admin-456')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toBe(true)
    })

    it('zakáže self-deletion (smazání sebe sama)', async () => {
      const program = Effect.gen(function* () {
        const service = yield* UserService
        return yield* service.canDeleteUser('user-123', 'user-123')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeUserServiceLayer(mockDb)))
      )

      expect(result).toBe(false)
    })
  })
})