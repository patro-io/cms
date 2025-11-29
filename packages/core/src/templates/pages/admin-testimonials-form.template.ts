import { renderAdminLayout, AdminLayoutData } from '../layouts/admin-layout-v2.template'
import type { TranslateFn } from '../../services/i18n'
import { renderAlert } from '../alert.template'

interface Testimonial {
  id?: number
  authorName: string
  authorTitle?: string
  authorCompany?: string
  testimonialText: string
  rating?: number
  isPublished: boolean
  sortOrder: number
}

interface TestimonialsFormData {
  testimonial?: Testimonial
  isEdit: boolean
  errors?: Record<string, string[]>
  user?: { name: string; email: string; role: string }
  message?: string
  messageType?: 'success' | 'error' | 'warning' | 'info'
  logoUrl?: string
}

export function renderTestimonialsForm(data: TestimonialsFormData, t: TranslateFn): string {
  const { testimonial, isEdit, errors, message, messageType } = data
  const pageTitle = isEdit ? t('testimonials.edit') : t('testimonials.create')

  const pageContent = `
    <div class="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 class="text-2xl font-semibold text-white">${pageTitle}</h1>
          <p class="mt-2 text-sm text-gray-300">
            ${isEdit ? t('testimonials.messages.updateError') : t('testimonials.messages.createError')}
          </p>
        </div>
        <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <a href="/admin/testimonials"
             class="inline-flex items-center justify-center rounded-xl backdrop-blur-sm bg-white/10 px-4 py-2 text-sm font-semibold text-white border border-white/20 hover:bg-white/20 transition-all">
            <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ${t('common.back')}
          </a>
        </div>
      </div>

      ${message ? renderAlert({ type: messageType || 'info', message, dismissible: true }) : ''}

      <!-- Form -->
      <div class="backdrop-blur-xl bg-white/10 rounded-xl border border-white/20 shadow-2xl">
        <form ${isEdit ? `hx-put="/admin/testimonials/${testimonial?.id}"` : 'hx-post="/admin/testimonials"'}
              hx-target="body"
              hx-swap="outerHTML"
              class="space-y-6 p-6">

          <!-- Author Information Section -->
          <div>
            <h2 class="text-lg font-medium text-white mb-4">${t('testimonials.form.authorInfo')}</h2>

            <!-- Author Name -->
            <div class="mb-4">
              <label for="authorName" class="block text-sm font-medium text-white">
                ${t('testimonials.authorName')} <span class="text-red-400">*</span>
              </label>
              <div class="mt-1">
                <input type="text"
                       name="authorName"
                       id="authorName"
                       value="${testimonial?.authorName || ''}"
                       required
                       maxlength="100"
                       class="block w-full rounded-md border-0 bg-gray-700 py-1.5 text-gray-100 shadow-sm ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                       placeholder="${t('testimonials.form.authorNamePlaceholder')}">
              </div>
              ${errors?.authorName ? `
                <div class="mt-1">
                  ${errors.authorName.map(error => `
                    <p class="text-sm text-red-400">${escapeHtml(error)}</p>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Author Title -->
              <div>
                <label for="authorTitle" class="block text-sm font-medium text-white">${t('testimonials.authorTitle')}</label>
                <div class="mt-1">
                  <input type="text"
                         name="authorTitle"
                         id="authorTitle"
                         value="${testimonial?.authorTitle || ''}"
                         maxlength="100"
                         class="block w-full rounded-md border-0 bg-gray-700 py-1.5 text-gray-100 shadow-sm ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                         placeholder="${t('testimonials.form.authorTitlePlaceholder')}">
                </div>
                ${errors?.authorTitle ? `
                  <div class="mt-1">
                    ${errors.authorTitle.map(error => `
                      <p class="text-sm text-red-400">${escapeHtml(error)}</p>
                    `).join('')}
                  </div>
                ` : ''}
              </div>

              <!-- Author Company -->
              <div>
                <label for="authorCompany" class="block text-sm font-medium text-white">${t('testimonials.authorCompany')}</label>
                <div class="mt-1">
                  <input type="text"
                         name="authorCompany"
                         id="authorCompany"
                         value="${testimonial?.authorCompany || ''}"
                         maxlength="100"
                         class="block w-full rounded-md border-0 bg-gray-700 py-1.5 text-gray-100 shadow-sm ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                         placeholder="${t('testimonials.form.authorCompanyPlaceholder')}">
                </div>
                ${errors?.authorCompany ? `
                  <div class="mt-1">
                    ${errors.authorCompany.map(error => `
                      <p class="text-sm text-red-400">${escapeHtml(error)}</p>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- Testimonial Content Section -->
          <div>
            <h2 class="text-lg font-medium text-white mb-4">${t('testimonials.form.content')}</h2>

            <!-- Testimonial Text -->
            <div class="mb-4">
              <label for="testimonialText" class="block text-sm font-medium text-white">
                ${t('testimonials.testimonial')} <span class="text-red-400">*</span>
              </label>
              <div class="mt-1">
                <textarea name="testimonialText"
                          id="testimonialText"
                          rows="6"
                          required
                          maxlength="1000"
                          class="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white placeholder-gray-300 focus:border-blue-400 focus:outline-none transition-colors w-full"
                          placeholder="${t('testimonials.form.testimonialPlaceholder')}">${testimonial?.testimonialText || ''}</textarea>
                <p class="mt-1 text-sm text-gray-300">
                  <span id="testimonial-count">0</span>/1000
                </p>
              </div>
              ${errors?.testimonialText ? `
                <div class="mt-1">
                  ${errors.testimonialText.map(error => `
                    <p class="text-sm text-red-400">${escapeHtml(error)}</p>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <!-- Rating -->
            <div>
              <label for="rating" class="block text-sm font-medium text-white">${t('testimonials.rating')}</label>
              <div class="mt-1">
                <select name="rating"
                        id="rating"
                        class="block w-full rounded-md border-0 bg-gray-700 py-1.5 text-gray-100 shadow-sm ring-1 ring-inset ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6">
                  <option value="">${t('testimonials.allRatings')}</option>
                  <option value="5" ${testimonial?.rating === 5 ? 'selected' : ''}>⭐⭐⭐⭐⭐ (${t('testimonials.stars', { count: 5 })})</option>
                  <option value="4" ${testimonial?.rating === 4 ? 'selected' : ''}>⭐⭐⭐⭐ (${t('testimonials.stars', { count: 4 })})</option>
                  <option value="3" ${testimonial?.rating === 3 ? 'selected' : ''}>⭐⭐⭐ (${t('testimonials.stars', { count: 3 })})</option>
                  <option value="2" ${testimonial?.rating === 2 ? 'selected' : ''}>⭐⭐ (${t('testimonials.stars', { count: 2 })})</option>
                  <option value="1" ${testimonial?.rating === 1 ? 'selected' : ''}>⭐ (${t('testimonials.stars', { count: 1 })})</option>
                </select>
              </div>
              ${errors?.rating ? `
                <div class="mt-1">
                  ${errors.rating.map(error => `
                    <p class="text-sm text-red-400">${escapeHtml(error)}</p>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Status and Sort Order Row -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Published Status -->
            <div>
              <label class="block text-sm font-medium text-white">${t('testimonials.status')}</label>
              <div class="mt-2 space-y-2">
                <div class="flex items-center">
                  <input id="published"
                         name="isPublished"
                         type="radio"
                         value="true"
                         ${!testimonial || testimonial.isPublished ? 'checked' : ''}
                         class="h-4 w-4 text-blue-600 focus:ring-blue-600 border-gray-600 bg-gray-700">
                  <label for="published" class="ml-2 block text-sm text-white">
                    ${t('testimonials.published')} <span class="text-gray-300">(${t('testimonials.form.publishedHelp')})</span>
                  </label>
                </div>
                <div class="flex items-center">
                  <input id="draft"
                         name="isPublished"
                         type="radio"
                         value="false"
                         ${testimonial && !testimonial.isPublished ? 'checked' : ''}
                         class="h-4 w-4 text-blue-600 focus:ring-blue-600 border-gray-600 bg-gray-700">
                  <label for="draft" class="ml-2 block text-sm text-white">
                    ${t('testimonials.draft')}
                  </label>
                </div>
              </div>
            </div>

            <!-- Sort Order -->
            <div>
              <label for="sortOrder" class="block text-sm font-medium text-white">${t('testimonials.order')}</label>
              <div class="mt-1">
                <input type="number"
                       name="sortOrder"
                       id="sortOrder"
                       value="${testimonial?.sortOrder || 0}"
                       min="0"
                       step="1"
                       class="block w-full rounded-md border-0 bg-gray-700 py-1.5 text-gray-100 shadow-sm ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6">
                <p class="mt-1 text-sm text-gray-300">${t('testimonials.form.sortOrderHelp')}</p>
              </div>
              ${errors?.sortOrder ? `
                <div class="mt-1">
                  ${errors.sortOrder.map(error => `
                    <p class="text-sm text-red-400">${escapeHtml(error)}</p>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Form Actions -->
          <div class="flex items-center justify-end space-x-3 pt-6 border-t border-white/20">
            <a href="/admin/testimonials"
               class="inline-flex items-center justify-center rounded-xl backdrop-blur-sm bg-white/10 px-4 py-2 text-sm font-semibold text-white border border-white/20 hover:bg-white/20 transition-all">
              ${t('common.cancel')}
            </a>
            <button type="submit"
                    class="inline-flex items-center justify-center rounded-xl backdrop-blur-sm bg-blue-500/80 px-4 py-2 text-sm font-semibold text-white border border-white/20 hover:bg-blue-500 transition-all">
              <svg class="-ml-0.5 mr-1.5 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              ${isEdit ? t('common.update') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      // Character count for testimonial
      const testimonialTextarea = document.getElementById('testimonialText');
      const testimonialCount = document.getElementById('testimonial-count');

      function updateTestimonialCount() {
        testimonialCount.textContent = testimonialTextarea.value.length;
      }

      testimonialTextarea.addEventListener('input', updateTestimonialCount);
      updateTestimonialCount(); // Initial count
    </script>
  `

  const layoutData: AdminLayoutData = {
    title: `${pageTitle} - Admin`,
    pageTitle,
    currentPath: isEdit ? `/admin/testimonials/${testimonial?.id}` : '/admin/testimonials/new',
    user: data.user,
    content: pageContent,
    logoUrl: data.logoUrl
  }

  return renderAdminLayout(layoutData, t)
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
