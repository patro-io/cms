export interface LogoData {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'default' | 'white' | 'dark'
  showText?: boolean
  showVersion?: boolean
  version?: string
  className?: string
  href?: string
  /** URL to logo SVG file (e.g., /files/logo.svg or custom URL) */
  logoUrl?: string
  /** Alt text for logo */
  alt?: string
}

const sizeClasses = {
  sm: 'h-6 w-auto',
  md: 'h-8 w-auto',
  lg: 'h-12 w-auto',
  xl: 'h-16 w-auto'
}

/**
 * Default inline SVG fallback (PatroCMS logo)
 * Used when no logoUrl is provided
 */
function getDefaultLogoSvg(mainFill: string, sizeClass: string, className: string): string {
  return `
    <svg class="${sizeClass} ${className}" viewBox="0 0 543 85" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path fill="${mainFill}" d="m58.88 29.24c0 22.8-17.26 26.4-26 26.4h-12.59v25.89h-19.67v-78.68h32.26c8.74 0 26 3.6 26 26.39zm-20.8 0.01c0-7.54-4.95-9.77-9.93-9.77h-7.86v19.53h7.86c4.98 0 9.93-2.22 9.93-9.76z"></path>
      <path fill="${mainFill}" d="m105.11 28.12h18.57v53.55h-18.57v-4.63c-4.46 4.11-10.19 6.58-16.44 6.58-14.21 0-25.73-12.77-25.73-28.52 0-15.76 11.52-28.53 25.73-28.53 6.25 0 11.98 2.48 16.44 6.59zm0 26.97c0-6.78-4.82-12.27-11.32-12.27-6.5 0-11.77 5.49-11.77 12.27 0 6.78 5.27 12.28 11.77 12.28 6.5 0 11.32-5.5 11.32-12.28z"></path>
      <path fill="${mainFill}" d="m173.24 68.19v15.42c-10.87 0-27.94-2.3-27.94-20.9v-18.13h-5.87v-16.38h5.87v-16.04h18.57v47.29c0 3.19 1.73 8.74 9.37 8.74z"></path>
      <path fill="#06b6d4" d="m160.05 36.88c0-5.86 4.6-10.62 10.29-10.62 5.68 0 10.29 4.76 10.29 10.62 0 5.87-4.61 10.63-10.29 10.63-5.69 0-10.29-4.76-10.29-10.63z"></path>
      <path fill="${mainFill}" d="m200.08 81.6v-53.43h18.58v53.43z"></path>
      <path fill="#06b6d4" d="m214.08 36.89c0-5.87 4.61-10.63 10.29-10.63 5.69 0 10.3 4.76 10.3 10.63 0 5.87-4.61 10.62-10.3 10.62-5.68 0-10.29-4.75-10.29-10.62z"></path>
      <path fill="${mainFill}" d="m298.21 54.93c0 15.84-12.35 28.83-31.27 28.83-18.91 0-31.26-12.99-31.26-28.83 0-15.85 12.35-28.7 31.26-28.7 18.92 0 31.27 12.85 31.27 28.7zm-19.39 0.07c0-6.86-5.32-12.42-11.88-12.42-6.55 0-11.87 5.56-11.87 12.42 0 6.85 5.32 12.41 11.87 12.41 6.56 0 11.88-5.56 11.88-12.41z"></path>
      <path fill="${mainFill}" d="m381.15 62.53c-6.66 12.91-19.78 21.66-36.02 21.66-25.73 0-40.78-18.66-40.78-41.69 0-23.03 15.05-41.69 40.78-41.69 16.2 0 29.15 8.56 35.83 21.24l-19.36 8.19c-3.26-7.02-9.35-11.73-16.92-11.73-12.32 0-19.51 10.74-19.51 23.99 0 13.25 7.19 23.99 19.51 23.99 7.55 0 13.69-4.77 16.96-11.87z"></path>
      <path fill="${mainFill}" d="m481.3 81.53h-19.67l-6.82-44.45-12.73 32.69-4.57 11.76h-8.66l-4.58-11.76-12.73-32.69-6.82 44.45h-19.67l13.16-78.67v-0.01h18.58 1.09l15.3 42.29 15.29-42.29h1.09 18.58z"></path>
      <path fill="${mainFill}" d="m542.38 57.05c0 18.2-14.32 26.66-29.64 26.66-15.32 0-26.9-8.85-26.9-8.85l8.53-16.46c5.18 5.42 13.64 8 18.37 8 4.73 0 8.73-3.66 8.73-7.48 0-13.85-32.48-5.1-32.48-32.28 0-17.43 12.48-25.83 26.49-25.83 13.51 0 23.75 6.35 23.75 6.35l-7.92 15.94c0 0-6.62-5.32-12.79-5.32-4.6 0-8.72 1.71-8.72 6.77 0 11.77 32.57 4.2 32.58 32.5z"></path>
    </svg>
  `
}

/**
 * Render logo component
 * 
 * Supports:
 * - External SVG files via logoUrl (e.g., /files/logo.svg)
 * - Inline SVG fallback (default PatroCMS logo)
 * - Multiple sizes and variants
 * - Optional version badge
 * 
 * @example
 * ```typescript
 * // External logo from R2
 * renderLogo({ logoUrl: '/files/logo.svg' })
 * 
 * // Custom logo URL
 * renderLogo({ logoUrl: 'https://cdn.example.com/logo.svg' })
 * 
 * // Fallback to inline SVG
 * renderLogo({ size: 'lg' })
 * ```
 */
export function renderLogo(data: LogoData = {}): string {
  const {
    size = 'md',
    variant = 'default',
    showText = true,
    showVersion = true,
    version,
    className = '',
    href,
    logoUrl,
    alt = 'PatroCMS Logo'
  } = data

  const sizeClass = sizeClasses[size]
  const mainFill = variant === 'white' ? '#ffffff' : variant === 'dark' ? '#1f2937' : '#F1F2F2'

  // Determine logo source
  const logoSvg = logoUrl 
    ? `<img src="${logoUrl}" alt="${alt}" class="${sizeClass} ${className}" loading="lazy" />`
    : getDefaultLogoSvg(mainFill, sizeClass, className)

  const versionBadge = showVersion && version ? `
    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
      variant === 'white'
        ? 'bg-white/10 text-white/80 ring-white/20'
        : 'bg-cyan-50 text-cyan-700 ring-cyan-700/10 dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-500/20'
    }">
      ${version}
    </span>
  ` : ''

  const logoContent = showText ? `
    <div class="flex items-center gap-2 ${className}">
      ${logoSvg}
      ${versionBadge}
    </div>
  ` : logoSvg

  if (href) {
    return `<a href="${href}" class="inline-block hover:opacity-80 transition-opacity">${logoContent}</a>`
  }

  return logoContent
}

/**
 * Get logo URL from environment or settings
 *
 * Priority:
 * 1. Custom logo from settings (database)
 * 2. Environment variable LOGO_URL
 * 3. Default /files/logo.svg
 * 4. Fallback to inline SVG (if file doesn't exist)
 *
 * @param env - Cloudflare environment bindings
 * @param settingsLogoUrl - Optional logo URL from appearance settings (database)
 * @returns Logo URL or undefined (triggers inline SVG fallback)
 */
export function getLogoUrl(env?: Record<string, unknown>, settingsLogoUrl?: string): string | undefined {
  // Priority 1: Logo from appearance settings (database)
  if (settingsLogoUrl && settingsLogoUrl.trim() !== '') {
    return settingsLogoUrl
  }
  
  // Priority 2: Environment variable
  if (env?.LOGO_URL && typeof env.LOGO_URL === 'string') {
    return env.LOGO_URL
  }
  
  // Priority 3: Default to /files/logo.svg (served from R2)
  // If file doesn't exist, renderLogo will use inline SVG fallback
  return '/files/logo.svg'
}