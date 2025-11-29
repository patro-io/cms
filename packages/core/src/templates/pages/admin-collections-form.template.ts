import { renderAlert } from "../components/alert.template";
import {
  getConfirmationDialogScript,
  renderConfirmationDialog,
} from "../components/confirmation-dialog.template";
import { FormData, FormField, renderForm } from "../form.template";
import {
  AdminLayoutCatalystData,
  renderAdminLayoutCatalyst,
} from "../layouts/admin-layout-catalyst.template";
import type { TranslateFn } from '../../services/i18n'

export interface CollectionField {
  id: string;
  field_name: string;
  field_type: string;
  field_label: string;
  field_options: any;
  field_order: number;
  is_required: boolean;
  is_searchable: boolean;
}

export interface CollectionFormData {
  id?: string;
  name?: string;
  display_name?: string;
  description?: string;
  fields?: CollectionField[];
  managed?: boolean; // @deprecated - use code_managed and fields_editable
  code_managed?: boolean;
  fields_editable?: boolean;
  isEdit?: boolean;
  error?: string;
  success?: string;
  user?: {
    name: string;
    email: string;
    role: string;
  };
  version?: string;
  editorPlugins?: {
    quill: boolean;
    easyMdx: boolean;
  };
}

// Helper function to get field type badge with color
function getFieldTypeBadge(fieldType: string, t: TranslateFn): string {
  const typeLabels: Record<string, string> = {
    text: t('collections.form.fieldTypes.text'),
    slug: t('collections.form.fieldTypes.slug'),
    richtext: t('collections.form.fieldTypes.richtext'),
    quill: t('collections.form.fieldTypes.quill'),
    mdxeditor: t('collections.form.fieldTypes.mdxeditor'),
    number: t('collections.form.fieldTypes.number'),
    boolean: t('collections.form.fieldTypes.boolean'),
    date: t('collections.form.fieldTypes.date'),
    select: t('collections.form.fieldTypes.select'),
    media: t('collections.form.fieldTypes.media'),
  };
  const typeColors: Record<string, string> = {
    text: "bg-blue-500/10 dark:bg-blue-400/10 text-blue-700 dark:text-blue-300 ring-blue-500/20 dark:ring-blue-400/20",
    slug: "bg-teal-500/10 dark:bg-teal-400/10 text-teal-700 dark:text-teal-300 ring-teal-500/20 dark:ring-teal-400/20",
    richtext:
      "bg-purple-500/10 dark:bg-purple-400/10 text-purple-700 dark:text-purple-300 ring-purple-500/20 dark:ring-purple-400/20",
    quill:
      "bg-purple-500/10 dark:bg-purple-400/10 text-purple-700 dark:text-purple-300 ring-purple-500/20 dark:ring-purple-400/20",
    mdxeditor:
      "bg-purple-500/10 dark:bg-purple-400/10 text-purple-700 dark:text-purple-300 ring-purple-500/20 dark:ring-purple-400/20",
    number:
      "bg-green-500/10 dark:bg-green-400/10 text-green-700 dark:text-green-300 ring-green-500/20 dark:ring-green-400/20",
    boolean:
      "bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-amber-500/20 dark:ring-amber-400/20",
    date: "bg-cyan-500/10 dark:bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 ring-cyan-500/20 dark:ring-cyan-400/20",
    select:
      "bg-indigo-500/10 dark:bg-indigo-400/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20 dark:ring-indigo-400/20",
    media:
      "bg-rose-500/10 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-rose-500/20 dark:ring-rose-400/20",
  };
  const label = typeLabels[fieldType] || fieldType;
  const color =
    typeColors[fieldType] ||
    "bg-zinc-500/10 dark:bg-zinc-400/10 text-zinc-700 dark:text-zinc-300 ring-zinc-500/20 dark:ring-zinc-400/20";
  return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${color} ring-1 ring-inset">${label}</span>`;
}

export function renderCollectionFormPage(data: CollectionFormData, t: TranslateFn): string {
  console.log("[renderCollectionFormPage] editorPlugins:", data.editorPlugins);

  const isEdit = data.isEdit || !!data.id;
  const title = isEdit ? t('collections.edit') : t('collections.createNew');
  const subtitle = isEdit
    ? t('collections.form.updateCollection') + `: ${data.display_name}`
    : t('collections.form.defineNew');

  // Pre-compute data attribute for all fields (without badge HTML to avoid escaping issues)
  const fieldsWithData = (data.fields || []).map((field) => ({
    ...field,
    dataFieldJSON: JSON.stringify(JSON.stringify(field)),
  }));

  const fields: FormField[] = [
    {
      name: "displayName",
      label: t('collections.form.displayNameLabel'),
      type: "text",
      value: data.display_name || "",
      placeholder: t('collections.form.displayNamePlaceholder'),
      required: true,
      readonly: data.code_managed,
      className: data.code_managed
        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
        : "",
    },
    {
      name: "name",
      label: t('collections.form.nameLabel'),
      type: "text",
      value: data.name || "",
      placeholder: t('collections.form.namePlaceholder'),
      required: true,
      readonly: isEdit,
      helpText: isEdit
        ? t('collections.form.nameHelpReadonly')
        : t('collections.form.nameHelp'),
      className: isEdit
        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
        : "",
    },
    {
      name: "description",
      label: t('collections.form.descriptionLabel'),
      type: "textarea",
      value: data.description || "",
      placeholder: t('collections.form.descriptionPlaceholder'),
      rows: 3,
      readonly: data.code_managed,
      className: data.code_managed
        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
        : "",
    },
  ];

  const formData: FormData = {
    id: "collection-form",
    ...(isEdit
      ? {
          hxPut: `/admin/collections/${data.id}`,
          action: `/admin/collections/${data.id}`,
          method: "PUT",
        }
      : { hxPost: "/admin/collections", action: "/admin/collections" }),
    hxTarget: "#form-messages",
    fields: fields,
    submitButtons: data.code_managed
      ? []
      : [
          {
              label: isEdit ? t('collections.form.updateCollection') : t('collections.create'),
            type: "submit",
            className: "btn-primary",
          },
        ],
  };

  const pageContent = `
    <div class="space-y-6">
      <!-- Config-Managed Collection Banner -->
      ${
        data.code_managed
          ? `
        <div class="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 p-4">
          <div class="flex items-start gap-x-3">
            <svg class="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
            <div class="flex-1">
              <h3 class="text-sm/6 font-semibold text-amber-900 dark:text-amber-300">
                ${t('collections.form.managedBanner.title')}
              </h3>
              <div class="text-sm/6 text-amber-800 dark:text-amber-400 mt-1 space-y-1">
                <p>${t('collections.form.managedBanner.description')}</p>
                <p class="mt-2">
                  <span class="font-medium">${t('collections.form.managedBanner.configFile')}</span>
                  <code class="ml-2 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300 font-mono text-xs">
                    src/collections/${data.name}.collection.ts
                  </code>
                </p>
                <p class="mt-2 text-xs">
                  ${t('collections.form.managedBanner.howToEdit')}
                </p>
              </div>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">${title}</h1>
          <p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">${subtitle}</p>
        </div>
        <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <a href="/admin/collections" class="inline-flex items-center justify-center rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm">
            <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            ${t('collections.backToCollections')}
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
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
            </div>
            <div>
              <h2 class="text-base/7 font-semibold text-zinc-950 dark:text-white">${t('collections.form.title')}</h2>
              <p class="text-sm/6 text-zinc-500 dark:text-zinc-400">${t('collections.form.subtitle')}</p>
            </div>
          </div>
        </div>

        <!-- Form Content -->
        <div class="px-6 py-6">
          <div id="form-messages"></div>
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

          <!-- Form Styling -->
          <style>
            #collection-form .form-group {
              margin-bottom: 1.5rem;
            }

            #collection-form .form-label {
              display: block;
              font-size: 0.875rem;
              font-weight: 500;
              margin-bottom: 0.5rem;
              line-height: 1.5rem;
            }

            .dark #collection-form .form-label {
              color: white;
            }

            html:not(.dark) #collection-form .form-label {
              color: #09090b; /* zinc-950 */
            }

            #collection-form .form-input,
            #collection-form .form-textarea {
              width: 100%;
              padding: 0.625rem 0.75rem;
              border-radius: 0.5rem;
              font-size: 0.875rem;
              line-height: 1.5rem;
              transition: all 0.15s;
            }

            html:not(.dark) #collection-form .form-input,
            html:not(.dark) #collection-form .form-textarea {
              background: white;
              border: 1px solid rgba(9, 9, 11, 0.1); /* zinc-950/10 */
              color: #09090b; /* zinc-950 */
            }

            .dark #collection-form .form-input,
            .dark #collection-form .form-textarea {
              background: #18181b; /* zinc-900 */
              border: 1px solid rgba(255, 255, 255, 0.1);
              color: white;
            }

            #collection-form .form-input:focus,
            #collection-form .form-textarea:focus {
              outline: none;
              box-shadow: 0 0 0 2px #2563eb; /* blue-600 */
            }

            .dark #collection-form .form-input:focus,
            .dark #collection-form .form-textarea:focus {
              box-shadow: 0 0 0 2px #3b82f6; /* blue-500 */
            }

            html:not(.dark) #collection-form .form-input::placeholder,
            html:not(.dark) #collection-form .form-textarea::placeholder {
              color: #71717a; /* zinc-500 */
            }

            .dark #collection-form .form-input::placeholder,
            .dark #collection-form .form-textarea::placeholder {
              color: #71717a; /* zinc-500 */
            }

            #collection-form .btn {
              padding: 0.625rem 1rem;
              font-weight: 600;
              font-size: 0.875rem;
              border-radius: 0.5rem;
              transition: all 0.15s;
              border: none;
              cursor: pointer;
            }

            html:not(.dark) #collection-form .btn-primary {
              background: #09090b; /* zinc-950 */
              color: white;
            }

            html:not(.dark) #collection-form .btn-primary:hover {
              background: #27272a; /* zinc-800 */
            }

            .dark #collection-form .btn-primary {
              background: white;
              color: #09090b; /* zinc-950 */
            }

            .dark #collection-form .btn-primary:hover {
              background: #f4f4f5; /* zinc-100 */
            }

            #collection-form .form-help-text {
              font-size: 0.75rem;
              margin-top: 0.25rem;
            }

            html:not(.dark) #collection-form .form-help-text {
              color: #71717a; /* zinc-500 */
            }

            .dark #collection-form .form-help-text {
              color: #a1a1aa; /* zinc-400 */
            }
          </style>
          
          ${renderForm(formData)}

          ${
            isEdit && !data.fields_editable
              ? `
            <!-- Read-Only Fields Display for Non-Editable Collections -->
            <div class="mt-8 pt-8 border-t border-zinc-950/5 dark:border-white/10">
              <div class="mb-6">
                <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white">${t('collections.form.fieldsSection.title')}</h3>
                <p class="text-sm/6 text-zinc-500 dark:text-zinc-400 mt-1">${t('collections.form.fieldsSection.readonlySubtitle')}</p>
              </div>

              <!-- Fields List (Read-Only) -->
              <div class="space-y-3">
                ${fieldsWithData
                  .map(
                    (field) => `
                  <div class="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-950/5 dark:border-white/10 p-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-x-4">
                        <div>
                          <div class="flex items-center gap-x-2">
                            <span class="text-sm/6 font-medium text-zinc-950 dark:text-white">${
                              field.field_label
                            }</span>
                            ${getFieldTypeBadge(field.field_type, t)}
                            ${
                              field.is_required
                                ? `
                              <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-rose-500/10 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/20 dark:ring-rose-400/20">
                                ${t('collections.form.fieldModal.required')}
                              </span>
                            `
                                : ""
                            }
                            ${
                              field.is_searchable
                                ? `
                              <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20">
                                ${t('collections.form.fieldModal.searchable')}
                              </span>
                            `
                                : ""
                            }
                          </div>
                          <div class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            <code class="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono">${
                              field.field_name
                            }</code>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join("")}

                ${
                  (data.fields || []).length === 0
                    ? `
                  <div class="text-center py-12 text-zinc-500 dark:text-zinc-400">
                    <svg class="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                    </svg>
                    <p class="mt-4 text-base/7 font-semibold text-zinc-950 dark:text-white">${t('collections.form.fieldsSection.noFields')}</p>
                    <p class="mt-2 text-sm/6">${t('collections.form.fieldsSection.noFieldsConfig')}</p>
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `
              : ""
          }

          ${
            isEdit && data.fields_editable !== false
              ? `
            <!-- Fields Management Section -->
            <div class="mt-8 pt-8 border-t border-zinc-950/5 dark:border-white/10">
              <div class="flex items-center justify-between mb-6">
                <div>
                  <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white">${t('collections.form.fieldsSection.title')}</h3>
                  <p class="text-sm/6 text-zinc-500 dark:text-zinc-400 mt-1">${t('collections.form.fieldsSection.subtitle')}</p>
                </div>
                <button
                  type="button"
                  onclick="showAddFieldModal()"
                  class="inline-flex items-center gap-x-1.5 px-3.5 py-2.5 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-semibold text-sm rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm"
                >
                  <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
                  ${t('collections.form.fieldModal.addTitle')}
                </button>
              </div>
              
              <!-- Fields List -->
              <div id="fields-list" class="space-y-3">
                ${fieldsWithData
                  .map(
                    (field) => `
                  <div class="field-item bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-950/5 dark:border-white/10 p-4"
                       data-field-id="${field.id}"
                       data-field-data="${field.dataFieldJSON}">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-x-4">
                        <div class="drag-handle cursor-move text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400">
                          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16"/>
                          </svg>
                        </div>
                        <div>
                          <div class="flex items-center gap-x-2">
                            <span class="text-sm/6 font-medium text-zinc-950 dark:text-white">${
                              field.field_label
                            }</span>
                            ${getFieldTypeBadge(field.field_type, t)}
                            ${
                              field.is_required
                                ? `
                              <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-pink-500/10 dark:bg-pink-400/10 text-pink-700 dark:text-pink-300 ring-1 ring-inset ring-pink-500/20 dark:ring-pink-400/20">
                                ${t('collections.form.fieldModal.required')}
                              </span>
                            `
                                : ""
                            }
                            ${
                              field.is_searchable
                                ? `
                              <span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20">
                                ${t('collections.form.fieldModal.searchable')}
                              </span>
                            `
                                : ""
                            }
                          </div>
                          <div class="text-sm/6 text-zinc-500 dark:text-zinc-400 mt-1">
                            ${t('collections.form.fieldModal.fieldName')}: <code class="text-zinc-950 dark:text-white font-mono text-xs">${
                              field.field_name
                            }</code>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-x-2">
                        <button
                          type="button"
                          onclick="editField('${field.id}')"
                          class="inline-flex items-center gap-x-1 px-2.5 py-1.5 text-sm font-medium text-zinc-950 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                          </svg>
                          ${t('collections.form.fieldModal.editTitle')}
                        </button>
                        <button
                          type="button"
                          onclick="deleteField('${field.id}')"
                          class="inline-flex items-center gap-x-1 px-2.5 py-1.5 text-sm font-medium text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition-colors"
                        >
                          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                          </svg>
                          ${t('collections.actions.deleteField')}
                        </button>
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join("")}

                ${
                  (data.fields || []).length === 0
                    ? `
                  <div class="text-center py-12 text-zinc-500 dark:text-zinc-400">
                    <svg class="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                    </svg>
                    <p class="mt-4 text-base/7 font-semibold text-zinc-950 dark:text-white">${t('collections.form.fieldsSection.noFields')}</p>
                    <p class="mt-2 text-sm/6">${t('collections.form.fieldsSection.noFieldsHelp')}</p>
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `
              : `
            <div class="mt-6 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900/30 p-4">
              <div class="flex items-start gap-x-3">
                <svg class="h-5 w-5 text-cyan-600 dark:text-cyan-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                </svg>
                <div>
                  <h3 class="text-sm/6 font-medium text-cyan-900 dark:text-cyan-300">
                    ${t('collections.form.createInfoBox.title')}
                  </h3>
                  <p class="text-sm/6 text-cyan-800 dark:text-cyan-400 mt-1">
                    ${t('collections.form.createInfoBox.description')}
                  </p>
                </div>
              </div>
            </div>
          `
          }
          
          <!-- Action Buttons -->
          <div class="mt-6 pt-6 border-t border-zinc-950/5 dark:border-white/10 flex items-center justify-between">
            <a href="/admin/collections" class="inline-flex items-center justify-center gap-x-1.5 rounded-lg bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
              ${data.code_managed ? t('collections.backToCollections') : t('common.cancel')}
            </a>

            ${
              isEdit && !data.code_managed
                ? `
              <button
                type="button"
                hx-delete="/admin/collections/${data.id}"
                hx-confirm="Are you sure you want to delete this collection? This action cannot be undone."
                hx-target="body"
                class="inline-flex items-center justify-center gap-x-1.5 rounded-lg bg-pink-600 dark:bg-pink-500 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 dark:hover:bg-pink-600 transition-colors shadow-sm"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                </svg>
                ${t('collections.delete')}
              </button>
            `
                : ""
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Field Modal -->
    <div id="field-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 hidden">
      <div class="rounded-xl bg-white dark:bg-zinc-900 shadow-xl ring-1 ring-zinc-950/5 dark:ring-white/10 w-full max-w-lg mx-4">
        <div class="px-6 py-4 border-b border-zinc-950/5 dark:border-white/10">
          <div class="flex items-center justify-between">
            <h3 id="modal-title" class="text-lg font-semibold text-zinc-950 dark:text-white">${t('collections.form.fieldModal.addTitle')}</h3>
            <button onclick="closeFieldModal()" class="text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <form id="field-form" class="p-6 space-y-4">
          <input type="hidden" id="field-id" name="field_id">

          <div>
            <label class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">${t('collections.form.fieldModal.fieldName')}</label>
            <input
              type="text"
              id="modal-field-name"
              name="field_name"
              required
              pattern="[a-z0-9_]+"
              class="w-full rounded-lg bg-white dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-950 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 focus:outline-none transition-colors"
              placeholder="${t('collections.form.fieldModal.fieldNamePlaceholder')}"
            >
            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${t('collections.form.fieldModal.fieldNameHelp')}</p>
          </div>

          <div>
            <label for="field-type" class="block text-sm/6 font-medium text-zinc-950 dark:text-white">${t('collections.form.fieldModal.fieldType')}</label>
            <div class="mt-2 grid grid-cols-1">
              <select
                id="field-type"
                name="field_type"
                required
                class="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 dark:bg-white/5 py-1.5 pl-3 pr-8 text-base text-zinc-950 dark:text-white outline outline-1 -outline-offset-1 outline-blue-500/30 dark:outline-blue-400/30 *:bg-white dark:*:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:focus-visible:outline-blue-400 sm:text-sm/6"
              >
                <option value="">${t('collections.form.fieldModal.fieldTypeSelect')}</option>
                <option value="text">${t('collections.form.fieldTypes.text')}</option>
                <option value="slug">${t('collections.form.fieldTypes.slug')}</option>
                <option value="richtext">${t('collections.form.fieldTypes.richtext')}</option>
                ${
                  data.editorPlugins?.quill
                   ? `<option value="quill">${t('collections.form.fieldTypes.quill')}</option>`
                   : ""
               }
               ${
                 data.editorPlugins?.easyMdx
                   ? `<option value="mdxeditor">${t('collections.form.fieldTypes.mdxeditor')}</option>`
                   : ""
               }
               <option value="number">${t('collections.form.fieldTypes.number')}</option>
               <option value="boolean">${t('collections.form.fieldTypes.boolean')}</option>
               <option value="date">${t('collections.form.fieldTypes.date')}</option>
               <option value="select">${t('collections.form.fieldTypes.select')}</option>
               <option value="media">${t('collections.form.fieldTypes.media')}</option>
              </select>
              <svg viewBox="0 0 16 16" fill="currentColor" data-slot="icon" aria-hidden="true" class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-blue-600 dark:text-blue-400 sm:size-4">
                <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
              </svg>
            </div>
            <p id="field-type-help" class="text-xs text-zinc-500 dark:text-zinc-400 mt-1"></p>
          </div>

          <div>
            <label class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">${t('collections.form.fieldModal.fieldLabel')}</label>
            <input
              type="text"
              id="field-label"
              name="field_label"
              required
              class="w-full rounded-lg bg-white dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-950 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 focus:outline-none transition-colors"
              placeholder="${t('collections.form.fieldModal.fieldLabelPlaceholder')}"
            >
          </div>

          <div class="flex items-center space-x-6">
            <div class="flex gap-3">
              <div class="flex h-6 shrink-0 items-center">
                <div class="group grid size-4 grid-cols-1">
                  <input type="hidden" name="is_required" value="0">
                  <input
                    type="checkbox"
                    id="field-required"
                    name="is_required"
                    value="1"
                    class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                  />
                  <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                    <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                    <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                  </svg>
                </div>
              </div>
              <div class="text-sm/6">
                <label for="field-required" class="font-medium text-zinc-950 dark:text-white">${t('collections.form.fieldModal.required')}</label>
              </div>
            </div>

            <div class="flex gap-3">
              <div class="flex h-6 shrink-0 items-center">
                <div class="group grid size-4 grid-cols-1">
                  <input type="hidden" name="is_searchable" value="0">
                  <input
                    type="checkbox"
                    id="field-searchable"
                    name="is_searchable"
                    value="1"
                    class="col-start-1 row-start-1 appearance-none rounded border border-zinc-950/10 dark:border-white/10 bg-white dark:bg-white/5 checked:border-indigo-500 checked:bg-indigo-500 indeterminate:border-indigo-500 indeterminate:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:border-zinc-950/5 dark:disabled:border-white/5 disabled:bg-zinc-950/10 dark:disabled:bg-white/10 disabled:checked:bg-zinc-950/10 dark:disabled:checked:bg-white/10 forced-colors:appearance-auto"
                  />
                  <svg viewBox="0 0 14 14" fill="none" class="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-zinc-950/25 dark:group-has-[:disabled]:stroke-white/25">
                    <path d="M3 8L6 11L11 3.5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:checked]:opacity-100" />
                    <path d="M3 7H11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-0 group-has-[:indeterminate]:opacity-100" />
                  </svg>
                </div>
              </div>
              <div class="text-sm/6">
                <label for="field-searchable" class="font-medium text-zinc-950 dark:text-white">${t('collections.form.fieldModal.searchable')}</label>
              </div>
            </div>
          </div>

          <div id="field-options-container" class="hidden">
            <label class="block text-sm font-medium text-zinc-950 dark:text-white mb-2">${t('collections.form.fieldModal.fieldOptions')}</label>
            <textarea
              id="field-options"
              name="field_options"
              rows="3"
              class="w-full rounded-lg bg-white dark:bg-zinc-800 px-4 py-3 text-sm text-zinc-950 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-500 focus:outline-none transition-colors font-mono"
              placeholder="${t('collections.form.fieldModal.fieldOptionsPlaceholder')}"
            ></textarea>
            <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${t('collections.form.fieldModal.fieldOptionsHelp')}</p>
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t border-zinc-950/5 dark:border-white/10">
            <button
              type="button"
              onclick="closeFieldModal()"
              class="rounded-lg bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
            >
              ${t('collections.form.fieldModal.cancel')}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <span id="submit-text">${t('collections.form.fieldModal.addButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      const collectionId = '${data.id || ""}';
      
      
      let currentEditingField = null;

      // Field modal functions
      function showAddFieldModal() {
        document.getElementById('modal-title').textContent = '${t('collections.form.fieldModal.addTitle')}';
        document.getElementById('submit-text').textContent = '${t('collections.form.fieldModal.addButton')}';
        document.getElementById('field-form').reset();
        document.getElementById('field-id').value = '';
        document.getElementById('modal-field-name').disabled = false;
        currentEditingField = null;
        isEditingField = false; // Allow change handlers for add mode
        document.getElementById('field-modal').classList.remove('hidden');
      }

      function editField(fieldId) {
        const fieldItem = document.querySelector(\`[data-field-id="\${fieldId}"]\`);
        if (!fieldItem) {
          console.error('Field item not found:', fieldId);
          return;
        }

        // Get field data from data attribute (primary source) or embedded array (fallback)
        let field = null;

        // Try to get from data attribute first
        const fieldDataAttr = fieldItem.getAttribute('data-field-data');
        if (fieldDataAttr) {
          try {
            // Data is double-JSON encoded to properly escape all special characters
            field = JSON.parse(JSON.parse(fieldDataAttr));
            console.log('Loaded field data from data attribute:', field);
          } catch (e) {
            console.error('Error parsing field data from attribute:', e);
            // Try single parse as fallback for backwards compatibility
            try {
              field = JSON.parse(fieldDataAttr);
              console.log('Loaded field data from data attribute (single parse):', field);
            } catch (e2) {
              console.error('Error parsing field data (fallback):', e2);
            }
          }
        }

        // Fallback to embedded array
        if (!field) {
          const fields = ${JSON.stringify(data.fields || [])};
          field = fields.find(f => f.id === fieldId);
          console.log('Loaded field data from embedded array:', field);
        }

        if (!field) {
          console.error('Field data not found for id:', fieldId);
          return;
        }

        // Set up the modal for editing
        document.getElementById('modal-title').textContent = '${t('collections.form.fieldModal.editTitle')}';
        document.getElementById('submit-text').textContent = '${t('collections.form.fieldModal.updateButton')}';
        document.getElementById('field-id').value = fieldId;
        currentEditingField = fieldId;

        // Show modal FIRST before populating fields
        document.getElementById('field-modal').classList.remove('hidden');

        // Set flag to prevent change event handlers from interfering
        isEditingField = true;

        // Use setTimeout to ensure modal is rendered before setting values
        setTimeout(() => {
          // Populate form with existing field data
        console.log('Field object for editing:', field);
        console.log('field.field_name:', field.field_name);
        console.log('field.field_type:', field.field_type);
        console.log('field.field_label:', field.field_label);

        const fieldNameInput = document.getElementById('modal-field-name');
        const fieldTypeSelect = document.getElementById('field-type');
        const fieldLabelInput = document.getElementById('field-label');

        console.log('Field name input element:', fieldNameInput);
        console.log('Field type select element:', fieldTypeSelect);
        console.log('Field label input element:', fieldLabelInput);

        if (fieldNameInput) {
          console.log('Before setting - field-name value:', fieldNameInput.value);
          console.log('Before setting - field-name disabled:', fieldNameInput.disabled);

          fieldNameInput.disabled = false; // Enable first to ensure value can be set
          fieldNameInput.value = field.field_name || '';
          fieldNameInput.disabled = true; // Then disable

          console.log('After setting - field-name value:', fieldNameInput.value);
          console.log('After setting - field-name disabled:', fieldNameInput.disabled);

          // Verify the value stuck
          setTimeout(() => {
            console.log('After 100ms - field-name value:', fieldNameInput.value);
          }, 100);
        } else {
          console.error('field-name input not found!');
        }

        if (fieldLabelInput) {
          fieldLabelInput.value = field.field_label || '';
          console.log('Set field-label to:', fieldLabelInput.value);
        } else {
          console.error('field-label input not found!');
        }

        if (fieldTypeSelect) {
          // Map schema types to UI field types
          let uiFieldType = field.field_type || '';

          // Check if it's a schema field with field_options that might indicate the actual type
          if (field.field_options && typeof field.field_options === 'object') {
            // Only convert to richtext if type is explicitly 'string' and format is richtext
            // Don't convert if it's already a specific editor type like 'mdxeditor', 'quill', etc.
            if (field.field_options.format === 'richtext' && uiFieldType === 'string') {
              uiFieldType = 'richtext';
            }
            // Check for other format indicators
            else if (field.field_options.type && !uiFieldType) {
              uiFieldType = field.field_options.type;
            }
          }

          // Map common schema types to UI types
          const typeMapping = {
            'string': 'text',
            'integer': 'number',
            'bool': 'boolean'
          };

          if (typeMapping[uiFieldType]) {
            uiFieldType = typeMapping[uiFieldType];
          }

          // Log all available options
          const availableOptions = Array.from(fieldTypeSelect.options).map(opt => ({ value: opt.value, text: opt.text }));
          console.log('Available dropdown options:', availableOptions);
          console.log('Trying to set field-type to:', uiFieldType);

          // Clear any existing selections first
          Array.from(fieldTypeSelect.options).forEach(opt => opt.selected = false);

          // Try multiple approaches to set the value
          let selectionSucceeded = false;

          // Approach 1: Direct value assignment
          fieldTypeSelect.value = uiFieldType;
          if (fieldTypeSelect.value === uiFieldType) {
            selectionSucceeded = true;
            console.log('✓ Approach 1 (direct value) succeeded');
          }

          // Approach 2: Find and select the specific option
          if (!selectionSucceeded) {
            console.log('Approach 1 failed, trying approach 2 (direct option selection)');
            const optionToSelect = Array.from(fieldTypeSelect.options).find(opt => opt.value === uiFieldType);
            if (optionToSelect) {
              optionToSelect.selected = true;
              // Trigger change event
              fieldTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
              if (fieldTypeSelect.value === uiFieldType) {
                selectionSucceeded = true;
                console.log('✓ Approach 2 (option.selected) succeeded');
              }
            }
          }

          // Approach 3: Set selectedIndex
          if (!selectionSucceeded) {
            console.log('Approach 2 failed, trying approach 3 (selectedIndex)');
            const optionIndex = Array.from(fieldTypeSelect.options).findIndex(opt => opt.value === uiFieldType);
            if (optionIndex !== -1) {
              fieldTypeSelect.selectedIndex = optionIndex;
              if (fieldTypeSelect.value === uiFieldType) {
                selectionSucceeded = true;
                console.log('✓ Approach 3 (selectedIndex) succeeded');
              }
            }
          }

          console.log('Final field-type value:', fieldTypeSelect.value, '(wanted:', uiFieldType, ')');

          if (!selectionSucceeded) {
            console.error('❌ All approaches failed to set field-type!');
            console.error('Wanted:', uiFieldType);
            console.error('Got:', fieldTypeSelect.value);
            console.error('Available options:', availableOptions);
          }
        } else {
          console.error('field-type select not found!');
        }

        const requiredCheckbox = document.getElementById('field-required');
        const searchableCheckbox = document.getElementById('field-searchable');

        if (requiredCheckbox) {
          requiredCheckbox.checked = Boolean(field.is_required);
        }

        if (searchableCheckbox) {
          searchableCheckbox.checked = Boolean(field.is_searchable);
        }

        // Handle field options - serialize object back to JSON string
        if (field.field_options) {
          document.getElementById('field-options').value = typeof field.field_options === 'string'
            ? field.field_options
            : JSON.stringify(field.field_options, null, 2);
        } else {
          document.getElementById('field-options').value = '';
        }

        // Show/hide options container based on field type
        const fieldType = field.field_type;
        const optionsContainer = document.getElementById('field-options-container');
        const helpText = document.getElementById('field-type-help');

        if (['select', 'media', 'richtext'].includes(fieldType)) {
          optionsContainer.classList.remove('hidden');

          // Set help text based on type
          switch (fieldType) {
            case 'select':
              helpText.textContent = '${t('collections.form.fieldTypes.selectHelp')}';
              break;
            case 'media':
              helpText.textContent = '${t('collections.form.fieldTypes.mediaHelp')}';
              break;
            case 'richtext':
              helpText.textContent = '${t('collections.form.fieldTypes.richtextHelp')}';
              break;
          }
        } else {
          optionsContainer.classList.add('hidden');

          // Set help text for other field types
          switch (fieldType) {
            case 'text':
              helpText.textContent = '${t('collections.form.fieldTypes.textHelp')}';
              break;
            case 'slug':
              helpText.textContent = '${t('collections.form.fieldTypes.slugHelp')}';
              break;
            case 'number':
              helpText.textContent = '${t('collections.form.fieldTypes.numberHelp')}';
              break;
            case 'boolean':
              helpText.textContent = '${t('collections.form.fieldTypes.booleanHelp')}';
              break;
            case 'date':
              helpText.textContent = '${t('collections.form.fieldTypes.dateHelp')}';
              break;
            default:
              helpText.textContent = '';
          }
        }

        // Clear the flag after a short delay to allow all events to settle
        setTimeout(() => {
          isEditingField = false;
          console.log('Cleared isEditingField flag');

          // Double-check the field-type value after the flag is cleared
          const finalCheck = document.getElementById('field-type');
          if (finalCheck) {
            console.log('Post-flag-clear check - field-type value:', finalCheck.value);
          }
        }, 200); // Increased delay

        }, 50); // Increased delay to ensure modal is fully rendered
      }

      function closeFieldModal() {
        document.getElementById('field-modal').classList.add('hidden');
        currentEditingField = null;
        isEditingField = false; // Clear the flag when closing
      }

      let fieldToDelete = null;

      function deleteField(fieldId) {
        fieldToDelete = fieldId;
        showConfirmDialog('delete-field-confirm');
      }

      function performDeleteField() {
        if (!fieldToDelete) return;

        fetch(\`/admin/collections/\${collectionId}/fields/\${fieldToDelete}\`, {
          method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            location.reload();
          } else {
            alert('Error deleting field: ' + data.error);
          }
        })
        .catch(error => {
          console.error('Error:', error);
          alert('Error deleting field');
        })
        .finally(() => {
          fieldToDelete = null;
        });
      }

      // Field form submission
      document.getElementById('field-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!collectionId) {
          alert('Error: Collection ID is missing. Cannot save field.');
          return;
        }
        
        const formData = new FormData(this);
        const isEditing = currentEditingField !== null;
        
        const url = isEditing 
          ? \`/admin/collections/\${collectionId}/fields/\${currentEditingField}\`
          : \`/admin/collections/\${collectionId}/fields\`;
        
        const method = isEditing ? 'PUT' : 'POST';
        
        
        fetch(url, {
          method: method,
          body: formData
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success) {
            location.reload();
          } else {
            alert('Error saving field: ' + (data.error || 'Unknown error'));
          }
        })
        .catch(error => {
          alert('Error saving field: ' + error.message);
        });
      });

      // Flag to prevent change handler during programmatic edits
      let isEditingField = false;

      // Field type change handler
      document.getElementById('field-type').addEventListener('change', function() {
        // Skip if we're programmatically setting values during edit
        if (isEditingField) {
          console.log('Skipping change handler - field is being edited');
          return;
        }

        const optionsContainer = document.getElementById('field-options-container');
        const fieldOptions = document.getElementById('field-options');
        const helpText = document.getElementById('field-type-help');
        const fieldNameInput = document.getElementById('modal-field-name');

        // Show/hide options based on field type
        if (['select', 'media', 'richtext', 'guid'].includes(this.value)) {
          optionsContainer.classList.remove('hidden');

          // Set default options and help text based on type
          switch (this.value) {
            case 'select':
              fieldOptions.value = '{"options": ["Option 1", "Option 2"], "multiple": false}';
              helpText.textContent = '${t('collections.form.fieldTypes.selectHelp')}';
              break;
            case 'media':
              fieldOptions.value = '{"accept": "image/*", "maxSize": "10MB"}';
              helpText.textContent = '${t('collections.form.fieldTypes.mediaHelp')}';
              break;
            case 'richtext':
              fieldOptions.value = '{"toolbar": "full", "height": 400}';
              helpText.textContent = '${t('collections.form.fieldTypes.richtextHelp')}';
              break;
          }
        } else {
          optionsContainer.classList.add('hidden');
          fieldOptions.value = '{}';

          // Set help text for other field types
          switch (this.value) {
            case 'text':
              helpText.textContent = '${t('collections.form.fieldTypes.textHelp')}';
              break;
            case 'slug':
              helpText.textContent = '${t('collections.form.fieldTypes.slugHelp')}';
              break;
            case 'number':
              helpText.textContent = '${t('collections.form.fieldTypes.numberHelp')}';
              break;
            case 'boolean':
              helpText.textContent = '${t('collections.form.fieldTypes.booleanHelp')}';
              break;
            case 'date':
              helpText.textContent = '${t('collections.form.fieldTypes.dateHelp')}';
              break;
            default:
              helpText.textContent = '';
          }
        }
      });

      // Close modal on escape key
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !document.getElementById('field-modal').classList.contains('hidden')) {
          closeFieldModal();
        }
      });

      // Close modal on backdrop click
      document.getElementById('field-modal').addEventListener('click', function(e) {
        if (e.target === this) {
          closeFieldModal();
        }
      });
    </script>

    <!-- Confirmation Dialogs -->
    ${renderConfirmationDialog({
      id: "delete-field-confirm",
      title: t('collections.form.fieldModal.editTitle'),
      message: t('collections.deleteConfirm'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      iconColor: "red",
      confirmClass: "bg-red-500 hover:bg-red-400",
      onConfirm: "performDeleteField()",
    })}

    ${getConfirmationDialogScript()}
  `;

  const layoutData: AdminLayoutCatalystData = {
    title: title,
    pageTitle: t('collections.title'),
    currentPath: "/admin/collections",
    user: data.user,
    version: data.version,
    content: pageContent,
  };

  return renderAdminLayoutCatalyst(layoutData, t);
}
