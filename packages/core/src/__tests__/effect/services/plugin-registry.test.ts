/**
 * Unit tests pro PluginRegistryServiceLive
 *
 * Testuje Effect-based plugin registry s type-safe error handling.
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import type { Plugin, PluginConfig } from '../../../types'
import { PluginRegistryService } from '../../../plugins/plugin-registry-effect'
import { PluginRegistryServiceLive } from '../../../plugins/plugin-registry-live'
import {
  PluginNotFoundError,
  PluginValidationError,
  PluginDependencyError,
  PluginCircularDependencyError,
  PluginAlreadyRegisteredError
} from '../../../plugins/plugin-errors'

// Helper pro spuštění Effect programů s fresh registry layer
async function runWithRegistry<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Promise<A> {
  // Vytvoř fresh instanci pro každý test
  const freshLayer = Layer.fresh(PluginRegistryServiceLive)
  return await Effect.runPromise(
    effect.pipe(Effect.provide(freshLayer)) as Effect.Effect<A, E, never>
  )
}

// Helper pro vytvoření mock pluginu
function createMockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin',
    ...overrides
  }
}

describe('PluginRegistryServiceLive', () => {
  /**
   * Vyčistit registry před každým testem pro zajištění test isolation.
   * Bez toho closure state zůstává sdílený mezi testy.
   */
  beforeEach(async () => {
    await runWithRegistry(
      Effect.gen(function* () {
        const registry = yield* PluginRegistryService
        yield* registry.clear()
      })
    )
  })

  describe('Query operations (never fail)', () => {
    it('get vrací undefined pro neexistující plugin', async () => {
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.get('nonexistent')
        })
      )
      
      expect(result).toBeUndefined()
    })
    
    it('get vrací plugin po registraci', async () => {
      const plugin = createMockPlugin({ name: 'my-plugin' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          return yield* registry.get('my-plugin')
        })
      )
      
      expect(result).toEqual(plugin)
    })
    
    it('getAll vrací prázdné pole pro nový registry', async () => {
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.getAll()
        })
      )
      
      expect(result).toEqual([])
    })
    
    it('getAll vrací všechny zaregistrované pluginy', async () => {
      const plugin1 = createMockPlugin({ name: 'plugin-1' })
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin1)
          yield* registry.register(plugin2)
          return yield* registry.getAll()
        })
      )
      
      expect(result).toHaveLength(2)
      expect(result).toContainEqual(plugin1)
      expect(result).toContainEqual(plugin2)
    })
    
    it('getActive vrací pouze aktivní pluginy', async () => {
      const plugin1 = createMockPlugin({ name: 'plugin-1' })
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin1)
          yield* registry.register(plugin2)
          yield* registry.activate('plugin-1')
          return yield* registry.getActive()
        })
      )
      
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('plugin-1')
    })
    
    it('has vrací false pro neexistující plugin', async () => {
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.has('nonexistent')
        })
      )
      
      expect(result).toBe(false)
    })
    
    it('has vrací true pro existující plugin', async () => {
      const plugin = createMockPlugin({ name: 'exists' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          return yield* registry.has('exists')
        })
      )
      
      expect(result).toBe(true)
    })
    
    it('getConfig vrací undefined pro neexistující plugin', async () => {
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.getConfig('nonexistent')
        })
      )
      
      expect(result).toBeUndefined()
    })
    
    it('getConfig vrací nastavený config', async () => {
      const plugin = createMockPlugin({ name: 'my-plugin' })
      const config: PluginConfig = { enabled: true, customSetting: 'value' }
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          yield* registry.setConfig('my-plugin', config)
          return yield* registry.getConfig('my-plugin')
        })
      )
      
      expect(result).toMatchObject(config)
      expect(result?.updatedAt).toBeDefined()
    })
    
    it('getStatus vrací undefined pro neexistující plugin', async () => {
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.getStatus('nonexistent')
        })
      )
      
      expect(result).toBeUndefined()
    })
    
    it('getStatus vrací správný status po registraci', async () => {
      const plugin = createMockPlugin({ name: 'my-plugin', version: '2.0.0' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          return yield* registry.getStatus('my-plugin')
        })
      )
      
      expect(result).toMatchObject({
        name: 'my-plugin',
        version: '2.0.0',
        active: false,
        installed: true,
        hasErrors: false
      })
    })
  })
  
  describe('register operation', () => {
    it('úspěšně zaregistruje validní plugin', async () => {
      const plugin = createMockPlugin({
        name: 'valid-plugin',
        version: '1.0.0',
        description: 'A valid plugin'
      })
      
      await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          
          const registered = yield* registry.get('valid-plugin')
          expect(registered).toEqual(plugin)
        })
      )
    })
    
    it('failuje s PluginValidationError pro nevalidní plugin', async () => {
      const invalidPlugin = createMockPlugin({
        name: '', // Prázdné jméno není validní
        version: '1.0.0'
      })
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.register(invalidPlugin)
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginValidationError')
      }
    })
    
    it('failuje s PluginDependencyError pro chybějící dependencies', async () => {
      const plugin = createMockPlugin({
        name: 'dependent-plugin',
        dependencies: ['nonexistent-dependency']
      })
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.register(plugin)
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginDependencyError')
        const error = result.left as PluginDependencyError
        expect(error.missingDependencies).toContain('nonexistent-dependency')
      }
    })
    
    it('úspěšně zaregistruje plugin se splněnými dependencies', async () => {
      const dependency = createMockPlugin({ name: 'dependency' })
      const dependent = createMockPlugin({
        name: 'dependent',
        dependencies: ['dependency']
      })
      
      await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(dependency)
          yield* registry.register(dependent)
          
          const registered = yield* registry.get('dependent')
          expect(registered).toBeDefined()
        })
      )
    })
  })
  
  describe('unregister operation', () => {
    it('úspěšně odstraní existující plugin', async () => {
      const plugin = createMockPlugin({ name: 'to-remove' })
      
      await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          yield* registry.unregister('to-remove')
          
          const removed = yield* registry.get('to-remove')
          expect(removed).toBeUndefined()
        })
      )
    })
    
    it('failuje s PluginNotFoundError pro neexistující plugin', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.unregister('nonexistent')
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginNotFoundError')
      }
    })
    
    it('failuje s PluginDependencyError pokud na plugin závisí jiný plugin', async () => {
      const dependency = createMockPlugin({ name: 'dependency' })
      const dependent = createMockPlugin({
        name: 'dependent',
        dependencies: ['dependency']
      })
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(dependency)
          yield* registry.register(dependent)
          return yield* registry.unregister('dependency')
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginDependencyError')
      }
    })
  })
  
  describe('activate/deactivate operations', () => {
    it('úspěšně aktivuje existující plugin', async () => {
      const plugin = createMockPlugin({ name: 'to-activate' })
      
      await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          yield* registry.activate('to-activate')
          
          const status = yield* registry.getStatus('to-activate')
          expect(status?.active).toBe(true)
        })
      )
    })
    
    it('failuje s PluginNotFoundError při aktivaci neexistujícího pluginu', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          return yield* registry.activate('nonexistent')
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginNotFoundError')
      }
    })
    
    it('úspěšně deaktivuje aktivní plugin', async () => {
      const plugin = createMockPlugin({ name: 'to-deactivate' })
      
      await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          yield* registry.activate('to-deactivate')
          yield* registry.deactivate('to-deactivate')
          
          const status = yield* registry.getStatus('to-deactivate')
          expect(status?.active).toBe(false)
        })
      )
    })
  })
  
  describe('resolveLoadOrder operation', () => {
    it('vyřeší správné pořadí pro pluginy bez dependencies', async () => {
      const plugin1 = createMockPlugin({ name: 'plugin-1' })
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin1)
          yield* registry.register(plugin2)
          return yield* registry.resolveLoadOrder()
        })
      )
      
      expect(result).toHaveLength(2)
      expect(result).toContain('plugin-1')
      expect(result).toContain('plugin-2')
    })
    
    it('vyřeší správné pořadí s jednoduchými dependencies', async () => {
      const pluginA = createMockPlugin({ name: 'plugin-a' })
      const pluginB = createMockPlugin({
        name: 'plugin-b',
        dependencies: ['plugin-a']
      })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(pluginA)
          yield* registry.register(pluginB)
          return yield* registry.resolveLoadOrder()
        })
      )
      
      expect(result).toEqual(['plugin-a', 'plugin-b'])
    })
    
    it('vyřeší složité dependency tree', async () => {
      const pluginA = createMockPlugin({ name: 'a' })
      const pluginB = createMockPlugin({ name: 'b', dependencies: ['a'] })
      const pluginC = createMockPlugin({ name: 'c', dependencies: ['a'] })
      const pluginD = createMockPlugin({ name: 'd', dependencies: ['b', 'c'] })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          // Registrovat v pořadí dependencies-first (register validuje dependencies)
          yield* registry.register(pluginA)
          yield* registry.register(pluginB)
          yield* registry.register(pluginC)
          yield* registry.register(pluginD)
          return yield* registry.resolveLoadOrder()
        })
      )
      
      // 'a' musí být první
      expect(result[0]).toBe('a')
      // 'b' a 'c' musí být před 'd'
      const indexB = result.indexOf('b')
      const indexC = result.indexOf('c')
      const indexD = result.indexOf('d')
      expect(indexB).toBeLessThan(indexD)
      expect(indexC).toBeLessThan(indexD)
    })
    
    it('detekuje cirkulární závislost', async () => {
      // Pro testování circular dependencies musíme obejít dependency validation při registraci
      // Nejdříve zaregistrujeme pluginy bez dependencies, pak vytvoříme circular dependency v grafu
      const pluginA = createMockPlugin({ name: 'a' })
      const pluginB = createMockPlugin({ name: 'b' })
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          // Registrovat pluginy nejdříve bez dependencies
          yield* registry.register(pluginA)
          yield* registry.register(pluginB)
          
          // Nyní simulujeme circular dependency přímou manipulací (hack pro test)
          // V reálném světě by to bylo přes API, ale pro test potřebujeme vytvořit stav
          const allPlugins = yield* registry.getAll()
          const a = allPlugins.find(p => p.name === 'a')
          const b = allPlugins.find(p => p.name === 'b')
          
          // Modifikujeme dependencies aby vytvořily circular dependency
          if (a) a.dependencies = ['b']
          if (b) b.dependencies = ['a']
          
          return yield* registry.resolveLoadOrder()
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginCircularDependencyError')
      }
    })
    
    it('failuje s PluginDependencyError pro chybějící dependency', async () => {
      const plugin = createMockPlugin({
        name: 'plugin',
        dependencies: ['missing']
      })
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin)
          return yield* registry.resolveLoadOrder()
        }).pipe(
          Effect.provide(Layer.fresh(PluginRegistryServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginDependencyError')
      }
    })
  })
  
  describe('utility operations', () => {
    it('getDependencyGraph vrací správný dependency graf', async () => {
      const pluginA = createMockPlugin({ name: 'a' })
      const pluginB = createMockPlugin({ name: 'b', dependencies: ['a'] })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(pluginA)
          yield* registry.register(pluginB)
          return yield* registry.getDependencyGraph()
        })
      )
      
      expect(result.get('a')).toEqual([])
      expect(result.get('b')).toEqual(['a'])
    })
    
    it('getStats vrací správné statistiky', async () => {
      const plugin1 = createMockPlugin({ name: 'plugin-1' })
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      const result = await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin1)
          yield* registry.register(plugin2)
          yield* registry.activate('plugin-1')
          return yield* registry.getStats()
        })
      )
      
      expect(result).toEqual({
        total: 2,
        active: 1,
        inactive: 1,
        withErrors: 0
      })
    })
    
    it('clear odstraní všechny pluginy', async () => {
      const plugin1 = createMockPlugin({ name: 'plugin-1' })
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      await runWithRegistry(
        Effect.gen(function* () {
          const registry = yield* PluginRegistryService
          yield* registry.register(plugin1)
          yield* registry.register(plugin2)
          yield* registry.clear()
          
          const all = yield* registry.getAll()
          expect(all).toHaveLength(0)
        })
      )
    })
  })
})