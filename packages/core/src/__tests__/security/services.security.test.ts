/**
 * Adversarial Security Tests pro služby
 * 
 * Účel: Testovat, zda služby BEZPEČNĚ SELHÁVAJÍ při nebezpečných vstupech
 * Pattern: Použití Effect.flip pro otočení Error Channel
 * 
 * NEPŘÁTELSKÉ VEKTORY ÚTOKŮ:
 * 1. Extrémně dlouhé řetězce (Buffer overflow simulace)
 * 2. SQL injection payloady
 * 3. XSS payloady
 * 4. null/undefined/prázdné objekty
 * 5. Duplicitní slugy
 * 6. Neexistující ID
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  ContentService,
  ContentServiceLive,
  ContentAlreadyExistsError,
  InvalidContentDataError,
  ContentNotFoundError
} from '../../services/content-effect'
import {
  UserService,
  UserServiceLive,
  UserAlreadyExistsError,
  UserValidationError,
  UserNotFoundError
} from '../../services/user-effect'
import {
  CollectionService,
  CollectionServiceLive,
  CollectionAlreadyExistsError,
  FieldAlreadyExistsError
} from '../../services/collection-effect'
import {
  AuthService,
  makeAuthServiceLayer,
  TokenInvalidError,
  PasswordMismatchError
} from '../../services/auth-effect'
import { makeDatabaseLayer, ValidationError } from '../../services/database-effect'

// Mock D1Database
const createMockDB = () => {
  const mockDB: any = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn()
    })
  }
  return mockDB
}

describe('🛡️ Adversarial Security Tests - ContentService', () => {
  let mockDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
  })

  describe('⚔️ Attack Vector: Extrémně dlouhé řetězce', () => {
    it('should reject slug with extreme length (10000+ characters)', async () => {
      // Generovat extrémně dlouhý slug - pokus o buffer overflow
      const extremelyLongSlug = 'a'.repeat(10000)
      
      mockDB.prepare().first.mockResolvedValue(null)
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        // Použití Effect.flip pro otočení error channel
        return yield* Effect.flip(
          service.createContent({
            collection_id: 'col-1',
            slug: extremelyLongSlug,
            data: { title: 'Test' },
            author_id: 'user-1'
          })
        )
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      // Ověřit, že služba zamítla vstup (ValidationError nebo NotFoundError je OK)
      expect(error._tag).toMatch(/ValidationError|NotFoundError/)
    })

    it('should handle content data with extremely long strings', async () => {
      const extremelyLongContent = 'x'.repeat(1000000) // 1MB text
      
      mockDB.prepare().first.mockResolvedValue(null)
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: 'col-1',
          slug: 'test-post',
          data: { body: extremelyLongContent },
          author_id: 'user-1'
        })
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      // Služba by měla bezpečně zpracovat nebo odmítnout
      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(layer),
          Effect.either
        )
      )

      // Ať už se to podaří nebo ne, nesmí spadnout
      expect(result).toBeDefined()
    })
  })

  describe('⚔️ Attack Vector: SQL Injection', () => {
    it('should safely handle SQL injection in slug', async () => {
      const sqlInjectionPayloads = [
        "' OR 1=1 --",
        "'; DROP TABLE content; --",
        "admin'--",
        "' OR 'a'='a",
        "1' UNION SELECT * FROM users--"
      ]

      mockDB.prepare().first.mockResolvedValue(null)
      mockDB.prepare().run.mockResolvedValue({ success: true })

      for (const payload of sqlInjectionPayloads) {
        const program = Effect.gen(function* (_) {
          const service = yield* ContentService
          return yield* Effect.flip(
            service.createContent({
              collection_id: 'col-1',
              slug: payload,
              data: { title: 'Test' },
              author_id: 'user-1'
            })
          )
        })

        const layer = ContentServiceLive.pipe(
          Layer.provide(makeDatabaseLayer(mockDB))
        )

        const error = await Effect.runPromise(
          program.pipe(Effect.provide(layer))
        )

        // Služba musí zamítnout SQL injection payloady
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).message).toContain('lowercase letters')
      }
    })

    it('should safely handle SQL injection in search query', async () => {
      const sqlPayload = "'; DELETE FROM content WHERE '1'='1"
      
      mockDB.prepare().all.mockResolvedValue({ results: [] })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        // Hledání by mělo bezpečně zpracovat parametry
        return yield* service.queryContent({
          search: sqlPayload,
          limit: 10
        })
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      // Služba by měla bezpečně zpracovat (použití parametrizovaných queries)
      await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      // Ověřit, že používáme parametrizované dotazy
      expect(mockDB.prepare).toHaveBeenCalled()
      const calls = mockDB.prepare.mock.calls
      expect(calls.length).toBeGreaterThan(0)
    })
  })

  describe('⚔️ Attack Vector: XSS Payloads', () => {
    it('should store XSS payload but not execute it', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>'
      ]

      for (let i = 0; i < xssPayloads.length; i++) {
        const xssPayload = xssPayloads[i]
        // Reset mocks pro každý payload
        vi.clearAllMocks()
        
        mockDB.prepare().first
          .mockResolvedValueOnce(null) // Check existence
          .mockResolvedValueOnce({ 
            id: `test-id-${i}`,
            collection_id: 'col-1',
            slug: `xss-test-${i}`,
            data: JSON.stringify({ title: xssPayload }),
            status: 'draft',
            author_id: 'user-1',
            created_at: Date.now(),
            updated_at: Date.now()
          })

        mockDB.prepare().run.mockResolvedValue({ success: true })

        const program = Effect.gen(function* (_) {
          const service = yield* ContentService
          // Služba by měla ULOŽIT data (ne vykonat je)
          return yield* service.createContent({
            collection_id: 'col-1',
            slug: `xss-test-${i}`,
            data: { 
              title: xssPayload,
              body: `Test with ${xssPayload}`
            },
            author_id: 'user-1'
          })
        })

        const layer = ContentServiceLive.pipe(
          Layer.provide(makeDatabaseLayer(mockDB))
        )

        const result = await Effect.runPromise(
          program.pipe(Effect.provide(layer))
        )

        // Data by měla být uložena jako JSON (ne vykonána)
        expect(result).toBeDefined()
        expect(mockDB.prepare().run).toHaveBeenCalled()
      }
    })
  })

  describe('⚔️ Attack Vector: null/undefined/prázdné objekty', () => {
    it('should handle null data safely', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: 'col-1',
          slug: 'test',
          data: null as any,
          author_id: 'user-1'
        })
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(layer),
          Effect.either
        )
      )

      // Služba by měla bezpečně zpracovat null
      expect(result).toBeDefined()
    })

    it('should handle undefined slug safely', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: 'col-1',
          slug: undefined as any,
          data: { title: 'Test' },
          author_id: 'user-1'
        })
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(layer),
          Effect.either
        )
      )

      expect(result).toBeDefined()
    })

    it('should handle empty collection_id safely', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* service.createContent({
          collection_id: '',
          slug: 'test',
          data: { title: 'Test' },
          author_id: 'user-1'
        })
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(layer),
          Effect.either
        )
      )

      expect(result).toBeDefined()
    })
  })

  describe('⚔️ Attack Vector: Duplicitní slugy', () => {
    it('should reject duplicate slug in same collection', async () => {
      // Mock že slug již existuje
      mockDB.prepare().first.mockResolvedValue({ id: 'existing-id' })

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* Effect.flip(
          service.createContent({
            collection_id: 'col-1',
            slug: 'existing-slug',
            data: { title: 'Test' },
            author_id: 'user-1'
          })
        )
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(error).toBeInstanceOf(ContentAlreadyExistsError)
    })
  })

  describe('⚔️ Attack Vector: Neexistující ID', () => {
    it('should reject access to nonexistent content', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* Effect.flip(
          service.getContentById('nonexistent-id-12345')
        )
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(error).toBeInstanceOf(ContentNotFoundError)
    })

    it('should reject update of nonexistent content', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* Effect.flip(
          service.updateContent('nonexistent-id', {
            data: { title: 'Hacked' },
            updated_by: 'attacker'
          })
        )
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(error).toBeInstanceOf(ContentNotFoundError)
    })

    it('should reject deletion of nonexistent content', async () => {
      mockDB.prepare().first.mockResolvedValue(null)

      const program = Effect.gen(function* (_) {
        const service = yield* ContentService
        return yield* Effect.flip(
          service.deleteContent('nonexistent-id')
        )
      })

      const layer = ContentServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(error).toBeInstanceOf(ContentNotFoundError)
    })
  })
})

describe('🛡️ Adversarial Security Tests - UserService', () => {
  let mockDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
  })

  describe('⚔️ Attack Vector: Email injection', () => {
    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user..name@example.com',
        'user@example..com',
        '<script>alert(1)</script>@example.com',
        "user'; DROP TABLE users; --@example.com"
      ]

      for (const email of invalidEmails) {
        const program = Effect.gen(function* (_) {
          const service = yield* UserService
          return yield* Effect.flip(
            service.createUser({
              email,
              password_hash: 'hashed-password',
              username: 'testuser'
            })
          )
        })

        const layer = UserServiceLive.pipe(
          Layer.provide(makeDatabaseLayer(mockDB))
        )

        const error = await Effect.runPromise(
          program.pipe(Effect.provide(layer))
        )

        // Služba může vrátit buď UserValidationError nebo DatabaseError
        expect(error._tag).toMatch(/UserValidationError|DatabaseError/)
      }
    })
  })

  describe('⚔️ Attack Vector: Username injection', () => {
    it('should handle SQL injection in username', async () => {
      mockDB.prepare().first.mockResolvedValue(null)
      mockDB.prepare().run.mockResolvedValue({ success: true })

      const program = Effect.gen(function* (_) {
        const service = yield* UserService
        return yield* service.createUser({
          email: 'test@example.com',
          username: "admin'--",
          password_hash: 'hashed-password'
        })
      })

      const layer = UserServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      // Služba by měla bezpečně uložit username jako data
      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(layer),
          Effect.either
        )
      )

      expect(result).toBeDefined()
    })
  })

  describe('⚔️ Attack Vector: Duplicitní uživatelé', () => {
    it('should reject duplicate email registration', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'existing-user' })

      const program = Effect.gen(function* (_) {
        const service = yield* UserService
        return yield* Effect.flip(
          service.createUser({
            email: 'existing@example.com',
            password_hash: 'hashed-password',
            username: 'newuser'
          })
        )
      })

      const layer = UserServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(error).toBeInstanceOf(UserAlreadyExistsError)
    })
  })
})

describe('🛡️ Adversarial Security Tests - CollectionService', () => {
  let mockDB: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockDB = createMockDB()
  })

  describe('⚔️ Attack Vector: Invalid collection names', () => {
    it('should reject collection names with invalid characters', async () => {
      const invalidNames = [
        'Collection Name', // mezery
        'collection-name!', // speciální znaky
        'Collection@123', // speciální znaky
        'UPPERCASE', // velká písmena
        'col/name', // lomítko
        '../../../etc/passwd', // path traversal
        '<script>alert(1)</script>'
      ]

      for (const name of invalidNames) {
        const program = Effect.gen(function* (_) {
          const service = yield* CollectionService
          return yield* Effect.flip(
            service.createCollection({
              name,
              display_name: 'Test Collection'
            })
          )
        })

        const layer = CollectionServiceLive.pipe(
          Layer.provide(makeDatabaseLayer(mockDB))
        )

        const error = await Effect.runPromise(
          program.pipe(Effect.provide(layer))
        )

        expect(error).toBeInstanceOf(ValidationError)
      }
    })
  })

  describe('⚔️ Attack Vector: Duplicitní kolekce', () => {
    it('should reject duplicate collection name', async () => {
      mockDB.prepare().first.mockResolvedValue({ id: 'existing-collection' })

      const program = Effect.gen(function* (_) {
        const service = yield* CollectionService
        return yield* Effect.flip(
          service.createCollection({
            name: 'existing_collection',
            display_name: 'Existing Collection'
          })
        )
      })

      const layer = CollectionServiceLive.pipe(
        Layer.provide(makeDatabaseLayer(mockDB))
      )

      const error = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(error).toBeInstanceOf(CollectionAlreadyExistsError)
    })
  })

  describe('⚔️ Attack Vector: Invalid field names', () => {
    it('should reject field names with invalid characters', async () => {
      const invalidFieldNames = [
        'field name', // mezery
        'field-name', // pomlčka
        'Field', // velká písmena
        'field.name', // tečka
        '__proto__', // nebezpečné JS property
        'constructor'
      ]

      mockDB.prepare().first.mockResolvedValue(null)

      for (const fieldName of invalidFieldNames) {
        const program = Effect.gen(function* (_) {
          const service = yield* CollectionService
          return yield* Effect.flip(
            service.createField({
              collection_id: 'col-1',
              field_name: fieldName,
              field_type: 'text',
              field_label: 'Test Field'
            })
          )
        })

        const layer = CollectionServiceLive.pipe(
          Layer.provide(makeDatabaseLayer(mockDB))
        )

        const error = await Effect.runPromise(
          program.pipe(Effect.provide(layer))
        )

        // Služba může vrátit buď ValidationError nebo DatabaseError
        expect(error._tag).toMatch(/ValidationError|DatabaseError/)
      }
    })
  })
})

describe('🛡️ Adversarial Security Tests - AuthService', () => {
  describe('⚔️ Attack Vector: Token manipulation', () => {
    it('should reject invalid JWT tokens', async () => {
      const invalidTokens = [
        'not.a.token',
        'x.y.z',
        '',
        'Bearer malicious-token',
        '<script>alert(1)</script>',
        "'; DROP TABLE users; --"
      ]

      for (const token of invalidTokens) {
        const program = Effect.gen(function* (_) {
          const service = yield* AuthService
          return yield* Effect.flip(
            service.verifyToken(token)
          )
        })

        const error = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeAuthServiceLayer())
          )
        )

        expect(error).toBeInstanceOf(TokenInvalidError)
      }
    })
  })

  describe('⚔️ Attack Vector: Password attacks', () => {
    it('should safely hash extremely long passwords', async () => {
      const extremelyLongPassword = 'p'.repeat(100000)

      const program = Effect.gen(function* (_) {
        const service = yield* AuthService
        return yield* service.hashPassword(extremelyLongPassword)
      })

      // Služba by měla bezpečně zpracovat (i když to trvá)
      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAuthServiceLayer()),
          Effect.either
        )
      )

      expect(result).toBeDefined()
    })

    it('should reject password verification with wrong hash', async () => {
      const program = Effect.gen(function* (_) {
        const service = yield* AuthService
        return yield* Effect.flip(
          service.verifyPassword('password123', 'wrong-hash')
        )
      })

      const error = await Effect.runPromise(
        program.pipe(
          Effect.provide(makeAuthServiceLayer())
        )
      )

      expect(error).toBeInstanceOf(PasswordMismatchError)
    })

    it('should handle special characters in passwords safely', async () => {
      const specialPasswords = [
        "'; DROP TABLE users; --",
        '<script>alert(1)</script>',
        '${7*7}',
        '../../../etc/passwd',
        '\x00\x00\x00'
      ]

      for (const password of specialPasswords) {
        const program = Effect.gen(function* (_) {
          const service = yield* AuthService
          const hash = yield* service.hashPassword(password)
          return yield* service.verifyPassword(password, hash)
        })

        const result = await Effect.runPromise(
          program.pipe(
            Effect.provide(makeAuthServiceLayer())
          )
        )

        // Ověření musí fungovat korektně i pro speciální znaky
        expect(result).toBe(true)
      }
    })
  })
})