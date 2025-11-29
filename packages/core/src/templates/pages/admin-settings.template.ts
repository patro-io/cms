import { renderAdminLayoutCatalyst, AdminLayoutCatalystData } from '../layouts/admin-layout-catalyst.template'
import { renderConfirmationDialog, getConfirmationDialogScript } from '../components/confirmation-dialog.template'
import type { TranslateFn } from '../../services/i18n'

export interface SettingsPageData {
  user?: {
    name: string
    email: string
    role: string
  }
  settings?: {
    general?: GeneralSettings
    appearance?: AppearanceSettings
    security?: SecuritySettings
    notifications?: NotificationSettings
    storage?: StorageSettings
    migrations?: MigrationSettings
    databaseTools?: DatabaseToolsSettings
  }
  activeTab?: string
  version?: string
  logoUrl?: string
}

export interface GeneralSettings {
  siteName: string
  siteDescription: string
  adminEmail: string
  timezone: string
  language: string
  maintenanceMode: boolean
  availableLanguages?: Array<{ value: string; label: string }>
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'auto'
  primaryColor: string
  logoUrl: string
  favicon: string
  customCSS: string
}

export interface SecuritySettings {
  twoFactorEnabled: boolean
  sessionTimeout: number
  passwordRequirements: {
    minLength: number
    requireUppercase: boolean
    requireNumbers: boolean
    requireSymbols: boolean
  }
  ipWhitelist: string[]
}

export interface NotificationSettings {
  emailNotifications: boolean
  contentUpdates: boolean
  systemAlerts: boolean
  userRegistrations: boolean
  emailFrequency: 'immediate' | 'daily' | 'weekly'
}

export interface StorageSettings {
  maxFileSize: number
  allowedFileTypes: string[]
  storageProvider: 'local' | 'cloudflare' | 's3'
  backupFrequency: 'daily' | 'weekly' | 'monthly'
  retentionPeriod: number
}

export interface MigrationSettings {
  totalMigrations: number
  appliedMigrations: number
  pendingMigrations: number
  lastApplied?: string
  migrations: Array<{
    id: string
    name: string
    filename: string
    description?: string
    applied: boolean
    appliedAt?: string
    size?: number
  }>
}

export interface DatabaseToolsSettings {
  totalTables: number
  totalRows: number
  lastBackup?: string
  databaseSize?: string
  tables: Array<{
    name: string
    rowCount: number
  }>
}

export function renderSettingsPage(data: SettingsPageData, t: TranslateFn): string {
  const activeTab = data.activeTab || 'general'
  
  const pageContent = `
    <div>
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">${t('settings.title')}</h1>
          <p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">${t('settings.subtitle')}</p>
        </div>
        <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none flex space-x-3">
          <button
            onclick="resetSettings()"
            class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            ${t('settings.actions.resetDefaults')}
          </button>
          <button
            onclick="saveAllSettings()"
            class="inline-flex items-center justify-center rounded-lg bg-zinc-950 dark:bg-white px-3.5 py-2.5 text-sm font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm"
          >
            <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            ${t('settings.actions.saveAll')}
          </button>
        </div>
      </div>

      <!-- Settings Navigation Tabs -->
      <div class="rounded-xl bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 mb-6 overflow-hidden">
        <div class="border-b border-zinc-950/5 dark:border-white/10">
          <nav class="flex overflow-x-auto" role="tablist">
            ${renderTabButton('general', t('settings.tabs.general'), 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', activeTab, t)}
            ${renderTabButton('appearance', t('settings.tabs.appearance'), 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z', activeTab, t)}
            ${renderTabButton('security', t('settings.tabs.security'), 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', activeTab, t)}
            ${renderTabButton('notifications', t('settings.tabs.notifications'), 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', activeTab, t)}
            ${renderTabButton('storage', t('settings.tabs.storage'), 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12', activeTab, t)}
            ${renderTabButton('migrations', t('settings.tabs.migrations'), 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4', activeTab, t)}
            ${renderTabButton('database-tools', t('settings.tabs.databaseTools'), 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01', activeTab, t)}
          </nav>
        </div>
      </div>

      <!-- Global Scripts (defined before content to be available for tabs) -->
      <script>
        // Initialize tab-specific features on page load
        const currentTab = '${activeTab}';

        // Localized messages safely inlined to avoid breaking JS for languages with quotes
        const SETTINGS_SAVING_LABEL = ${JSON.stringify(t('common.saving'))};
        const SETTINGS_SAVE_SUCCESS_MESSAGE = ${JSON.stringify(t('settings.saveSuccess'))};
        const SETTINGS_SAVE_ERROR_MESSAGE = ${JSON.stringify(t('settings.saveError'))};

        async function saveAllSettings() {
          // Collect all form data
          const formData = new FormData();

          // Get all form inputs in the settings content area
          document.querySelectorAll('#settings-content input, #settings-content select, #settings-content textarea').forEach(input => {
            if (input.type === 'checkbox') {
              formData.append(input.name, input.checked ? 'true' : 'false');
            } else if (input.name) {
              formData.append(input.name, input.value);
            }
          });

          // Show loading state
          const saveBtn = document.querySelector('button[onclick="saveAllSettings()"]');
          const originalText = saveBtn.innerHTML;
          saveBtn.innerHTML = '<svg class="animate-spin -ml-0.5 mr-1.5 h-5 w-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>' + SETTINGS_SAVING_LABEL;
          saveBtn.disabled = true;

          try {
            // Determine which endpoint to call based on current tab
            let endpoint = '/admin/settings/general';
            if (currentTab === 'general') {
              endpoint = '/admin/settings/general';
            } else if (currentTab === 'appearance') {
              endpoint = '/admin/settings/appearance';
            }
            // Add more endpoints for other tabs when implemented

            const response = await fetch(endpoint, {
              method: 'POST',
              body: formData
            });

            const result = await response.json();

            if (result.success) {
              showNotification(result.message || SETTINGS_SAVE_SUCCESS_MESSAGE, 'success');
            } else {
              showNotification(result.error || SETTINGS_SAVE_ERROR_MESSAGE, 'error');
            }
          } catch (error) {
            console.error('Error saving settings:', error);
            showNotification(SETTINGS_SAVE_ERROR_MESSAGE, 'error');
          } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
          }
        }
        
        function resetSettings() {
          showConfirmDialog('reset-settings-confirm');
        }

        function performResetSettings() {
          showNotification('${t('settings.actions.resetDefaults')}', 'info');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
        
        // Migration functions
        window.refreshMigrationStatus = async function() {
          try {
            const response = await fetch('/admin/settings/api/migrations/status');
            const result = await response.json();
            
            if (result.success) {
              updateMigrationUI(result.data);
            } else {
              console.error('Failed to refresh migration status');
            }
          } catch (error) {
            console.error('Error loading migration status:', error);
          }
        };

        window.runPendingMigrations = async function() {
          const btn = document.getElementById('run-migrations-btn');
          if (!btn || btn.disabled) return;

          showConfirmDialog('run-migrations-confirm');
        };

        window.performRunMigrations = async function() {
          const btn = document.getElementById('run-migrations-btn');
          if (!btn) return;

          btn.disabled = true;
          btn.innerHTML = '${t('settings.migrations.running')}';

          try {
            const response = await fetch('/admin/settings/api/migrations/run', {
              method: 'POST'
            });
            const result = await response.json();

            if (result.success) {
              alert(result.message);
              setTimeout(() => window.refreshMigrationStatus(), 1000);
            } else {
              alert(result.error || '${t('settings.migrations.error')}');
            }
          } catch (error) {
            alert('${t('settings.migrations.error')}');
          } finally {
            btn.disabled = false;
            btn.innerHTML = '${t('settings.migrations.runPending')}';
          }
        };

        window.validateSchema = async function() {
          try {
            const response = await fetch('/admin/settings/api/migrations/validate');
            const result = await response.json();
            
            if (result.success) {
              if (result.data.valid) {
                alert('${t('settings.migrations.valid')}');
              } else {
                alert(\`${t('settings.migrations.invalid')}\`.replace('{issues}', result.data.issues.join(', ')));
              }
            } else {
              alert('${t('settings.migrations.validateError')}');
            }
          } catch (error) {
            alert('${t('settings.migrations.validateError')}');
          }
        };

        window.updateMigrationUI = function(data) {
          const totalEl = document.getElementById('total-migrations');
          const appliedEl = document.getElementById('applied-migrations');
          const pendingEl = document.getElementById('pending-migrations');
          
          if (totalEl) totalEl.textContent = data.totalMigrations;
          if (appliedEl) appliedEl.textContent = data.appliedMigrations;
          if (pendingEl) pendingEl.textContent = data.pendingMigrations;
          
          const runBtn = document.getElementById('run-migrations-btn');
          if (runBtn) {
            runBtn.disabled = data.pendingMigrations === 0;
          }
          
          // Update migrations list
          const listContainer = document.getElementById('migrations-list');
          if (listContainer && data.migrations && data.migrations.length > 0) {
            listContainer.innerHTML = data.migrations.map(migration => \`
              <div class="px-6 py-4 flex items-center justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-3">
                    <div class="flex-shrink-0">
                      \${migration.applied 
                        ? '<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
                        : '<svg class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
                      }
                    </div>
                    <div>
                      <h5 class="text-white font-medium">\${migration.name}</h5>
                      <p class="text-sm text-gray-300">\${migration.filename}</p>
                      \${migration.description ? \`<p class="text-xs text-gray-400 mt-1">\${migration.description}</p>\` : ''}
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center space-x-4 text-sm">
                  \${migration.size ? \`<span class="text-gray-400">\${(migration.size / 1024).toFixed(1)} KB</span>\` : ''}
                  <span class="px-2 py-1 rounded-full text-xs font-medium \${
                    migration.applied
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800'
                  }">
                    \${migration.applied ? '${t('settings.migrations.applied')}' : '${t('settings.migrations.pending')}'}
                  </span>
                  \${migration.appliedAt ? \`<span class="text-gray-400">\${new Date(migration.appliedAt).toLocaleDateString()}</span>\` : ''}
                </div>
              </div>
            \`).join('');
          }
        };
        
        // Database Tools functions
        window.refreshDatabaseStats = async function() {
          try {
            const response = await fetch('/admin/settings/api/database-tools/stats');
            const result = await response.json();
            
            if (result.success) {
              updateDatabaseToolsUI(result.data);
            } else {
              console.error('Failed to refresh database stats');
            }
          } catch (error) {
            console.error('Error loading database stats:', error);
          }
        };

        window.createDatabaseBackup = async function() {
          const btn = document.getElementById('create-backup-btn');
          if (!btn) return;
          
          btn.disabled = true;
          btn.innerHTML = '${t('settings.databaseTools.creatingBackup')}';
          
          try {
            const response = await fetch('/admin/settings/api/database-tools/backup', {
              method: 'POST'
            });
            const result = await response.json();
            
            if (result.success) {
              alert(result.message);
              setTimeout(() => window.refreshDatabaseStats(), 1000);
            } else {
              alert(result.error || '${t('settings.databaseTools.backupError')}');
            }
          } catch (error) {
            alert('${t('settings.databaseTools.backupError')}');
          } finally {
            btn.disabled = false;
            btn.innerHTML = '${t('settings.databaseTools.createBackup')}';
          }
        };

        window.truncateDatabase = async function() {
          // Show dangerous operation warning
          const confirmText = prompt(
            '${t('settings.databaseTools.truncateConfirm')}'
          );
          
          if (confirmText !== 'TRUNCATE ALL DATA') {
            alert('${t('settings.databaseTools.truncateCancel')}');
            return;
          }
          
          const btn = document.getElementById('truncate-db-btn');
          if (!btn) return;
          
          btn.disabled = true;
          btn.innerHTML = '${t('settings.databaseTools.truncating')}';
          
          try {
            const response = await fetch('/admin/settings/api/database-tools/truncate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                confirmText: confirmText
              })
            });
            const result = await response.json();
            
            if (result.success) {
              alert(\`${t('settings.databaseTools.truncateSuccess')}\`.replace('{tables}', result.data.tablesCleared.join(', ')));
              setTimeout(() => {
                window.refreshDatabaseStats();
                // Optionally reload page to refresh all data
                window.location.reload();
              }, 2000);
            } else {
              alert(result.error || '${t('settings.databaseTools.truncateError')}');
            }
          } catch (error) {
            alert('${t('settings.databaseTools.truncateError')}');
          } finally {
            btn.disabled = false;
            btn.innerHTML = '${t('settings.databaseTools.truncate')}';
          }
        };

        window.validateDatabase = async function() {
          try {
            const response = await fetch('/admin/settings/api/database-tools/validate');
            const result = await response.json();
            
            if (result.success) {
              if (result.data.valid) {
                alert('${t('settings.databaseTools.validateSuccess')}');
              } else {
                alert(\`${t('settings.databaseTools.validateError')}\`.replace('{issues}', result.data.issues.join('\\n')));
              }
            } else {
              alert('${t('settings.databaseTools.validateError')}');
            }
          } catch (error) {
            alert('${t('settings.databaseTools.validateError')}');
          }
        };

        window.updateDatabaseToolsUI = function(data) {
          const totalTablesEl = document.getElementById('total-tables');
          const totalRowsEl = document.getElementById('total-rows');
          const tablesListEl = document.getElementById('tables-list');

          if (totalTablesEl) totalTablesEl.textContent = data.tables.length;
          if (totalRowsEl) totalRowsEl.textContent = data.totalRows.toLocaleString();

          if (tablesListEl && data.tables && data.tables.length > 0) {
            tablesListEl.innerHTML = data.tables.map(table => \`
              <a
                href="/admin/database-tools/tables/\${table.name}"
                class="flex items-center justify-between py-3 px-4 rounded-lg bg-white dark:bg-white/5 hover:bg-zinc-50 dark:hover:bg-white/10 cursor-pointer transition-colors ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 no-underline"
              >
                <div class="flex items-center space-x-3">
                  <svg class="w-5 h-5 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  <span class="text-zinc-950 dark:text-white font-medium">\${table.name}</span>
                </div>
                <div class="flex items-center space-x-3">
                  <span class="text-zinc-500 dark:text-zinc-400 text-sm">\${table.rowCount.toLocaleString()} rows</span>
                  <svg class="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </a>
            \`).join('');
          }
        };

        // Auto-load tab-specific data after all functions are defined
        if (currentTab === 'migrations') {
          setTimeout(window.refreshMigrationStatus, 500);
        }

        if (currentTab === 'database-tools') {
          setTimeout(window.refreshDatabaseStats, 500);
        }
      </script>

      <!-- Settings Content -->
      <div class="rounded-xl bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10">
        <div id="settings-content" class="p-8">
          ${renderTabContent(activeTab, data.settings, t)}
        </div>
      </div>
    </div>

    <!-- Confirmation Dialogs -->
    ${renderConfirmationDialog({
      id: 'reset-settings-confirm',
      title: t('settings.resetDialog.title'),
      message: t('settings.resetDialog.message'),
      confirmText: t('settings.resetDialog.confirm'),
      cancelText: t('common.cancel'),
      iconColor: 'yellow',
      confirmClass: 'bg-yellow-500 hover:bg-yellow-400',
      onConfirm: 'performResetSettings()'
    })}

    ${renderConfirmationDialog({
      id: 'run-migrations-confirm',
      title: t('settings.runMigrationsDialog.title'),
      message: t('settings.runMigrationsDialog.message'),
      confirmText: t('settings.runMigrationsDialog.confirm'),
      cancelText: t('common.cancel'),
      iconColor: 'blue',
      confirmClass: 'bg-blue-500 hover:bg-blue-400',
      onConfirm: 'performRunMigrations()'
    })}

    ${getConfirmationDialogScript()}
  `

  const layoutData: AdminLayoutCatalystData = {
    title: t('settings.title'),
    pageTitle: t('settings.title'),
    currentPath: '/admin/settings',
    user: data.user,
    version: data.version,
    content: pageContent,
    logoUrl: data.logoUrl
  }

  return renderAdminLayoutCatalyst(layoutData, t)
}

function renderTabButton(tabId: string, label: string, iconPath: string, activeTab: string, t?: TranslateFn): string {
  const isActive = activeTab === tabId
  const baseClasses = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline'
  const activeClasses = isActive
    ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white'
    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'

  return `
    <a
      href="/admin/settings/${tabId}"
      data-tab="${tabId}"
      class="${baseClasses} ${activeClasses}"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/>
      </svg>
      <span>${label}</span>
    </a>
  `
}

function renderTabContent(activeTab: string, settings?: SettingsPageData['settings'], t?: TranslateFn): string {
  const translate = t || ((key: string) => key)
  
  switch (activeTab) {
    case 'general':
      return renderGeneralSettings(settings?.general, translate)
    case 'appearance':
      return renderAppearanceSettings(settings?.appearance, translate)
    case 'security':
      return renderSecuritySettings(settings?.security, translate)
    case 'notifications':
      return renderNotificationSettings(settings?.notifications, translate)
    case 'storage':
      return renderStorageSettings(settings?.storage, translate)
    case 'migrations':
      return renderMigrationSettings(settings?.migrations, translate)
    case 'database-tools':
      return renderDatabaseToolsSettings(settings?.databaseTools, translate)
    default:
      return renderGeneralSettings(settings?.general)
  }
}

function renderGeneralSettings(settings?: GeneralSettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)
  
  return `
    <div class="space-y-6">
      <div>
        <h3 class="text-lg/7 font-semibold text-zinc-950 dark:text-white">${translate('settings.general.title')}</h3>
        <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">${translate('settings.general.subtitle')}</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div>
            <label class="block text-sm/6 font-medium text-zinc-950 dark:text-white mb-2">${translate('settings.general.siteName')}</label>
            <input
              type="text"
              name="siteName"
              value="${settings?.siteName || 'PatroCMS'}"
              class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm/6 text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
              placeholder="Enter site name"
            />
          </div>

          <div>
            <label class="block text-sm/6 font-medium text-zinc-950 dark:text-white mb-2">Admin ${translate('auth.email')}</label>
            <input
              type="email"
              name="adminEmail"
              value="${settings?.adminEmail || 'admin@example.com'}"
              class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm/6 text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label class="block text-sm/6 font-medium text-zinc-950 dark:text-white mb-2">${translate('settings.general.timezone')}</label>
            <select
              name="timezone"
              class="w-full rounded-lg bg-white dark:bg-zinc-800 px-3 py-2 text-sm/6 text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
            >
              <option value="UTC" ${settings?.timezone === 'UTC' ? 'selected' : ''}>UTC</option>
              <option value="America/New_York" ${settings?.timezone === 'America/New_York' ? 'selected' : ''}>Eastern Time</option>
              <option value="America/Chicago" ${settings?.timezone === 'America/Chicago' ? 'selected' : ''}>Central Time</option>
              <option value="America/Denver" ${settings?.timezone === 'America/Denver' ? 'selected' : ''}>Mountain Time</option>
              <option value="America/Los_Angeles" ${settings?.timezone === 'America/Los_Angeles' ? 'selected' : ''}>Pacific Time</option>
            </select>
          </div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm/6 font-medium text-zinc-950 dark:text-white mb-2">${translate('settings.general.siteDescription')}</label>
            <textarea
              name="siteDescription"
              rows="3"
              class="w-full rounded-lg bg-white dark:bg-white/5 px-3 py-2 text-sm/6 text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
              placeholder="Describe your site..."
            >${settings?.siteDescription || ''}</textarea>
          </div>

          <div>
            <label class="block text-sm/6 font-medium text-zinc-950 dark:text-white mb-2">${translate('settings.general.language')}</label>
            <select
              id="language-selector"
              name="language"
              onchange="changeUserLanguage(this.value)"
              class="w-full rounded-lg bg-white dark:bg-zinc-800 px-3 py-2 text-sm/6 text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400"
            >
              ${(settings?.availableLanguages || [
                { value: 'en', label: 'English' },
                { value: 'cs', label: 'Čeština' },
                { value: 'de', label: 'Deutsch' },
                { value: 'fr', label: 'Français' },
                { value: 'es', label: 'Español' },
                { value: 'it', label: 'Italiano' },
                { value: 'pl', label: 'Polski' }
              ]).map(lang =>
                `<option value="${lang.value}" ${settings?.language === lang.value ? 'selected' : ''}>${lang.label}</option>`
              ).join('')}
            </select>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">${translate('settings.general.languageNote')}</p>
          </div>
          
          <script>
            // Localized messages for language change - safely embedded
            const LANGUAGE_SAVE_SUCCESS_MESSAGE = ${JSON.stringify(translate('settings.saveSuccess'))};
            const LANGUAGE_SAVE_ERROR_MESSAGE = ${JSON.stringify(translate('settings.saveError'))};

            window.changeUserLanguage = async function(language) {
              try {
                const response = await fetch('/admin/api/user/language', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ language })
                });
                
                const result = await response.json();
                
                if (result.success) {
                  showNotification(LANGUAGE_SAVE_SUCCESS_MESSAGE, 'success');
                  setTimeout(() => window.location.reload(), 1000);
                } else {
                  showNotification(result.error || LANGUAGE_SAVE_ERROR_MESSAGE, 'error');
                }
              } catch (error) {
                console.error('Error changing language:', error);
                showNotification(LANGUAGE_SAVE_ERROR_MESSAGE, 'error');
              }
            };
          </script>
          
          <div class="flex gap-3">
            <div class="flex h-6 shrink-0 items-center">
              <div class="group grid size-4 grid-cols-1">
                <input
                  type="checkbox"
                  id="maintenanceMode"
                  name="maintenanceMode"
                  ${settings?.maintenanceMode ? 'checked' : ''}
                  class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                />
                <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                  <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                  <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                </svg>
              </div>
            </div>
            <div class="text-sm/6">
              <label for="maintenanceMode" class="font-medium text-zinc-950 dark:text-white">
                ${translate('settings.general.maintenanceMode')}
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderAppearanceSettings(settings?: AppearanceSettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)
  
  return `
    <div class="space-y-6">
      <!-- WIP Notice -->
      <div class="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-6 ring-1 ring-inset ring-blue-600/20 dark:ring-blue-500/30">
        <div class="flex items-start space-x-3">
          <svg class="w-6 h-6 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1">
            <h4 class="text-base/7 font-semibold text-blue-900 dark:text-blue-300">${translate('settings.wip.title')}</h4>
            <p class="mt-1 text-sm/6 text-blue-700 dark:text-blue-200">
              ${translate('settings.wip.message')}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-lg font-semibold text-white mb-4">${translate('settings.appearance.title')}</h3>
        <p class="text-gray-300 mb-6">${translate('settings.appearance.subtitle')}</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.appearance.theme')}</label>
            <div class="grid grid-cols-3 gap-3">
              <label class="flex items-center space-x-2 p-3 bg-white/10 rounded-lg border border-white/20 cursor-pointer hover:bg-white/20 transition-colors">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  ${settings?.theme === 'light' ? 'checked' : ''}
                  class="text-blue-600"
                />
                <span class="text-sm text-gray-300">${translate('settings.appearance.light')}</span>
              </label>
              <label class="flex items-center space-x-2 p-3 bg-white/10 rounded-lg border border-white/20 cursor-pointer hover:bg-white/20 transition-colors">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  ${settings?.theme === 'dark' || !settings?.theme ? 'checked' : ''}
                  class="text-blue-600"
                />
                <span class="text-sm text-gray-300">${translate('settings.appearance.dark')}</span>
              </label>
              <label class="flex items-center space-x-2 p-3 bg-white/10 rounded-lg border border-white/20 cursor-pointer hover:bg-white/20 transition-colors">
                <input
                  type="radio"
                  name="theme"
                  value="auto"
                  ${settings?.theme === 'auto' ? 'checked' : ''}
                  class="text-blue-600"
                />
                <span class="text-sm text-gray-300">${translate('settings.appearance.auto')}</span>
              </label>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.appearance.primaryColor')}</label>
            <div class="flex items-center space-x-3">
              <input 
                type="color" 
                name="primaryColor"
                value="${settings?.primaryColor || '#465FFF'}"
                class="w-12 h-10 bg-white/10 border border-white/20 rounded-lg cursor-pointer"
              />
              <input 
                type="text" 
                value="${settings?.primaryColor || '#465FFF'}"
                class="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#465FFF"
              />
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.appearance.logoUrl')}</label>
            <input 
              type="url" 
              name="logoUrl"
              value="${settings?.logoUrl || ''}"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/logo.png"
            />
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.appearance.favicon')}</label>
            <input 
              type="url" 
              name="favicon"
              value="${settings?.favicon || ''}"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/favicon.ico"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.appearance.customCSS')}</label>
            <textarea
              name="customCSS"
              rows="6"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="${translate('settings.appearance.customCSSPlaceholder')}"
            >${settings?.customCSS || ''}</textarea>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderSecuritySettings(settings?: SecuritySettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)
  
  return `
    <div class="space-y-6">
      <!-- WIP Notice -->
      <div class="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-6 ring-1 ring-inset ring-blue-600/20 dark:ring-blue-500/30">
        <div class="flex items-start space-x-3">
          <svg class="w-6 h-6 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1">
            <h4 class="text-base/7 font-semibold text-blue-900 dark:text-blue-300">${translate('settings.wip.title')}</h4>
            <p class="mt-1 text-sm/6 text-blue-700 dark:text-blue-200">
              ${translate('settings.wip.message')}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-lg font-semibold text-white mb-4">${translate('settings.security.title')}</h3>
        <p class="text-gray-300 mb-6">${translate('settings.security.subtitle')}</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="flex gap-3">
            <div class="flex h-6 shrink-0 items-center">
              <div class="group grid size-4 grid-cols-1">
                <input
                  type="checkbox"
                  id="twoFactorEnabled"
                  name="twoFactorEnabled"
                  ${settings?.twoFactorEnabled ? 'checked' : ''}
                  class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                />
                <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                  <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                  <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                </svg>
              </div>
            </div>
            <div class="text-sm/6">
              <label for="twoFactorEnabled" class="font-medium text-zinc-950 dark:text-white">
                ${translate('settings.security.twoFactorEnabled')}
              </label>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.security.sessionTimeout')}</label>
            <input 
              type="number" 
              name="sessionTimeout"
              value="${settings?.sessionTimeout || 30}"
              min="5"
              max="1440"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.security.passwordRequirements')}</label>
            <div class="space-y-3">
              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="requireUppercase"
                      name="requireUppercase"
                      ${settings?.passwordRequirements?.requireUppercase ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="requireUppercase" class="font-medium text-zinc-950 dark:text-white">${translate('settings.security.requireUppercase')}</label>
                </div>
              </div>
              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="requireNumbers"
                      name="requireNumbers"
                      ${settings?.passwordRequirements?.requireNumbers ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="requireNumbers" class="font-medium text-zinc-950 dark:text-white">${translate('settings.security.requireNumbers')}</label>
                </div>
              </div>
              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="requireSymbols"
                      name="requireSymbols"
                      ${settings?.passwordRequirements?.requireSymbols ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="requireSymbols" class="font-medium text-zinc-950 dark:text-white">${translate('settings.security.requireSymbols')}</label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.security.minPasswordLength')}</label>
            <input 
              type="number" 
              name="minPasswordLength"
              value="${settings?.passwordRequirements?.minLength || 8}"
              min="6"
              max="128"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.security.ipWhitelist')}</label>
            <textarea
              name="ipWhitelist"
              rows="4"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="${translate('settings.security.ipWhitelistPlaceholder')}"
            >${settings?.ipWhitelist?.join('\n') || ''}</textarea>
            <p class="text-xs text-gray-400 mt-1">${translate('settings.security.ipWhitelistHelp')}</p>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderNotificationSettings(settings?: NotificationSettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)
  
  return `
    <div class="space-y-6">
      <!-- WIP Notice -->
      <div class="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-6 ring-1 ring-inset ring-blue-600/20 dark:ring-blue-500/30">
        <div class="flex items-start space-x-3">
          <svg class="w-6 h-6 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1">
            <h4 class="text-base/7 font-semibold text-blue-900 dark:text-blue-300">${translate('settings.wip.title')}</h4>
            <p class="mt-1 text-sm/6 text-blue-700 dark:text-blue-200">
              ${translate('settings.wip.message')}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-lg font-semibold text-white mb-4">${translate('settings.notifications.title')}</h3>
        <p class="text-gray-300 mb-6">${translate('settings.notifications.subtitle')}</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div>
            <h4 class="text-md font-medium text-white mb-3">${translate('settings.notifications.emailNotifications')}</h4>
            <div class="space-y-5">
              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="emailNotifications"
                      name="emailNotifications"
                      ${settings?.emailNotifications ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="emailNotifications" class="font-medium text-zinc-950 dark:text-white">${translate('settings.notifications.enableEmailNotifications')}</label>
                </div>
              </div>

              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="contentUpdates"
                      name="contentUpdates"
                      ${settings?.contentUpdates ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="contentUpdates" class="font-medium text-zinc-950 dark:text-white">${translate('settings.notifications.contentUpdates')}</label>
                </div>
              </div>

              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="systemAlerts"
                      name="systemAlerts"
                      ${settings?.systemAlerts ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="systemAlerts" class="font-medium text-zinc-950 dark:text-white">${translate('settings.notifications.systemAlerts')}</label>
                </div>
              </div>

              <div class="flex gap-3">
                <div class="flex h-6 shrink-0 items-center">
                  <div class="group grid size-4 grid-cols-1">
                    <input
                      type="checkbox"
                      id="userRegistrations"
                      name="userRegistrations"
                      ${settings?.userRegistrations ? 'checked' : ''}
                      class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                    />
                    <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                      <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                      <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                    </svg>
                  </div>
                </div>
                <div class="text-sm/6">
                  <label for="userRegistrations" class="font-medium text-zinc-950 dark:text-white">${translate('settings.notifications.userRegistrations')}</label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.notifications.emailFrequency')}</label>
            <select
              name="emailFrequency"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="immediate" ${settings?.emailFrequency === 'immediate' ? 'selected' : ''}>${translate('settings.notifications.immediate')}</option>
              <option value="daily" ${settings?.emailFrequency === 'daily' ? 'selected' : ''}>${translate('settings.notifications.daily')}</option>
              <option value="weekly" ${settings?.emailFrequency === 'weekly' ? 'selected' : ''}>${translate('settings.notifications.weekly')}</option>
            </select>
          </div>
          
          <div class="p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
            <div class="flex items-start space-x-3">
              <svg class="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div>
                <h5 class="text-sm font-medium text-blue-300">${translate('settings.notifications.notificationPreferences')}</h5>
                <p class="text-xs text-blue-200 mt-1">
                  ${translate('settings.notifications.criticalAlertsNote')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderStorageSettings(settings?: StorageSettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)
  
  return `
    <div class="space-y-6">
      <!-- WIP Notice -->
      <div class="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-6 ring-1 ring-inset ring-blue-600/20 dark:ring-blue-500/30">
        <div class="flex items-start space-x-3">
          <svg class="w-6 h-6 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1">
            <h4 class="text-base/7 font-semibold text-blue-900 dark:text-blue-300">${translate('settings.wip.title')}</h4>
            <p class="mt-1 text-sm/6 text-blue-700 dark:text-blue-200">
              ${translate('settings.wip.message')}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-lg font-semibold text-white mb-4">${translate('settings.storage.title')}</h3>
        <p class="text-gray-300 mb-6">${translate('settings.storage.subtitle')}</p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.storage.maxFileSize')}</label>
            <input 
              type="number" 
              name="maxFileSize"
              value="${settings?.maxFileSize || 10}"
              min="1"
              max="100"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.storage.storageProvider')}</label>
            <select
              name="storageProvider"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="local" ${settings?.storageProvider === 'local' ? 'selected' : ''}>${translate('settings.storage.localStorage')}</option>
              <option value="cloudflare" ${settings?.storageProvider === 'cloudflare' ? 'selected' : ''}>${translate('settings.storage.cloudflareR2')}</option>
              <option value="s3" ${settings?.storageProvider === 's3' ? 'selected' : ''}>${translate('settings.storage.amazonS3')}</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.storage.backupFrequency')}</label>
            <select
              name="backupFrequency"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily" ${settings?.backupFrequency === 'daily' ? 'selected' : ''}>${translate('settings.storage.daily')}</option>
              <option value="weekly" ${settings?.backupFrequency === 'weekly' ? 'selected' : ''}>${translate('settings.storage.weekly')}</option>
              <option value="monthly" ${settings?.backupFrequency === 'monthly' ? 'selected' : ''}>${translate('settings.storage.monthly')}</option>
            </select>
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.storage.allowedFileTypes')}</label>
            <textarea
              name="allowedFileTypes"
              rows="3"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="${translate('settings.storage.allowedFileTypesPlaceholder')}"
            >${settings?.allowedFileTypes?.join(', ') || 'jpg, jpeg, png, gif, pdf, docx'}</textarea>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${translate('settings.storage.retentionPeriod')}</label>
            <input 
              type="number" 
              name="retentionPeriod"
              value="${settings?.retentionPeriod || 30}"
              min="7"
              max="365"
              class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div class="p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
            <div class="flex items-start space-x-3">
              <svg class="w-5 h-5 text-green-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div>
                <h5 class="text-sm font-medium text-green-300">${translate('settings.storage.storageStatus')}</h5>
                <p class="text-xs text-green-200 mt-1">
                  ${translate('settings.storage.currentUsage')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderMigrationSettings(settings?: MigrationSettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)

  return `
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold text-white mb-4">${translate('settings.migrations.title')}</h3>
        <p class="text-gray-300 mb-6">${translate('settings.migrations.subtitle')}</p>
      </div>
      
      <!-- Migration Status Overview -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="backdrop-blur-md bg-blue-500/20 rounded-lg border border-blue-500/30 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-blue-300">${translate('settings.migrations.total')}</p>
              <p id="total-migrations" class="text-2xl font-bold text-white">${settings?.totalMigrations || '0'}</p>
            </div>
            <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
            </svg>
          </div>
        </div>
        
        <div class="backdrop-blur-md bg-green-500/20 rounded-lg border border-green-500/30 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-green-300">${translate('settings.migrations.applied')}</p>
              <p id="applied-migrations" class="text-2xl font-bold text-white">${settings?.appliedMigrations || '0'}</p>
            </div>
            <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
        </div>
        
        <div class="backdrop-blur-md bg-orange-500/20 rounded-lg border border-orange-500/30 p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-orange-300">${translate('settings.migrations.pending')}</p>
              <p id="pending-migrations" class="text-2xl font-bold text-white">${settings?.pendingMigrations || '0'}</p>
            </div>
            <svg class="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Migration Actions -->
      <div class="flex items-center space-x-4 mb-6">
        <button
          onclick="window.refreshMigrationStatus()"
          class="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          ${translate('settings.migrations.refresh')}
        </button>
        
        <button
          onclick="window.runPendingMigrations()"
          id="run-migrations-btn"
          class="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
          ${(settings?.pendingMigrations || 0) === 0 ? 'disabled' : ''}
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10v4.586a1 1 0 00.293.707l2.414 2.414a1 1 0 00.707.293H15M9 10V9a2 2 0 012-2h2a2 2 0 012 2v1"/>
          </svg>
          ${translate('settings.migrations.runPending')}
        </button>

        <button
          onclick="window.validateSchema()"
          class="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          ${translate('settings.migrations.validate')}
        </button>
      </div>

      <!-- Migrations List -->
      <div class="backdrop-blur-md bg-white/10 rounded-lg border border-white/20 overflow-hidden">
        <div class="px-6 py-4 border-b border-white/10">
          <h4 class="text-lg font-medium text-white">${translate('settings.migrations.history')}</h4>
          <p class="text-sm text-gray-300 mt-1">${translate('settings.migrations.historySubtitle')}</p>
        </div>
        
        <div id="migrations-list" class="divide-y divide-white/10">
          <div class="px-6 py-8 text-center">
            <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
            </svg>
            <p class="text-gray-300">${translate('settings.migrations.loading')}</p>
          </div>
        </div>
      </div>
    </div>

    <script>
      // Auto-load when tab becomes active
      if (currentTab === 'migrations') {
        setTimeout(refreshMigrationStatus, 500);
      }
    </script>
  `
}

function renderDatabaseToolsSettings(settings?: DatabaseToolsSettings, t?: TranslateFn): string {
  const translate = t || ((key: string) => key)

  return `
    <div class="space-y-6">
      <div>
        <h3 class="text-lg/7 font-semibold text-zinc-950 dark:text-white">${translate('settings.databaseTools.title')}</h3>
        <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">${translate('settings.databaseTools.subtitle')}</p>
      </div>

      <!-- Database Statistics -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="rounded-lg bg-white dark:bg-white/5 p-6 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">${translate('settings.databaseTools.totalTables')}</p>
              <p id="total-tables" class="mt-2 text-3xl/8 font-semibold text-zinc-950 dark:text-white">${settings?.totalTables || '0'}</p>
            </div>
            <div class="rounded-lg bg-indigo-500/10 p-3">
              <svg class="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-white dark:bg-white/5 p-6 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">${translate('settings.databaseTools.totalRows')}</p>
              <p id="total-rows" class="mt-2 text-3xl/8 font-semibold text-zinc-950 dark:text-white">${settings?.totalRows?.toLocaleString() || '0'}</p>
            </div>
            <div class="rounded-lg bg-green-500/10 p-3">
              <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Database Operations -->
      <div class="space-y-4">
        <!-- Safe Operations -->
        <div class="rounded-lg bg-white dark:bg-white/5 p-6 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10">
          <h4 class="text-base/7 font-semibold text-zinc-950 dark:text-white mb-4">${translate('settings.databaseTools.safeOperations')}</h4>
          <div class="flex flex-wrap gap-3">
            <button
              onclick="window.refreshDatabaseStats()"
              class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
            >
              <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              ${translate('settings.databaseTools.refresh')}
            </button>

            <button
              onclick="window.createDatabaseBackup()"
              id="create-backup-btn"
              class="inline-flex items-center justify-center rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors shadow-sm"
            >
              <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              ${translate('settings.databaseTools.createBackup')}
            </button>

            <button
              onclick="window.validateDatabase()"
              class="inline-flex items-center justify-center rounded-lg bg-green-600 dark:bg-green-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-green-500 dark:hover:bg-green-400 transition-colors shadow-sm"
            >
              <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              ${translate('settings.databaseTools.validate')}
            </button>
          </div>
        </div>
      </div>

      <!-- Tables List -->
      <div class="rounded-lg bg-white dark:bg-white/5 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 overflow-hidden">
        <div class="px-6 py-4 border-b border-zinc-950/10 dark:border-white/10">
          <h4 class="text-base/7 font-semibold text-zinc-950 dark:text-white">${translate('settings.databaseTools.tables')}</h4>
          <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">${translate('settings.databaseTools.tablesSubtitle')}</p>
        </div>

        <div id="tables-list" class="p-6 space-y-2">
          <div class="text-center py-8">
            <svg class="w-12 h-12 text-zinc-400 dark:text-zinc-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
            <p class="text-zinc-500 dark:text-zinc-400">${translate('settings.databaseTools.loading')}</p>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="rounded-lg bg-red-50 dark:bg-red-950/20 p-6 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
        <div class="flex items-start space-x-3">
          <svg class="w-6 h-6 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
          <div class="flex-1">
            <h4 class="text-base/7 font-semibold text-red-900 dark:text-red-400">${translate('settings.databaseTools.dangerZone')}</h4>
            <p class="mt-1 text-sm/6 text-red-700 dark:text-red-300">
              ${translate('settings.databaseTools.dangerZoneSubtitle')}
              <strong>${translate('settings.databaseTools.dangerZoneWarning').split(',')[0]},</strong> ${translate('settings.databaseTools.dangerZoneWarning').split(',')[1]}.
            </p>
            <div class="mt-4">
              <button
                onclick="window.truncateDatabase()"
                id="truncate-db-btn"
                class="inline-flex items-center justify-center rounded-lg bg-red-600 dark:bg-red-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-red-500 dark:hover:bg-red-400 transition-colors shadow-sm"
              >
                <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                ${translate('settings.databaseTools.truncate')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}