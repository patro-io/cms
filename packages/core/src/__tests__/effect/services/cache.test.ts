/**
 * CacheService Tests - Effect TS Implementation
 * 
 * Testuje in-memory caching s TTL, invalidation, getOrSet pattern
 */

import { describe, it, expect } from 'vitest'
import { Effect, Option } from 'effect'
import {
  CacheService,
  makeCacheServiceLayer,
  CacheError,
  CACHE_CONFIGS
} from '../../../services/cache'

/**
 * Helper pro vytvoření test cache layer s krátkým TTL
 */
const makeTestCacheLayer = (ttl: number = 1) =>
  makeCacheServiceLayer({
    ttl,
    keyPrefix: 'test'
  })

describe('CacheService - Effect Implementation', () => {
  describe('generateKey', () => {
    it('vytvoří klíč s prefixem', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        return yield* cache.generateKey('user')
      })

      const key = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer()))
      )

      expect(key).toBe('test:user')
    })

    it('vytvoří klíč s prefixem a identifikátorem', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        return yield* cache.generateKey('user', '123')
      })

      const key = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer()))
      )

      expect(key).toBe('test:user:123')
    })

    it('podporuje více segmentů klíče', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        const key1 = yield* cache.generateKey('collection', 'posts')
        const key2 = yield* cache.generateKey('collection', 'users')
        return { key1, key2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer()))
      )

      expect(result.key1).toBe('test:collection:posts')
      expect(result.key2).toBe('test:collection:users')
      expect(result.key1).not.toBe(result.key2)
    })
  })

  describe('set / get', () => {
    it('uloží a načte hodnotu z cache', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key1', 'value1')
        const result = yield* cache.get<string>('key1')
        
        return result
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe('value1')
      }
    })

    it('vrátí None pro neexistující klíč', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        return yield* cache.get<string>('nonexistent')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer()))
      )

      expect(Option.isNone(result)).toBe(true)
    })

    it('podporuje různé typy dat', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('string', 'text')
        yield* cache.set('number', 42)
        yield* cache.set('boolean', true)
        yield* cache.set('object', { name: 'Test', count: 5 })
        yield* cache.set('array', [1, 2, 3])
        
        const str = yield* cache.get<string>('string')
        const num = yield* cache.get<number>('number')
        const bool = yield* cache.get<boolean>('boolean')
        const obj = yield* cache.get<{ name: string; count: number }>('object')
        const arr = yield* cache.get<number[]>('array')
        
        return { str, num, bool, obj, arr }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result.str)).toBe(true)
      expect(Option.isSome(result.num)).toBe(true)
      expect(Option.isSome(result.bool)).toBe(true)
      expect(Option.isSome(result.obj)).toBe(true)
      expect(Option.isSome(result.arr)).toBe(true)
      
      if (Option.isSome(result.obj)) {
        expect(result.obj.value.name).toBe('Test')
        expect(result.obj.value.count).toBe(5)
      }
    })

    it('přepíše existující hodnotu', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'old-value')
        const before = yield* cache.get<string>('key')
        
        yield* cache.set('key', 'new-value')
        const after = yield* cache.get<string>('key')
        
        return { before, after }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result.before)).toBe(true)
      expect(Option.isSome(result.after)).toBe(true)
      
      if (Option.isSome(result.before) && Option.isSome(result.after)) {
        expect(result.before.value).toBe('old-value')
        expect(result.after.value).toBe('new-value')
      }
    })
  })

  describe('TTL (Time To Live)', () => {
    it('respektuje výchozí TTL z konfigurace', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'value') // Použije default TTL 1 sekunda
        const immediate = yield* cache.get<string>('key')
        
        // Počkej 1.5 sekundy
        yield* Effect.sleep('1500 millis')
        
        const afterExpiry = yield* cache.get<string>('key')
        
        return { immediate, afterExpiry }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(1)))
      )

      expect(Option.isSome(result.immediate)).toBe(true)
      expect(Option.isNone(result.afterExpiry)).toBe(true)
    })

    it('umožňuje vlastní TTL per entry', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('short', 'expires-fast', 1) // 1 sekunda
        yield* cache.set('long', 'expires-slow', 10) // 10 sekund
        
        // Počkej 1.5 sekundy
        yield* Effect.sleep('1500 millis')
        
        const short = yield* cache.get<string>('short')
        const long = yield* cache.get<string>('long')
        
        return { short, long }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(5)))
      )

      expect(Option.isNone(result.short)).toBe(true) // Vypršelo
      expect(Option.isSome(result.long)).toBe(true) // Stále platné
    })

    it('automaticky čistí expirované záznamy při get', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'value', 1)
        
        // Počkej na expiraci
        yield* Effect.sleep('1100 millis')
        
        // První get by měl smazat expirovaný záznam
        const first = yield* cache.get<string>('key')
        
        // Druhý get by měl potvrdit že záznam je pryč
        const second = yield* cache.get<string>('key')
        
        return { first, second }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(5)))
      )

      expect(Option.isNone(result.first)).toBe(true)
      expect(Option.isNone(result.second)).toBe(true)
    })
  })

  describe('getWithSource', () => {
    it('vrátí hit result s daty pro validní cache', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'value', 60)
        return yield* cache.getWithSource<string>('key')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result.hit).toBe(true)
      expect(result.data).toBe('value')
      expect(result.source).toBe('memory')
      expect(result.ttl).toBeGreaterThan(0)
    })

    it('vrátí miss pro neexistující klíč', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        return yield* cache.getWithSource<string>('nonexistent')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer()))
      )

      expect(result.hit).toBe(false)
      expect(result.data).toBe(null)
      expect(result.source).toBe('none')
    })

    it('vrátí expired source pro vypršený záznam', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'value', 1)
        yield* Effect.sleep('1100 millis')
        
        return yield* cache.getWithSource<string>('key')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(5)))
      )

      expect(result.hit).toBe(false)
      expect(result.data).toBe(null)
      expect(result.source).toBe('expired')
    })

    it('poskytuje zbývající TTL v sekundách', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'value', 10) // 10 sekund TTL
        
        const immediate = yield* cache.getWithSource<string>('key')
        
        yield* Effect.sleep('2 seconds')
        
        const later = yield* cache.getWithSource<string>('key')
        
        return { immediate, later }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result.immediate.ttl).toBeLessThanOrEqual(10)
      expect(result.immediate.ttl).toBeGreaterThan(9)
      
      // Allow 1 second margin for timing variations (flaky test fix)
      expect(result.later.ttl).toBeLessThanOrEqual(9)
      expect(result.later.ttl).toBeGreaterThan(6)
    })
  })

  describe('delete', () => {
    it('smaže konkrétní klíč', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key1', 'value1', 60)
        yield* cache.set('key2', 'value2', 60)
        
        const before1 = yield* cache.get<string>('key1')
        const before2 = yield* cache.get<string>('key2')
        
        yield* cache.delete('key1')
        
        const after1 = yield* cache.get<string>('key1')
        const after2 = yield* cache.get<string>('key2')
        
        return { before1, before2, after1, after2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result.before1)).toBe(true)
      expect(Option.isSome(result.before2)).toBe(true)
      expect(Option.isNone(result.after1)).toBe(true)
      expect(Option.isSome(result.after2)).toBe(true) // Zůstává
    })

    it('neselže při mazání neexistujícího klíče', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        return yield* cache.delete('nonexistent')
      })

      // Nemělo by selhat
      await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer()))
      )

      expect(true).toBe(true) // Úspěch = neselhal
    })
  })

  describe('invalidate - pattern matching', () => {
    it('invaliduje klíče podle wildcard patternu', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('test:user:1', 'user1', 60)
        yield* cache.set('test:user:2', 'user2', 60)
        yield* cache.set('test:post:1', 'post1', 60)
        
        const count = yield* cache.invalidate('test:user:*')
        
        const user1 = yield* cache.get<string>('test:user:1')
        const user2 = yield* cache.get<string>('test:user:2')
        const post1 = yield* cache.get<string>('test:post:1')
        
        return { count, user1, user2, post1 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result.count).toBe(2) // Smazáno 2 user klíče
      expect(Option.isNone(result.user1)).toBe(true)
      expect(Option.isNone(result.user2)).toBe(true)
      expect(Option.isSome(result.post1)).toBe(true) // Post zůstává
    })

    it('invaliduje všechny klíče s pattern *', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key1', 'value1', 60)
        yield* cache.set('key2', 'value2', 60)
        yield* cache.set('key3', 'value3', 60)
        
        const count = yield* cache.invalidate('*')
        
        const after1 = yield* cache.get<string>('key1')
        const after2 = yield* cache.get<string>('key2')
        
        return { count, after1, after2 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result.count).toBe(3)
      expect(Option.isNone(result.after1)).toBe(true)
      expect(Option.isNone(result.after2)).toBe(true)
    })

    it('podporuje complex patterns', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('api:v1:users', 'data1', 60)
        yield* cache.set('api:v1:posts', 'data2', 60)
        yield* cache.set('api:v2:users', 'data3', 60)
        
        const count = yield* cache.invalidate('api:v1:*')
        
        const v1users = yield* cache.get<string>('api:v1:users')
        const v1posts = yield* cache.get<string>('api:v1:posts')
        const v2users = yield* cache.get<string>('api:v2:users')
        
        return { count, v1users, v1posts, v2users }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result.count).toBe(2)
      expect(Option.isNone(result.v1users)).toBe(true)
      expect(Option.isNone(result.v1posts)).toBe(true)
      expect(Option.isSome(result.v2users)).toBe(true) // v2 zůstává
    })

    it('vrátí 0 pokud žádný klíč neodpovídá', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key1', 'value1', 60)
        
        return yield* cache.invalidate('nonmatching:*')
      })

      const count = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(count).toBe(0)
    })
  })

  describe('clear', () => {
    it('vyčistí celou cache', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key1', 'value1', 60)
        yield* cache.set('key2', 'value2', 60)
        yield* cache.set('key3', 'value3', 60)
        
        const before = yield* cache.get<string>('key1')
        
        yield* cache.clear()
        
        const after1 = yield* cache.get<string>('key1')
        const after2 = yield* cache.get<string>('key2')
        const after3 = yield* cache.get<string>('key3')
        
        return { before, after1, after2, after3 }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result.before)).toBe(true)
      expect(Option.isNone(result.after1)).toBe(true)
      expect(Option.isNone(result.after2)).toBe(true)
      expect(Option.isNone(result.after3)).toBe(true)
    })

    it('umožňuje nové záznamy po clear', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'old', 60)
        yield* cache.clear()
        yield* cache.set('key', 'new', 60)
        
        return yield* cache.get<string>('key')
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result)).toBe(true)
      if (Option.isSome(result)) {
        expect(result.value).toBe('new')
      }
    })
  })

  describe('getOrSet', () => {
    it('načte z cache pokud existuje', async () => {
      let callbackCalled = false

      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.set('key', 'cached-value', 60)
        
        return yield* cache.getOrSet(
          'key',
          () => Effect.sync(() => {
            callbackCalled = true
            return 'callback-value'
          }),
          60
        )
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result).toBe('cached-value')
      expect(callbackCalled).toBe(false) // Callback nebyl volán
    })

    it('zavolá callback a uloží pokud cache neexistuje', async () => {
      let callbackCalled = false

      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        const result = yield* cache.getOrSet(
          'key',
          () => Effect.sync(() => {
            callbackCalled = true
            return 'callback-value'
          }),
          60
        )
        
        // Ověř že hodnota je nyní v cache
        const cached = yield* cache.get<string>('key')
        
        return { result, cached }
      })

      const data = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(data.result).toBe('callback-value')
      expect(callbackCalled).toBe(true)
      expect(Option.isSome(data.cached)).toBe(true)
      if (Option.isSome(data.cached)) {
        expect(data.cached.value).toBe('callback-value')
      }
    })

    it('propaguje chyby z callbacku', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        return yield* cache.getOrSet(
          'key',
          () => Effect.fail(new Error('Callback error')),
          60
        )
      })

      const exit = await Effect.runPromiseExit(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(exit._tag).toBe('Failure')
    })

    it('respektuje TTL parametr', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        yield* cache.getOrSet(
          'key',
          () => Effect.succeed('value'),
          1 // 1 sekunda TTL
        )
        
        const immediate = yield* cache.get<string>('key')
        
        yield* Effect.sleep('1100 millis')
        
        const afterExpiry = yield* cache.get<string>('key')
        
        return { immediate, afterExpiry }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(Option.isSome(result.immediate)).toBe(true)
      expect(Option.isNone(result.afterExpiry)).toBe(true)
    })
  })

  describe('CACHE_CONFIGS', () => {
    it('obsahuje přednastavené konfigurace', () => {
      expect(CACHE_CONFIGS.api).toBeDefined()
      expect(CACHE_CONFIGS.user).toBeDefined()
      expect(CACHE_CONFIGS.content).toBeDefined()
      expect(CACHE_CONFIGS.collection).toBeDefined()
    })

    it('každá konfigurace má ttl a keyPrefix', () => {
      Object.values(CACHE_CONFIGS).forEach(config => {
        expect(config).toHaveProperty('ttl')
        expect(config).toHaveProperty('keyPrefix')
        expect(typeof config.ttl).toBe('number')
        expect(typeof config.keyPrefix).toBe('string')
      })
    })

    it('různé typy cache mají různé prefixy', () => {
      const prefixes = Object.values(CACHE_CONFIGS).map(c => c.keyPrefix)
      const uniquePrefixes = new Set(prefixes)
      expect(uniquePrefixes.size).toBe(prefixes.length)
    })
  })

  describe('Integration test - real-world scenario', () => {
    it('simuluje typický cache workflow', async () => {
      const program = Effect.gen(function* () {
        const cache = yield* CacheService
        
        // 1. Generuj klíč
        const key = yield* cache.generateKey('user', '123')
        
        // 2. První request - miss, načti z "databáze"
        const firstResult = yield* cache.getOrSet(
          key,
          () => Effect.succeed({ id: '123', name: 'John Doe' }),
          60
        )
        
        // 3. Druhý request - hit
        const secondResult = yield* cache.get<{ id: string; name: string }>(key)
        
        // 4. Invalidace všech user klíčů
        yield* cache.invalidate('test:user:*')
        
        // 5. Po invalidaci - miss
        const afterInvalidation = yield* cache.get<{ id: string; name: string }>(key)
        
        return { key, firstResult, secondResult, afterInvalidation }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(makeTestCacheLayer(60)))
      )

      expect(result.key).toBe('test:user:123')
      expect(result.firstResult.name).toBe('John Doe')
      expect(Option.isSome(result.secondResult)).toBe(true)
      expect(Option.isNone(result.afterInvalidation)).toBe(true)
    })
  })
})