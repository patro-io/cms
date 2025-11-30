/**
 * Application Configuration using Effect.Config
 * 
 * Definuje type-safe schémata pro všechny environment variables.
 * 
 * DŮLEŽITÉ: 
 * - Cloudflare bindings (DB, MEDIA_BUCKET, atd.) se NEPŘEDÁVAJÍ přes Config!
 * - Pouze string ENV vars se čtou pomocí Effect.Config
 * 
 * @see docs/effect/ENV_VARIABLES.md
 */

import { Config, Redacted } from 'effect'

/**
 * JWT Configuration
 *
 * Konfigurace pro JWT tokeny a autentizaci
 */
export const JwtConfig = Config.all({
  /**
   * JWT Secret pro podepisování tokenů
   *
   * @required false
   * @sensitive true
   * @default "your-super-secret-jwt-key-change-in-production"
   */
  secret: Config.redacted('JWT_SECRET').pipe(
    Config.withDefault(Redacted.make('your-super-secret-jwt-key-change-in-production'))
  ),
  
  /**
   * JWT Token expiration v hodinách
   *
   * @required false
   * @default 24
   */
  expiresInHours: Config.number('JWT_EXPIRES_IN_HOURS').pipe(
    Config.withDefault(24)
  ),
  
  /**
   * Password salt pro hashing hesel
   *
   * @required false
   * @sensitive true
   * @default "salt-change-in-production"
   */
  passwordSalt: Config.redacted('PASSWORD_SALT').pipe(
    Config.withDefault(Redacted.make('salt-change-in-production'))
  )
})

/**
 * Email Configuration
 *
 * Konfigurace pro odesílání emailů přes SendGrid
 */
export const EmailConfig = Config.all({
  /**
   * SendGrid API klíč pro odesílání emailů
   * 
   * @required false
   * @sensitive true
   * @default ""
   */
  sendgridApiKey: Config.redacted('SENDGRID_API_KEY').pipe(
    Config.withDefault(Redacted.make(''))
  ),
  
  /**
   * Výchozí email adresa pro odesílatele
   * 
   * @required false
   * @default ""
   */
  defaultFromEmail: Config.string('DEFAULT_FROM_EMAIL').pipe(
    Config.withDefault('')
  )
})

/**
 * Cloudflare Images Configuration
 * 
 * Konfigurace pro Cloudflare Images API
 */
export const ImagesConfig = Config.all({
  /**
   * Cloudflare Images Account ID
   * 
   * @required false
   * @sensitive true
   * @default ""
   */
  accountId: Config.redacted('IMAGES_ACCOUNT_ID').pipe(
    Config.withDefault(Redacted.make(''))
  ),
  
  /**
   * Cloudflare Images API Token
   * 
   * @required false
   * @sensitive true
   * @default ""
   */
  apiToken: Config.redacted('IMAGES_API_TOKEN').pipe(
    Config.withDefault('')
  )
})

/**
 * Application Configuration
 * 
 * Obecná konfigurace aplikace
 */
export const AppConfig = Config.all({
  /**
   * Prostředí aplikace (development/production)
   * 
   * @required false
   * @default "production"
   */
  environment: Config.string('ENVIRONMENT').pipe(
    Config.withDefault('production')
  ),
  
  /**
   * Název R2 bucketu pro media soubory
   * 
   * @required false
   * @default "patro-media-dev"
   */
  bucketName: Config.string('BUCKET_NAME').pipe(
    Config.withDefault('patro-media-dev')
  )
})

/**
 * Complete Application Configuration
 *
 * Kombinuje všechny Config schémata do jednoho
 */
export const FullAppConfig = Config.all({
  jwt: JwtConfig,
  email: EmailConfig,
  images: ImagesConfig,
  app: AppConfig
})

// Type inference - exportujeme typy pro použití v kódu
export type JwtConfig = Config.Config.Success<typeof JwtConfig>
export type EmailConfig = Config.Config.Success<typeof EmailConfig>
export type ImagesConfig = Config.Config.Success<typeof ImagesConfig>
export type AppConfig = Config.Config.Success<typeof AppConfig>
export type FullAppConfig = Config.Config.Success<typeof FullAppConfig>