import { createDb, users } from '@patro-io/cms'
import { eq } from 'drizzle-orm'

/**
 * Seed script to create initial admin user
 *
 * Run this script after migrations:
 * pnpm db:migrate:local
 * pnpm seed
 *
 * Admin credentials:
 * Email: admin@patro.io
 * Password: patro!
 */

interface Env {
  DB: D1Database
}

/**
 * Hash password using the same SHA-256 method as AuthService
 * This ensures compatibility with the login system
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + salt)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function seed() {
  // Get password salt from environment or use default (must match AuthService)
  const passwordSalt = process.env.PASSWORD_SALT || 'salt-change-in-production'
  
  // Get D1 database from Cloudflare environment
  // @ts-ignore - getPlatformProxy is available in wrangler
  const { env } = await import('@cloudflare/workers-types/experimental')
  const platform = (env as any).getPlatformProxy?.() || { env: {} }

  if (!platform.env?.DB) {
    console.error('❌ Error: DB binding not found')
    console.error('')
    console.error('Make sure you have:')
    console.error('1. Created your D1 database: wrangler d1 create <database-name>')
    console.error('2. Updated wrangler.jsonc with the database_id')
    console.error('3. Run migrations: pnpm db:migrate:local')
    console.error('')
    process.exit(1)
  }

  const db = createDb(platform.env.DB)

  try {
    // Check if admin user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@patro.io'))
      .get()

    if (existingUser) {
      console.log('✓ Admin user already exists')
      console.log(`  Email: admin@patro.io`)
      console.log(`  Role: ${existingUser.role}`)
      return
    }

    // Hash password using SHA-256 (same as AuthService)
    const passwordHash = await hashPassword('patro!', passwordSalt)

    // Create admin user
    await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: 'admin@patro.io',
        username: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        passwordHash: passwordHash,
        role: 'admin',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      .run()

    console.log('✓ Admin user created successfully')
    console.log(`  Email: admin@patro.io`)
    console.log(`  Role: admin`)
    console.log('')
    console.log('You can now login at: http://localhost:8787/auth/login')
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    process.exit(1)
  }
}

// Run seed
seed()
  .then(() => {
    console.log('')
    console.log('✓ Seeding complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  })
