/**
 * Auth Validation Service
 *
 * Provides validation schemas for authentication operations
 */

import { Schema } from 'effect'

export interface AuthSettings {
  enablePasswordLogin?: boolean
  enableOAuthLogin?: boolean
  requireEmailVerification?: boolean
  [key: string]: any
}

/**
 * Auth Validation Service
 * Provides dynamic validation schemas for registration based on database settings
 */
export const authValidationService = {
  /**
   * Build registration schema dynamically based on auth settings
   * For now, returns a static schema with standard fields
   */
  buildRegistrationSchema(): Schema.Schema.Any {
    // TODO: Load settings from database to make fields optional/required dynamically
    // For now, use a static schema with common registration fields
    return Schema.Struct({
      email: Schema.String.pipe(
        Schema.filter((s): s is string => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
          message: () => 'Valid email is required'
        })
      ),
      password: Schema.String.pipe(
        Schema.minLength(8, { message: () => 'Password must be at least 8 characters' })
      ),
      username: Schema.optional(
        Schema.String.pipe(
          Schema.minLength(3, { message: () => 'Username must be at least 3 characters' })
        )
      ),
      firstName: Schema.optional(
        Schema.String.pipe(
          Schema.minLength(1, { message: () => 'First name is required' })
        )
      ),
      lastName: Schema.optional(
        Schema.String.pipe(
          Schema.minLength(1, { message: () => 'Last name is required' })
        )
      )
    })
  },

  /**
   * Generate default values for optional fields
   */
  generateDefaultValue(field: string, data: any): string {
    switch (field) {
      case 'username':
        // Generate username from email (part before @)
        return data.email ? data.email.split('@')[0] : `user${Date.now()}`
      case 'firstName':
        return 'User'
      case 'lastName':
        return data.email ? data.email.split('@')[0] : 'Account'
      default:
        return ''
    }
  }
}
