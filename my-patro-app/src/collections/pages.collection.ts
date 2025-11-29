/**
 * Pages Collection
 *
 * Collection for static pages (About, Contact, etc.)
 */

import type { CollectionConfig } from '@patro-io/cms'

export default {
  name: 'pages',
  displayName: 'Pages',
  description: 'Static page content collection',
  icon: '📄',
  color: '#10B981',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        required: true,
        maxLength: 200,
        placeholder: 'Enter page title...',
        helpText: 'The main title of the page'
      },
      slug: {
        type: 'slug',
        title: 'URL Slug',
        required: true,
        maxLength: 200,
        placeholder: 'url-friendly-slug',
        helpText: 'Leave blank to auto-generate from title'
      },
      content: {
        type: 'richtext',
        title: 'Content',
        required: true,
        placeholder: 'Start writing page content...',
        helpText: 'The main content of the page'
      },
      metaDescription: {
        type: 'textarea',
        title: 'Meta Description',
        maxLength: 160,
        placeholder: 'SEO meta description...',
        helpText: 'SEO description for search engines (max 160 characters)'
      },
      featuredImage: {
        type: 'media',
        title: 'Featured Image',
        helpText: 'Optional featured image for the page'
      },
      status: {
        type: 'select',
        title: 'Status',
        enum: ['draft', 'published', 'archived'],
        enumLabels: ['Draft', 'Published', 'Archived'],
        default: 'draft',
        required: true
      },
      showInMenu: {
        type: 'checkbox',
        title: 'Show in Navigation',
        default: false,
        helpText: 'Display this page in the main navigation menu'
      },
      menuOrder: {
        type: 'number',
        title: 'Menu Order',
        min: 0,
        default: 0,
        helpText: 'Order in navigation menu (lower numbers appear first)'
      }
    },
    required: ['title', 'slug', 'content']
  },

  // List view configuration
  listFields: ['title', 'slug', 'status', 'showInMenu'],
  searchFields: ['title', 'content', 'metaDescription'],
  defaultSort: 'createdAt',
  defaultSortOrder: 'desc',

  // Mark as config-managed (code-based) collection with editable fields
  codeManaged: true,
  fieldsEditable: true,
  isActive: true
} satisfies CollectionConfig