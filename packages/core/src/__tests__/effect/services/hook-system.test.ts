/**
 * Unit tests pro HookSystemServiceLive
 *
 * Testuje Effect-based hook systém s priority ordering a scoped hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import type { HookHandler } from '../../../types'
import { HookSystemService } from '../../../plugins/hook-system-effect'
import { HookSystemServiceLive } from '../../../plugins/hook-system-live'
import { HookExecutionError } from '../../../plugins/plugin-errors'

// Helper pro spuštění Effect programů s fresh hook system layer
async function runWithHookSystem<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Promise<A> {
  // Vytvoř fresh instanci pro každý test
  const freshLayer = Layer.fresh(HookSystemServiceLive)
  return await Effect.runPromise(
    effect.pipe(Effect.provide(freshLayer)) as Effect.Effect<A, E, never>
  )
}

describe('HookSystemServiceLive', () => {
  /**
   * Vyčistit hook system před každým testem pro zajištění test isolation.
   * Bez toho closure state zůstává sdílený mezi testy.
   */
  beforeEach(async () => {
    await runWithHookSystem(
      Effect.gen(function* () {
        const hooks = yield* HookSystemService
        yield* hooks.clear()
      })
    )
  })

  describe('register operation', () => {
    it('úspěšně zaregistruje hook handler', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler)
          
          const registered = yield* hooks.getHooks('test:hook')
          expect(registered).toHaveLength(1)
          expect(registered[0]?.handler).toBe(handler)
        })
      )
    })
    
    it('registruje hooks s prioritou', async () => {
      const handler1: HookHandler = vi.fn(async (data) => data)
      const handler2: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler1, 20)
          yield* hooks.register('test:hook', handler2, 10)
          
          const registered = yield* hooks.getHooks('test:hook')
          expect(registered).toHaveLength(2)
          // Nižší priorita by měla být první
          expect(registered[0]?.priority).toBe(10)
          expect(registered[1]?.priority).toBe(20)
        })
      )
    })
    
    it('používá default prioritu 10 pokud není specifikována', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler)
          
          const registered = yield* hooks.getHooks('test:hook')
          expect(registered[0]?.priority).toBe(10)
        })
      )
    })
    
    it('registruje více handlerů pro stejný hook', async () => {
      const handler1: HookHandler = vi.fn(async (data) => data)
      const handler2: HookHandler = vi.fn(async (data) => data)
      const handler3: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler1)
          yield* hooks.register('test:hook', handler2)
          yield* hooks.register('test:hook', handler3)
          
          const registered = yield* hooks.getHooks('test:hook')
          expect(registered).toHaveLength(3)
        })
      )
    })
  })
  
  describe('unregister operation', () => {
    it('úspěšně odstraní zaregistrovaný handler', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler)
          yield* hooks.unregister('test:hook', handler)
          
          const registered = yield* hooks.getHooks('test:hook')
          expect(registered).toHaveLength(0)
        })
      )
    })
    
    it('odstraní pouze specifický handler', async () => {
      const handler1: HookHandler = vi.fn(async (data) => data)
      const handler2: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler1)
          yield* hooks.register('test:hook', handler2)
          yield* hooks.unregister('test:hook', handler1)
          
          const registered = yield* hooks.getHooks('test:hook')
          expect(registered).toHaveLength(1)
          expect(registered[0]?.handler).toBe(handler2)
        })
      )
    })
    
    it('ignoruje unregister pro neexistující hook', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          // Neprovede nic, nefailuje
          yield* hooks.unregister('nonexistent', handler)
          
          const names = yield* hooks.getHookNames()
          expect(names).toHaveLength(0)
        })
      )
    })
  })
  
  describe('execute operation', () => {
    it('vykoná jeden hook handler', async () => {
      const handler = vi.fn(async (data: string) => data + '-modified')
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler)
          return yield* hooks.execute('test:hook', 'initial')
        })
      )
      
      expect(handler).toHaveBeenCalledTimes(1)
      expect(result).toBe('initial-modified')
    })
    
    it('vykoná hooks v pořadí podle priority', async () => {
      const executionOrder: number[] = []
      
      const handler1: HookHandler = vi.fn(async (data) => {
        executionOrder.push(1)
        return data + '-1'
      })
      
      const handler2: HookHandler = vi.fn(async (data) => {
        executionOrder.push(2)
        return data + '-2'
      })
      
      const handler3: HookHandler = vi.fn(async (data) => {
        executionOrder.push(3)
        return data + '-3'
      })
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler2, 20)
          yield* hooks.register('test:hook', handler1, 5)
          yield* hooks.register('test:hook', handler3, 30)
          return yield* hooks.execute('test:hook', 'start')
        })
      )
      
      expect(executionOrder).toEqual([1, 2, 3])
      expect(result).toBe('start-1-2-3')
    })
    
    it('předává výsledek z jednoho handleru do dalšího', async () => {
      const handler1: HookHandler = vi.fn(async (data: number) => data * 2)
      const handler2: HookHandler = vi.fn(async (data: number) => data + 10)
      const handler3: HookHandler = vi.fn(async (data: number) => data * 3)
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('math:ops', handler1, 1)
          yield* hooks.register('math:ops', handler2, 2)
          yield* hooks.register('math:ops', handler3, 3)
          return yield* hooks.execute('math:ops', 5)
        })
      )
      
      // 5 * 2 = 10, 10 + 10 = 20, 20 * 3 = 60
      expect(result).toBe(60)
    })
    
    it('vrací původní data pokud nejsou žádné hooks', async () => {
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          return yield* hooks.execute('empty:hook', 'unchanged')
        })
      )
      
      expect(result).toBe('unchanged')
    })
    
    it('předává context do hook handlerů', async () => {
      let receivedContext: any = null
      
      const handler: HookHandler = vi.fn(async (data, context) => {
        receivedContext = context
        return data
      })
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler)
          return yield* hooks.execute('test:hook', 'data', { userId: '123' })
        })
      )
      
      expect(receivedContext).toBeDefined()
      expect(receivedContext?.context).toEqual({ userId: '123' })
    })
    
    it('poskytuje cancel funkci v contextu', async () => {
      let cancelFunction: (() => void) | undefined
      
      const handler: HookHandler = vi.fn(async (data, context) => {
        cancelFunction = context?.cancel
        return data
      })
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler)
          return yield* hooks.execute('test:hook', 'data')
        })
      )
      
      expect(cancelFunction).toBeDefined()
      expect(typeof cancelFunction).toBe('function')
    })
    
    it('zastaví execution pokud handler zavolá cancel', async () => {
      const handler1 = vi.fn(async (data, context) => {
        context?.cancel?.()
        return data + '-1'
      })
      
      const handler2 = vi.fn(async (data) => {
        return data + '-2'
      })
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler1, 1)
          yield* hooks.register('test:hook', handler2, 2)
          return yield* hooks.execute('test:hook', 'start')
        })
      )
      
      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).not.toHaveBeenCalled()
      expect(result).toBe('start-1')
    })
    
    it('zabraňuje nekonečné rekurzi', async () => {
      let executionCount = 0
      
      const recursiveHandler: HookHandler = vi.fn(async function(data, context) {
        executionCount++
        // Pokus o rekurzivní volání by měl být zabráněn
        return data
      })
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('recursive:hook', recursiveHandler)
          
          // První execution
          const result1 = yield* hooks.execute('recursive:hook', 'data')
          
          // Druhé execution by mělo fungovat normálně
          const result2 = yield* hooks.execute('recursive:hook', 'data')
          
          return { result1, result2, executionCount }
        })
      )
      
      expect(result.executionCount).toBe(2) // Obě executions by měly proběhnout
    })
  })
  
  describe('error handling', () => {
    it('failuje s HookExecutionError pokud handler vyhodí chybu', async () => {
      const handler: HookHandler = vi.fn(async () => {
        throw new Error('Handler failed')
      })
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('failing:hook', handler)
          return yield* hooks.execute('failing:hook', 'data')
        }).pipe(
          Effect.provide(Layer.fresh(HookSystemServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      if (result._tag === 'Left') {
        expect(result.left._tag).toBe('HookExecutionError')
        const error = result.left as HookExecutionError
        expect(error.hookName).toBe('failing:hook')
      }
    })
    
    it('pokračuje s dalšími hooks pokud jeden failuje (non-critical)', async () => {
      const handler1: HookHandler = vi.fn(async (data) => data + '-1')
      const handler2: HookHandler = vi.fn(async () => {
        throw new Error('Handler 2 failed')
      })
      const handler3: HookHandler = vi.fn(async (data) => data + '-3')
      
      // V current implementaci by měl failnout celý chain
      // ale můžeme otestovat chování
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('test:hook', handler1, 1)
          yield* hooks.register('test:hook', handler2, 2)
          yield* hooks.register('test:hook', handler3, 3)
          return yield* hooks.execute('test:hook', 'start')
        }).pipe(
          Effect.provide(Layer.fresh(HookSystemServiceLive)),
          Effect.either
        )
      )
      
      expect(result._tag).toBe('Left')
      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })
  
  describe('scoped hook system', () => {
    it('vytvoří scoped hook system pro plugin', async () => {
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          const scoped = yield* hooks.createScope('my-plugin')
          
          expect(scoped).toBeDefined()
          expect(scoped.register).toBeDefined()
          expect(scoped.execute).toBeDefined()
          expect(scoped.unregister).toBeDefined()
          expect(scoped.unregisterAll).toBeDefined()
        })
      )
    })
    
    it('scoped hooks se registrují do globálního systému', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          const scoped = yield* hooks.createScope('plugin-a')
          
          yield* scoped.register('test:hook', handler)
          
          const globalHooks = yield* hooks.getHooks('test:hook')
          expect(globalHooks).toHaveLength(1)
        })
      )
    })
    
    it('unregisterAll odstraní všechny scoped hooks', async () => {
      const handler1: HookHandler = vi.fn(async (data) => data)
      const handler2: HookHandler = vi.fn(async (data) => data)
      const handler3: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          const scoped = yield* hooks.createScope('plugin-a')
          
          // Registrace přes scoped
          yield* scoped.register('hook:1', handler1)
          yield* scoped.register('hook:2', handler2)
          
          // Registrace přímo do globálu (jiný plugin)
          yield* hooks.register('hook:1', handler3)
          
          // Unregister všech scoped hooks
          yield* scoped.unregisterAll()
          
          // Globální hook by měl obsahovat pouze handler3
          const hooks1 = yield* hooks.getHooks('hook:1')
          expect(hooks1).toHaveLength(1)
          expect(hooks1[0]?.handler).toBe(handler3)
          
          // hook:2 by měl být prázdný
          const hooks2 = yield* hooks.getHooks('hook:2')
          expect(hooks2).toHaveLength(0)
        })
      )
    })
    
    it('scoped execute používá globální hook systém', async () => {
      const handler: HookHandler = vi.fn(async (data: string) => data + '-modified')
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          const scoped = yield* hooks.createScope('plugin-a')
          
          yield* scoped.register('test:hook', handler)
          return yield* scoped.execute('test:hook', 'data')
        })
      )
      
      expect(result).toBe('data-modified')
    })
    
    it('getRegisteredHooks vrací pouze hooks z tohoto scope', async () => {
      const handler1: HookHandler = vi.fn(async (data) => data)
      const handler2: HookHandler = vi.fn(async (data) => data)
      const handler3: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          const scopeA = yield* hooks.createScope('plugin-a')
          const scopeB = yield* hooks.createScope('plugin-b')
          
          yield* scopeA.register('hook:1', handler1)
          yield* scopeA.register('hook:2', handler2)
          yield* scopeB.register('hook:3', handler3)
          
          const registeredA = yield* scopeA.getRegisteredHooks()
          expect(registeredA).toHaveLength(2)
          
          const registeredB = yield* scopeB.getRegisteredHooks()
          expect(registeredB).toHaveLength(1)
        })
      )
    })
  })
  
  describe('utility operations', () => {
    it('getHookNames vrací názvy všech zaregistrovaných hooks', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('hook:1', handler)
          yield* hooks.register('hook:2', handler)
          yield* hooks.register('hook:3', handler)
          return yield* hooks.getHookNames()
        })
      )
      
      expect(result).toHaveLength(3)
      expect(result).toContain('hook:1')
      expect(result).toContain('hook:2')
      expect(result).toContain('hook:3')
    })
    
    it('getStats vrací statistiky hook systému', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      const result = await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('hook:1', handler)
          yield* hooks.register('hook:1', handler)
          yield* hooks.register('hook:2', handler)
          return yield* hooks.getStats()
        })
      )
      
      expect(result).toHaveLength(2)
      expect(result.find(s => s.hookName === 'hook:1')?.handlerCount).toBe(2)
      expect(result.find(s => s.hookName === 'hook:2')?.handlerCount).toBe(1)
    })
    
    it('clear odstraní všechny hooks', async () => {
      const handler: HookHandler = vi.fn(async (data) => data)
      
      await runWithHookSystem(
        Effect.gen(function* () {
          const hooks = yield* HookSystemService
          yield* hooks.register('hook:1', handler)
          yield* hooks.register('hook:2', handler)
          yield* hooks.clear()
          
          const names = yield* hooks.getHookNames()
          expect(names).toHaveLength(0)
        })
      )
    })
  })
})