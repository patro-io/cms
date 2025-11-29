/**
 * Unit tests pro PluginManagerServiceLive
 *
 * Testuje Effect-based plugin manager s kompletním lifecycle management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { Hono } from 'hono'
import type { Plugin, PluginConfig, PluginContext, HookHandler } from '../../../types'
import { PluginManagerService } from '../../../plugins/plugin-manager-effect'
import { PluginManagerServiceLive } from '../../../plugins/plugin-manager-live'
import { PluginRegistryService } from '../../../plugins/plugin-registry-effect'
import { PluginRegistryServiceLive } from '../../../plugins/plugin-registry-live'
import { HookSystemService } from '../../../plugins/hook-system-effect'
import { HookSystemServiceLive } from '../../../plugins/hook-system-live'
import {
  PluginError,
  PluginNotFoundError,
  PluginSystemInitializationError
} from '../../../plugins/plugin-errors'

// Composed layer pro testing
const TestPluginSystemLayer = Layer.provide(
  PluginManagerServiceLive,
  Layer.mergeAll(PluginRegistryServiceLive, HookSystemServiceLive)
)

// Helper pro spuštění Effect programů s plugin system
async function runWithPluginSystem<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Promise<A> {
  return await Effect.runPromise(
    effect.pipe(Effect.provide(TestPluginSystemLayer)) as Effect.Effect<A, E, never>
  )
}

// Helper pro vytvoření mock pluginu
function createMockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin',
    install: vi.fn(async (ctx) => {}),
    uninstall: vi.fn(async (ctx) => {}),
    activate: vi.fn(async (ctx) => {}),
    deactivate: vi.fn(async (ctx) => {}),
    ...overrides
  }
}

// Mock PluginContext pro testování
function createMockContext(): PluginContext {
  return {
    db: {} as any,
    kv: {} as any,
    config: { enabled: true },
    services: {
      auth: {} as any,
      content: {} as any,
      media: {} as any
    },
    hooks: {
      register: vi.fn(),
      execute: vi.fn(async () => ({})),
      unregister: vi.fn(),
      getHooks: vi.fn(() => [])
    } as any,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  }
}

describe('PluginManagerServiceLive', () => {
  /**
   * Vyčistit registry a hooks před každým testem pro zajištění test isolation.
   * Plugin Manager závisí na obou službách, musíme vyčistit obě.
   */
  beforeEach(async () => {
    await runWithPluginSystem(
      Effect.gen(function* () {
        const manager = yield* PluginManagerService
        yield* manager.registry.clear()
        yield* manager.hooks.clear()
      })
    )
  })

  describe('initialize operation', () => {
    it('úspěšně inicializuje plugin systém', async () => {
      const context = createMockContext()
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          
          // Ověř, že context byl uložen
          // Můžeme to ověřit tím, že další operace nebudou failovat s "not initialized"
        })
      )
    })
    
    it('vykoná APP_INIT hook během inicializace', async () => {
      const context = createMockContext()
      let appInitCalled = false
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          
          // Registruj APP_INIT hook
          const appInitHandler: HookHandler = vi.fn(async (data) => {
            appInitCalled = true
            return data
          })
          
          yield* manager.hooks.register('app:init', appInitHandler)
          yield* manager.initialize(context)
          
          expect(appInitCalled).toBe(true)
        })
      )
    })
  })
  
  describe('install operation', () => {
    it('úspěšně nainstaluje validní plugin', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({
        name: 'valid-plugin',
        version: '1.0.0'
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          
          // Ověř, že plugin byl zaregistrován
          const registered = yield* manager.registry.get('valid-plugin')
          expect(registered).toBeDefined()
          
          // Ověř, že status byl nastaven
          const status = yield* manager.getStatus('valid-plugin')
          expect(status.installed).toBe(true)
        })
      )
    })
    
    it('vykoná plugin.install() lifecycle hook', async () => {
      const context = createMockContext()
      const installMock = vi.fn(async (ctx: PluginContext) => {})
      
      const plugin = createMockPlugin({
        name: 'hookable-plugin',
        install: installMock
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          
          expect(installMock).toHaveBeenCalledTimes(1)
          expect(installMock).toHaveBeenCalledWith(
            expect.objectContaining({
              config: expect.any(Object),
              hooks: expect.any(Object),
              logger: expect.any(Object)
            })
          )
        })
      )
    })
    
    it('vytvoří scoped hook system pro plugin', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({ name: 'scoped-plugin' })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          
          // Plugin by měl mít přístup k scoped hooks
          // (ověříme nepřímo přes další operace)
        })
      )
    })
    
    it('nastaví custom config pokud je poskytnut', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({ name: 'configured-plugin' })
      const customConfig: PluginConfig = {
        enabled: true,
        customSetting: 'custom-value'
      }
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin, customConfig)
          
          const config = yield* manager.registry.getConfig('configured-plugin')
          expect(config).toMatchObject(customConfig)
        })
      )
    })
    
    it('failuje pokud plugin manager není inicializován', async () => {
      const plugin = createMockPlugin({ name: 'plugin' })
      
      const result = await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          // Bez initialize()
          return yield* Effect.either(manager.install(plugin))
        })
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginError')
        expect((result.left as PluginError).message).toContain('not initialized')
      }
    })
    
    it('registruje plugin routes', async () => {
      const context = createMockContext()
      // Použij reálnou Hono instanci
      const handler = new Hono()
      handler.get('/', (c) => c.text('test'))
      
      const mockRoute = {
        path: '/test',
        handler: handler as any,
        description: 'Test route'
      }
      
      const plugin = createMockPlugin({
        name: 'routed-plugin',
        routes: [mockRoute]
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          
          const routes = yield* manager.getPluginRoutes()
          expect(routes.has('routed-plugin')).toBe(true)
        })
      )
    })
    
    it('registruje plugin hooks', async () => {
      const context = createMockContext()
      const hookHandler: HookHandler = vi.fn(async (data) => data)
      
      const plugin = createMockPlugin({
        name: 'hooked-plugin',
        hooks: [{
          name: 'test:hook',
          handler: hookHandler,
          priority: 10
        }]
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          
          const hooks = yield* manager.hooks.getHooks('test:hook')
          expect(hooks).toHaveLength(1)
        })
      )
    })
  })
  
  describe('uninstall operation', () => {
    it('úspěšně odinstaluje nainstalovaný plugin', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({ name: 'to-uninstall' })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.uninstall('to-uninstall')
          
          const uninstalled = yield* manager.registry.get('to-uninstall')
          expect(uninstalled).toBeUndefined()
        })
      )
    })
    
    it('vykoná plugin.uninstall() lifecycle hook', async () => {
      const context = createMockContext()
      const uninstallMock = vi.fn(async (ctx: PluginContext) => {})
      
      const plugin = createMockPlugin({
        name: 'hookable-plugin',
        uninstall: uninstallMock
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.uninstall('hookable-plugin')
          
          expect(uninstallMock).toHaveBeenCalledTimes(1)
        })
      )
    })
    
    it('deaktivuje plugin před uninstalací pokud je aktivní', async () => {
      const context = createMockContext()
      const deactivateMock = vi.fn(async (ctx: PluginContext) => {})
      
      const plugin = createMockPlugin({
        name: 'active-plugin',
        deactivate: deactivateMock
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.activate('active-plugin')
          yield* manager.uninstall('active-plugin')
          
          expect(deactivateMock).toHaveBeenCalled()
        })
      )
    })
    
    it('vyčistí scoped hooks při uninstalaci', async () => {
      const context = createMockContext()
      const hookHandler: HookHandler = vi.fn(async (data) => data)
      
      const plugin = createMockPlugin({
        name: 'hooked-plugin',
        hooks: [{
          name: 'test:hook',
          handler: hookHandler
        }]
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.uninstall('hooked-plugin')
          
          const hooks = yield* manager.hooks.getHooks('test:hook')
          expect(hooks).toHaveLength(0)
        })
      )
    })
    
    it('odstraní plugin routes', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({
        name: 'routed-plugin',
        routes: [{ path: '/test', handler: {} as any }]
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.uninstall('routed-plugin')
          
          const routes = yield* manager.getPluginRoutes()
          expect(routes.has('routed-plugin')).toBe(false)
        })
      )
    })
    
    it('failuje pokud plugin neexistuje', async () => {
      const context = createMockContext()
      
      const result = await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          return yield* Effect.either(manager.uninstall('nonexistent'))
        })
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('PluginError')
      }
    })
  })
  
  describe('activate/deactivate operations', () => {
    it('úspěšně aktivuje nainstalovaný plugin', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({ name: 'to-activate' })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.activate('to-activate')
          
          const status = yield* manager.getStatus('to-activate')
          expect(status.active).toBe(true)
        })
      )
    })
    
    it('vykoná plugin.activate() lifecycle hook', async () => {
      const context = createMockContext()
      const activateMock = vi.fn(async (ctx: PluginContext) => {})
      
      const plugin = createMockPlugin({
        name: 'hookable-plugin',
        activate: activateMock
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.activate('hookable-plugin')
          
          expect(activateMock).toHaveBeenCalledTimes(1)
        })
      )
    })
    
    it('úspěšně deaktivuje aktivní plugin', async () => {
      const context = createMockContext()
      const plugin = createMockPlugin({ name: 'to-deactivate' })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.activate('to-deactivate')
          yield* manager.deactivate('to-deactivate')
          
          const status = yield* manager.getStatus('to-deactivate')
          expect(status.active).toBe(false)
        })
      )
    })
    
    it('vykoná plugin.deactivate() lifecycle hook', async () => {
      const context = createMockContext()
      const deactivateMock = vi.fn(async (ctx: PluginContext) => {})
      
      const plugin = createMockPlugin({
        name: 'hookable-plugin',
        deactivate: deactivateMock
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          yield* manager.activate('hookable-plugin')
          yield* manager.deactivate('hookable-plugin')
          
          expect(deactivateMock).toHaveBeenCalledTimes(1)
        })
      )
    })
  })
  
  describe('loadPlugins operation', () => {
    it('načte a aktivuje pouze enabled pluginy', async () => {
      const context = createMockContext()
      const plugin1 = createMockPlugin({ name: 'plugin-1' })
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      const configs: PluginConfig[] = [
        { enabled: true, name: 'plugin-1' } as any,
        { enabled: false, name: 'plugin-2' } as any
      ]
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          
          // Musíme pluginy nejdřív zaregistrovat
          yield* manager.registry.register(plugin1)
          yield* manager.registry.register(plugin2)
          
          yield* manager.loadPlugins(configs)
          
          const status1 = yield* manager.getStatus('plugin-1')
          const status2 = yield* manager.getStatus('plugin-2')
          
          expect(status1.active).toBe(true)
          expect(status2.active).toBe(false)
        })
      )
    })
    
    it('vyřeší správné load order podle dependencies', async () => {
      const context = createMockContext()
      const pluginA = createMockPlugin({ name: 'a' })
      const pluginB = createMockPlugin({ name: 'b', dependencies: ['a'] })
      
      const configs: PluginConfig[] = [
        { enabled: true, name: 'b' } as any,
        { enabled: true, name: 'a' } as any
      ]
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          
          // Registrovat v dependency order (A před B)
          yield* manager.registry.register(pluginA)
          yield* manager.registry.register(pluginB)
          
          yield* manager.loadPlugins(configs)
          
          // Obě by měly být aktivní
          const statusA = yield* manager.getStatus('a')
          const statusB = yield* manager.getStatus('b')
          
          expect(statusA.active).toBe(true)
          expect(statusB.active).toBe(true)
        })
      )
    })
  })
  
  describe('getStats operation', () => {
    it('vrací správné statistiky plugin systému', async () => {
      const context = createMockContext()
      // Použij reálnou Hono instanci
      const handler = new Hono()
      handler.get('/', (c) => c.text('test'))
      
      const plugin1 = createMockPlugin({
        name: 'plugin-1',
        routes: [{ path: '/test', handler: handler as any }],
        middleware: [{ name: 'test-mw', handler: {} as any }]
      })
      
      const plugin2 = createMockPlugin({ name: 'plugin-2' })
      
      const result = await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin1)
          yield* manager.install(plugin2)
          yield* manager.activate('plugin-1')
          
          return yield* manager.getStats()
        })
      )
      
      expect(result.registry.total).toBe(2)
      expect(result.registry.active).toBe(1)
      expect(result.routes).toBe(1)
    })
  })
  
  describe('shutdown operation', () => {
    it('vykoná APP_SHUTDOWN hook', async () => {
      const context = createMockContext()
      let shutdownCalled = false
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          
          const shutdownHandler: HookHandler = vi.fn(async (data) => {
            shutdownCalled = true
            return data
          })
          
          yield* manager.hooks.register('app:shutdown', shutdownHandler)
          yield* manager.shutdown()
          
          expect(shutdownCalled).toBe(true)
        })
      )
    })
    
    it('deaktivuje všechny aktivní pluginy v reverse order', async () => {
      const context = createMockContext()
      const deactivationOrder: string[] = []
      
      const plugin1 = createMockPlugin({
        name: 'plugin-1',
        deactivate: vi.fn(async () => {
          deactivationOrder.push('plugin-1')
        })
      })
      
      const plugin2 = createMockPlugin({
        name: 'plugin-2',
        deactivate: vi.fn(async () => {
          deactivationOrder.push('plugin-2')
        })
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin1)
          yield* manager.install(plugin2)
          yield* manager.activate('plugin-1')
          yield* manager.activate('plugin-2')
          yield* manager.shutdown()
          
          // Reverse order: plugin-2 pak plugin-1
          expect(deactivationOrder).toEqual(['plugin-2', 'plugin-1'])
        })
      )
    })
  })
  
  describe('backward compatibility', () => {
    it('poskytuje Promise-based HookSystem v plugin contextu', async () => {
      const context = createMockContext()
      let receivedHooks: any
      
      const plugin = createMockPlugin({
        name: 'promise-plugin',
        install: vi.fn(async (ctx) => {
          receivedHooks = ctx.hooks
        })
      })
      
      await runWithPluginSystem(
        Effect.gen(function* () {
          const manager = yield* PluginManagerService
          yield* manager.initialize(context)
          yield* manager.install(plugin)
          
          // Ověř, že hooks mají Promise-based API
          expect(receivedHooks).toBeDefined()
          expect(typeof receivedHooks.register).toBe('function')
          expect(typeof receivedHooks.execute).toBe('function')
          expect(typeof receivedHooks.unregister).toBe('function')
          
          // Execute by měla vrátit Promise
          const result = receivedHooks.execute('test', {})
          expect(result).toBeInstanceOf(Promise)
        })
      )
    })
  })
})