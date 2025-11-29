import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { PluginService, PluginServiceLive } from '../../../services/plugin-service'
import { DatabaseService } from '../../../services/database-effect'

describe('PluginService', () => {
  let mockDb: any
  let TestLayer: Layer.Layer<PluginService>

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockReturnValue(Effect.succeed([])),
      queryFirst: vi.fn().mockReturnValue(Effect.succeed(null)),
      execute: vi.fn().mockReturnValue(Effect.succeed({ success: true, changes: 1 }))
    }

    const MockDatabaseLayer = Layer.succeed(DatabaseService, mockDb)
    TestLayer = PluginServiceLive.pipe(Layer.provide(MockDatabaseLayer))
  })

  describe('getAllPlugins', () => {
    it('should fetch all plugins', async () => {
      const mockPlugins = [
        { id: '1', name: 'test-plugin', display_name: 'Test Plugin', is_core: 0 }
      ]
      mockDb.query.mockReturnValue(Effect.succeed(mockPlugins))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        const result = yield* service.getAllPlugins()
        expect(result).toHaveLength(1)
        expect(result[0]?.name).toBe('test-plugin')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should handle database errors', async () => {
      mockDb.query.mockReturnValue(Effect.fail(new Error('DB error')))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.getAllPlugins()
      })

      await expect(Effect.runPromise(program.pipe(Effect.provide(TestLayer)))).rejects.toThrow()
    })
  })

  describe('getPlugin', () => {
    it('should fetch a single plugin by id', async () => {
      const mockPlugin = { id: '1', name: 'test-plugin', display_name: 'Test', is_core: 0 }
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockPlugin))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        const result = yield* service.getPlugin('1')
        expect(result).not.toBeNull()
        expect(result?.id).toBe('1')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should return null for non-existent plugin', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        const result = yield* service.getPlugin('non-existent')
        expect(result).toBeNull()
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('getPluginStats', () => {
    it('should return plugin statistics', async () => {
      const mockStats = { total: 5, active: 3, inactive: 2, errors: 0 }
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockStats))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        const result = yield* service.getPluginStats()
        expect(result.total).toBe(5)
        expect(result.active).toBe(3)
        expect(result.inactive).toBe(2)
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('installPlugin', () => {
    it('should install a new plugin', async () => {
      const pluginData = {
        name: 'new-plugin',
        display_name: 'New Plugin',
        version: '1.0.0'
      }

      mockDb.execute.mockReturnValue(Effect.succeed({ success: true }))
      mockDb.queryFirst.mockReturnValue(Effect.succeed({
        id: 'plugin-123',
        ...pluginData,
        is_core: 0
      }))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        const result = yield* service.installPlugin(pluginData)
        expect(result.name).toBe('new-plugin')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('activatePlugin', () => {
    it('should activate a plugin', async () => {
      const mockPlugin = {
        id: '1',
        name: 'test-plugin',
        display_name: 'Test',
        is_core: 0,
        dependencies: '[]',
        settings: '{}',
        permissions: '[]'
      }
      
      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockPlugin))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true }))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.activatePlugin('1')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail if plugin not found', async () => {
      mockDb.queryFirst.mockReturnValue(Effect.succeed(null))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.activatePlugin('non-existent')
      })

      await expect(Effect.runPromise(program.pipe(Effect.provide(TestLayer)))).rejects.toThrow()
    })
  })

  describe('deactivatePlugin', () => {
    it('should deactivate a plugin', async () => {
      const mockPlugin = { 
        id: '1', 
        name: 'test-plugin',
        display_name: 'Test',
        is_core: 0
      }
      
      // Mock sequence: getPlugin -> checkDependents -> execute update -> log
      mockDb.queryFirst.mockReturnValueOnce(Effect.succeed(mockPlugin)) // getPlugin
      mockDb.query.mockReturnValueOnce(Effect.succeed([])) // checkDependents
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true })) // update & log

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.deactivatePlugin('1')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('updatePluginSettings', () => {
    it('should update plugin settings', async () => {
      const mockPlugin = { id: '1', name: 'test', is_core: 0 }
      const newSettings = { theme: 'dark' }

      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockPlugin))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true }))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.updatePluginSettings('1', newSettings)
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })

  describe('uninstallPlugin', () => {
    it('should uninstall a non-core plugin', async () => {
      const mockPlugin = { 
        id: '1', 
        name: 'test-plugin',
        is_core: 0,
        status: 'inactive'
      }

      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockPlugin))
      mockDb.execute.mockReturnValue(Effect.succeed({ success: true }))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.uninstallPlugin('1')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })

    it('should fail to uninstall core plugin', async () => {
      const mockPlugin = { id: '1', name: 'core-plugin', is_core: 1, status: 'active' }

      mockDb.queryFirst.mockReturnValue(Effect.succeed(mockPlugin))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        yield* service.uninstallPlugin('1')
      })

      await expect(Effect.runPromise(program.pipe(Effect.provide(TestLayer)))).rejects.toThrow()
    })
  })

  describe('getPluginActivity', () => {
    it('should fetch plugin activity log', async () => {
      const mockActivity = [
        { id: '1', action: 'activated', plugin_id: '1', timestamp: Date.now() }
      ]

      mockDb.query.mockReturnValue(Effect.succeed(mockActivity))

      const program = Effect.gen(function* () {
        const service = yield* PluginService
        const result = yield* service.getPluginActivity('1', 10)
        expect(result).toHaveLength(1)
        expect(result[0].action).toBe('activated')
      })

      await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
    })
  })
})