/**
 * Blog Posts Collection
 *
 * Example collection configuration for blog posts
 */

import type { CollectionConfig } from '@patro-io/cms'

export default {
  name: 'blog_posts',
  displayName: 'Blog Posts',
  description: 'Manage your blog posts',
  icon: '📝',
  color: '#3B82F6',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        required: true,
        maxLength: 200,
        placeholder: 'Enter blog post title...',
        helpText: 'The main title of your blog post'
      },
      slug: {
        type: 'slug',
        title: 'URL Slug',
        required: true,
        maxLength: 200,
        placeholder: 'url-friendly-slug',
        helpText: 'Leave blank to auto-generate from title'
      },
      excerpt: {
        type: 'textarea',
        title: 'Excerpt',
        maxLength: 500,
        placeholder: 'Write a short summary...',
        helpText: 'A short summary of the post for previews and SEO'
      },
      content: {
        type: 'richtext',
        title: 'Content',
        required: true,
        placeholder: 'Start writing your blog post...',
        helpText: 'The main content of your blog post'
      },
      featuredImage: {
        type: 'media',
        title: 'Featured Image',
        helpText: 'Recommended size: 1200x630px'
      },
      author: {
        type: 'string',
        title: 'Author',
        required: true,
        placeholder: 'Author name'
      },
      publishedAt: {
        type: 'datetime',
        title: 'Published Date',
        helpText: 'When this post was or will be published'
      },
      status: {
        type: 'select',
        title: 'Status',
        enum: ['draft', 'published', 'archived'],
        enumLabels: ['Draft', 'Published', 'Archived'],
        default: 'draft',
        required: true
      },
      difficulty: {
        type: 'select',
        title: 'Difficulty',
        enum: ['beginner', 'intermediate', 'advanced'],
        enumLabels: ['Beginner', 'Intermediate', 'Advanced'],
        required: true,
        default: 'beginner',
        helpText: 'Target audience difficulty level'
      },
      tags: {
        type: 'string',
        title: 'Tags',
        placeholder: 'javascript, tutorial, web-dev',
        helpText: 'Comma-separated tags for categorization'
      }
    },
    required: ['title', 'slug', 'content', 'author', 'difficulty']
  },

  // List view configuration
  listFields: ['title', 'author', 'difficulty', 'status', 'publishedAt'],
  searchFields: ['title', 'excerpt', 'author', 'tags'],
  defaultSort: 'createdAt',
  defaultSortOrder: 'desc',

  // Mark as config-managed (code-based) collection with editable fields
  codeManaged: true,
  fieldsEditable: true,
  isActive: true
} satisfies CollectionConfig
