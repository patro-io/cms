/**
 * Content Service - Pure Effect Implementation
 * Handles content CRUD operations for dynamic CMS data
 */

import { Context, Effect, Layer } from 'effect'
import {
  DatabaseService,
  DatabaseError,
  NotFoundError,
  ValidationError,
  makeDatabaseLayer
} from './database-effect'
import { getAvailableLocales } from './i18n'

/**
 * Content types
 */
export interface Content {
  id: string
  collection_id: string
  slug: string
  data: any
  status: string
  author_id: string
  updated_by?: string
  created_at: number
  updated_at: number
  published_at?: number
  title?: string
  scheduled_publish_at?: number
  scheduled_unpublish_at?: number
  meta_title?: string
  meta_description?: string
  review_status?: string
  // Localization fields
  language?: string
  translation_group_id?: string
  translation_source?: string
}

export interface ContentVersion {
  id: string
  content_id: string
  version: number
  data: any
  author_id: string
  created_at: number
}

export interface WorkflowHistoryEntry {
  id: string
  content_id: string
  action: string
  from_status: string
  to_status: string
  user_id: string
  comment?: string
  created_at: number
}

export interface CreateContentInput {
  collection_id: string
  slug: string
  data: any
  status?: string
  author_id: string
  title?: string
  scheduled_publish_at?: number
  scheduled_unpublish_at?: number
  meta_title?: string
  meta_description?: string
  // Localization
  language?: string
  translation_group_id?: string
  translation_source?: string
  // Translation linking - ID of content to link as translation
  linkToId?: string
}

export interface UpdateContentInput {
  slug?: string
  data?: any
  status?: string
  updated_by: string
  title?: string
  scheduled_publish_at?: number
  scheduled_unpublish_at?: number
  meta_title?: string
  meta_description?: string
  // Allow correcting language if needed
  language?: string
}

export interface ContentQueryOptions {
  collection_id?: string
  status?: string
  limit?: number
  offset?: number
  orderBy?: string
  orderDirection?: 'ASC' | 'DESC'
  search?: string
  // Localization filters
  language?: string
  translation_group_id?: string
}

/**
 * Content Service Error types
 */
export class ContentNotFoundError {
  readonly _tag = 'ContentNotFoundError'
  constructor(readonly contentId: string) {}
}

export class ContentAlreadyExistsError {
  readonly _tag = 'ContentAlreadyExistsError'
  constructor(readonly slug: string) {}
}

export class InvalidContentDataError {
  readonly _tag = 'InvalidContentDataError'
  constructor(readonly message: string, readonly details?: any) {}
}

export class TranslationAlreadyExistsError {
  readonly _tag = 'TranslationAlreadyExistsError'
  constructor(readonly language: string, readonly translationGroupId: string) {}
}

/**
 * Translation info for a content item
 */
export interface TranslationInfo {
  language: string
  contentId: string
  status: string
  source: 'manual' | 'ai'
  title?: string
}

/**
 * Available translations response
 */
export interface AvailableTranslationsResponse {
  current: {
    language: string
    contentId: string
  }
  translations: TranslationInfo[]
  availableTargetLanguages: string[]
}

/**
 * Create translation options
 */
export interface CreateTranslationOptions {
  useAi?: boolean
  overrideFields?: Record<string, unknown>
}

/**
 * Content Service Interface - Closed Service Pattern
 * No DatabaseService in requirements - dependencies resolved in Layer
 */
export interface ContentService {
  readonly getContentById: (
    id: string
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError>

  readonly getContentBySlug: (
    collectionId: string,
    slug: string
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError>

  /**
   * Get content by slug with translations map
   */
  readonly getContentBySlugWithTranslations: (
    collectionId: string,
    slug: string
  ) => Effect.Effect<Content & { translations: Record<string, string> }, DatabaseError | ContentNotFoundError>

  readonly queryContent: (
    options: ContentQueryOptions
  ) => Effect.Effect<Content[], DatabaseError>

  readonly countContent: (
    options: Omit<ContentQueryOptions, 'limit' | 'offset' | 'orderBy' | 'orderDirection'>
  ) => Effect.Effect<number, DatabaseError>

  readonly createContent: (
    input: CreateContentInput
  ) => Effect.Effect<Content, DatabaseError | ContentAlreadyExistsError | ValidationError | ContentNotFoundError | NotFoundError>

  readonly updateContent: (
    id: string,
    input: UpdateContentInput
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError | ValidationError | ContentAlreadyExistsError | NotFoundError>

  readonly deleteContent: (
    id: string
  ) => Effect.Effect<void, DatabaseError | ContentNotFoundError>

  readonly publishContent: (
    id: string,
    userId: string
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError | NotFoundError>

  readonly unpublishContent: (
    id: string,
    userId: string
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError | NotFoundError>

  readonly duplicateContent: (
    id: string,
    userId: string
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError | NotFoundError>

  readonly getContentVersions: (
    contentId: string
  ) => Effect.Effect<ContentVersion[], DatabaseError>

  readonly createContentVersion: (
    contentId: string,
    data: any,
    authorId: string
  ) => Effect.Effect<ContentVersion, DatabaseError | ContentNotFoundError | NotFoundError>

  readonly restoreContentVersion: (
    contentId: string,
    version: number,
    userId: string
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError | NotFoundError>

  readonly logWorkflowAction: (
    contentId: string,
    action: string,
    fromStatus: string,
    toStatus: string,
    userId: string,
    comment?: string
  ) => Effect.Effect<void, DatabaseError>

  readonly bulkUpdateStatus: (
    ids: string[],
    status: string,
    userId: string
  ) => Effect.Effect<number, DatabaseError>

  readonly softDeleteContent: (
    id: string,
    userId: string
  ) => Effect.Effect<void, DatabaseError | ContentNotFoundError>

  readonly hardDeleteContent: (
    id: string
  ) => Effect.Effect<void, DatabaseError | ContentNotFoundError>

  readonly getContentWithCollection: (
    id: string
  ) => Effect.Effect<any, DatabaseError | ContentNotFoundError>

  /**
   * Get all content items in a translation group
   */
  readonly getTranslationGroup: (
    groupId: string
  ) => Effect.Effect<Content[], DatabaseError>

  /**
   * Get available translations for a content item
   */
  readonly getAvailableTranslations: (
    contentId: string
  ) => Effect.Effect<AvailableTranslationsResponse, DatabaseError | ContentNotFoundError>

  /**
   * Create a new translation for existing content
   */
  readonly createTranslation: (
    sourceContentId: string,
    targetLanguage: string,
    options?: CreateTranslationOptions
  ) => Effect.Effect<Content, DatabaseError | ContentNotFoundError | TranslationAlreadyExistsError | ValidationError>

  /**
   * Get or create translation group ID for a content item
   */
  readonly ensureTranslationGroup: (
    contentId: string
  ) => Effect.Effect<string, DatabaseError | ContentNotFoundError>
}

/**
 * Content Service Tag for dependency injection
 */
export const ContentService = Context.GenericTag<ContentService>('@services/ContentService')

/**
 * Content Service Live Implementation - Closed Service Pattern
 * Dependencies (DatabaseService) are resolved at Layer creation time
 */
export const ContentServiceLive = Layer.effect(
  ContentService,
  Effect.gen(function* (_) {
    // Get DatabaseService once at Layer creation time
    const db = yield* DatabaseService
    
    // Return service implementation with db in closure
    return {
      getContentById: (id: string) =>
        Effect.gen(function* (_) {
          const content = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            )
          

          if (!content) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          // Parse data field if it's a string
          if (typeof content.data === 'string') {
            try {
              content.data = JSON.parse(content.data)
            } catch (e) {
              // Leave as string if parsing fails
            }
          }

          return content
        }),

      getContentBySlug: (collectionId: string, slug: string) =>
        Effect.gen(function* (_) {
          const content = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE collection_id = ? AND slug = ?',
              [collectionId, slug]
            )
          

          if (!content) {
            return yield* Effect.fail(new ContentNotFoundError(`${collectionId}/${slug}`))
          }

          // Parse data field if it's a string
          if (typeof content.data === 'string') {
            try {
              content.data = JSON.parse(content.data)
            } catch (e) {
              // Leave as string if parsing fails
            }
          }

          return content
        }),

      getContentBySlugWithTranslations: (collectionId: string, slug: string) =>
        Effect.gen(function* (_) {
          // First get the content itself
          const content = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE collection_id = ? AND slug = ?',
              [collectionId, slug]
            )
          

          if (!content) {
            return yield* Effect.fail(new ContentNotFoundError(`${collectionId}/${slug}`))
          }

          // Parse data field if it's a string
          if (typeof content.data === 'string') {
            try {
              content.data = JSON.parse(content.data)
            } catch (e) {
              // Leave as string if parsing fails
            }
          }

          // Build translations map
          const translations: Record<string, string> = {}
          
          // If content has a translation_group_id, fetch all translations
          if (content.translation_group_id) {
            const relatedContent = yield* 
              db.query<Content>(
                `SELECT language, slug FROM content
                 WHERE translation_group_id = ? AND collection_id = ?
                 ORDER BY language ASC`,
                [content.translation_group_id, collectionId]
              )
            

            // Build language -> slug map
            for (const item of relatedContent) {
              const lang = item.language || 'en'
              translations[lang] = item.slug
            }
          } else {
            // No translation group - only include current content
            const currentLang = content.language || 'en'
            translations[currentLang] = content.slug
          }

          return {
            ...content,
            translations
          }
        }),

      queryContent: (options: ContentQueryOptions) =>
        Effect.gen(function* (_) {
          const conditions: string[] = []
          const params: any[] = []

          // By default, exclude deleted content unless explicitly requested
          if (options.status) {
            conditions.push('c.status = ?')
            params.push(options.status)
          } else {
            // Exclude deleted by default
            conditions.push('c.status != ?')
            params.push('deleted')
          }

          if (options.collection_id) {
            conditions.push('c.collection_id = ?')
            params.push(options.collection_id)
          }

          if (options.language) {
            conditions.push('c.language = ?')
            params.push(options.language)
          }

          if (options.translation_group_id) {
            conditions.push('c.translation_group_id = ?')
            params.push(options.translation_group_id)
          }

          if (options.search) {
            conditions.push('(c.slug LIKE ? OR c.data LIKE ?)')
            const searchParam = `%${options.search}%`
            params.push(searchParam, searchParam)
          }

          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
          const orderBy = options.orderBy || 'created_at'
          const orderDirection = options.orderDirection || 'DESC'
          const limit = options.limit || 50
          const offset = options.offset || 0

          const sql = `
            SELECT
              c.*,
              u.email as author_email,
              COALESCE(u.first_name || ' ' || u.last_name, u.username, u.email) as author_name
            FROM content c
            LEFT JOIN users u ON c.author_id = u.id
            ${whereClause}
            ORDER BY c.${orderBy} ${orderDirection}
            LIMIT ? OFFSET ?
          `

          params.push(limit, offset)

          const results = yield* db.query<Content & { author_name?: string; author_email?: string }>(sql, params)

          // Parse data field for each result
          return results.map(content => {
            if (typeof content.data === 'string') {
              try {
                content.data = JSON.parse(content.data)
              } catch (e) {
                // Leave as string if parsing fails
              }
            }
            return content
          })
        }),

      countContent: (options: Omit<ContentQueryOptions, 'limit' | 'offset' | 'orderBy' | 'orderDirection'>) =>
        Effect.gen(function* (_) {
          const conditions: string[] = []
          const params: any[] = []

          // By default, exclude deleted content unless explicitly requested
          if (options.status) {
            conditions.push('status = ?')
            params.push(options.status)
          } else {
            // Exclude deleted by default
            conditions.push('status != ?')
            params.push('deleted')
          }

          if (options.collection_id) {
            conditions.push('collection_id = ?')
            params.push(options.collection_id)
          }

          if (options.language) {
            conditions.push('language = ?')
            params.push(options.language)
          }

          if (options.translation_group_id) {
            conditions.push('translation_group_id = ?')
            params.push(options.translation_group_id)
          }

          if (options.search) {
            conditions.push('(slug LIKE ? OR data LIKE ?)')
            const searchParam = `%${options.search}%`
            params.push(searchParam, searchParam)
          }

          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

          const sql = `SELECT COUNT(*) as count FROM content ${whereClause}`

          const result = yield* 
            db.queryFirst<{ count: number }>(sql, params)
          

          return result?.count || 0
        }),

      createContent: (input: CreateContentInput) =>
        Effect.gen(function* (_) {
          // Validate slug format
          if (!/^[a-z0-9-_]+$/.test(input.slug)) {
            return yield* 
              Effect.fail(
                new ValidationError(
                  'Slug must contain only lowercase letters, numbers, hyphens, and underscores'
                )
              )
            
          }

          // Check if content with same slug already exists in collection
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM content WHERE collection_id = ? AND slug = ?',
              [input.collection_id, input.slug]
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          

          if (existing) {
            return yield* Effect.fail(new ContentAlreadyExistsError(input.slug))
          }

          // Handle translation linking via linkToId
          let translationGroupId = input.translation_group_id
          
          if (input.linkToId) {
            // Fetch the linked content to get/create its translation_group_id
            const linkedContent = yield* 
              db.queryFirst<Content>(
                'SELECT id, translation_group_id FROM content WHERE id = ?',
                [input.linkToId]
              ).pipe(
                Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
                Effect.catchAll(() => Effect.succeed(null))
              )
            

            if (!linkedContent) {
              return yield* 
                Effect.fail(
                  new ValidationError(`Content to link (${input.linkToId}) not found`)
                )
              
            }

            // Use existing translation_group_id or create new one
            if (linkedContent.translation_group_id) {
              translationGroupId = linkedContent.translation_group_id
            } else {
              // Create new translation group and update the linked content
              translationGroupId = crypto.randomUUID()
              yield* 
                db.execute(
                  `UPDATE content
                   SET translation_group_id = ?,
                       translation_source = COALESCE(translation_source, 'manual')
                   WHERE id = ?`,
                  [translationGroupId, input.linkToId]
                )
              
            }
          }

          const contentId = crypto.randomUUID()
          const now = Date.now()
          const status = input.status || 'draft'

          // Serialize data to JSON
          const dataJson = typeof input.data === 'string' ? input.data : JSON.stringify(input.data)

          // LANGUAGE DEFAULT HIERARCHY:
          // 1. input.language (from form or API) - highest priority
          // 2. 'en' fallback - used only if input.language is not provided
          //
          // NOTE: The input.language should come from AI Translator plugin's
          // defaultSourceLanguage setting (set in /admin/content/new route).
          // This 'en' fallback is only a safety net for edge cases.
          yield* 
            db.execute(
              `INSERT INTO content (id, collection_id, slug, title, data, status, language, translation_group_id, translation_source, author_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                contentId,
                input.collection_id,
                input.slug,
                input.title || 'Untitled',
                dataJson,
                status,
                input.language || 'en',
                translationGroupId || null,
                input.translation_source || 'manual',
                input.author_id,
                now,
                now
              ]
            )
          

          return yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [contentId]
            ).pipe(
              Effect.flatMap((content) => {
                if (!content) {
                  return Effect.fail(new NotFoundError('Content not found after creation'))
                }
                // Parse data field
                if (typeof content.data === 'string') {
                  try {
                    content.data = JSON.parse(content.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(content)
              })
            )
          
        }),

      updateContent: (id: string, input: UpdateContentInput) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          // If slug is being updated, validate and check for conflicts
          if (input.slug !== undefined) {
            if (!/^[a-z0-9-_]+$/.test(input.slug)) {
              return yield* 
                Effect.fail(
                  new ValidationError(
                    'Slug must contain only lowercase letters, numbers, hyphens, and underscores'
                  )
                )
              
            }

            // Check if new slug conflicts with another content in same collection
            const conflict = yield* 
              db.queryFirst<{ id: string }>(
                'SELECT id FROM content WHERE collection_id = ? AND slug = ? AND id != ?',
                [existing.collection_id, input.slug, id]
              ).pipe(
                Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
                Effect.catchAll(() => Effect.succeed(null))
              )
            

            if (conflict) {
              return yield* Effect.fail(new ContentAlreadyExistsError(input.slug))
            }
          }

          const now = Date.now()
          const updates: string[] = []
          const params: any[] = []

          if (input.slug !== undefined) {
            updates.push('slug = ?')
            params.push(input.slug)
          }

          if (input.data !== undefined) {
            updates.push('data = ?')
            const dataJson = typeof input.data === 'string' ? input.data : JSON.stringify(input.data)
            params.push(dataJson)
          }

          if (input.status !== undefined) {
            updates.push('status = ?')
            params.push(input.status)
          }

          if (input.title !== undefined) {
            updates.push('title = ?')
            params.push(input.title)
          }

          if (input.language !== undefined) {
            updates.push('language = ?')
            params.push(input.language)
          }

          updates.push('updated_by = ?')
          params.push(input.updated_by)

          updates.push('updated_at = ?')
          params.push(now)

          params.push(id)

          yield* 
            db.execute(
              `UPDATE content SET ${updates.join(', ')} WHERE id = ?`,
              params
            )
          

          return yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            ).pipe(
              Effect.flatMap((content) => {
                if (!content) {
                  return Effect.fail(new NotFoundError('Content not found after update'))
                }
                // Parse data field
                if (typeof content.data === 'string') {
                  try {
                    content.data = JSON.parse(content.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(content)
              })
            )
          
        }),

      deleteContent: (id: string) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM content WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          yield* 
            db.execute(
              'DELETE FROM content WHERE id = ?',
              [id]
            )
          
        }),

      publishContent: (id: string, userId: string) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          const now = Date.now()

          yield* 
            db.execute(
              'UPDATE content SET status = ?, published_at = ?, updated_by = ?, updated_at = ? WHERE id = ?',
              ['published', now, userId, now, id]
            )
          

          return yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            ).pipe(
              Effect.flatMap((content) => {
                if (!content) {
                  return Effect.fail(new NotFoundError('Content not found after publish'))
                }
                // Parse data field
                if (typeof content.data === 'string') {
                  try {
                    content.data = JSON.parse(content.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(content)
              })
            )
          
        }),

      unpublishContent: (id: string, userId: string) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          const now = Date.now()

          yield* 
            db.execute(
              'UPDATE content SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?',
              ['draft', userId, now, id]
            )
          

          return yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            ).pipe(
              Effect.flatMap((content) => {
                if (!content) {
                  return Effect.fail(new NotFoundError('Content not found after unpublish'))
                }
                // Parse data field
                if (typeof content.data === 'string') {
                  try {
                    content.data = JSON.parse(content.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(content)
              })
            )
          
        }),

      duplicateContent: (id: string, userId: string) =>
        Effect.gen(function* (_) {
          // Get original content
          const original = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [id]
            )
          

          if (!original) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          // Generate unique slug
          const baseSlug = original.slug
          let newSlug = `${baseSlug}-copy`
          let counter = 1

          // Check if slug exists and increment until unique
          while (true) {
            const existing = yield* 
              db.queryFirst<{ id: string }>(
                'SELECT id FROM content WHERE collection_id = ? AND slug = ?',
                [original.collection_id, newSlug]
              ).pipe(
                Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
                Effect.catchAll(() => Effect.succeed(null))
              )
            

            if (!existing) break

            counter++
            newSlug = `${baseSlug}-copy-${counter}`
          }

          const newContentId = crypto.randomUUID()
          const now = Date.now()

          // Serialize data
          const dataJson = typeof original.data === 'string' ? original.data : JSON.stringify(original.data)

          yield* 
            db.execute(
              `INSERT INTO content (id, collection_id, slug, title, data, status, author_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newContentId,
                original.collection_id,
                newSlug,
                original.title || 'Untitled',
                dataJson,
                'draft', // Always create duplicates as draft
                userId,
                now,
                now
              ]
            )
          

          return yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [newContentId]
            ).pipe(
              Effect.flatMap((content) => {
                if (!content) {
                  return Effect.fail(new NotFoundError('Content not found after duplication'))
                }
                // Parse data field
                if (typeof content.data === 'string') {
                  try {
                    content.data = JSON.parse(content.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(content)
              })
            )
          
        }),

      getContentVersions: (contentId: string) =>
        Effect.gen(function* (_) {
          const versions = yield* 
            db.query<ContentVersion>(
              'SELECT * FROM content_versions WHERE content_id = ? ORDER BY version DESC',
              [contentId]
            )
          

          // Parse data field for each version
          return versions.map(version => {
            if (typeof version.data === 'string') {
              try {
                version.data = JSON.parse(version.data)
              } catch (e) {
                // Leave as string if parsing fails
              }
            }
            return version
          })
        }),

      createContentVersion: (contentId: string, data: any, authorId: string) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [contentId]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(contentId))
          }

          // Get the next version number
          const lastVersion = yield* 
            db.queryFirst<{ version: number }>(
              'SELECT MAX(version) as version FROM content_versions WHERE content_id = ?',
              [contentId]
            )
          

          const nextVersion = (lastVersion?.version || 0) + 1
          const versionId = crypto.randomUUID()
          const now = Date.now()

          // Serialize data
          const dataJson = typeof data === 'string' ? data : JSON.stringify(data)

          yield* 
            db.execute(
              `INSERT INTO content_versions (id, content_id, version, data, author_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [versionId, contentId, nextVersion, dataJson, authorId, now]
            )
          

          return yield* 
            db.queryFirst<ContentVersion>(
              'SELECT * FROM content_versions WHERE id = ?',
              [versionId]
            ).pipe(
              Effect.flatMap((version) => {
                if (!version) {
                  return Effect.fail(new ContentNotFoundError(versionId))
                }
                // Parse data field
                if (typeof version.data === 'string') {
                  try {
                    version.data = JSON.parse(version.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(version)
              })
            )
          
        }),

      restoreContentVersion: (contentId: string, version: number, userId: string) =>
        Effect.gen(function* (_) {
          // Get the version data
          const versionData = yield* 
            db.queryFirst<ContentVersion>(
              'SELECT * FROM content_versions WHERE content_id = ? AND version = ?',
              [contentId, version]
            )
          

          if (!versionData) {
            return yield* Effect.fail(new ContentNotFoundError(`${contentId}/version/${version}`))
          }

          const now = Date.now()

          // Update content with version data
          yield* 
            db.execute(
              'UPDATE content SET data = ?, updated_by = ?, updated_at = ? WHERE id = ?',
              [
                typeof versionData.data === 'string' ? versionData.data : JSON.stringify(versionData.data),
                userId,
                now,
                contentId
              ]
            )
          

          return yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [contentId]
            ).pipe(
              Effect.flatMap((content) => {
                if (!content) {
                  return Effect.fail(new ContentNotFoundError(contentId))
                }
                // Parse data field
                if (typeof content.data === 'string') {
                  try {
                    content.data = JSON.parse(content.data)
                  } catch (e) {
                    // Leave as string if parsing fails
                  }
                }
                return Effect.succeed(content)
              })
            )
          
        }),

      logWorkflowAction: (
        contentId: string,
        action: string,
        fromStatus: string,
        toStatus: string,
        userId: string,
        comment?: string
      ) =>
        Effect.gen(function* (_) {
          const entryId = crypto.randomUUID()
          const now = Date.now()

          yield* 
            db.execute(
              `INSERT INTO workflow_history (id, content_id, action, from_status, to_status, user_id, comment, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [entryId, contentId, action, fromStatus, toStatus, userId, comment || null, now]
            )
          
        }),

      bulkUpdateStatus: (ids: string[], status: string, userId: string) =>
        Effect.gen(function* (_) {
          if (ids.length === 0) {
            return 0
          }

          const now = Date.now()
          const placeholders = ids.map(() => '?').join(',')

          yield* 
            db.execute(
              `UPDATE content SET status = ?, updated_by = ?, updated_at = ? WHERE id IN (${placeholders})`,
              [status, userId, now, ...ids]
            )
          

          return ids.length
        }),

      softDeleteContent: (id: string, userId: string) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM content WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          const now = Date.now()

          yield* 
            db.execute(
              'UPDATE content SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?',
              ['deleted', userId, now, id]
            )
          
        }),

      hardDeleteContent: (id: string) =>
        Effect.gen(function* (_) {
          // Check if content exists
          const existing = yield* 
            db.queryFirst<{ id: string }>(
              'SELECT id FROM content WHERE id = ?',
              [id]
            )
          

          if (!existing) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          // Permanently delete content and all related data
          // Delete workflow history first (foreign key constraint)
          yield* 
            db.execute(
              'DELETE FROM workflow_history WHERE content_id = ?',
              [id]
            )
          

          // Delete content versions
          yield* 
            db.execute(
              'DELETE FROM content_versions WHERE content_id = ?',
              [id]
            )
          

          // Delete the content itself
          yield* 
            db.execute(
              'DELETE FROM content WHERE id = ?',
              [id]
            )
          
        }),

      getContentWithCollection: (id: string) =>
        Effect.gen(function* (_) {
          const result = yield* 
            db.queryFirst<any>(
              `SELECT
                c.*,
                col.name as collection_name,
                col.schema as collection_fields
               FROM content c
               LEFT JOIN collections col ON c.collection_id = col.id
               WHERE c.id = ?`,
              [id]
            )
          

          if (!result) {
            return yield* Effect.fail(new ContentNotFoundError(id))
          }

          // Parse JSON fields
          if (typeof result.data === 'string') {
            try {
              result.data = JSON.parse(result.data)
            } catch (e) {
              // Leave as string if parsing fails
            }
          }

          if (typeof result.collection_fields === 'string') {
            try {
              result.collection_fields = JSON.parse(result.collection_fields)
            } catch (e) {
              // Leave as string if parsing fails
            }
          }

          return result
        }),

      getTranslationGroup: (groupId: string) =>
        Effect.gen(function* (_) {
          const results = yield* 
            db.query<Content>(
              `SELECT * FROM content
               WHERE translation_group_id = ?
               ORDER BY language ASC`,
              [groupId]
            )
          

          // Parse data field for each result
          return results.map(content => {
            if (typeof content.data === 'string') {
              try {
                content.data = JSON.parse(content.data)
              } catch (e) {
                // Leave as string if parsing fails
              }
            }
            return content
          })
        }),

      getAvailableTranslations: (contentId: string) =>
        Effect.gen(function* (_) {
          // Get the content to find its translation group
          const content = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [contentId]
            )
          

          if (!content) {
            return yield* Effect.fail(new ContentNotFoundError(contentId))
          }

          // Parse data if needed
          if (typeof content.data === 'string') {
            try {
              content.data = JSON.parse(content.data)
            } catch (e) {
              // Leave as string
            }
          }

          const currentLanguage = content.language || 'en'
          const translationGroupId = content.translation_group_id

          // If no translation group, this is the only version
          if (!translationGroupId) {
            // Get all supported languages from i18n service
            const supportedLanguages = getAvailableLocales()
            const availableTargetLanguages = supportedLanguages.filter(
              lang => lang !== currentLanguage
            )

            return {
              current: {
                language: currentLanguage,
                contentId: content.id
              },
              translations: [{
                language: currentLanguage,
                contentId: content.id,
                status: content.status,
                source: (content.translation_source || 'manual') as 'manual' | 'ai',
                title: content.title
              }],
              availableTargetLanguages
            }
          }

          // Get all translations in the group
          const groupContents = yield* 
            db.query<Content>(
              `SELECT id, language, status, translation_source, title
               FROM content
               WHERE translation_group_id = ?
               ORDER BY language ASC`,
              [translationGroupId]
            )
          

          const translations: TranslationInfo[] = groupContents.map(c => ({
            language: c.language || 'en',
            contentId: c.id,
            status: c.status,
            source: (c.translation_source || 'manual') as 'manual' | 'ai',
            title: c.title
          }))

          // Determine available target languages (not yet translated)
          const existingLanguages = new Set(translations.map(t => t.language))
          const supportedLanguages = getAvailableLocales()
          const availableTargetLanguages = supportedLanguages.filter(
            lang => !existingLanguages.has(lang)
          )

          return {
            current: {
              language: currentLanguage,
              contentId: content.id
            },
            translations,
            availableTargetLanguages
          }
        }),

      createTranslation: (
        sourceContentId: string,
        targetLanguage: string,
        options?: CreateTranslationOptions
      ) =>
        Effect.gen(function* (_) {
          // Validate target language
          const supportedLanguages = getAvailableLocales()
          if (!supportedLanguages.includes(targetLanguage as any)) {
            return yield* 
              Effect.fail(
                new ValidationError(`Unsupported language: ${targetLanguage}`)
              )
            
          }

          // Get source content
          const sourceContent = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [sourceContentId]
            )
          

          if (!sourceContent) {
            return yield* Effect.fail(new ContentNotFoundError(sourceContentId))
          }

          // Parse source data
          let sourceData = sourceContent.data
          if (typeof sourceData === 'string') {
            try {
              sourceData = JSON.parse(sourceData)
            } catch (e) {
              sourceData = {}
            }
          }

          // Get or create translation group ID with atomic transaction to prevent race conditions
          let translationGroupId = sourceContent.translation_group_id
          if (!translationGroupId) {
            translationGroupId = crypto.randomUUID()
            
            // Use atomic UPDATE with WHERE clause to prevent race conditions
            // Only update if translation_group_id is still NULL
            const updateResult = yield* 
              db.execute(
                `UPDATE content
                 SET translation_group_id = ?,
                     translation_source = COALESCE(translation_source, 'manual')
                 WHERE id = ? AND translation_group_id IS NULL`,
                [translationGroupId, sourceContentId]
              )
            

            // If no rows were updated, another process already set the group ID
            // Re-fetch to get the actual group ID
            if (updateResult.changes === 0) {
              const refetchedContent = yield* 
                db.queryFirst<Content>(
                  'SELECT translation_group_id FROM content WHERE id = ?',
                  [sourceContentId]
                )
              
              if (refetchedContent?.translation_group_id) {
                translationGroupId = refetchedContent.translation_group_id
              }
            }
          }

          // Check if translation already exists for this language in the group
          const existingTranslation = yield* 
            db.queryFirst<{ id: string }>(
              `SELECT id FROM content
               WHERE translation_group_id = ? AND language = ?`,
              [translationGroupId, targetLanguage]
            ).pipe(
              Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
              Effect.catchAll(() => Effect.succeed(null))
            )
          

          if (existingTranslation) {
            return yield* 
              Effect.fail(
                new TranslationAlreadyExistsError(targetLanguage, translationGroupId)
              )
            
          }

          // Generate unique slug with collision prevention
          let baseSlug = `${sourceContent.slug}-${targetLanguage}`
          let newSlug = baseSlug
          let slugCounter = 1
          
          // Check for slug uniqueness within the same collection
          let slugExists = true
          while (slugExists) {
            const existingSlug = yield* 
              db.queryFirst<{ id: string }>(
                'SELECT id FROM content WHERE collection_id = ? AND slug = ?',
                [sourceContent.collection_id, newSlug]
              ).pipe(
                Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
                Effect.catchAll(() => Effect.succeed(null))
              )
            
            
            if (!existingSlug) {
              slugExists = false
            } else {
              newSlug = `${baseSlug}-${slugCounter}`
              slugCounter++
            }
          }

          // Prepare new content data
          const newContentId = crypto.randomUUID()
          const now = Date.now()
          
          // Merge source data with any overrides
          const newData = {
            ...sourceData,
            ...(options?.overrideFields || {})
          }
          
          const translationSource = options?.useAi ? 'ai' : 'manual'
          const newTitle = (newData as any).title || sourceContent.title || 'Untitled'

          // Insert new translation
          yield* 
            db.execute(
              `INSERT INTO content (
                id, collection_id, slug, title, data, status, language,
                translation_group_id, translation_source, author_id,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newContentId,
                sourceContent.collection_id,
                newSlug,
                newTitle,
                JSON.stringify(newData),
                'draft', // New translations start as draft
                targetLanguage,
                translationGroupId,
                translationSource,
                sourceContent.author_id,
                now,
                now
              ]
            )
          

          // Return the newly created content
          const newContent = yield* 
            db.queryFirst<Content>(
              'SELECT * FROM content WHERE id = ?',
              [newContentId]
            )
          

          if (!newContent) {
            return yield* Effect.fail(new ContentNotFoundError(newContentId))
          }

          // Parse data field
          if (typeof newContent.data === 'string') {
            try {
              newContent.data = JSON.parse(newContent.data)
            } catch (e) {
              // Leave as string
            }
          }

          return newContent
        }),

      ensureTranslationGroup: (contentId: string) =>
        Effect.gen(function* (_) {
          // Get the content
          const content = yield* 
            db.queryFirst<Content>(
              'SELECT id, translation_group_id FROM content WHERE id = ?',
              [contentId]
            )
          

          if (!content) {
            return yield* Effect.fail(new ContentNotFoundError(contentId))
          }

          // If already has a group, return it
          if (content.translation_group_id) {
            return content.translation_group_id
          }

          // Create new group ID
          const newGroupId = crypto.randomUUID()

          // Update content with new group ID
          yield* 
            db.execute(
              `UPDATE content
               SET translation_group_id = ?,
                   translation_source = COALESCE(translation_source, 'manual')
               WHERE id = ?`,
              [newGroupId, contentId]
            )
          

          return newGroupId
        })
    }
  })
)

/**
 * Helper function to create Content service layer with database dependency
 * Usage: makeContentServiceLayer(mockDb) for tests
 */
export const makeContentServiceLayer = (db: any) =>
  Layer.provide(ContentServiceLive, makeDatabaseLayer(db))

