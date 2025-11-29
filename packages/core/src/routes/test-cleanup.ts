/**
 * Test Cleanup Routes
 *
 * Provides endpoints to clean up test data after e2e tests
 * WARNING: These endpoints should only be available in development/test environments
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { Effect } from 'effect'
import { DatabaseService, makeDatabaseLayer } from '../services/database-effect'

const app = new Hono()

/**
 * Clean up all test data (collections, content, users except admin)
 * POST /test-cleanup
 */
app.post('/test-cleanup', (c: Context) => {
  const db = c.env.DB

  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    let deletedCount = 0

    // Step 1: Delete child data for test content
    yield* dbService.execute(`
      DELETE FROM content_versions
      WHERE content_id IN (
        SELECT id FROM content
        WHERE title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%'
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(`
      DELETE FROM workflow_history
      WHERE content_id IN (
        SELECT id FROM content
        WHERE title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%'
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(`
      DELETE FROM content_data
      WHERE content_id IN (
        SELECT id FROM content
        WHERE title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%'
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    // Step 2: Delete test content
    const contentResult = yield* dbService.execute(`
      DELETE FROM content
      WHERE title LIKE 'Test %' OR title LIKE '%E2E%' OR title LIKE '%Playwright%' OR title LIKE '%Sample%'
    `, [])
    deletedCount += contentResult.changes || 0

    // Step 3: Delete child data for test users
    yield* dbService.execute(`
      DELETE FROM api_tokens
      WHERE user_id IN (
        SELECT id FROM users
        WHERE email != 'admin@patro.io' AND (email LIKE '%test%' OR email LIKE '%example.com%')
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(`
      DELETE FROM media
      WHERE uploaded_by IN (
        SELECT id FROM users
        WHERE email != 'admin@patro.io' AND (email LIKE '%test%' OR email LIKE '%example.com%')
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    // Step 4: Delete test users
    const usersResult = yield* dbService.execute(`
      DELETE FROM users
      WHERE email != 'admin@patro.io' AND (email LIKE '%test%' OR email LIKE '%example.com%')
    `, [])
    deletedCount += usersResult.changes || 0

    // Step 5: Delete child data for test collections
    yield* dbService.execute(`
      DELETE FROM collection_fields
      WHERE collection_id IN (
        SELECT id FROM collections
        WHERE name LIKE 'test_%' OR name IN ('blog_posts', 'test_collection', 'products', 'articles')
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(`
      DELETE FROM content
      WHERE collection_id IN (
        SELECT id FROM collections
        WHERE name LIKE 'test_%' OR name IN ('blog_posts', 'test_collection', 'products', 'articles')
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    // Step 6: Delete test collections
    const collectionsResult = yield* dbService.execute(`
      DELETE FROM collections
      WHERE name LIKE 'test_%' OR name IN ('blog_posts', 'test_collection', 'products', 'articles')
    `, [])
    deletedCount += collectionsResult.changes || 0

    // Step 7: Clean up orphaned data
    yield* dbService.execute(
      `DELETE FROM content_data WHERE content_id NOT IN (SELECT id FROM content)`, []
    ).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(
      `DELETE FROM collection_fields WHERE collection_id NOT IN (SELECT id FROM collections)`, []
    ).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(
      `DELETE FROM content_versions WHERE content_id NOT IN (SELECT id FROM content)`, []
    ).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    yield* dbService.execute(
      `DELETE FROM workflow_history WHERE content_id NOT IN (SELECT id FROM content)`, []
    ).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    // Step 8: Delete old activity logs
    yield* dbService.execute(`
      DELETE FROM activity_logs
      WHERE id NOT IN (
        SELECT id FROM activity_logs
        ORDER BY created_at DESC
        LIMIT 100
      )
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    return c.json({
      success: true,
      deletedCount,
      message: 'Test data cleaned up successfully'
    })
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(db)),
      Effect.catchAll((error) => {
        console.error('Test cleanup error:', error)
        return Effect.succeed(c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500))
      })
    )
  )
})

app.post('/test-cleanup/users', (c: Context) => {
  const db = c.env.DB

  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const result = yield* dbService.execute(`
      DELETE FROM users
      WHERE email != 'admin@patro.io'
      AND (
        email LIKE '%test%'
        OR email LIKE '%example.com%'
        OR first_name = 'Test'
      )
    `, [])

    return c.json({
      success: true,
      deletedCount: result.changes || 0,
      message: 'Test users cleaned up successfully'
    })
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(db)),
      Effect.catchAll((error) => {
        console.error('User cleanup error:', error)
        return Effect.succeed(c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500))
      })
    )
  )
})

app.post('/test-cleanup/collections', (c: Context) => {
  const db = c.env.DB

  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    let deletedCount = 0

    const collections = yield* dbService.query<{ id: string }>(`
      SELECT id FROM collections
      WHERE name LIKE 'test_%'
      OR name IN ('blog_posts', 'test_collection', 'products', 'articles')
    `, [])

    if (collections && collections.length > 0) {
      const collectionIds = collections.map((c: any) => c.id)

      for (const id of collectionIds) {
        yield* dbService.execute('DELETE FROM collection_fields WHERE collection_id = ?', [id])
          .pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
      }

      for (const id of collectionIds) {
        yield* dbService.execute('DELETE FROM content WHERE collection_id = ?', [id])
          .pipe(
            Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
            Effect.catchAll(() => Effect.succeed(undefined))
          )
      }

      const result = yield* dbService.execute(`
        DELETE FROM collections
        WHERE id IN (${collectionIds.map(() => '?').join(',')})
      `, collectionIds)

      deletedCount = result.changes || 0
    }

    return c.json({
      success: true,
      deletedCount,
      message: 'Test collections cleaned up successfully'
    })
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(db)),
      Effect.catchAll((error) => {
        console.error('Collection cleanup error:', error)
        return Effect.succeed(c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500))
      })
    )
  )
})

app.post('/test-cleanup/content', (c: Context) => {
  const db = c.env.DB

  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'Cleanup endpoint not available in production' }, 403)
  }

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    
    const result = yield* dbService.execute(`
      DELETE FROM content
      WHERE title LIKE 'Test %'
      OR title LIKE '%E2E%'
      OR title LIKE '%Playwright%'
      OR title LIKE '%Sample%'
    `, [])

    yield* dbService.execute(`
      DELETE FROM content_data
      WHERE content_id NOT IN (SELECT id FROM content)
    `, []).pipe(
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v test-cleanup", e)),
      Effect.catchAll(() => Effect.succeed(undefined))
    )

    return c.json({
      success: true,
      deletedCount: result.changes || 0,
      message: 'Test content cleaned up successfully'
    })
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(db)),
      Effect.catchAll((error) => {
        console.error('Content cleanup error:', error)
        return Effect.succeed(c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500))
      })
    )
  )
})

export default app
