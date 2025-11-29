/**
 * User Service - Pure Effect Implementation
 * 
 * Handles user management, roles, and authentication operations
 */

import { Context, Effect, Layer } from 'effect'
import { DatabaseService, DatabaseError, NotFoundError } from './database-effect'

/**
 * User types and interfaces
 */
export interface User {
  id: string
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  bio: string | null
  avatar_url: string | null
  password_hash: string
  role: string
  is_active: number
  email_verified: number
  two_factor_enabled: number
  timezone: string | null
  language: string | null
  theme: string | null
  email_notifications: number
  invitation_token: string | null
  invited_by: string | null
  invited_at: number | null
  created_at: number
  updated_at: number
  last_login_at: number | null
}

export interface CreateUserInput {
  email: string
  username?: string
  first_name?: string
  last_name?: string
  phone?: string
  bio?: string
  password_hash: string
  role?: string
  is_active?: boolean
  email_verified?: boolean
}

export interface UpdateUserInput {
  email?: string
  username?: string
  first_name?: string
  last_name?: string
  phone?: string
  bio?: string
  role?: string
  is_active?: boolean
  email_verified?: boolean
  timezone?: string
  language?: string | null
  theme?: string
  email_notifications?: boolean
  avatar_url?: string
}

export interface UserQueryOptions {
  search?: string
  role?: string
  is_active?: boolean
  limit?: number
  offset?: number
}

/**
 * User Service Error types
 */
export class UserNotFoundError {
  readonly _tag = 'UserNotFoundError'
  constructor(readonly message: string = 'User not found') {}
}

export class UserAlreadyExistsError {
  readonly _tag = 'UserAlreadyExistsError'
  constructor(readonly message: string = 'User already exists') {}
}

export class UserValidationError {
  readonly _tag = 'UserValidationError'
  constructor(readonly message: string, readonly errors: string[]) {}
}

export class UnauthorizedError {
  readonly _tag = 'UnauthorizedError'
  constructor(readonly message: string = 'Unauthorized action') {}
}

/**
 * User Service Interface - Closed Service Pattern
 * No DatabaseService in requirements - dependencies resolved in Layer
 */
export interface UserService {
  /**
   * Get user by ID
   */
  readonly getUserById: (
    id: string
  ) => Effect.Effect<User, UserNotFoundError | DatabaseError>

  /**
   * Get user by email
   */
  readonly getUserByEmail: (
    email: string
  ) => Effect.Effect<User, UserNotFoundError | DatabaseError>

  /**
   * Get user by username
   */
  readonly getUserByUsername: (
    username: string
  ) => Effect.Effect<User, UserNotFoundError | DatabaseError>

  /**
   * Query users with filters
   */
  readonly queryUsers: (
    options: UserQueryOptions
  ) => Effect.Effect<User[], DatabaseError>

  /**
   * Count users with filters
   */
  readonly countUsers: (
    options: Omit<UserQueryOptions, 'limit' | 'offset'>
  ) => Effect.Effect<number, DatabaseError>

  /**
   * Create new user
   */
  readonly createUser: (
    input: CreateUserInput
  ) => Effect.Effect<
    User,
    UserAlreadyExistsError | UserValidationError | DatabaseError
  >

  /**
   * Update user
   */
  readonly updateUser: (
    id: string,
    input: UpdateUserInput
  ) => Effect.Effect<
    User,
    UserNotFoundError | UserAlreadyExistsError | UserValidationError | DatabaseError
  >

  /**
   * Delete user (soft delete by default)
   */
  readonly deleteUser: (
    id: string,
    hardDelete?: boolean
  ) => Effect.Effect<void, UserNotFoundError | DatabaseError>

  /**
   * Toggle user active status
   */
  readonly toggleUserStatus: (
    id: string,
    active: boolean
  ) => Effect.Effect<User, UserNotFoundError | DatabaseError>

  /**
   * Update user password
   */
  readonly updatePassword: (
    id: string,
    newPasswordHash: string
  ) => Effect.Effect<void, UserNotFoundError | DatabaseError>

  /**
   * Create user invitation
   */
  readonly createInvitation: (
    email: string,
    firstName: string,
    lastName: string,
    role: string,
    invitedBy: string
  ) => Effect.Effect<
    { userId: string; token: string },
    UserAlreadyExistsError | DatabaseError
  >

  /**
   * Resend invitation
   */
  readonly resendInvitation: (
    userId: string
  ) => Effect.Effect<string, UserNotFoundError | DatabaseError>

  /**
   * Cancel invitation
   */
  readonly cancelInvitation: (
    userId: string
  ) => Effect.Effect<void, UserNotFoundError | DatabaseError>

  /**
   * Check if user can be deleted (prevent self-deletion)
   */
  readonly canDeleteUser: (
    userId: string,
    currentUserId: string
  ) => Effect.Effect<boolean, never>
}

/**
 * User Service Tag
 */
export const UserService = Context.GenericTag<UserService>('@services/UserService')

/**
 * User Service Live Implementation - Closed Service Pattern
 * Dependencies (DatabaseService) are resolved at Layer creation time
 */
export const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* (_) {
    // Get DatabaseService once at Layer creation time
    const db = yield* DatabaseService
    
    // Return service implementation with db in closure
    return {
      getUserById: (id: string) =>
        Effect.gen(function* (_) {
          const user = yield* 
            db.queryFirst<User>(
              'SELECT * FROM users WHERE id = ?',
              [id]
            )
          

          if (!user) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          return user
        }),

      getUserByEmail: (email: string) =>
        Effect.gen(function* (_) {
          const user = yield* 
            db.queryFirst<User>(
              'SELECT * FROM users WHERE email = ?',
              [email.toLowerCase()]
            )
          

          if (!user) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          return user
        }),

      getUserByUsername: (username: string) =>
        Effect.gen(function* (_) {
          const user = yield* 
            db.queryFirst<User>(
              'SELECT * FROM users WHERE username = ?',
              [username]
            )
          

          if (!user) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          return user
        }),

      queryUsers: (options: UserQueryOptions) =>
        Effect.gen(function* (_) {
          let whereClause = 'WHERE 1=1'
          const params: any[] = []

          if (options.is_active !== undefined) {
            whereClause += ' AND is_active = ?'
            params.push(options.is_active ? 1 : 0)
          }

          if (options.search) {
            whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR username LIKE ?)'
            const searchParam = `%${options.search}%`
            params.push(searchParam, searchParam, searchParam, searchParam)
          }

          if (options.role) {
            whereClause += ' AND role = ?'
            params.push(options.role)
          }

          const limit = options.limit || 20
          const offset = options.offset || 0

          const users = yield* 
            db.query<User>(
              `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
              [...params, limit, offset]
            )
          

          return users
        }),

      countUsers: (options: Omit<UserQueryOptions, 'limit' | 'offset'>) =>
        Effect.gen(function* (_) {
          let whereClause = 'WHERE 1=1'
          const params: any[] = []

          if (options.is_active !== undefined) {
            whereClause += ' AND is_active = ?'
            params.push(options.is_active ? 1 : 0)
          }

          if (options.search) {
            whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR username LIKE ?)'
            const searchParam = `%${options.search}%`
            params.push(searchParam, searchParam, searchParam, searchParam)
          }

          if (options.role) {
            whereClause += ' AND role = ?'
            params.push(options.role)
          }

          const result = yield* 
            db.queryFirst<{ count: number }>(
              `SELECT COUNT(*) as count FROM users ${whereClause}`,
              params
            )
          

          return result?.count || 0
        }),

      createUser: (input: CreateUserInput) =>
        Effect.gen(function* (_) {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(input.email)) {
            return yield* 
              Effect.fail(
                new UserValidationError('Invalid email format', ['email'])
              )
            
          }

          // Check if user already exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM users WHERE email = ? OR username = ?',
              [input.email.toLowerCase(), input.username || '']
            )
          

          if (existing) {
            return yield* 
              Effect.fail(new UserAlreadyExistsError('Email or username already exists'))
            
          }

          // Create user
          const userId = crypto.randomUUID()
          const now = Date.now()

          yield* 
            db.execute(
              `INSERT INTO users (
                id, email, username, first_name, last_name, phone, bio,
                password_hash, role, is_active, email_verified,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId,
                input.email.toLowerCase(),
                input.username || null,
                input.first_name || null,
                input.last_name || null,
                input.phone || null,
                input.bio || null,
                input.password_hash,
                input.role || 'viewer',
                input.is_active !== false ? 1 : 0,
                input.email_verified ? 1 : 0,
                now,
                now
              ]
            )
          

          // Fetch and return created user
          const user = yield* 
            db.queryFirst<User>(
              'SELECT * FROM users WHERE id = ?',
              [userId]
            )
          

          if (!user) {
            return yield* Effect.fail(new DatabaseError({ message: 'Failed to create user' }))
          }

          return user
        }),

      updateUser: (id: string, input: UpdateUserInput) =>
        Effect.gen(function* (_) {
          // Check if user exists
          const existing = yield* 
            db.queryFirst<User>('SELECT * FROM users WHERE id = ?', [id])
          

          if (!existing) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          // Validate email if provided
          if (input.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(input.email)) {
              return yield* 
                Effect.fail(
                  new UserValidationError('Invalid email format', ['email'])
                )
              
            }

            // Check if email/username taken by another user
            const duplicate = yield* 
              db.queryFirst<{ id: string }>(
                'SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?',
                [input.email.toLowerCase(), input.username || '', id]
              )
            

            if (duplicate) {
              return yield* 
                Effect.fail(new UserAlreadyExistsError('Email or username already taken'))
              
            }
          }

          // Build update query dynamically
          const updates: string[] = []
          const params: any[] = []

          if (input.email !== undefined) {
            updates.push('email = ?')
            params.push(input.email.toLowerCase())
          }
          if (input.username !== undefined) {
            updates.push('username = ?')
            params.push(input.username)
          }
          if (input.first_name !== undefined) {
            updates.push('first_name = ?')
            params.push(input.first_name)
          }
          if (input.last_name !== undefined) {
            updates.push('last_name = ?')
            params.push(input.last_name)
          }
          if (input.phone !== undefined) {
            updates.push('phone = ?')
            params.push(input.phone)
          }
          if (input.bio !== undefined) {
            updates.push('bio = ?')
            params.push(input.bio)
          }
          if (input.role !== undefined) {
            updates.push('role = ?')
            params.push(input.role)
          }
          if (input.is_active !== undefined) {
            updates.push('is_active = ?')
            params.push(input.is_active ? 1 : 0)
          }
          if (input.email_verified !== undefined) {
            updates.push('email_verified = ?')
            params.push(input.email_verified ? 1 : 0)
          }
          if (input.timezone !== undefined) {
            updates.push('timezone = ?')
            params.push(input.timezone)
          }
          if (input.language !== undefined) {
            updates.push('language = ?')
            params.push(input.language)
          }
          if (input.theme !== undefined) {
            updates.push('theme = ?')
            params.push(input.theme)
          }
          if (input.email_notifications !== undefined) {
            updates.push('email_notifications = ?')
            params.push(input.email_notifications ? 1 : 0)
          }
          if (input.avatar_url !== undefined) {
            updates.push('avatar_url = ?')
            params.push(input.avatar_url)
          }

          updates.push('updated_at = ?')
          params.push(Date.now())
          params.push(id)

          yield* 
            db.execute(
              `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
              params
            )
          

          // Fetch and return updated user
          const user = yield* 
            db.queryFirst<User>('SELECT * FROM users WHERE id = ?', [id])
          

          if (!user) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          return user
        }),

      deleteUser: (id: string, hardDelete: boolean = false) =>
        Effect.gen(function* (_) {
          // Check if user exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM users WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          if (hardDelete) {
            // Hard delete - permanently remove
            yield* db.execute('DELETE FROM users WHERE id = ?', [id])
          } else {
            // Soft delete - deactivate
            yield* 
              db.execute(
                'UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?',
                [Date.now(), id]
              )
            
          }

          return yield* Effect.void
        }),

      toggleUserStatus: (id: string, active: boolean) =>
        Effect.gen(function* (_) {
          // Check if user exists
          const existing = yield* 
            db.queryFirst<User>('SELECT * FROM users WHERE id = ?', [id])
          

          if (!existing) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          yield* 
            db.execute(
              'UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?',
              [active ? 1 : 0, Date.now(), id]
            )
          

          // Fetch and return updated user
          const user = yield* 
            db.queryFirst<User>('SELECT * FROM users WHERE id = ?', [id])
          

          if (!user) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          return user
        }),

      updatePassword: (id: string, newPasswordHash: string) =>
        Effect.gen(function* (_) {
          // Check if user exists
          const existing = yield* 
            db.queryFirst<{ id: string; password_hash: string }>(
              'SELECT id, password_hash FROM users WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new UserNotFoundError())
          }

          // Store old password in history
          yield* 
            db.execute(
              'INSERT INTO password_history (id, user_id, password_hash, created_at) VALUES (?, ?, ?, ?)',
              [crypto.randomUUID(), id, existing.password_hash, Date.now()]
            )
          

          // Update password
          yield* 
            db.execute(
              'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
              [newPasswordHash, Date.now(), id]
            )
          

          return yield* Effect.void
        }),

      createInvitation: (
        email: string,
        firstName: string,
        lastName: string,
        role: string,
        invitedBy: string
      ) =>
        Effect.gen(function* (_) {
          // Check if user already exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM users WHERE email = ?',
              [email.toLowerCase()]
            )
          

          if (existing) {
            return yield* 
              Effect.fail(new UserAlreadyExistsError('User with this email already exists'))
            
          }

          // Create user with invitation
          const userId = crypto.randomUUID()
          const token = crypto.randomUUID()
          const now = Date.now()

          yield* 
            db.execute(
              `INSERT INTO users (
                id, email, first_name, last_name, role,
                invitation_token, invited_by, invited_at,
                is_active, email_verified, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId,
                email.toLowerCase(),
                firstName,
                lastName,
                role,
                token,
                invitedBy,
                now,
                0,
                0,
                now,
                now
              ]
            )
          

          return { userId, token }
        }),

      resendInvitation: (userId: string) =>
        Effect.gen(function* (_) {
          // Check if user exists and has pending invitation
          const existing = yield* 
            db.queryFirst<{ id: string; invitation_token: string | null }>(
              'SELECT id, invitation_token FROM users WHERE id = ? AND is_active = 0 AND invitation_token IS NOT NULL',
              [userId]
            )
          

          if (!existing) {
            return yield* 
              Effect.fail(new UserNotFoundError('User not found or invitation not valid'))
            
          }

          // Generate new token
          const newToken = crypto.randomUUID()

          yield* 
            db.execute(
              'UPDATE users SET invitation_token = ?, invited_at = ?, updated_at = ? WHERE id = ?',
              [newToken, Date.now(), Date.now(), userId]
            )
          

          return newToken
        }),

      cancelInvitation: (userId: string) =>
        Effect.gen(function* (_) {
          // Check if user exists and has pending invitation
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM users WHERE id = ? AND is_active = 0 AND invitation_token IS NOT NULL',
              [userId]
            )
          

          if (!existing) {
            return yield* 
              Effect.fail(new UserNotFoundError('User not found or invitation not valid'))
            
          }

          // Delete the user (they haven't activated yet)
          yield* db.execute('DELETE FROM users WHERE id = ?', [userId])

          return yield* Effect.void
        }),

      canDeleteUser: (userId: string, currentUserId: string) =>
        Effect.succeed(userId !== currentUserId)
    }
  })
)

