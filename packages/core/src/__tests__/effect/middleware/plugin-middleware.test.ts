import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getActivePlugins, isPluginActive, requireActivePlugin } from '../../../middleware/plugin-middleware'

// Mock D1 Database
const createMockDb = () => {
  const storage = new Map<string, any[]>()
  
  // Initialize plugins table
  storage.set('plugins', [
    { id: 'active-plugin', name: 'active-plugin', display_name: 'Active Plugin', status: 'active' },
    { id: 'inactive-plugin', name: 'inactive-plugin', display_name: 'Inactive Plugin', status: 'inactive' }
  ])

  return {
    prepare: vi.fn((query: string) => {
      const statement = {
        bind: vi.fn((...args: any[]) => {
          return {
            first: vi.fn(async () => {
              if (query.includes('WHERE id = ?')) {
                const id = args[0]
                const plugins = storage.get('plugins') || []
                return plugins.find((p: any) => p.id === id)
              }
              return null
            }),
            all: vi.fn(async () => {
               const plugins = storage.get('plugins') || []
               return { results: plugins }
            }),
            run: vi.fn(async () => { return { success: true } })
          }
        }),
        first: vi.fn(async () => {
            if (query.includes('COUNT')) {
                const plugins = storage.get('plugins') || []
                return { total: plugins.length, active: 1, inactive: 1, errors: 0 }
            }
            return null
        }),
        all: vi.fn(async () => {
            const plugins = storage.get('plugins') || []
            return { results: plugins }
        })
      }
      return statement
    })
  } as any
}

describe('Plugin Middleware', () => {
  let db: any

  beforeEach(() => {
    db = createMockDb()
  })

  it('isPluginActive should return true for active plugin', async () => {
    const result = await isPluginActive(db, 'active-plugin')
    expect(result).toBe(true)
  })

  it('isPluginActive should return false for inactive plugin', async () => {
    const result = await isPluginActive(db, 'inactive-plugin')
    expect(result).toBe(false)
  })

  it('isPluginActive should return false for non-existent plugin', async () => {
    const result = await isPluginActive(db, 'non-existent')
    expect(result).toBe(false)
  })

  it('requireActivePlugin should resolve for active plugin', async () => {
    await expect(requireActivePlugin(db, 'active-plugin')).resolves.not.toThrow()
  })

  it('requireActivePlugin should reject for inactive plugin', async () => {
    await expect(requireActivePlugin(db, 'inactive-plugin')).rejects.toThrow(/is required but is not active/)
  })

  it('getActivePlugins should return only active plugins', async () => {
    const plugins = await getActivePlugins(db)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('active-plugin')
  })
})