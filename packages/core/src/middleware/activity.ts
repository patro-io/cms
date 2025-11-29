import { Effect } from 'effect'
import type { D1Database } from '@cloudflare/workers-types'
import { DatabaseService, makeDatabaseService } from '../services/database-effect'

/**
 * Log user activity
 */
export const logActivity = (
  dbOrService: DatabaseService | D1Database,
  userId: string | undefined,
  action: string,
  resourceType: string | undefined,
  resourceId: string | null | undefined,
  details: string | object | undefined,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> => {
  // Handle both DatabaseService (Effect) and D1Database (Raw)
  const db = 'execute' in dbOrService
    ? (dbOrService as DatabaseService)
    : makeDatabaseService(dbOrService as D1Database)

  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details
  const id = crypto.randomUUID()
  const timestamp = Date.now()

  // TODO: Add ip_address and user_agent to database schema
  const program = db.execute(
    `INSERT INTO activity_logs (id, action, resource_type, resource_id, details, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      action,
      resourceType || 'system',
      resourceId === undefined ? null : resourceId,
      detailsStr === undefined ? null : detailsStr,
      userId === undefined ? null : userId,
      timestamp
    ]
  )

  // Run the effect asynchronously and return a promise
  return Effect.runPromise(
    program.pipe(
      Effect.catchAll((error) => {
        console.error('Failed to log activity:', error)
        return Effect.succeed(undefined) // Don't fail the request if logging fails
      }),
      Effect.map(() => undefined)
    )
  )
}