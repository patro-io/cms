import {
  getMDXEditorInitScript,
  getMDXEditorScripts,
} from "../../plugins/available/easy-mdx";
import {
  getQuillCDN,
  getQuillInitScript,
} from "../../plugins/core-plugins/quill-editor";
import type { TranslateFn } from "../../services/i18n";
import { renderAlert } from "../alert.template";
import {
  FieldDefinition,
  renderDynamicField,
  renderFieldGroup,
} from "../components/dynamic-field.template";
import {
  getConfirmationDialogScript,
  renderConfirmationDialog,
} from "../confirmation-dialog.template";
import {
  AdminLayoutCatalystData,
  renderAdminLayoutCatalyst,
} from "../layouts/admin-layout-catalyst.template";

export interface Collection {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  schema: any;
}

/**
 * Translation info for sidebar widget
 */
export interface TranslationItem {
  language: string;
  contentId: string;
  status: string;
  source: 'manual' | 'ai';
  title?: string;
  isCurrent: boolean;
}

/**
 * Translations data for sidebar widget
 */
export interface TranslationsData {
  currentLanguage: string;
  groupId?: string;
  items: TranslationItem[];
  availableTargetLanguages: string[];
}

export interface ContentFormData {
  id?: string;
  title?: string;
  slug?: string;
  data?: any;
  status?: string;
  scheduled_publish_at?: number;
  scheduled_unpublish_at?: number;
  review_status?: string;
  meta_title?: string;
  meta_description?: string;
  created_at?: number;
  updated_at?: number;
  published_at?: number;
  author_id?: string;
  // Localization fields
  language?: string; // content.language (DB column)
  defaultLanguage?: string; // Default language from AI Translator plugin settings
  translationGroupId?: string; // content.translation_group_id
  translationSource?: 'manual' | 'ai'; // content.translation_source
  availableLanguages?: {
    code: string;
    label: string;
  }[];
  // Translations widget data (populated from API)
  translations?: TranslationsData;
  collection: Collection;
  fields: FieldDefinition[];
  isEdit?: boolean;
  error?: string;
  success?: string;
  validationErrors?: Record<string, string[]>;
  workflowEnabled?: boolean; // New flag to indicate if workflow plugin is active
  quillEnabled?: boolean; // Flag to indicate if Quill plugin is active
  quillSettings?: {
    version?: string;
    defaultHeight?: number;
    defaultToolbar?: string;
    theme?: string;
  };
  mdxeditorEnabled?: boolean; // Flag to indicate if MDXEditor plugin is active
  mdxeditorSettings?: {
    defaultHeight?: number;
    toolbar?: string;
    placeholder?: string;
  };
  referrerParams?: string; // URL parameters to preserve filters when returning to list
  user?: {
    name: string;
    email: string;
    role: string;
  };
  version?: string;
  logoUrl?: string;
}

/**
 * Get language display name
 */
function getLanguageDisplayName(code: string): string {
  const names: Record<string, string> = {
    cs: 'Čeština',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    pl: 'Polski'
  };
  return names[code] || code.toUpperCase();
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status: string): string {
  const statusConfig: Record<string, { class: string; text: string }> = {
    draft: {
      class: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300',
      text: 'Draft'
    },
    review: {
      class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      text: 'Review'
    },
    published: {
      class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      text: 'Published'
    },
    archived: {
      class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      text: 'Archived'
    }
  };
  const config = statusConfig[status] || statusConfig['draft'];
  return `<span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${config?.class || 'bg-zinc-100'}">${config?.text || status}</span>`;
}

/**
 * Get source badge HTML (AI or Manual)
 */
function getSourceBadge(source: 'manual' | 'ai'): string {
  if (source === 'ai') {
    return `<span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
      <svg class="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
      AI
    </span>`;
  }
  return '';
}

/**
 * Render the translations widget for the sidebar
 */
function renderTranslationsWidget(data: ContentFormData, t: TranslateFn, isEdit: boolean): string {
  // Only show for edit mode with content that has an ID
  if (!isEdit || !data.id) {
    return '';
  }

  const currentLanguage = data.language || 'en';
  const translationGroupId = data.translationGroupId;
  const translationSource = data.translationSource || 'manual';

  return `
    <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-6">
      <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white mb-4 flex items-center gap-2">
        <svg class="h-5 w-5 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"/>
        </svg>
        ${t('content.form.languageVersions') || 'Language Versions'}
      </h3>

      <!-- Current Language Info -->
      <div class="mb-4 p-3 rounded-lg bg-white dark:bg-zinc-800 ring-1 ring-zinc-950/5 dark:ring-white/10">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">${getLanguageFlag(currentLanguage)}</span>
            <span class="font-medium text-zinc-950 dark:text-white">${getLanguageDisplayName(currentLanguage)}</span>
          </div>
          <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300">
            ${t('content.form.currentVersion') || 'Current'}
          </span>
        </div>
        ${translationSource === 'ai' ? `
          <div class="mt-2">
            ${getSourceBadge('ai')}
          </div>
        ` : ''}
      </div>

      <!-- Translations List (loaded via HTMX) -->
      <div
        id="translations-list"
        hx-get="/admin/content/${data.id}/translations"
        hx-trigger="load"
        hx-target="#translations-list"
        hx-swap="innerHTML"
      >
        <div class="flex items-center justify-center py-4">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-500 dark:border-zinc-400"></div>
          <span class="ml-2 text-sm text-zinc-500 dark:text-zinc-400">${t('common.loading') || 'Loading...'}</span>
        </div>
      </div>

      <!-- Create Translation Button -->
      <div class="mt-4 pt-4 border-t border-zinc-950/5 dark:border-white/10">
        <button
          type="button"
          onclick="showCreateTranslationModal('${data.id}')"
          class="w-full inline-flex items-center justify-center gap-x-2 px-3 py-2 text-sm font-medium text-zinc-950 dark:text-white bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10 transition-colors"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          ${t('content.form.createTranslation') || 'Create Translation'}
        </button>
      </div>
    </div>

    <!-- Create Translation Modal -->
    <div id="create-translation-modal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div class="rounded-xl bg-white dark:bg-zinc-900 shadow-xl ring-1 ring-zinc-950/5 dark:ring-white/10 p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold text-zinc-950 dark:text-white mb-4 flex items-center gap-2">
          <svg class="h-5 w-5 text-zinc-500 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          ${t('content.form.createNewTranslation') || 'Create New Translation'}
        </h3>
        
        <form id="create-translation-form" onsubmit="submitCreateTranslation(event)">
          <div class="mb-4">
            <label for="target-language" class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">
              ${t('content.form.targetLanguage') || 'Target Language'}
            </label>
            <select
              id="target-language"
              name="targetLanguage"
              class="w-full rounded-lg bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-950 dark:text-white shadow-sm ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white"
            >
              <option value="">${t('content.form.selectLanguage') || 'Select language...'}</option>
              <!-- Options will be populated dynamically -->
            </select>
          </div>

          <div class="mb-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="use-ai-translation"
                name="useAi"
                class="rounded border-zinc-300 dark:border-zinc-600 text-lime-600 focus:ring-lime-500 dark:bg-zinc-700"
              >
              <span class="text-sm text-zinc-950 dark:text-white">
                ${t('content.form.useAiTranslation') || 'Use AI Translation'}
              </span>
            </label>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              ${t('content.form.aiTranslationHint') || 'Automatically translate content using AI'}
            </p>
          </div>

          <div class="flex justify-end gap-3">
            <button
              type="button"
              onclick="hideCreateTranslationModal()"
              class="rounded-lg bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              ${t('common.cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-zinc-950 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              ${t('content.form.createTranslation') || 'Create Translation'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      // Translation widget functions
      let currentContentIdForTranslation = null;

      function showCreateTranslationModal(contentId) {
        currentContentIdForTranslation = contentId;
        
        // Fetch available languages
        fetch('/admin/content/' + contentId + '/translations')
          .then(response => response.json())
          .then(data => {
            if (data.success && data.availableTargetLanguages) {
              const select = document.getElementById('target-language');
              select.innerHTML = '<option value="">Select language...</option>';
              
              const languageNames = {
                cs: 'Čeština',
                en: 'English',
                de: 'Deutsch',
                fr: 'Français',
                es: 'Español',
                it: 'Italiano',
                pl: 'Polski'
              };
              
              data.availableTargetLanguages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang;
                option.textContent = languageNames[lang] || lang.toUpperCase();
                select.appendChild(option);
              });
            }
          })
          .catch(error => {
            console.error('Error fetching available languages:', error);
          });
        
        document.getElementById('create-translation-modal').classList.remove('hidden');
      }

      function hideCreateTranslationModal() {
        document.getElementById('create-translation-modal').classList.add('hidden');
        currentContentIdForTranslation = null;
      }

      function submitCreateTranslation(event) {
        event.preventDefault();
        
        const targetLanguage = document.getElementById('target-language').value;
        const useAi = document.getElementById('use-ai-translation').checked;
        
        if (!targetLanguage) {
          showNotification('${t('content.form.selectLanguageError') || 'Prosím vyberte cílový jazyk'}', 'error');
          return;
        }
        
        if (!currentContentIdForTranslation) {
          showNotification('${t('content.form.invalidContentId') || 'Neplatné ID obsahu'}', 'error');
          return;
        }
        
        // Show loading state
        const loadingMessage = useAi
          ? '${t('content.form.creatingAiTranslation') || 'Vytvářím AI překlad, chvíli strpení...'}'
          : '${t('content.form.creatingTranslation') || 'Vytvářím překlad...'}';
        showNotification(loadingMessage, 'info');
        
        fetch('/admin/content/' + currentContentIdForTranslation + '/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            targetLanguage: targetLanguage,
            useAi: useAi
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            hideCreateTranslationModal();
            
            // Pro AI překlad počkáme déle (5 sekund) než se přesměrujeme
            if (useAi) {
              showNotification('${t('content.form.aiTranslationInProgress') || 'AI překlad probíhá, načítám přeložený obsah...'}', 'success');
              setTimeout(() => {
                window.location.href = '/admin/content/' + data.contentId + '/edit';
              }, 5000);
            } else {
              // Pro manuální překlad přesměrujeme rychleji
              showNotification('${t('content.form.translationCreated') || 'Překlad vytvořen!'}', 'success');
              setTimeout(() => {
                window.location.href = '/admin/content/' + data.contentId + '/edit';
              }, 1500);
            }
          } else {
            showNotification(data.error || '${t('content.form.translationError') || 'Chyba při vytváření překladu'}', 'error');
          }
        })
        .catch(error => {
          console.error('Error creating translation:', error);
          showNotification('${t('content.form.translationError') || 'Chyba při vytváření překladu'}', 'error');
        });
      }

      // Handle HTMX response for translations list
      document.body.addEventListener('htmx:afterSwap', function(event) {
        if (event.detail.target.id === 'translations-list') {
          // Response is JSON, need to render it
          try {
            const data = JSON.parse(event.detail.xhr.responseText);
            if (data.success) {
              renderTranslationsList(data);
            } else {
              event.detail.target.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">${t('content.form.noTranslations') || 'No other translations available'}</p>';
            }
          } catch (e) {
            // If not JSON, it's already HTML
          }
        }
      });

      function renderTranslationsList(data) {
        const container = document.getElementById('translations-list');
        if (!container) return;

        const currentContentId = '${data.id}';
        const translations = data.translations || [];
        const otherTranslations = translations.filter(t => t.contentId !== currentContentId);

        if (otherTranslations.length === 0) {
          container.innerHTML = '<p class="text-sm text-zinc-500 dark:text-zinc-400">${t('content.form.noOtherTranslations') || 'No other language versions yet'}</p>';
          return;
        }

        const languageNames = {
          cs: 'Čeština',
          en: 'English',
          de: 'Deutsch',
          fr: 'Français',
          es: 'Español',
          it: 'Italiano',
          pl: 'Polski'
        };

        const statusConfig = {
          draft: { class: 'bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300', text: 'Draft' },
          review: { class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', text: 'Review' },
          published: { class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', text: 'Published' },
          archived: { class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', text: 'Archived' }
        };

        let html = '<div class="space-y-2">';
        otherTranslations.forEach(translation => {
          const statusCfg = statusConfig[translation.status] || statusConfig.draft;
          html += \`
            <a href="/admin/content/\${translation.contentId}/edit"
               class="block p-3 rounded-lg bg-white dark:bg-zinc-800 ring-1 ring-zinc-950/5 dark:ring-white/10 hover:ring-zinc-950/10 dark:hover:ring-white/20 transition-all">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-zinc-950 dark:text-white">\${languageNames[translation.language] || translation.language}</span>
                </div>
                <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium \${statusCfg.class}">\${statusCfg.text}</span>
              </div>
              \${translation.source === 'ai' ? '<div class="mt-1"><span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">AI</span></div>' : ''}
            </a>
          \`;
        });
        html += '</div>';

        container.innerHTML = html;
      }
    </script>
  `;
}

/**
 * Get language flag emoji
 */
function getLanguageFlag(code: string): string {
  const flags: Record<string, string> = {
    cs: '🇨🇿',
    en: '🇬🇧',
    de: '🇩🇪',
    fr: '🇫🇷',
    es: '🇪🇸',
    it: '🇮🇹',
    pl: '🇵🇱'
  };
  return flags[code] || '🌐';
}

export function renderContentFormPage(data: ContentFormData, t: TranslateFn): string {
  const isEdit = data.isEdit || !!data.id;
  const title = isEdit
    ? `Edit: ${data.title || "Content"}`
    : `New ${data.collection.display_name}`;

  const currentLanguage = data.language || data.defaultLanguage || "en";
  const languageOptions = data.availableLanguages || [];

  // Construct back URL with preserved filters
  const backUrl = data.referrerParams
    ? `/admin/content?${data.referrerParams}`
    : `/admin/content?collection=${data.collection.id}`;

  // Group fields by category
  const coreFields = data.fields.filter((f) =>
    ["title", "slug", "content"].includes(f.field_name)
  );
  const contentFields = data.fields.filter(
    (f) =>
      !["title", "slug", "content"].includes(f.field_name) &&
      !f.field_name.startsWith("meta_")
  );
  const metaFields = data.fields.filter((f) =>
    f.field_name.startsWith("meta_")
  );

  // Helper function to get field value - title and slug are stored as columns, others in data JSON
  const getFieldValue = (fieldName: string) => {
    if (fieldName === "title")
      return data.title || data.data?.[fieldName] || "";
    if (fieldName === "slug") return data.slug || data.data?.[fieldName] || "";
    return data.data?.[fieldName] || "";
  };

  // Prepare plugin statuses for field rendering
  const pluginStatuses = {
    quillEnabled: data.quillEnabled || false,
    mdxeditorEnabled: data.mdxeditorEnabled || false,
  };

  // Render field groups
  const coreFieldsHTML = coreFields
    .sort((a, b) => a.field_order - b.field_order)
    .map((field) =>
      renderDynamicField(field, {
        value: getFieldValue(field.field_name),
        errors: data.validationErrors?.[field.field_name] || [],
        pluginStatuses,
        t
      })
    );

  const contentFieldsHTML = contentFields
    .sort((a, b) => a.field_order - b.field_order)
    .map((field) =>
      renderDynamicField(field, {
        value: getFieldValue(field.field_name),
        errors: data.validationErrors?.[field.field_name] || [],
        pluginStatuses,
        t
      })
    );

  const metaFieldsHTML = metaFields
    .sort((a, b) => a.field_order - b.field_order)
    .map((field) =>
      renderDynamicField(field, {
        value: getFieldValue(field.field_name),
        errors: data.validationErrors?.[field.field_name] || [],
        pluginStatuses,
        t
      })
    );

  const pageContent = `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">${
            isEdit ? t('content.form.editTitle') : t('content.form.newTitle')
          }</h1>
          <p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
            ${
              data.collection.description ||
              t('content.form.manageContent', { collection: data.collection.display_name.toLowerCase() })
            }
          </p>
        </div>
        <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <a href="${backUrl}" class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm">
            <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            ${t('content.form.backToContent')}
          </a>
        </div>
      </div>

      <!-- Form Container -->
      <div class="rounded-lg bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 overflow-hidden">
        <!-- Form Header -->
        <div class="border-b border-zinc-950/5 dark:border-white/10 px-6 py-6">
          <div class="flex items-center gap-x-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-50 dark:bg-zinc-800 ring-1 ring-zinc-950/10 dark:ring-white/10">
              <svg class="h-6 w-6 text-zinc-950 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-base/7 font-semibold text-zinc-950 dark:text-white">${
                data.collection.display_name
              }</h2>
              <p class="text-sm/6 text-zinc-500 dark:text-zinc-400">${
                isEdit ? t('content.form.updateDescription') : t('content.form.createDescription')
              }</p>
            </div>
          </div>
        </div>

        <!-- Form Content -->
        <div class="px-6 py-6">
          <div id="form-messages">
            ${
              data.error
                ? renderAlert({
                    type: "error",
                    message: data.error,
                    dismissible: true,
                  })
                : ""
            }
            ${
              data.success
                ? renderAlert({
                    type: "success",
                    message: data.success,
                    dismissible: true,
                  })
                : ""
            }
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Content Form -->
        <div class="lg:col-span-2">
          <form
            id="content-form"
            ${
              isEdit
                ? `hx-put="/admin/content/${data.id}"`
                : `hx-post="/admin/content"`
            }
            hx-target="#form-messages"
            hx-encoding="multipart/form-data"
            class="space-y-6"
          >
            <input type="hidden" name="collection_id" value="${
              data.collection.id
            }">
            <input type="hidden" name="language" value="${currentLanguage}">
            ${
              isEdit ? `<input type="hidden" name="id" value="${data.id}">` : ""
            }
            ${
              data.referrerParams
                ? `<input type="hidden" name="referrer_params" value="${data.referrerParams}">`
                : ""
            }
            
            <!-- Core Fields -->
            ${renderFieldGroup(t('content.form.basicInformation'), coreFieldsHTML)}
            
            <!-- Content Fields -->
            ${
              contentFields.length > 0
                ? renderFieldGroup(t('content.form.contentDetails'), contentFieldsHTML)
                : ""
            }
            
            <!-- SEO & Meta Fields -->
            ${
              metaFields.length > 0
                ? renderFieldGroup(t('content.form.seoMetadata'), metaFieldsHTML, true)
                : ""
            }
            
            <div id="form-messages"></div>
          </form>
        </div>

        <!-- Sidebar -->
        <div class="lg:col-span-1 space-y-6">
          <!-- Publishing Options -->
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-6">
            <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white mb-4">${t('content.form.publishing')}</h3>

            ${
              data.workflowEnabled
                ? `
              <!-- Workflow Status (when workflow plugin is enabled) -->
              <div class="mb-4">
                <label for="status" class="block text-sm/6 font-medium text-zinc-950 dark:text-white">${t('content.form.status')}</label>
                <div class="mt-2 grid grid-cols-1">
                  <select
                    id="status"
                    name="status"
                    form="content-form"
                    class="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 dark:bg-white/5 py-1.5 pl-3 pr-8 text-base text-zinc-950 dark:text-white outline outline-1 -outline-offset-1 outline-zinc-500/30 dark:outline-zinc-400/30 *:bg-white dark:*:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500 dark:focus-visible:outline-zinc-400 sm:text-sm/6"
                  >
                    <option value="draft" ${
                      data.status === "draft" ? "selected" : ""
                    }>${t('content.form.statusDraft')}</option>
                    <option value="review" ${
                      data.status === "review" ? "selected" : ""
                    }>${t('content.form.statusReview')}</option>
                    <option value="published" ${
                      data.status === "published" ? "selected" : ""
                    }>${t('content.form.statusPublished')}</option>
                    <option value="archived" ${
                      data.status === "archived" ? "selected" : ""
                    }>${t('content.form.statusArchived')}</option>
                  </select>
                  <svg viewBox="0 0 16 16" fill="currentColor" data-slot="icon" aria-hidden="true" class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-zinc-600 dark:text-zinc-400 sm:size-4">
                    <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                  </svg>
                </div>
              </div>

              <!-- Scheduled Publishing -->
              <div class="mb-4">
                <label class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">${t('content.form.schedulePublish')}</label>
                <input
                  type="datetime-local"
                  name="scheduled_publish_at"
                  form="content-form"
                  value="${
                    data.scheduled_publish_at
                      ? new Date(data.scheduled_publish_at)
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }"
                  class="w-full rounded-lg bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-950 dark:text-white shadow-sm ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-shadow"
                >
                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${t('content.form.schedulePublishHint')}</p>
              </div>

              <!-- Scheduled Unpublishing -->
              <div class="mb-6">
                <label class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">${t('content.form.scheduleUnpublish')}</label>
                <input
                  type="datetime-local"
                  name="scheduled_unpublish_at"
                  form="content-form"
                  value="${
                    data.scheduled_unpublish_at
                      ? new Date(data.scheduled_unpublish_at)
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }"
                  class="w-full rounded-lg bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-950 dark:text-white shadow-sm ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-shadow"
                >
                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${t('content.form.scheduleUnpublishHint')}</p>
              </div>
            `
                : `
              <!-- Simple Status (when workflow plugin is disabled) -->
              <div class="mb-6">
                <label for="status" class="block text-sm/6 font-medium text-zinc-950 dark:text-white">${t('content.form.status')}</label>
                <div class="mt-2 grid grid-cols-1">
                  <select
                    id="status"
                    name="status"
                    form="content-form"
                    class="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 dark:bg-white/5 py-1.5 pl-3 pr-8 text-base text-zinc-950 dark:text-white outline outline-1 -outline-offset-1 outline-zinc-500/30 dark:outline-zinc-400/30 *:bg-white dark:*:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-500 dark:focus-visible:outline-zinc-400 sm:text-sm/6"
                  >
                    <option value="draft" ${
                      data.status === "draft" ? "selected" : ""
                    }>${t('content.form.statusDraft')}</option>
                    <option value="published" ${
                      data.status === "published" ? "selected" : ""
                    }>${t('content.form.statusPublished')}</option>
                  </select>
                  <svg viewBox="0 0 16 16" fill="currentColor" data-slot="icon" aria-hidden="true" class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-zinc-600 dark:text-zinc-400 sm:size-4">
                    <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                  </svg>
                </div>
                <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${t('content.form.workflowHint')}</p>
              </div>
            `
            }
          </div>

          <!-- Content Info -->
          ${
            isEdit
              ? `
            <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-6">
              <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white mb-4">${t('content.form.contentInfo')}</h3>

              <dl class="space-y-3 text-sm">
                <div>
                  <dt class="text-zinc-500 dark:text-zinc-400">${t('content.form.created')}</dt>
                  <dd class="mt-1 text-zinc-950 dark:text-white">${
                    data.created_at
                      ? new Date(data.created_at).toLocaleDateString()
                      : "Unknown"
                  }</dd>
                </div>
                <div>
                  <dt class="text-zinc-500 dark:text-zinc-400">${t('content.form.lastModified')}</dt>
                  <dd class="mt-1 text-zinc-950 dark:text-white">${
                    data.updated_at
                      ? new Date(data.updated_at).toLocaleDateString()
                      : "Unknown"
                  }</dd>
                </div>
                <div>
                  <dt class="text-zinc-500 dark:text-zinc-400">${t('content.form.author')}</dt>
                  <dd class="mt-1 text-zinc-950 dark:text-white">${
                    data.user?.name || "Unknown"
                  }</dd>
                </div>
                ${
                  data.published_at
                    ? `
                  <div>
                    <dt class="text-zinc-500 dark:text-zinc-400">${t('content.form.published')}</dt>
                    <dd class="mt-1 text-zinc-950 dark:text-white">${new Date(
                      data.published_at
                    ).toLocaleDateString()}</dd>
                  </div>
                `
                    : ""
                }
              </dl>

              <div class="mt-4 pt-4 border-t border-zinc-950/5 dark:border-white/10">
                <button
                  type="button"
                  onclick="showVersionHistory('${data.id}')"
                  class="inline-flex items-center gap-x-1.5 text-sm font-medium text-zinc-950 dark:text-white hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  ${t('content.form.viewVersionHistory')}
                </button>
              </div>
            </div>
          `
              : ""
          }

          <!-- Language Versions Widget -->
          ${renderTranslationsWidget(data, t, isEdit)}

          <!-- Quick Actions -->
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10 p-6">
            <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white mb-4">${t('content.form.quickActions')}</h3>

            <div class="space-y-2">
              <button
                type="button"
                onclick="previewContent()"
                class="w-full inline-flex items-center gap-x-2 px-3 py-2 text-sm font-medium text-zinc-950 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                ${t('content.form.previewContent')}
              </button>

              <button
                type="button"
                onclick="duplicateContent()"
                class="w-full inline-flex items-center gap-x-2 px-3 py-2 text-sm font-medium text-zinc-950 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                ${t('content.form.duplicateContent')}
              </button>

              ${
                isEdit
                  ? `
                <button
                  type="button"
                  onclick="deleteContent('${data.id}')"
                  class="w-full inline-flex items-center gap-x-2 px-3 py-2 text-sm font-medium text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition-colors"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                  </svg>
                  ${t('content.form.deleteContent')}
                </button>
              `
                  : ""
              }
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="mt-6 pt-6 border-t border-zinc-950/5 dark:border-white/10 flex items-center justify-between">
          <a href="${backUrl}" class="inline-flex items-center justify-center gap-x-1.5 rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            ${t('content.form.cancel')}
          </a>

          <div class="flex items-center gap-x-3">
            <button
              type="submit"
              form="content-form"
              name="action"
              value="save"
              class="inline-flex items-center justify-center gap-x-1.5 rounded-lg bg-zinc-950 dark:bg-white px-3.5 py-2.5 text-sm font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              ${isEdit ? t('content.form.update') : t('content.form.save')}
            </button>

            ${
              data.user?.role !== "viewer"
                ? `
              <button
                type="submit"
                form="content-form"
                name="action"
                value="save_and_publish"
                class="inline-flex items-center justify-center gap-x-1.5 rounded-lg bg-lime-600 dark:bg-lime-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-lime-700 dark:hover:bg-lime-600 transition-colors shadow-sm"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${isEdit ? t('content.form.update') : t('content.form.save')} & ${t('content.form.publish')}
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- Confirmation Dialogs -->
    ${renderConfirmationDialog({
      id: "duplicate-content-confirm",
      title: t('content.form.duplicateContentTitle'),
      message: t('content.form.duplicateContentMessage'),
      confirmText: t('content.form.duplicate'),
      cancelText: t('content.form.cancel'),
      iconColor: "blue",
      confirmClass: "bg-blue-500 hover:bg-blue-400",
      onConfirm: "performDuplicateContent()",
    })}

    ${renderConfirmationDialog({
      id: "delete-content-confirm",
      title: t('content.form.deleteContentTitle'),
      message: t('content.form.deleteContentMessage'),
      confirmText: t('content.form.delete'),
      cancelText: t('content.form.cancel'),
      iconColor: "red",
      confirmClass: "bg-red-500 hover:bg-red-400",
      onConfirm: `performDeleteContent('${data.id}')`,
    })}

    ${getConfirmationDialogScript()}


    ${
      data.quillEnabled
        ? getQuillCDN(data.quillSettings?.version)
        : "<!-- Quill plugin not active -->"
    }

    ${
      data.quillEnabled
        ? getQuillInitScript()
        : "<!-- Quill init script not needed -->"
    }

    ${
      data.mdxeditorEnabled
        ? getMDXEditorScripts()
        : "<!-- MDXEditor plugin not active -->"
    }

    <!-- Dynamic Field Scripts -->
    <script>
      // Field group toggle
      function toggleFieldGroup(groupId) {
        const content = document.getElementById(groupId + '-content');
        const icon = document.getElementById(groupId + '-icon');
        
        if (content.classList.contains('hidden')) {
          content.classList.remove('hidden');
          icon.classList.remove('rotate-[-90deg]');
        } else {
          content.classList.add('hidden');
          icon.classList.add('rotate-[-90deg]');
        }
      }

      // Media field functions
      let currentMediaFieldId = null;

      function openMediaSelector(fieldId) {
        currentMediaFieldId = fieldId;
        // Store the original value in case user cancels
        const originalValue = document.getElementById(fieldId)?.value || '';

        // Open media library modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50';
        modal.id = 'media-selector-modal';
        modal.innerHTML = \`
          <div class="rounded-xl bg-white dark:bg-zinc-900 shadow-xl ring-1 ring-zinc-950/5 dark:ring-white/10 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 class="text-lg font-semibold text-zinc-950 dark:text-white mb-4">Select Media</h3>
            <div id="media-grid-container" hx-get="/admin/media/selector" hx-trigger="load"></div>
            <div class="mt-4 flex justify-end space-x-2">
              <button
                onclick="cancelMediaSelection('\${fieldId}', '\${originalValue}')"
                class="rounded-lg bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                Cancel
              </button>
              <button
                onclick="closeMediaSelector()"
                class="rounded-lg bg-zinc-950 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                OK
              </button>
            </div>
          </div>
        \`;
        document.body.appendChild(modal);
        // Trigger HTMX for the modal content
        if (window.htmx) {
          htmx.process(modal);
        }
      }

      function closeMediaSelector() {
        const modal = document.getElementById('media-selector-modal');
        if (modal) {
          modal.remove();
        }
        currentMediaFieldId = null;
      }

      function cancelMediaSelection(fieldId, originalValue) {
        // Restore original value
        const hiddenInput = document.getElementById(fieldId);
        if (hiddenInput) {
          hiddenInput.value = originalValue;
        }

        // If original value was empty, hide the preview and show select button
        if (!originalValue) {
          const preview = document.getElementById(fieldId + '-preview');
          if (preview) {
            preview.classList.add('hidden');
          }
        }

        // Close modal
        closeMediaSelector();
      }

      function clearMediaField(fieldId) {
        document.getElementById(fieldId).value = '';
        document.getElementById(fieldId + '-preview').classList.add('hidden');
      }

      // Global function called by media selector buttons
      window.selectMediaFile = function(mediaId, mediaUrl, filename) {
        if (!currentMediaFieldId) {
          console.error('No field ID set for media selection');
          return;
        }

        const fieldId = currentMediaFieldId;

        // Set the hidden input value to the media URL (not ID)
        const hiddenInput = document.getElementById(fieldId);
        if (hiddenInput) {
          hiddenInput.value = mediaUrl;
        }

        // Update the preview
        const preview = document.getElementById(fieldId + '-preview');
        if (preview) {
          preview.innerHTML = \`<img src="\${mediaUrl}" alt="\${filename}" class="w-32 h-32 object-cover rounded-lg border border-white/20">\`;
          preview.classList.remove('hidden');
        }

        // Show the remove button by finding the media actions container and updating it
        const mediaField = hiddenInput?.closest('.media-field-container');
        if (mediaField) {
          const actionsDiv = mediaField.querySelector('.media-actions');
          if (actionsDiv && !actionsDiv.querySelector('button:has-text("Remove")')) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.onclick = () => clearMediaField(fieldId);
            removeBtn.className = 'inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all';
            removeBtn.textContent = 'Remove';
            actionsDiv.appendChild(removeBtn);
          }
        }

        // DON'T close the modal - let user click OK button
        // Visual feedback: highlight the selected item
        document.querySelectorAll('#media-selector-grid [data-media-id]').forEach(el => {
          el.classList.remove('ring-2', 'ring-lime-500', 'dark:ring-lime-400');
        });
        const selectedItem = document.querySelector(\`#media-selector-grid [data-media-id="\${mediaId}"]\`);
        if (selectedItem) {
          selectedItem.classList.add('ring-2', 'ring-lime-500', 'dark:ring-lime-400');
        }
      };

      function setMediaField(fieldId, mediaUrl) {
        document.getElementById(fieldId).value = mediaUrl;
        const preview = document.getElementById(fieldId + '-preview');
        preview.innerHTML = \`<img src="\${mediaUrl}" alt="Selected media" class="w-32 h-32 object-cover rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">\`;
        preview.classList.remove('hidden');

        // Close modal
        document.querySelector('.fixed.inset-0')?.remove();
      }

      // Custom select options
      function addCustomOption(input, selectId) {
        const value = input.value.trim();
        if (value) {
          const select = document.getElementById(selectId);
          const option = document.createElement('option');
          option.value = value;
          option.text = value;
          option.selected = true;
          select.appendChild(option);
          input.value = '';
        }
      }

      // Quick actions
      function previewContent() {
        const form = document.getElementById('content-form');
        const formData = new FormData(form);
        
        // Open preview in new window
        const preview = window.open('', '_blank');
        if (!preview) {
          showNotification('Please allow popups to preview content', 'error');
          return;
        }
        
        preview.document.write('<html><head><title>Loading Preview...</title></head><body><p style="font-family: Arial; padding: 20px;">Loading preview...</p></body></html>');
        
        fetch('/admin/content/preview', {
          method: 'POST',
          body: formData
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Preview failed');
          }
          return response.text();
        })
        .then(html => {
          preview.document.open();
          preview.document.write(html);
          preview.document.close();
        })
        .catch(error => {
          console.error('Preview error:', error);
          preview.document.open();
          preview.document.write('<html><head><title>Preview Error</title></head><body><p style="font-family: Arial; padding: 20px; color: red;">Error loading preview. Please try again.</p></body></html>');
          preview.document.close();
          showNotification('Failed to generate preview', 'error');
        });
      }

      function duplicateContent() {
        showConfirmDialog('duplicate-content-confirm');
      }

      function performDuplicateContent() {
        const contentId = '${data.id || ""}';
        if (!contentId) {
          showNotification('Cannot duplicate unsaved content. Please save first.', 'error');
          return;
        }

        const form = document.getElementById('content-form');
        const formData = new FormData(form);
        formData.append('id', contentId);

        // Show loading state
        showNotification('Duplicating content...', 'info');

        fetch('/admin/content/duplicate', {
          method: 'POST',
          body: formData
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            showNotification('Content duplicated successfully!', 'success');
            setTimeout(() => {
              window.location.href = \`/admin/content/\${data.id}/edit\`;
            }, 1000);
          } else {
            showNotification(data.error || 'Error duplicating content', 'error');
          }
        })
        .catch(error => {
          console.error('Duplicate error:', error);
          showNotification('Failed to duplicate content', 'error');
        });
      }

      function deleteContent(contentId) {
        showConfirmDialog('delete-content-confirm');
      }

      function performDeleteContent(contentId) {
        if (!contentId) {
          showNotification('Invalid content ID', 'error');
          return;
        }

        // Show loading state
        showNotification('Deleting content...', 'info');

        fetch(\`/admin/content/\${contentId}\`, {
          method: 'DELETE'
        })
        .then(response => {
          if (response.ok) {
            showNotification('Content deleted successfully!', 'success');
            setTimeout(() => {
              window.location.href = '/admin/content';
            }, 1000);
          } else {
            return response.json().then(data => {
              throw new Error(data.error || 'Delete failed');
            });
          }
        })
        .catch(error => {
          console.error('Delete error:', error);
          showNotification(error.message || 'Failed to delete content', 'error');
        });
      }

      // Notification system
      function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = \`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg transition-all duration-300 \${
          type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 ring-1 ring-green-600/20' :
          type === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 ring-1 ring-red-600/20' :
          'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 ring-1 ring-blue-600/20'
        }\`;
        notification.innerHTML = \`
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              \${type === 'success' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>' :
                type === 'error' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>' :
                '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'}
            </svg>
            <span class="text-sm font-medium">\${message}</span>
          </div>
        \`;
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
          notification.style.opacity = '0';
          setTimeout(() => notification.remove(), 300);
        }, 5000);
      }

      function showVersionHistory(contentId) {
        // Create and show version history modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50';
        modal.innerHTML = \`
          <div id="version-history-content">
            <div class="flex items-center justify-center h-32">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
            </div>
          </div>
        \`;
        document.body.appendChild(modal);

        // Load version history
        fetch(\`/admin/content/\${contentId}/versions\`)
        .then(response => response.text())
        .then(html => {
          document.getElementById('version-history-content').innerHTML = html;
        })
        .catch(error => {
          console.error('Error loading version history:', error);
          document.getElementById('version-history-content').innerHTML = '<p class="text-zinc-950 dark:text-white">Error loading version history</p>';
        });
      }

      // Version history modal functions - must be global for onclick handlers
      window.closeVersionHistory = function() {
        const modal = document.querySelector('.version-history-modal');
        if (modal && modal.closest('.fixed')) {
          modal.closest('.fixed').remove();
        }
      };
      
      window.restoreVersion = function(contentId, version) {
        if (confirm(\`Are you sure you want to restore to version \${version}? This will create a new version with the restored content.\`)) {
          const notify = window.showNotification || ((msg) => alert(msg));
          
          fetch(\`/admin/content/\${contentId}/restore/\${version}\`, {
            method: 'POST'
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              notify('Version restored successfully! Refreshing page...', 'success');
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            } else {
              notify('Failed to restore version', 'error');
            }
          })
          .catch(error => {
            console.error('Error restoring version:', error);
            notify('Error restoring version', 'error');
          });
        }
      };
      
      window.previewVersion = function(contentId, version) {
        const preview = window.open('', '_blank');
        if (!preview) {
          showNotification('Please allow popups to preview versions', 'error');
          return;
        }
        
        preview.document.write('<html><head><title>Loading Preview...</title></head><body><p style="font-family: Arial; padding: 20px;">Loading version preview...</p></body></html>');
        
        fetch(\`/admin/content/\${contentId}/version/\${version}/preview\`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Preview failed');
          }
          return response.text();
        })
        .then(html => {
          preview.document.open();
          preview.document.write(html);
          preview.document.close();
        })
        .catch(error => {
          console.error('Preview error:', error);
          preview.document.open();
          preview.document.write('<html><head><title>Preview Error</title></head><body><p style="font-family: Arial; padding: 20px; color: red;">Error loading preview. Please try again.</p></body></html>');
          preview.document.close();
          showNotification('Failed to load version preview', 'error');
        });
      };
      
      window.toggleChanges = function(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
          element.classList.toggle('hidden');
        }
      };

      // Auto-save functionality
      let autoSaveTimeout;
      function scheduleAutoSave() {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
          const form = document.getElementById('content-form');
          const formData = new FormData(form);
          formData.append('action', 'autosave');
          
          fetch(form.action, {
            method: 'POST',
            body: formData
          })
          .then(response => {
            if (response.ok) {
              console.log('Auto-saved');
            }
          })
          .catch(error => console.error('Auto-save failed:', error));
        }, 30000); // Auto-save every 30 seconds
      }

      // Bind auto-save to form changes
      document.addEventListener('DOMContentLoaded', function() {
        const form = document.getElementById('content-form');
        form.addEventListener('input', scheduleAutoSave);
        form.addEventListener('change', scheduleAutoSave);
      });
    </script>


    ${
      data.mdxeditorEnabled
        ? `<script>${getMDXEditorInitScript({
            defaultHeight: data.mdxeditorSettings?.defaultHeight,
            toolbar: data.mdxeditorSettings?.toolbar,
            placeholder: data.mdxeditorSettings?.placeholder,
          })}</script>`
        : ""
    }
  `;

  const layoutData: AdminLayoutCatalystData = {
    title: title,
    pageTitle: t('content.title'),
    currentPath: "/admin/content",
    user: data.user,
    content: pageContent,
    version: data.version,
    logoUrl: data.logoUrl
  };

  return renderAdminLayoutCatalyst(layoutData, t);
}
