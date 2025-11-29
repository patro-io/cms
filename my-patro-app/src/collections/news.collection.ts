/**
 * News Collection
 *
 * Collection for news articles and announcements
 */

import type { CollectionConfig } from '@patro-io/cms'

export default {
  name: 'news',
  displayName: 'News',
  description: 'News article content collection',
  icon: '📰',
  color: '#F59E0B',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        required: true,
        maxLength: 200,
        placeholder: 'Enter news title...',
        helpText: 'The headline of the news article'
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
        placeholder: 'Start writing news article...',
        helpText: 'The main content of the news article'
      },
      excerpt: {
        type: 'textarea',
        title: 'Excerpt',
        maxLength: 300,
        placeholder: 'Write a short summary...',
        helpText: 'A brief summary of the news for previews'
      },
      publishDate: {
        type: 'datetime',
        title: 'Publish Date',
        required: true,
        helpText: 'When this news article was or will be published'
      },
      author: {
        type: 'string',
        title: 'Author',
        required: true,
        placeholder: 'Author name'
      },
      category: {
        type: 'select',
        title: 'Category',
        enum: ['technology', 'business', 'general', 'announcement', 'update'],
        enumLabels: ['Technology', 'Business', 'General', 'Announcement', 'Update'],
        default: 'general',
        required: true,
        helpText: 'News category for organization'
      },
      featuredImage: {
        type: 'media',
        title: 'Featured Image',
        helpText: 'Recommended size: 1200x630px'
      },
      status: {
        type: 'select',
        title: 'Status',
        enum: ['draft', 'published', 'archived'],
        enumLabels: ['Draft', 'Published', 'Archived'],
        default: 'draft',
        required: true
      },
      priority: {
        type: 'select',
        title: 'Priority',
        enum: ['low', 'normal', 'high', 'urgent'],
        enumLabels: ['Low', 'Normal', 'High', 'Urgent'],
        default: 'normal',
        helpText: 'Priority level for displaying news'
      },
      tags: {
        type: 'string',
        title: 'Tags',
        placeholder: 'breaking, update, important',
        helpText: 'Comma-separated tags for categorization'
      }
    },
    required: ['title', 'slug', 'content', 'publishDate', 'author', 'category']
  },

  // List view configuration
  listFields: ['title', 'author', 'category', 'priority', 'status', 'publishDate'],
  searchFields: ['title', 'excerpt', 'author', 'tags'],
  defaultSort: 'publishDate',
  defaultSortOrder: 'desc',

  // Mark as config-managed (code-based) collection with editable fields
  codeManaged: true,
  fieldsEditable: true,
  isActive: true
} satisfies CollectionConfig