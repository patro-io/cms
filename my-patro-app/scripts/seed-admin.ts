import { createDb, users } from '@patro-io/cms'
import { eq } from 'drizzle-orm'
import { getPlatformProxy } from 'wrangler'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Seed script to create initial admin user
 *
 * Run this script after migrations:
 * pnpm db:migrate:local
 * pnpm seed
 *
 * Admin credentials will be read from environment or generated randomly
 */

interface Env {
  DB: D1Database
}

/**
 * Generuje náhodné bezpečné heslo
 */
function generateSecurePassword(): string {
  const length = 16
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  let password = ''
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length]
  }
  
  return password
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
  // Get credentials from environment or generate secure defaults
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@patro.io'
  const adminPassword = process.env.ADMIN_PASSWORD || generateSecurePassword()
  const isPasswordGenerated = !process.env.ADMIN_PASSWORD
  
  // Get password salt from environment or use default (must match AuthService)
  const passwordSalt = process.env.PASSWORD_SALT || 'salt-change-in-production'

  // Get D1 database from Cloudflare environment using wrangler
  let platform: Awaited<ReturnType<typeof getPlatformProxy<Env>>>
  
  try {
    platform = await getPlatformProxy<Env>()
  } catch (error) {
    console.error('❌ Error: Failed to get platform proxy')
    console.error('Make sure you are running this with tsx/node and wrangler is installed')
    console.error('')
    console.error(error)
    process.exit(1)
  }

  if (!platform.env?.DB) {
    console.error('❌ Error: DB binding not found')
    console.error('')
    console.error('Make sure you have:')
    console.error('1. Created your D1 database: wrangler d1 create <database-name>')
    console.error('2. Updated wrangler.jsonc with the database_id')
    console.error('3. Run migrations: pnpm db:migrate:local')
    console.error('')
    
    // Dispose platform proxy before exit
    await platform.dispose()
    process.exit(1)
  }

  const db = createDb(platform.env.DB)

  try {
    // Check if admin user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .get()

    if (existingUser) {
      console.log('✓ Admin user already exists')
      console.log(`  Email: ${adminEmail}`)
      console.log(`  Role: ${existingUser.role}`)
      
      // Dispose platform proxy before exit
      await platform.dispose()
      return
    }

    // Hash password using SHA-256 (same as AuthService)
    const passwordHash = await hashPassword(adminPassword, passwordSalt)

    // Create admin user
    await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: adminEmail,
        username: adminEmail.split('@')[0],
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
    console.log(`  Email:    ${adminEmail}`)
    console.log(`  Password: ${adminPassword}`)
    console.log(`  Role:     admin`)
    console.log('')
    if (isPasswordGenerated) {
      console.log('⚠ IMPORTANT: Save this password! It was randomly generated.')
      console.log('  You can change it after first login in admin settings.')
      console.log('')
    }
    console.log('You can now login at: http://localhost:8787/auth/login')
    
    // Dispose platform proxy after successful seed
    await platform.dispose()
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    
    // Dispose platform proxy on error
    await platform.dispose()
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
