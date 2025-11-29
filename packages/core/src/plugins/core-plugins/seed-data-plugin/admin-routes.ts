import { Hono } from 'hono'
import { SeedDataService } from './services/seed-data-service'
import { requireAuth, i18nMiddleware } from '../../../middleware'

type Bindings = {
  DB: D1Database
}

export function createSeedDataAdminRoutes() {
  const routes = new Hono<{ Bindings: Bindings }>()

  // Apply authentication and i18n middleware
  routes.use('*', requireAuth())
  routes.use('*', i18nMiddleware())

  // Get seed data status/info
  routes.get('/', async (c) => {
    const t = (c as any).get('t') || ((key: string) => key)
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Seed Data - PatroCMS Admin</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f5f5;
              padding: 2rem;
            }
            .container {
              max-width: 800px;
              margin: 0 auto;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              padding: 2rem;
            }
            h1 {
              color: #333;
              margin-bottom: 1rem;
              font-size: 2rem;
            }
            .description {
              color: #666;
              margin-bottom: 2rem;
              line-height: 1.6;
            }
            .card {
              background: #f9f9f9;
              border-radius: 6px;
              padding: 1.5rem;
              margin-bottom: 1.5rem;
            }
            .card h2 {
              color: #333;
              font-size: 1.25rem;
              margin-bottom: 0.75rem;
            }
            .card p {
              color: #666;
              line-height: 1.6;
              margin-bottom: 1rem;
            }
            .card ul {
              color: #666;
              margin-left: 1.5rem;
              margin-bottom: 1rem;
            }
            .card li {
              margin-bottom: 0.5rem;
            }
            button {
              background: #3b82f6;
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 6px;
              font-size: 1rem;
              cursor: pointer;
              transition: background 0.2s;
            }
            button:hover {
              background: #2563eb;
            }
            button:disabled {
              background: #94a3b8;
              cursor: not-allowed;
            }
            .danger {
              background: #ef4444;
            }
            .danger:hover {
              background: #dc2626;
            }
            .warning {
              background: #f59e0b;
              color: #fff;
              padding: 1rem;
              border-radius: 6px;
              margin-bottom: 1.5rem;
            }
            .success {
              background: #10b981;
              color: #fff;
              padding: 1rem;
              border-radius: 6px;
              margin-bottom: 1.5rem;
              display: none;
            }
            .error {
              background: #ef4444;
              color: #fff;
              padding: 1rem;
              border-radius: 6px;
              margin-bottom: 1.5rem;
              display: none;
            }
            .loading {
              display: none;
              margin-left: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🌱 ${t('plugins.seedData.title')}</h1>
            <p class="description">
              ${t('plugins.seedData.description')}
            </p>

            <div class="warning">
              <strong>⚠️ ${t('plugins.seedData.warning')}:</strong> ${t('plugins.seedData.warningText')}
            </div>

            <div class="success" id="successMessage"></div>
            <div class="error" id="errorMessage"></div>

            <div class="card">
              <h2>${t('plugins.seedData.whatWillBeCreated')}</h2>
              <ul>
                <li><strong>${t('plugins.seedData.users')}:</strong> ${t('plugins.seedData.usersDesc')}</li>
                <li><strong>${t('plugins.seedData.content')}:</strong> ${t('plugins.seedData.contentDesc')}</li>
                <li><strong>${t('plugins.seedData.passwords')}:</strong> ${t('plugins.seedData.passwordsDesc')}</li>
                <li><strong>${t('plugins.seedData.dates')}:</strong> ${t('plugins.seedData.datesDesc')}</li>
                <li><strong>${t('plugins.seedData.statuses')}:</strong> ${t('plugins.seedData.statusesDesc')}</li>
              </ul>
            </div>

            <div class="card">
              <h2>${t('plugins.seedData.generateTitle')}</h2>
              <p>${t('plugins.seedData.generateDesc')}</p>
              <button id="seedButton" onclick="generateSeedData()">
                ${t('plugins.seedData.generateButton')}
                <span class="loading" id="loading">...</span>
              </button>
            </div>

            <div class="card">
              <h2>${t('plugins.seedData.clearTitle')}</h2>
              <p>${t('plugins.seedData.clearDesc')}</p>
              <button class="danger" id="clearButton" onclick="clearSeedData()">
                ${t('plugins.seedData.clearButton')}
                <span class="loading" id="clearLoading">...</span>
              </button>
            </div>
          </div>

          <script>
            async function generateSeedData() {
              const button = document.getElementById('seedButton');
              const loading = document.getElementById('loading');
              const success = document.getElementById('successMessage');
              const error = document.getElementById('errorMessage');

              button.disabled = true;
              loading.style.display = 'inline';
              success.style.display = 'none';
              error.style.display = 'none';

              try {
                const response = await fetch('/admin/seed-data/generate', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });

                const data = await response.json();

                if (response.ok) {
                  success.textContent = \`✅ Successfully created \${data.users} users and \${data.content} content items!\`;
                  success.style.display = 'block';
                } else {
                  throw new Error(data.error || 'Failed to generate seed data');
                }
              } catch (err) {
                error.textContent = \`❌ Error: \${err.message}\`;
                error.style.display = 'block';
              } finally {
                button.disabled = false;
                loading.style.display = 'none';
              }
            }

            async function clearSeedData() {
              if (!confirm('Are you sure you want to clear all data? This cannot be undone!')) {
                return;
              }

              const button = document.getElementById('clearButton');
              const loading = document.getElementById('clearLoading');
              const success = document.getElementById('successMessage');
              const error = document.getElementById('errorMessage');

              button.disabled = true;
              loading.style.display = 'inline';
              success.style.display = 'none';
              error.style.display = 'none';

              try {
                const response = await fetch('/admin/seed-data/clear', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });

                const data = await response.json();

                if (response.ok) {
                  success.textContent = '✅ Successfully cleared all seed data!';
                  success.style.display = 'block';
                } else {
                  throw new Error(data.error || 'Failed to clear seed data');
                }
              } catch (err) {
                error.textContent = \`❌ Error: \${err.message}\`;
                error.style.display = 'block';
              } finally {
                button.disabled = false;
                loading.style.display = 'none';
              }
            }
          </script>
        </body>
      </html>
    `
    return c.html(html)
  })

  // Generate seed data
  routes.post('/generate', async (c) => {
    try {
      const db = c.env.DB
      const seedService = new SeedDataService(db)

      const result = await seedService.seedAll()

      return c.json({
        success: true,
        users: result.users,
        content: result.content
      })
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message
      }, 500)
    }
  })

  // Clear seed data
  routes.post('/clear', async (c) => {
    try {
      const db = c.env.DB
      const seedService = new SeedDataService(db)

      await seedService.clearSeedData()

      return c.json({
        success: true
      })
    } catch (error: any) {
      return c.json({
        success: false,
        error: error.message
      }, 500)
    }
  })

  return routes
}
