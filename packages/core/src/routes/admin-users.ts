/**
 * Admin Users Routes - Pure Effect Implementation
 *
 * User management, profiles, and permissions
 *
 * FULLY MIGRATED TO PURE EFFECT ✅ - All async handlers removed
 * MIGRATED TO makeAppLayer ✅ - Using centralized layer composition
 */

import { Hono } from 'hono'
import { Effect } from 'effect'
import { requireAuth, logActivity, i18nMiddleware, getTranslate } from '../middleware'
import { UserService, type User } from '../services/user-effect'
import { AuthService } from '../services/auth-effect'
import { DatabaseService } from '../services/database-effect'
import { makeAuthServiceLayer } from '../services/auth-effect'
import { SettingsService } from '../services/settings'
import { makeAppLayer } from '../services'
import { getAvailableLocales, getLocaleDisplayName, type Locale } from '../services/i18n'
import { sanitizeInput } from '../utils/sanitize'
import {
  renderActivityLogsPage,
  type ActivityLogsPageData,
  type ActivityLog
} from '../templates/pages/admin-activity-logs.template'
import { 
  renderProfilePage, 
  renderAvatarImage, 
  type UserProfile, 
  type ProfilePageData 
} from '../templates/pages/admin-profile.template'
import { renderAlert } from '../templates/components/alert.template'
import {
  renderUsersListPage,
  type UsersListPageData,
  type User as UserListItem
} from '../templates/pages/admin-users-list.template'
import {
  renderUserNewPage,
  type UserNewPageData
} from '../templates/pages/admin-user-new.template'
import {
  renderUserEditPage,
  type UserEditPageData,
  type UserEditData
} from '../templates/pages/admin-user-edit.template'
import type { Bindings, Variables } from '../app'

const userRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

// Redirect /admin to /admin/dashboard
userRoutes.get('/', (c) => {
  return c.redirect('/admin/dashboard')
})

// Constants
const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' }
]

// Generate available languages dynamically from i18n service
// Pre-computed at module load time for performance (static array)
// First option is "Auto-detect" (empty value = use IP geolocation)
const AVAILABLE_LANGUAGES_OPTIONS = [
  { value: '', label: 'Automaticky (Auto-detect)' },
  ...getAvailableLocales().map((locale: Locale) => ({
    value: locale,
    label: getLocaleDisplayName(locale)
  }))
]

const ROLES = [
  { value: 'admin', label: 'Administrator' },
  { value: 'editor', label: 'Editor' },
  { value: 'author', label: 'Author' },
  { value: 'viewer', label: 'Viewer' }
]

/**
 * GET /admin/profile - Show user profile page
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.get('/profile', (c) => {
  const user = c.get('user')
  const t = c.get('t')!
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const settingsService = yield* SettingsService
    
    const userProfile = yield* userService.getUserById(user!.userId)
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const profile: UserProfile = {
      id: userProfile.id,
      email: userProfile.email,
      username: userProfile.username || '',
      first_name: userProfile.first_name || '',
      last_name: userProfile.last_name || '',
      phone: userProfile.phone ?? undefined,
      bio: userProfile.bio ?? undefined,
      avatar_url: userProfile.avatar_url ?? undefined,
      timezone: userProfile.timezone || 'UTC',
      language: userProfile.language || '',  // '' means auto-detect (IP geolocation)
      theme: userProfile.theme || 'dark',
      email_notifications: Boolean(userProfile.email_notifications),
      two_factor_enabled: Boolean(userProfile.two_factor_enabled),
      role: userProfile.role,
      created_at: userProfile.created_at,
      last_login_at: userProfile.last_login_at ?? undefined
    }

    const pageData: ProfilePageData = {
      profile,
      timezones: TIMEZONES,
      languages: AVAILABLE_LANGUAGES_OPTIONS,
      user: {
        name: `${profile.first_name} ${profile.last_name}`.trim() || profile.username || user!.email,
        email: user!.email,
        role: user!.role
      },
      t,
      logoUrl: appearanceSettings.logoUrl
    }

    return pageData
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) =>
        Effect.succeed({
          profile: {} as UserProfile,
          timezones: TIMEZONES,
          languages: AVAILABLE_LANGUAGES_OPTIONS,
          error: 'Failed to load profile. Please try again.',
          user: {
            name: user!.email,
            email: user!.email,
            role: user!.role
          },
          t
        } as ProfilePageData)
      )
    )
  ).then(pageData => c.html(renderProfilePage(pageData)))
})

/**
 * PUT /admin/profile - Update user profile
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.put('/profile', (c) => {
  const user = c.get('user')
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })

    // Sanitize inputs
    const firstName = yield* sanitizeInput(formData.get('first_name')?.toString())
    const lastName = yield* sanitizeInput(formData.get('last_name')?.toString())
    const username = yield* sanitizeInput(formData.get('username')?.toString())
    const email = formData.get('email')?.toString()?.trim().toLowerCase() || ''
    const phoneRaw = formData.get('phone')?.toString()
    const phone = phoneRaw ? yield* sanitizeInput(phoneRaw) : undefined
    const bioRaw = formData.get('bio')?.toString()
    const bio = bioRaw ? yield* sanitizeInput(bioRaw) : undefined
    const timezone = formData.get('timezone')?.toString() || 'UTC'
    const language = formData.get('language')?.toString() || null
    const emailNotifications = formData.get('email_notifications') === '1'

    // Validate required fields
    if (!firstName || !lastName || !username || !email) {
      return {
        type: 'error' as const,
        message: 'First name, last name, username, and email are required.'
      }
    }

    // Update profile
    yield* 
      userService.updateUser(user!.userId, {
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        phone,
        bio,
        timezone,
        language,
        email_notifications: emailNotifications
      })
    

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'profile.update',
            'users',
            user!.userId,
            { fields: ['first_name', 'last_name', 'username', 'email', 'phone', 'bio', 'timezone', 'language', 'email_notifications'] },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      message: 'Profile updated successfully!'
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          message: '_tag' in error && error._tag === 'UserAlreadyExistsError'
            ? 'Username or email is already taken by another user.'
            : 'Failed to update profile. Please try again.'
        })
      )
    )
  ).then(result => c.html(
    renderAlert({
      type: result.type,
      message: result.message,
      dismissible: true
    })
  ))
})

/**
 * POST /admin/profile/password - Change user password
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.post('/profile/password', (c) => {
  const user = c.get('user')
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const authService = yield* AuthService
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })

    const currentPassword = formData.get('current_password')?.toString() || ''
    const newPassword = formData.get('new_password')?.toString() || ''
    const confirmPassword = formData.get('confirm_password')?.toString() || ''

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return {
        type: 'error' as const,
        message: 'All password fields are required.'
      }
    }

    if (newPassword !== confirmPassword) {
      return {
        type: 'error' as const,
        message: 'New passwords do not match.'
      }
    }

    if (newPassword.length < 8) {
      return {
        type: 'error' as const,
        message: 'New password must be at least 8 characters long.'
      }
    }

    // Get current user
    const userData = yield* userService.getUserById(user!.userId)

    // Verify current password
    const validPassword = yield* 
      authService.verifyPassword(currentPassword, userData.password_hash)
    

    if (!validPassword) {
      return {
        type: 'error' as const,
        message: 'Current password is incorrect.'
      }
    }

    // Hash new password
    const newPasswordHash = yield* authService.hashPassword(newPassword)

    // Update password
    yield* userService.updatePassword(user!.userId, newPasswordHash)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'profile.password_change',
            'users',
            user!.userId,
            {},
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      message: 'Password updated successfully!'
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.provide(makeAuthServiceLayer()),
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() =>
        Effect.succeed({
          type: 'error' as const,
          message: 'Failed to update password. Please try again.'
        })
      )
    )
  ).then(result => c.html(
    renderAlert({
      type: result.type,
      message: result.message,
      dismissible: true
    })
  ))
})

/**
 * GET /admin/users - List all users
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.get('/users', (c) => {
  const db = c.env.DB
  const user = c.get('user')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    // Get pagination parameters
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const search = c.req.query('search') || ''
    const roleFilter = c.req.query('role') || ''
    const statusFilter = c.req.query('status') || 'active'
    const offset = (page - 1) * limit

    // Query users
    const users = yield* 
      userService.queryUsers({
        search,
        role: roleFilter || undefined,
        is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
        limit,
        offset
      })
    

    // Get total count
    const totalUsers = yield* 
      userService.countUsers({
        search,
        role: roleFilter || undefined,
        is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined
      })
    

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'users.list_view',
            'users',
            undefined,
            { search, page, limit },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    // Check if API request
    const acceptHeader = c.req.header('accept') || ''
    const isApiRequest = acceptHeader.includes('application/json')

    if (isApiRequest) {
      return {
        type: 'json' as const,
        data: {
          users,
          pagination: {
            page,
            limit,
            total: totalUsers,
            pages: Math.ceil(totalUsers / limit)
          }
        }
      }
    }

    // Return HTML
    const usersList: UserListItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username || '',
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      role: u.role,
      avatar: u.avatar_url ?? undefined,
      isActive: Boolean(u.is_active),
      lastLoginAt: u.last_login_at ?? undefined,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      formattedLastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : undefined,
      formattedCreatedAt: new Date(u.created_at).toLocaleDateString()
    }))

    const pageData: UsersListPageData = {
      users: usersList,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      totalUsers,
      searchFilter: search,
      roleFilter,
      statusFilter,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalItems: totalUsers,
        itemsPerPage: limit,
        startItem: offset + 1,
        endItem: Math.min(offset + limit, totalUsers),
        baseUrl: '/admin/users'
      },
      user: {
        name: user!.email.split('@')[0] || user!.email,
        email: user!.email,
        role: user!.role
      },
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }

    return {
      type: 'html' as const,
      data: pageData
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() =>
        Effect.succeed({
          type: 'error' as const,
          data: null
        })
      )
    )
  ).then(result => {
    if (result.type === 'json') {
      return c.json(result.data)
    } else if (result.type === 'error') {
      return c.html(
        renderAlert({
          type: 'error',
          message: 'Failed to load users. Please try again.',
          dismissible: true
        }),
        500
      )
    } else {
      const t = getTranslate(c)
      return c.html(renderUsersListPage(result.data, t))
    }
  })
})

/**
 * GET /admin/users/new - Show new user creation page
 * MIGRATED TO PURE EFFECT ✅ (no async needed)
 */
userRoutes.get('/users/new', (c) => {
  const user = c.get('user')
  const t = getTranslate(c)

  const db = c.env.DB
  
  const program = Effect.gen(function* (_) {
    const settingsService = yield* SettingsService
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const pageData: UserNewPageData = {
      roles: ROLES,
      user: {
        name: user!.email.split('@')[0] || user!.email,
        email: user!.email,
        role: user!.role
      },
      logoUrl: appearanceSettings.logoUrl
    }
    
    return pageData
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() => Effect.succeed({
        roles: ROLES,
        user: {
          name: user!.email.split('@')[0] || user!.email,
          email: user!.email,
          role: user!.role
        }
      } as UserNewPageData))
    )
  ).then(pageData => c.html(renderUserNewPage(pageData, t)))
})

/**
 * POST /admin/users/new - Create new user
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.post('/users/new', (c) => {
  const db = c.env.DB
  const user = c.get('user')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const authService = yield* AuthService
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })

    // Sanitize inputs
    const firstName = yield* sanitizeInput(formData.get('first_name')?.toString())
    const lastName = yield* sanitizeInput(formData.get('last_name')?.toString())
    const username = yield* sanitizeInput(formData.get('username')?.toString())
    const email = formData.get('email')?.toString()?.trim().toLowerCase() || ''
    const phoneRaw = formData.get('phone')?.toString()
    const phone = phoneRaw ? yield* sanitizeInput(phoneRaw) : undefined
    const bioRaw = formData.get('bio')?.toString()
    const bio = bioRaw ? yield* sanitizeInput(bioRaw) : undefined
    const role = formData.get('role')?.toString() || 'viewer'
    const password = formData.get('password')?.toString() || ''
    const confirmPassword = formData.get('confirm_password')?.toString() || ''
    const isActive = formData.get('is_active') === '1'
    const emailVerified = formData.get('email_verified') === '1'

    // Validate required fields
    if (!firstName || !lastName || !username || !email || !password) {
      return {
        type: 'error' as const,
        message: 'First name, last name, username, email, and password are required.'
      }
    }

    // Validate password
    if (password.length < 8) {
      return {
        type: 'error' as const,
        message: 'Password must be at least 8 characters long.'
      }
    }

    if (password !== confirmPassword) {
      return {
        type: 'error' as const,
        message: 'Passwords do not match.'
      }
    }

    // Hash password
    const passwordHash = yield* authService.hashPassword(password)

    // Create user
    const newUser = yield* 
      userService.createUser({
        email,
        username,
        first_name: firstName,
        last_name: lastName,
        phone,
        bio,
        password_hash: passwordHash,
        role,
        is_active: isActive,
        email_verified: emailVerified
      })
    

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'user.create',
            'users',
            newUser.id,
            { email, username, role },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    // Redirect to edit page
    return {
      type: 'redirect' as const,
      url: `/admin/users/${newUser.id}/edit?success=User created successfully`
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.provide(makeAuthServiceLayer()),
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          message: '_tag' in error && error._tag === 'UserAlreadyExistsError'
            ? 'Username or email is already taken.'
            : '_tag' in error && error._tag === 'UserValidationError'
            ? (error as any).message
            : 'Failed to create user. Please try again.'
        })
      )
    )
  ).then(result => {
    if (result.type === 'redirect') {
      return c.redirect(result.url)
    }
    return c.html(
      renderAlert({
        type: 'error',
        message: result.message,
        dismissible: true
      })
    )
  })
})

/**
 * GET /admin/users/:id - Get user by ID (API endpoint)
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.get('/users/:id', (c) => {
  // Check if this is the edit route
  if (c.req.path.endsWith('/edit')) {
    return Promise.resolve(c.json({ error: 'Not found' }, 404))
  }

  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService

    const userRecord = yield* userService.getUserById(userId)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'user.view',
            'users',
            userId,
            {},
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        username: userRecord.username,
        first_name: userRecord.first_name,
        last_name: userRecord.last_name,
        phone: userRecord.phone,
        bio: userRecord.bio,
        avatar_url: userRecord.avatar_url,
        role: userRecord.role,
        is_active: userRecord.is_active,
        email_verified: userRecord.email_verified,
        two_factor_enabled: userRecord.two_factor_enabled,
        created_at: userRecord.created_at,
        last_login_at: userRecord.last_login_at
      }
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          error: '_tag' in error && error._tag === 'UserNotFoundError' ? 'User not found' : 'Failed to fetch user',
          statusCode: '_tag' in error && error._tag === 'UserNotFoundError' ? 404 : 500
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, result.statusCode as 404 | 500)
    }
    return c.json({ user: result.user })
  })
})

/**
 * GET /admin/users/:id/edit - Show user edit page
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.get('/users/:id/edit', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const settingsService = yield* SettingsService

    const userToEdit = yield* userService.getUserById(userId)
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    const editData: UserEditData = {
      id: userToEdit.id,
      email: userToEdit.email ?? undefined,
      username: userToEdit.username || '',
      firstName: userToEdit.first_name || '',
      lastName: userToEdit.last_name || '',
      phone: userToEdit.phone ?? undefined,
      bio: userToEdit.bio ?? undefined,
      avatarUrl: userToEdit.avatar_url ?? undefined,
      role: userToEdit.role,
      isActive: Boolean(userToEdit.is_active),
      emailVerified: Boolean(userToEdit.email_verified),
      twoFactorEnabled: Boolean(userToEdit.two_factor_enabled),
      createdAt: userToEdit.created_at,
      lastLoginAt: userToEdit.last_login_at ?? undefined
    }

    const pageData: UserEditPageData = {
      userToEdit: editData,
      roles: ROLES,
      user: {
        name: user!.email.split('@')[0] || user!.email,
        email: user!.email,
        role: user!.role
      },
      logoUrl: appearanceSettings.logoUrl
    }

    return { type: 'success' as const, data: pageData }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() =>
        Effect.succeed({ type: 'error' as const })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(
        renderAlert({
          type: 'error',
          message: 'User not found',
          dismissible: true
        }),
        404
      )
    }
    const t = getTranslate(c)
    return c.html(renderUserEditPage(result.data, t))
  })
})

/**
 * PUT /admin/users/:id - Update user
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.put('/users/:id', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })

    // Sanitize inputs
    const firstName = yield* sanitizeInput(formData.get('first_name')?.toString())
    const lastName = yield* sanitizeInput(formData.get('last_name')?.toString())
    const username = yield* sanitizeInput(formData.get('username')?.toString())
    const email = formData.get('email')?.toString()?.trim().toLowerCase() || ''
    const phoneRaw = formData.get('phone')?.toString()
    const phone = phoneRaw ? yield* sanitizeInput(phoneRaw) : undefined
    const bioRaw = formData.get('bio')?.toString()
    const bio = bioRaw ? yield* sanitizeInput(bioRaw) : undefined
    const role = formData.get('role')?.toString() || 'viewer'
    const isActive = formData.get('is_active') === '1'
    const emailVerified = formData.get('email_verified') === '1'

    // Validate required fields
    if (!firstName || !lastName || !username || !email) {
      return {
        type: 'error' as const,
        message: 'First name, last name, username, and email are required.'
      }
    }

    // Update user
    yield* 
      userService.updateUser(userId, {
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        phone,
        bio,
        role,
        is_active: isActive,
        email_verified: emailVerified
      })
    

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'user.update',
            'users',
            userId,
            { fields: ['first_name', 'last_name', 'username', 'email', 'phone', 'bio', 'role', 'is_active', 'email_verified'] },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      message: 'User updated successfully!'
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          message: '_tag' in error && error._tag === 'UserAlreadyExistsError'
            ? 'Username or email is already taken by another user.'
            : '_tag' in error && error._tag === 'UserNotFoundError'
            ? 'User not found'
            : 'Failed to update user. Please try again.'
        })
      )
    )
  ).then(result => c.html(
    renderAlert({
      type: result.type,
      message: result.message,
      dismissible: true
    })
  ))
})

/**
 * POST /admin/users/:id/toggle - Toggle user active status
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.post('/users/:id/toggle', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const body = yield* Effect.tryPromise({
      try: () => c.req.json().catch(() => ({ active: true })),
      catch: (error) => new Error(`Failed to parse JSON body: ${error}`)
    })
    const active = body.active === true

    // Prevent self-deactivation
    if (userId === user!.userId && !active) {
      return {
        type: 'error' as const,
        error: 'You cannot deactivate your own account',
        statusCode: 400
      }
    }

    // Toggle status
    const updatedUser = yield* userService.toggleUserStatus(userId, active)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            active ? 'user.activate' : 'user.deactivate',
            'users',
            userId,
            { email: updatedUser.email },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      message: active ? 'User activated successfully' : 'User deactivated successfully'
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          error: '_tag' in error && error._tag === 'UserNotFoundError' ? 'User not found' : 'Failed to toggle user status',
          statusCode: '_tag' in error && error._tag === 'UserNotFoundError' ? 404 : 500
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, (result.statusCode || 500) as 400 | 404 | 500)
    }
    return c.json({ success: true, message: result.message })
  })
})

/**
 * DELETE /admin/users/:id - Delete user
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.delete('/users/:id', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const body = yield* Effect.tryPromise({
      try: () => c.req.json().catch(() => ({ hardDelete: false })),
      catch: (error) => new Error(`Failed to parse JSON body: ${error}`)
    })
    const hardDelete = body.hardDelete === true

    // Prevent self-deletion
    if (userId === user!.userId) {
      return {
        type: 'error' as const,
        error: 'You cannot delete your own account',
        statusCode: 400
      }
    }

    // Get user before deletion for logging
    const userToDelete = yield* userService.getUserById(userId)

    // Delete user
    yield* userService.deleteUser(userId, hardDelete)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            hardDelete ? 'user.hard_delete' : 'user.soft_delete',
            'users',
            userId,
            { email: userToDelete.email, permanent: hardDelete },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      message: hardDelete ? 'User permanently deleted' : 'User deactivated successfully'
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          error: '_tag' in error && error._tag === 'UserNotFoundError' ? 'User not found' : 'Failed to delete user',
          statusCode: '_tag' in error && error._tag === 'UserNotFoundError' ? 404 : 500
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, (result.statusCode || 500) as 400 | 404 | 500)
    }
    return c.json({ success: true, message: result.message })
  })
})

/**
 * POST /admin/invite-user - Invite a new user
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.post('/invite-user', (c) => {
  const db = c.env.DB
  const user = c.get('user')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })

    // Sanitize inputs
    const email = formData.get('email')?.toString()?.trim().toLowerCase() || ''
    const role = formData.get('role')?.toString()?.trim() || 'viewer'
    const firstNameRaw = formData.get('first_name')?.toString()
    const lastNameRaw = formData.get('last_name')?.toString()
    const firstName = firstNameRaw ? yield* sanitizeInput(firstNameRaw) : ''
    const lastName = lastNameRaw ? yield* sanitizeInput(lastNameRaw) : ''

    // Validate input
    if (!email || !firstName || !lastName) {
      return {
        type: 'error' as const,
        error: 'Email, first name, and last name are required',
        statusCode: 400
      }
    }

    // Create invitation
    const invitation = yield* 
      userService.createInvitation(email, firstName, lastName, role, user!.userId)
    

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'user.invite_sent',
            'users',
            invitation.userId,
            { email, role, invited_user_id: invitation.userId },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    // Generate invitation link
    const invitationLink = `${c.req.header('origin') || 'http://localhost:8787'}/auth/accept-invitation?token=${invitation.token}`

    return {
      type: 'success' as const,
      data: {
        success: true,
        message: 'User invitation sent successfully',
        user: {
          id: invitation.userId,
          email,
          first_name: firstName,
          last_name: lastName,
          role
        },
        invitation_link: invitationLink
      }
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          error: '_tag' in error && error._tag === 'UserAlreadyExistsError'
            ? 'A user with this email already exists'
            : 'Failed to send user invitation',
          statusCode: 400
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, (result.statusCode || 400) as 400)
    }
    return c.json(result.data)
  })
})

/**
 * POST /admin/resend-invitation/:id - Resend invitation
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.post('/resend-invitation/:id', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService

    // Get user for email
    const invitedUser = yield* userService.getUserById(userId)

    // Resend invitation
    const newToken = yield* userService.resendInvitation(userId)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'user.invitation_resent',
            'users',
            userId,
            { email: invitedUser.email },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    // Generate new invitation link
    const invitationLink = `${c.req.header('origin') || 'http://localhost:8787'}/auth/accept-invitation?token=${newToken}`

    return {
      type: 'success' as const,
      data: {
        success: true,
        message: 'Invitation resent successfully',
        invitation_link: invitationLink
      }
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) =>
        Effect.succeed({
          type: 'error' as const,
          error: '_tag' in error && error._tag === 'UserNotFoundError'
            ? 'User not found or invitation not valid'
            : 'Failed to resend invitation',
          statusCode: '_tag' in error && error._tag === 'UserNotFoundError' ? 404 : 500
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, (result.statusCode || 500) as 404 | 500)
    }
    return c.json(result.data)
  })
})

/**
 * DELETE /admin/cancel-invitation/:id - Cancel invitation
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.delete('/cancel-invitation/:id', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const userId = c.req.param('id')

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService

    // Get user for email before canceling
    const invitedUser = yield* userService.getUserById(userId)

    // Cancel invitation
    yield* userService.cancelInvitation(userId)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'user.invitation_cancelled',
            'users',
            userId,
            { email: invitedUser.email },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.catchAll((error) =>
       Effect.succeed({
         type: 'error' as const,
         error: '_tag' in error && error._tag === 'UserNotFoundError'
           ? 'User not found or invitation not valid'
           : 'Failed to cancel invitation',
         statusCode: '_tag' in error && error._tag === 'UserNotFoundError' ? 404 : 500
       })
     )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: result.error }, (result.statusCode || 500) as 404 | 500)
    }
    return c.json({ success: true, message: 'Invitation cancelled successfully' })
  })
})

/**
 * POST /admin/profile/avatar - Upload user avatar
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.post('/profile/avatar', (c) => {
  const user = c.get('user')
  const db = c.env.DB

  const program = Effect.gen(function* (_) {
    const userService = yield* UserService
    const formData = yield* Effect.tryPromise({
      try: () => c.req.formData(),
      catch: (error) => new Error(`Failed to parse form data: ${error}`)
    })
    const avatarFile = formData.get('avatar') as File | null

    if (!avatarFile || typeof avatarFile === 'string' || !avatarFile.name) {
      return {
        type: 'error' as const,
        message: 'Please select an image file.'
      }
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(avatarFile.type)) {
      return {
        type: 'error' as const,
        message: 'Please upload a valid image file (JPEG, PNG, GIF, or WebP).'
      }
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024
    if (avatarFile.size > maxSize) {
      return {
        type: 'error' as const,
        message: 'Image file must be smaller than 5MB.'
      }
    }

    // For now, simulate storing the avatar
    const avatarUrl = `/uploads/avatars/${user!.userId}-${Date.now()}.${avatarFile.type.split('/')[1]}`

    // Update user avatar
    yield* 
      userService.updateUser(user!.userId, {
        avatar_url: avatarUrl
      })
    

    // Get updated user data
    const userData = yield* userService.getUserById(user!.userId)

    // Log activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'profile.avatar_update',
            'users',
            user!.userId,
            { avatar_url: avatarUrl },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    return {
      type: 'success' as const,
      avatarUrl,
      firstName: userData.first_name || '',
      lastName: userData.last_name || ''
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() =>
        Effect.succeed({
          type: 'error' as const,
          message: 'Failed to upload profile picture. Please try again.'
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(
        renderAlert({
          type: 'error',
          message: result.message,
          dismissible: true
        })
      )
    }

    // Return alert and updated avatar
    const alertHtml = renderAlert({
      type: 'success',
      message: 'Profile picture updated successfully!',
      dismissible: true
    })

    const avatarUrlWithCache = `${result.avatarUrl}?t=${Date.now()}`
    const avatarImageHtml = renderAvatarImage(
      avatarUrlWithCache,
      result.firstName,
      result.lastName
    )

    const avatarImageWithOob = avatarImageHtml.replace(
      'id="avatar-image-container"',
      'id="avatar-image-container" hx-swap-oob="true"'
    )

    return c.html(alertHtml + avatarImageWithOob)
  })
})

/**
 * GET /admin/activity-logs - View activity logs
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.get('/activity-logs', (c) => {
  const db = c.env.DB
  const user = c.get('user')
  const t = c.get('t')!

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService

    // Get pagination and filter parameters
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = (page - 1) * limit

    const filters = {
      action: c.req.query('action') || '',
      resource_type: c.req.query('resource_type') || '',
      date_from: c.req.query('date_from') || '',
      date_to: c.req.query('date_to') || '',
      user_id: c.req.query('user_id') || ''
    }

    // Build where clause
    let whereConditions: string[] = []
    let params: any[] = []

    if (filters.action) {
      whereConditions.push('al.action = ?')
      params.push(filters.action)
    }

    if (filters.resource_type) {
      whereConditions.push('al.resource_type = ?')
      params.push(filters.resource_type)
    }

    if (filters.user_id) {
      whereConditions.push('al.user_id = ?')
      params.push(filters.user_id)
    }

    if (filters.date_from) {
      const fromTimestamp = new Date(filters.date_from).getTime()
      whereConditions.push('al.created_at >= ?')
      params.push(fromTimestamp)
    }

    if (filters.date_to) {
      const toTimestamp = new Date(filters.date_to + ' 23:59:59').getTime()
      whereConditions.push('al.created_at <= ?')
      params.push(toTimestamp)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Get activity logs
    const logs = yield* 
      dbService.query<any>(
        `SELECT
          al.id, al.user_id, al.action, al.resource_type, al.resource_id,
          al.details, al.ip_address, al.user_agent, al.created_at,
          u.email as user_email,
          COALESCE(u.first_name || ' ' || u.last_name, u.username, u.email) as user_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )
    

    // Get total count
    const countResult = yield* 
      dbService.queryFirst<{ total: number }>(
        `SELECT COUNT(*) as total
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}`,
        params
      )
    
    const totalLogs = countResult?.total || 0

    // Parse details JSON
    const formattedLogs: ActivityLog[] = logs.map((log: any) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null
    }))

    // Log the activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'activity.logs_viewed',
            undefined,
            undefined,
            { filters, page, limit },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    const pageData: ActivityLogsPageData = {
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        total: totalLogs,
        pages: Math.ceil(totalLogs / limit)
      },
      filters,
      user: {
        name: user!.email.split('@')[0] || user!.email,
        email: user!.email,
        role: user!.role
      },
      t
    }

    return pageData
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() =>
        Effect.succeed({
          logs: [],
          pagination: { page: 1, limit: 50, total: 0, pages: 0 },
          filters: {},
          user: {
            name: user!.email,
            email: user!.email,
            role: user!.role
          },
          t
        } as ActivityLogsPageData)
      )
    )
  ).then(pageData => c.html(renderActivityLogsPage(pageData)))
})

/**
 * GET /admin/activity-logs/export - Export activity logs to CSV
 * MIGRATED TO PURE EFFECT ✅
 */
userRoutes.get('/activity-logs/export', (c) => {
  const db = c.env.DB
  const user = c.get('user')

  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService

    // Get filter parameters
    const filters = {
      action: c.req.query('action') || '',
      resource_type: c.req.query('resource_type') || '',
      date_from: c.req.query('date_from') || '',
      date_to: c.req.query('date_to') || '',
      user_id: c.req.query('user_id') || ''
    }

    // Build where clause
    let whereConditions: string[] = []
    let params: any[] = []

    if (filters.action) {
      whereConditions.push('al.action = ?')
      params.push(filters.action)
    }

    if (filters.resource_type) {
      whereConditions.push('al.resource_type = ?')
      params.push(filters.resource_type)
    }

    if (filters.user_id) {
      whereConditions.push('al.user_id = ?')
      params.push(filters.user_id)
    }

    if (filters.date_from) {
      const fromTimestamp = new Date(filters.date_from).getTime()
      whereConditions.push('al.created_at >= ?')
      params.push(fromTimestamp)
    }

    if (filters.date_to) {
      const toTimestamp = new Date(filters.date_to + ' 23:59:59').getTime()
      whereConditions.push('al.created_at <= ?')
      params.push(toTimestamp)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Get all matching activity logs (limit to 10,000)
    const logs = yield* 
      dbService.query<any>(
        `SELECT
          al.id, al.user_id, al.action, al.resource_type, al.resource_id,
          al.details, al.ip_address, al.user_agent, al.created_at,
          u.email as user_email,
          COALESCE(u.first_name || ' ' || u.last_name, u.username, u.email) as user_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT 10000`,
        params
      )
    

    // Generate CSV
    const csvHeaders = ['Timestamp', 'User', 'Email', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Details']
    const csvRows = [csvHeaders.join(',')]

    for (const log of logs) {
      const row = [
        `"${new Date(log.created_at).toISOString()}"`,
        `"${log.user_name || 'Unknown'}"`,
        `"${log.user_email || 'N/A'}"`,
        `"${log.action}"`,
        `"${log.resource_type || 'N/A'}"`,
        `"${log.resource_id || 'N/A'}"`,
        `"${log.ip_address || 'N/A'}"`,
        `"${log.details ? JSON.stringify(JSON.parse(log.details)) : 'N/A'}"`
      ]
      csvRows.push(row.join(','))
    }

    const csvContent = csvRows.join('\n')

    // Log the export activity
    yield*
      Effect.tryPromise({
        try: () =>
          logActivity(
            db,
            user!.userId,
            'activity.logs_exported',
            undefined,
            undefined,
            { filters, count: logs.length },
            c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
            c.req.header('user-agent')
          ),
        catch: (error) => new Error(`Failed to log activity: ${error}`)
      })
    

    // Return CSV file
    const filename = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`

    return {
      type: 'success' as const,
      csvContent,
      filename
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(db)), // ✅ Unified layer
      Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
      Effect.catchAll(() =>
        Effect.succeed({
          type: 'error' as const
        })
      )
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.json({ error: 'Failed to export activity logs' }, 500)
    }
    return new Response(result.csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${result.filename}"`
      }
    })
  })
})

export { userRoutes }