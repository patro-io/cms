/**
 * Email Plugin
 *
 * Send transactional emails using Resend
 * Handles registration, verification, password reset, and one-time codes
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import { PluginBuilder } from '../../sdk/plugin-builder'
import type { Plugin } from '@patro-io/cms'
import { renderAdminLayout } from '../../../templates/layouts/admin-layout-v2.template'
import { i18nMiddleware } from '../../../middleware/i18n'

export function createEmailPlugin(): Plugin {
  const builder = PluginBuilder.create({
    name: 'email',
    version: '1.0.0-beta.1',
    description: 'Send transactional emails using Resend'
  })

  // Add plugin metadata
  builder.metadata({
    author: {
      name: 'Patro',
      email: 'team@patro.io',
      url: 'https://patro.io'
    },
    license: 'MIT',
    compatibility: '^2.0.0'
  })

  // Create the Email Settings route
  const emailRoutes = new Hono()

  // Apply i18n middleware to ensure translations work correctly
  emailRoutes.use('*', i18nMiddleware())

  emailRoutes.get('/settings', async (c: any) => {
    const currentUser = c.get('user') as { email?: string; role?: string } | undefined
    const t = c.get('t') || ((key: string) => key)
    const db = c.env.DB

    // Load current settings from database
    const plugin = await db.prepare(`
      SELECT settings FROM plugins WHERE id = 'email'
    `).first() as { settings: string | null } | null

    const settings = plugin?.settings ? JSON.parse(plugin.settings) : {}

    const contentHTML = html`
      <div class="p-8">
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-zinc-950 dark:text-white mb-2">${t('plugins.email.title')}</h1>
          <p class="text-zinc-600 dark:text-zinc-400">${t('plugins.email.subtitle')}</p>
        </div>

        <!-- Settings Form -->
        <div class="max-w-3xl">
          <!-- Main Settings Card -->
          <div class="rounded-xl bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-6 mb-6">
            <h2 class="text-xl font-semibold text-zinc-950 dark:text-white mb-4">${t('plugins.email.resendConfig')}</h2>

            <form id="emailSettingsForm" class="space-y-6">
              <!-- API Key -->
              <div>
                <label for="apiKey" class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
                  ${t('plugins.email.apiKey')} <span class="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="apiKey"
                  name="apiKey"
                  value="${settings.apiKey || ''}"
                  class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  placeholder="re_..."
                  required
                />
                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  ${t('plugins.email.apiKeyHelp')} <a href="https://resend.com/api-keys" target="_blank" class="text-indigo-600 dark:text-indigo-400 hover:underline">resend.com/api-keys</a>
                </p>
              </div>

              <!-- From Email -->
              <div>
                <label for="fromEmail" class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
                  ${t('plugins.email.fromEmail')} <span class="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="fromEmail"
                  name="fromEmail"
                  value="${settings.fromEmail || ''}"
                  class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  placeholder="noreply@yourdomain.com"
                  required
                />
                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  ${t('plugins.email.fromEmailHelp')}
                </p>
              </div>

              <!-- From Name -->
              <div>
                <label for="fromName" class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
                  ${t('plugins.email.fromName')} <span class="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="fromName"
                  name="fromName"
                  value="${settings.fromName || ''}"
                  class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  placeholder="${t('plugins.email.fromNamePlaceholder')}"
                  required
                />
              </div>

              <!-- Reply To -->
              <div>
                <label for="replyTo" class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
                  ${t('plugins.email.replyTo')}
                </label>
                <input
                  type="email"
                  id="replyTo"
                  name="replyTo"
                  value="${settings.replyTo || ''}"
                  class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  placeholder="support@yourdomain.com"
                />
              </div>

              <!-- Logo URL -->
              <div>
                <label for="logoUrl" class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
                  ${t('plugins.email.logoUrl')}
                </label>
                <input
                  type="url"
                  id="logoUrl"
                  name="logoUrl"
                  value="${settings.logoUrl || ''}"
                  class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  placeholder="https://yourdomain.com/logo.png"
                />
                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  ${t('plugins.email.logoUrlHelp')}
                </p>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-3 pt-4">
                <button
                  type="submit"
                  class="inline-flex items-center justify-center rounded-lg bg-zinc-950 dark:bg-white px-3.5 py-2.5 text-sm font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm"
                >
                  ${t('plugins.email.saveSettings')}
                </button>
                <button
                  type="button"
                  id="testEmailBtn"
                  class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                >
                  ${t('plugins.email.sendTestEmail')}
                </button>
                <button
                  type="button"
                  id="resetBtn"
                  class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                >
                  ${t('plugins.email.reset')}
                </button>
              </div>
            </form>
          </div>

          <!-- Status Message -->
          <div id="statusMessage" class="hidden rounded-xl p-4 mb-6"></div>

          <!-- Info Card -->
          <div class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-100 dark:ring-indigo-900/50 p-6">
            <h3 class="font-semibold text-indigo-900 dark:text-indigo-300 mb-3">
              ${t('plugins.email.templatesIncluded')}
            </h3>
            <ul class="text-sm text-indigo-800 dark:text-indigo-200 space-y-2">
              <li>${t('plugins.email.templateRegistration')}</li>
              <li>${t('plugins.email.templateVerification')}</li>
              <li>${t('plugins.email.templatePasswordReset')}</li>
              <li>${t('plugins.email.templateOTP')}</li>
            </ul>
            <p class="text-xs text-indigo-700 dark:text-indigo-300 mt-4">
              ${t('plugins.email.templatesNote')}
            </p>
          </div>
        </div>
      </div>

      <script>
        // Form submission handler
        document.getElementById('emailSettingsForm').addEventListener('submit', async (e) => {
          e.preventDefault()
          const formData = new FormData(e.target)
          const data = Object.fromEntries(formData.entries())

          const statusEl = document.getElementById('statusMessage')

          try {
            const response = await fetch('/admin/plugins/email/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            })

            if (response.ok) {
              statusEl.className = 'rounded-xl bg-green-50 dark:bg-green-950/30 ring-1 ring-green-100 dark:ring-green-900/50 p-4 mb-6 text-green-900 dark:text-green-200'
              statusEl.innerHTML = '${t('plugins.email.saveSuccess')}'
              statusEl.classList.remove('hidden')
              setTimeout(() => statusEl.classList.add('hidden'), 3000)
            } else {
              throw new Error('Failed to save settings')
            }
          } catch (error) {
            statusEl.className = 'rounded-xl bg-red-50 dark:bg-red-950/30 ring-1 ring-red-100 dark:ring-red-900/50 p-4 mb-6 text-red-900 dark:text-red-200'
            statusEl.innerHTML = '${t('plugins.email.saveError')}'
            statusEl.classList.remove('hidden')
          }
        })

        // Test email handler
        document.getElementById('testEmailBtn').addEventListener('click', async () => {
          // Prompt for destination email
          const toEmail = prompt('${t('plugins.email.enterTestEmail')}')
          if (!toEmail) return

          // Basic email validation
          if (!toEmail.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) {
            alert('Please enter a valid email address')
            return
          }

          const statusEl = document.getElementById('statusMessage')

          statusEl.className = 'rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-100 dark:ring-indigo-900/50 p-4 mb-6 text-indigo-900 dark:text-indigo-200'
          statusEl.innerHTML = '${t('plugins.email.sendingTestEmail')}' + ' ' + toEmail
          statusEl.classList.remove('hidden')

          try {
            const response = await fetch('/admin/plugins/email/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toEmail })
            })

            const data = await response.json()

            if (response.ok) {
              statusEl.className = 'rounded-xl bg-green-50 dark:bg-green-950/30 ring-1 ring-green-100 dark:ring-green-900/50 p-4 mb-6 text-green-900 dark:text-green-200'
              statusEl.innerHTML = data && data.message ? data.message : '${t('plugins.email.testEmailSuccess')}'
            } else {
              statusEl.className = 'rounded-xl bg-red-50 dark:bg-red-950/30 ring-1 ring-red-100 dark:ring-red-900/50 p-4 mb-6 text-red-900 dark:text-red-200'
              statusEl.innerHTML = data && data.error ? data.error : '${t('plugins.email.testEmailError')}'
            }
          } catch (error) {
            statusEl.className = 'rounded-xl bg-red-50 dark:bg-red-950/30 ring-1 ring-red-100 dark:ring-red-900/50 p-4 mb-6 text-red-900 dark:text-red-200'
            statusEl.innerHTML = '${t('plugins.email.networkError')}'
          }
        })

        // Reset button handler
        document.getElementById('resetBtn').addEventListener('click', () => {
          document.getElementById('emailSettingsForm').reset()
        })
      </script>
    `

    const resolvedContent = await contentHTML

    const layoutUser = currentUser
      ? {
          name: currentUser.email || 'User',
          email: currentUser.email || '',
          role: currentUser.role || 'user'
        }
      : undefined

    return c.html(
      renderAdminLayout(
        {
          title: t('plugins.email.title'),
          content: resolvedContent,
          user: layoutUser,
          currentPath: '/admin/plugins/email/settings'
        },
        t
      )
    )
  })

  // POST endpoint for saving settings
  emailRoutes.post('/settings', async (c: any) => {
    try {
      const body = await c.req.json()
      const db = c.env.DB

      // Update plugin settings in database
      await db.prepare(`
        UPDATE plugins
        SET settings = ?,
            updated_at = unixepoch()
        WHERE id = 'email'
      `).bind(JSON.stringify(body)).run()

      return c.json({ success: true })
    } catch (error) {
      console.error('Error saving email settings:', error)
      return c.json({ success: false, error: 'Failed to save settings' }, 500)
    }
  })

  // POST endpoint for test email
  emailRoutes.post('/test', async (c: any) => {
    try {
      const db = c.env.DB
      const body = await c.req.json()

      // Load settings from database
      const plugin = await db.prepare(`
        SELECT settings FROM plugins WHERE id = 'email'
      `).first() as { settings: string | null } | null

      if (!plugin?.settings) {
        return c.json({
          success: false,
          error: 'Email settings not configured. Please save your settings first.'
        }, 400)
      }

      const settings = JSON.parse(plugin.settings)

      // Validate required settings
      if (!settings.apiKey || !settings.fromEmail || !settings.fromName) {
        return c.json({
          success: false,
          error: 'Missing required settings. Please configure API Key, From Email, and From Name.'
        }, 400)
      }

      // Use provided email or fallback to fromEmail
      const toEmail = body.toEmail || settings.fromEmail

      // Validate email format
      if (!toEmail.match(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/)) {
        return c.json({
          success: false,
          error: 'Invalid email address format'
        }, 400)
      }

      // Send test email via Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${settings.fromName} <${settings.fromEmail}>`,
          to: [toEmail],
          subject: 'Test Email from PatroCMS',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #667eea;">Test Email Successful!</h1>
              <p>This is a test email from your PatroCMS Email plugin.</p>
              <p><strong>Configuration:</strong></p>
              <ul>
                <li>From: ${settings.fromName} &lt;${settings.fromEmail}&gt;</li>
                <li>Reply-To: ${settings.replyTo || 'Not set'}</li>
                <li>Sent at: ${new Date().toISOString()}</li>
              </ul>
              <p>Your email settings are working correctly!</p>
            </div>
          `,
          reply_to: settings.replyTo || settings.fromEmail
        })
      })

      const data = await response.json() as any

      if (!response.ok) {
        console.error('Resend API error:', data)
        return c.json({
          success: false,
          error: data.message || 'Failed to send test email. Check your API key and domain verification.'
        }, response.status)
      }

      return c.json({
        success: true,
        message: `Test email sent successfully to ${toEmail}`,
        emailId: data.id
      })

    } catch (error: any) {
      console.error('Test email error:', error)
      return c.json({
        success: false,
        error: error.message || 'An error occurred while sending test email'
      }, 500)
    }
  })

  // Register the route
  builder.addRoute('/admin/plugins/email', emailRoutes, {
    description: 'Email plugin settings',
    requiresAuth: true,
    priority: 80
  })

  // Add menu item
  builder.addMenuItem('Email', '/admin/plugins/email/settings', {
    icon: 'envelope',
    order: 80,
    permissions: ['email:manage']
  })

  // Add lifecycle hooks
  builder.lifecycle({
    activate: async () => {
      console.info('Email plugin activated')
    },

    deactivate: async () => {
      console.info('Email plugin deactivated')
    }
  })

  return builder.build() as Plugin
}

// Export the plugin instance
export const emailPlugin = createEmailPlugin()
