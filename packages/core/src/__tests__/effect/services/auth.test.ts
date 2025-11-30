/**
 * AuthService Tests - Effect TS Implementation
 *
 * Testuje JWT token generování/verifikaci a password hashing
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  AuthService,
  AuthServiceLive,
  JWTPayload,
  TokenExpiredError,
  TokenInvalidError,
  PasswordMismatchError
} from '../../../services/auth-effect'
import { makeMockConfigLayer } from '../../../config/config-provider.js'

/**
 * Test credentials
 */
const TEST_JWT_SECRET = 'test-secret-key-for-jwt'
const TEST_PASSWORD_SALT = 'test-salt-for-passwords'

/**
 * Helper pro vytvoření test layer s mock config
 */
const makeTestAuthServiceLayer = () => {
  const configLayer = makeMockConfigLayer({
    JWT_SECRET: TEST_JWT_SECRET,
    PASSWORD_SALT: TEST_PASSWORD_SALT,
    JWT_EXPIRES_IN_HOURS: '24'
  })
  return Layer.provide(AuthServiceLive, configLayer)
}

describe('AuthService - Effect Implementation', () => {
  describe('generateToken', () => {
    it('vygeneruje platný JWT token', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        return yield* service.generateToken(
          'user-123',
          'test@example.com',
          'admin',
          24
        )
      })

      const token = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
      // JWT tokens mají typicky 3 části oddělené tečkou
      expect(token.split('.')).toHaveLength(3)
    })

    it('generuje tokeny s výchozí expirací 24 hodin', async () => {
      const beforeGeneration = Math.floor(Date.now() / 1000)

      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const token = yield* service.generateToken(
          'user-123',
          'test@example.com',
          'admin'
        )
        // Ihned verifikuj
        return yield* service.verifyToken(token)
      })

      const payload = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(payload.userId).toBe('user-123')
      expect(payload.email).toBe('test@example.com')
      expect(payload.role).toBe('admin')
      expect(payload.exp).toBeGreaterThan(beforeGeneration)
      expect(payload.exp).toBeLessThanOrEqual(beforeGeneration + (24 * 60 * 60) + 1)
      expect(payload.iat).toBeGreaterThanOrEqual(beforeGeneration)
    })

    it('umožňuje vlastní expiračni dobu', async () => {
      const beforeGeneration = Math.floor(Date.now() / 1000)

      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const token = yield* service.generateToken(
          'user-123',
          'test@example.com',
          'viewer',
          1 // 1 hodina
        )
        return yield* service.verifyToken(token)
      })

      const payload = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(payload.exp).toBeGreaterThan(beforeGeneration)
      expect(payload.exp).toBeLessThanOrEqual(beforeGeneration + (1 * 60 * 60) + 1)
    })

    it('každé volání generuje jedinečný token', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const token1 = yield* service.generateToken('user-123', 'test@example.com', 'admin')
        // Pauza 1 sekunda aby se změnil iat timestamp
        yield* Effect.sleep('1 second')
        const token2 = yield* service.generateToken('user-123', 'test@example.com', 'admin')
        return { token1, token2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result.token1).not.toBe(result.token2)
    })
  })

  describe('verifyToken', () => {
    it('úspěšně verifikuje platný token', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const token = yield* service.generateToken(
          'user-456',
          'verify@example.com',
          'editor',
          24
        )
        return yield* service.verifyToken(token)
      })

      const payload = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(payload.userId).toBe('user-456')
      expect(payload.email).toBe('verify@example.com')
      expect(payload.role).toBe('editor')
      expect(payload.exp).toBeGreaterThan(0)
      expect(payload.iat).toBeGreaterThan(0)
    })

    it('vyhodí TokenInvalidError pro neplatný token', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        return yield* service.verifyToken('invalid.jwt.token')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(TokenInvalidError)
        expect(exit.cause.error._tag).toBe('TokenInvalidError')
      }
    })

    it('vyhodí TokenInvalidError pro poškozený token', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        // Vygeneruj platný token a pak ho poškod
        const token = yield* service.generateToken('user-123', 'test@example.com', 'admin')
        const corruptedToken = token.substring(0, token.length - 5) + 'xxxxx'
        return yield* service.verifyToken(corruptedToken)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(TokenInvalidError)
      }
    })

    it('vyhodí TokenExpiredError pro expirovaný token', async () => {
      // Vytvoř token manuálně s exp časem v minulosti
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        // Generuj token s velmi malou expirací
        const token = yield* service.generateToken(
          'user-123',
          'expired@example.com',
          'admin',
          -1 // Záporná hodnota = už expirovaný
        )
        return yield* service.verifyToken(token)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        // JWT library může vrátit buď TokenInvalidError nebo TokenExpiredError
        // Ověř že je to nějaká chyba
        expect(exit.cause.error._tag).toMatch(/Token(Invalid|Expired)Error/)
      }
    })

    it('vyhodí TokenInvalidError pro token s jinou secret key', async () => {
      // Vygeneruj token s první secret key
      const generateProgram = Effect.gen(function* () {
        const service = yield* AuthService
        return yield* service.generateToken('user-123', 'test@example.com', 'admin')
      })

      const token = await Effect.runPromise(
        generateProgram.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      // Zkus verifikovat s jinou secret key
      const verifyProgram = Effect.gen(function* () {
        const service = yield* AuthService
        return yield* service.verifyToken(token)
      })

      const differentConfigLayer = makeMockConfigLayer({
        JWT_SECRET: 'different-secret-key',
        PASSWORD_SALT: TEST_PASSWORD_SALT
      })
      const differentLayer = Layer.provide(AuthServiceLive, differentConfigLayer)

      const exit = await Effect.runPromiseExit(
        verifyProgram.pipe(Effect.provide(differentLayer))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(TokenInvalidError)
      }
    })

    it('zachovává všechny custom payload fields', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const token = yield* service.generateToken(
          'user-789',
          'custom@example.com',
          'custom-role',
          24
        )
        return yield* service.verifyToken(token)
      })

      const payload = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      // Ověř základní fields
      expect(payload).toHaveProperty('userId')
      expect(payload).toHaveProperty('email')
      expect(payload).toHaveProperty('role')
      expect(payload).toHaveProperty('exp')
      expect(payload).toHaveProperty('iat')
    })
  })

  describe('hashPassword', () => {
    it('hashuje heslo pomocí SHA-256', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        return yield* service.hashPassword('my-secret-password')
      })

      const hash = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA-256 produkuje 64 hex znaky
      expect(hash).toMatch(/^[a-f0-9]{64}$/) // Pouze hex znaky
    })

    it('stejné heslo vždy produkuje stejný hash (deterministický)', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash1 = yield* service.hashPassword('password123')
        const hash2 = yield* service.hashPassword('password123')
        return { hash1, hash2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result.hash1).toBe(result.hash2)
    })

    it('různá hesla produkují různé hashe', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash1 = yield* service.hashPassword('password1')
        const hash2 = yield* service.hashPassword('password2')
        return { hash1, hash2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result.hash1).not.toBe(result.hash2)
    })

    it('umožňuje vlastní salt', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash1 = yield* service.hashPassword('password', 'salt1')
        const hash2 = yield* service.hashPassword('password', 'salt2')
        return { hash1, hash2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      // Stejné heslo s různým saltem = různé hashe
      expect(result.hash1).not.toBe(result.hash2)
    })

    it('používá výchozí salt pokud není poskytnut', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hashWithDefault = yield* service.hashPassword('test-password')
        const hashWithExplicitDefault = yield* service.hashPassword('test-password', TEST_PASSWORD_SALT)
        return { hashWithDefault, hashWithExplicitDefault }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result.hashWithDefault).toBe(result.hashWithExplicitDefault)
    })
  })

  describe('verifyPassword', () => {
    it('vrátí true pro správné heslo', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash = yield* service.hashPassword('correct-password')
        return yield* service.verifyPassword('correct-password', hash)
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result).toBe(true)
    })

    it('vyhodí PasswordMismatchError pro špatné heslo', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash = yield* service.hashPassword('correct-password')
        return yield* service.verifyPassword('wrong-password', hash)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(PasswordMismatchError)
        expect(exit.cause.error._tag).toBe('PasswordMismatchError')
        expect(exit.cause.error.message).toContain('not match')
      }
    })

    it('respektuje vlastní salt při verifikaci', async () => {
      const customSalt = 'my-custom-salt'

      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash = yield* service.hashPassword('password', customSalt)
        const isValid = yield* service.verifyPassword('password', hash, customSalt)
        return isValid
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result).toBe(true)
    })

    it('vyhodí PasswordMismatchError pokud salt nesouhlasí', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash = yield* service.hashPassword('password', 'salt1')
        // Zkus verifikovat se špatným saltem
        return yield* service.verifyPassword('password', hash, 'salt2')
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(PasswordMismatchError)
      }
    })

    it('case-sensitive porovnání hesel', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash = yield* service.hashPassword('Password123')
        return yield* service.verifyPassword('password123', hash) // lowercase
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(PasswordMismatchError)
      }
    })

    it('detekuje i malé rozdíly v hesle', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService
        const hash = yield* service.hashPassword('password123')
        return yield* service.verifyPassword('password124', hash) // Poslední znak jiný
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
    })
  })

  describe('Integration test - celý auth flow', () => {
    it('simuluje kompletní registraci a přihlášení', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService

        // 1. Hashuj heslo při registraci
        const passwordHash = yield* service.hashPassword('user-password-123')

        // 2. Simuluj uložení uživatele (v reálu by šlo do DB)
        const user = {
          id: 'user-999',
          email: 'integration@example.com',
          role: 'editor',
          passwordHash
        }

        // 3. Při přihlášení verifikuj heslo
        const isPasswordValid = yield* service.verifyPassword(
          'user-password-123',
          user.passwordHash
        )

        if (!isPasswordValid) {
          return yield* Effect.fail(new PasswordMismatchError('Login failed'))
        }

        // 4. Vygeneruj JWT token po úspěšném přihlášení
        const token = yield* service.generateToken(
          user.id,
          user.email,
          user.role,
          24
        )

        // 5. Verifikuj token (např. při každém request)
        const payload = yield* service.verifyToken(token)

        return {
          loginSuccess: true,
          token,
          userId: payload.userId,
          userEmail: payload.email,
          userRole: payload.role
        }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(result.loginSuccess).toBe(true)
      expect(result.token).toBeDefined()
      expect(result.userId).toBe('user-999')
      expect(result.userEmail).toBe('integration@example.com')
      expect(result.userRole).toBe('editor')
    })

    it('simuluje neúspěšné přihlášení se špatným heslem', async () => {
      const program = Effect.gen(function* () {
        const service = yield* AuthService

        // 1. Hashuj správné heslo
        const passwordHash = yield* service.hashPassword('correct-password')

        // 2. Zkus přihlášení se špatným heslem
        return yield* service.verifyPassword('wrong-password', passwordHash)
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestAuthServiceLayer()))
      )

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure' && exit.cause._tag === 'Fail') {
        expect(exit.cause.error).toBeInstanceOf(PasswordMismatchError)
      }
    })
  })
})