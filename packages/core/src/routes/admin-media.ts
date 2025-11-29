import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { Effect, Schema } from 'effect'
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { requireAuth, requireRole, i18nMiddleware, getTranslate } from '../middleware'
import { renderMediaLibraryPage, MediaLibraryPageData, FolderStats, TypeStats } from '../templates/pages/admin-media-library.template'
import { renderMediaFileDetails, MediaFileDetailsData } from '../templates/components/media-file-details.template'
import { MediaFile, renderMediaFileCard } from '../templates/components/media-grid.template'
import type { Bindings, Variables } from '../app'
import {
  DatabaseService,
  MediaService,
  makeMediaServiceLayer,
  SettingsService,
  makeAppLayer
} from '../services'

// File validation schema
const fileValidationSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(255)
  ),
  type: Schema.String.pipe(
    Schema.filter((type): type is string => {
      const allowedTypes = [
        // Images
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        // Documents
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // Videos
        'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
        // Audio
        'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'
      ]
      return allowedTypes.includes(type)
    }, {
      message: () => 'Unsupported file type'
    })
  ),
  size: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(50 * 1024 * 1024) // 50MB max
  )
})

const adminMediaRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth, i18nMiddleware) now applied in app.ts

// Media library main page with Pure Effect
adminMediaRoutes.get('/', (c) => {
  const t = getTranslate(c)
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const { searchParams } = new URL(c.req.url)
    const folder = searchParams.get('folder') || 'all'
    const type = searchParams.get('type') || 'all'
    const view = searchParams.get('view') || 'grid'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = 24
    const offset = (page - 1) * limit

    const dbService = yield* DatabaseService
    const settingsService = yield* SettingsService

    // Get appearance settings for logo
    const appearanceSettings = yield* settingsService.getAppearanceSettings()

    // Build query for media files
    let query = 'SELECT * FROM media'
    const params: any[] = []
    const conditions: string[] = ['deleted_at IS NULL']
    
    if (folder !== 'all') {
      conditions.push('folder = ?')
      params.push(folder)
    }
    
    if (type !== 'all') {
      switch (type) {
        case 'images':
          conditions.push('mime_type LIKE ?')
          params.push('image/%')
          break
        case 'documents':
          conditions.push('mime_type IN (?, ?, ?)')
          params.push('application/pdf', 'text/plain', 'application/msword')
          break
        case 'videos':
          conditions.push('mime_type LIKE ?')
          params.push('video/%')
          break
      }
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }
    
    query += ` ORDER BY uploaded_at DESC LIMIT ${limit} OFFSET ${offset}`
    
    const results = yield* dbService.query<any>(query, params)
    
    // Get folder statistics
    const folders = yield* 
      dbService.query<any>(`
        SELECT folder, COUNT(*) as count, SUM(size) as totalSize
        FROM media
        WHERE deleted_at IS NULL
        GROUP BY folder
        ORDER BY folder
      `)
    
    
    // Get type statistics
    const types = yield* 
      dbService.query<any>(`
        SELECT
          CASE
            WHEN mime_type LIKE 'image/%' THEN 'images'
            WHEN mime_type LIKE 'video/%' THEN 'videos'
            WHEN mime_type IN ('application/pdf', 'text/plain') THEN 'documents'
            ELSE 'other'
          END as type,
          COUNT(*) as count
        FROM media
        WHERE deleted_at IS NULL
        GROUP BY type
      `)
    
    
    // Process media files with local serving URLs
    const mediaFiles: MediaFile[] = results.map((row: any) => ({
      id: row.id,
      filename: row.filename,
      original_name: row.original_name,
      mime_type: row.mime_type,
      size: row.size,
      public_url: `/files/${row.r2_key}`,
      thumbnail_url: row.mime_type.startsWith('image/') ? `/files/${row.r2_key}` : undefined,
      alt: row.alt,
      caption: row.caption,
      tags: row.tags ? JSON.parse(row.tags) : [],
      uploaded_at: row.uploaded_at,
      fileSize: formatFileSize(row.size),
      uploadedAt: new Date(row.uploaded_at).toLocaleDateString(),
      isImage: row.mime_type.startsWith('image/'),
      isVideo: row.mime_type.startsWith('video/'),
      isDocument: !row.mime_type.startsWith('image/') && !row.mime_type.startsWith('video/')
    }))
    
    const pageData: MediaLibraryPageData = {
      files: mediaFiles,
      folders: folders.map((f: any) => ({
        folder: f.folder,
        count: f.count,
        totalSize: f.totalSize
      })) as FolderStats[],
      types: types.map((t: any) => ({
        type: t.type,
        count: t.count
      })) as TypeStats[],
      currentFolder: folder,
      currentType: type,
      currentView: view as 'grid' | 'list',
      currentPage: page,
      totalFiles: results.length,
      hasNextPage: results.length === limit,
      user: {
        name: user!.email,
        email: user!.email,
        role: user!.role
      },
      version: c.get('appVersion'),
      logoUrl: appearanceSettings.logoUrl
    }

    return pageData
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer (includes DatabaseService + SettingsService)
      Effect.catchAll((error) => {
        console.error('Error loading media library:', error)
        return Effect.fail(error)
      })
    )
  ).then(pageData => {
    return c.html(renderMediaLibraryPage(pageData, t))
  }).catch(error => {
    console.error('Error loading media library:', error)
    return c.html(html`<p>Error loading media library</p>`)
  })
})

// Media selector endpoint (HTMX endpoint for content form media selection) with Pure Effect
adminMediaRoutes.get('/selector', (c) => {
  const program = Effect.gen(function* (_) {
    const { searchParams } = new URL(c.req.url)
    const search = searchParams.get('search') || ''
    const dbService = yield* DatabaseService

    // Build search query
    let query = 'SELECT * FROM media WHERE deleted_at IS NULL'
    const params: any[] = []

    if (search.trim()) {
      query += ' AND (filename LIKE ? OR original_name LIKE ? OR alt LIKE ?)'
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }

    query += ' ORDER BY uploaded_at DESC LIMIT 24'

    const results = yield* dbService.query<any>(query, params)

    const mediaFiles = results.map((row: any) => ({
      id: row.id,
      filename: row.filename,
      original_name: row.original_name,
      mime_type: row.mime_type,
      size: row.size,
      public_url: `/files/${row.r2_key}`,
      thumbnail_url: row.mime_type.startsWith('image/') ? `/files/${row.r2_key}` : undefined,
      alt: row.alt,
      tags: row.tags ? JSON.parse(row.tags) : [],
      uploaded_at: row.uploaded_at,
      fileSize: formatFileSize(row.size),
      uploadedAt: new Date(row.uploaded_at).toLocaleDateString(),
      isImage: row.mime_type.startsWith('image/'),
      isVideo: row.mime_type.startsWith('video/'),
      isDocument: !row.mime_type.startsWith('image/') && !row.mime_type.startsWith('video/')
    }))

    return mediaFiles
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error loading media selector:', error)
        return Effect.succeed([])
      })
    )
  ).then(mediaFiles => {
    // Render media selector grid
    return c.html(html`
      <div class="mb-4">
        <input
          type="search"
          id="media-selector-search"
          placeholder="Search files..."
          class="w-full rounded-lg bg-white dark:bg-zinc-800 px-4 py-2 text-sm text-zinc-950 dark:text-white shadow-sm ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-white transition-shadow"
          hx-get="/admin/media/selector"
          hx-trigger="keyup changed delay:300ms"
          hx-target="#media-selector-grid"
          hx-include="[name='search']"
        >
      </div>

      <div id="media-selector-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
        ${raw(mediaFiles.map(file => `
          <div
            class="relative group cursor-pointer rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-800 shadow-sm hover:shadow-md transition-shadow"
            data-media-id="${file.id}"
          >
            <div class="aspect-square relative">
              ${file.isImage ? `
                <img
                  src="${file.public_url}"
                  alt="${file.alt || file.filename}"
                  class="w-full h-full object-cover"
                  loading="lazy"
                >
              ` : file.isVideo ? `
                <video
                  src="${file.public_url}"
                  class="w-full h-full object-cover"
                  muted
                ></video>
              ` : `
                <div class="w-full h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-700">
                  <div class="text-center">
                    <svg class="w-12 h-12 mx-auto text-zinc-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">${file.filename.split('.').pop()?.toUpperCase()}</span>
                  </div>
                </div>
              `}

              <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onclick="selectMediaFile('${file.id}', '${file.public_url.replace(/'/g, "\\'")}', '${file.filename.replace(/'/g, "\\'")}')"
                  class="px-4 py-2 bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white rounded-lg font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Select
                </button>
              </div>
            </div>

            <div class="p-2">
              <p class="text-xs text-zinc-700 dark:text-zinc-300 truncate" title="${file.original_name}">
                ${file.original_name}
              </p>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                ${file.fileSize}
              </p>
            </div>
          </div>
        `).join(''))}
      </div>

      ${mediaFiles.length === 0 ? html`
        <div class="text-center py-12 text-zinc-500 dark:text-zinc-400">
          <svg class="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <p class="mt-2">No media files found</p>
        </div>
      ` : ''}
    `)
  })
})

// Search media files (HTMX endpoint) with Pure Effect
adminMediaRoutes.get('/search', (c) => {
  const program = Effect.gen(function* (_) {
    const { searchParams } = new URL(c.req.url)
    const search = searchParams.get('search') || ''
    const folder = searchParams.get('folder') || 'all'
    const type = searchParams.get('type') || 'all'
    const dbService = yield* DatabaseService
    
    // Build search query
    let query = 'SELECT * FROM media'
    const params: any[] = []
    const conditions: string[] = []
    
    if (search.trim()) {
      conditions.push('(filename LIKE ? OR original_name LIKE ? OR alt LIKE ?)')
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }
    
    if (folder !== 'all') {
      conditions.push('folder = ?')
      params.push(folder)
    }
    
    if (type !== 'all') {
      switch (type) {
        case 'images':
          conditions.push('mime_type LIKE ?')
          params.push('image/%')
          break
        case 'documents':
          conditions.push('mime_type IN (?, ?, ?)')
          params.push('application/pdf', 'text/plain', 'application/msword')
          break
        case 'videos':
          conditions.push('mime_type LIKE ?')
          params.push('video/%')
          break
      }
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }
    
    query += ` ORDER BY uploaded_at DESC LIMIT 24`
    
    const results = yield* dbService.query<any>(query, params)
    
    const mediaFiles = results.map((row: any) => ({
      ...row,
      public_url: `/files/${row.r2_key}`,
      thumbnail_url: row.mime_type.startsWith('image/') ? `/files/${row.r2_key}` : undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      uploadedAt: new Date(row.uploaded_at).toLocaleDateString(),
      fileSize: formatFileSize(row.size),
      isImage: row.mime_type.startsWith('image/'),
      isVideo: row.mime_type.startsWith('video/'),
      isDocument: !row.mime_type.startsWith('image/') && !row.mime_type.startsWith('video/')
    }))
    
    return mediaFiles
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error searching media:', error)
        return Effect.succeed([])
      })
    )
  ).then(mediaFiles => {
    const gridHTML = mediaFiles.map(file => generateMediaItemHTML(file)).join('')
    return c.html(raw(gridHTML))
  })
})

// Get file details modal (HTMX endpoint) with Pure Effect
adminMediaRoutes.get('/:id/details', (c) => {
  const program = Effect.gen(function* (_) {
    const id = c.req.param('id')
    const dbService = yield* DatabaseService
    
    const result = yield* 
      dbService.queryFirst<any>('SELECT * FROM media WHERE id = ?', [id])
    
    
    if (!result) {
      return {
        type: 'error' as const,
        message: 'File not found'
      }
    }
    
    const file: MediaFile & { width?: number; height?: number; folder: string; uploadedAt: string } = {
      id: result.id,
      filename: result.filename,
      original_name: result.original_name,
      mime_type: result.mime_type,
      size: result.size,
      public_url: `/files/${result.r2_key}`,
      thumbnail_url: result.mime_type.startsWith('image/') ? `/files/${result.r2_key}` : undefined,
      alt: result.alt,
      caption: result.caption,
      tags: result.tags ? JSON.parse(result.tags) : [],
      uploaded_at: result.uploaded_at,
      fileSize: formatFileSize(result.size),
      uploadedAt: new Date(result.uploaded_at).toLocaleString(),
      isImage: result.mime_type.startsWith('image/'),
      isVideo: result.mime_type.startsWith('video/'),
      isDocument: !result.mime_type.startsWith('image/') && !result.mime_type.startsWith('video/'),
      width: result.width,
      height: result.height,
      folder: result.folder
    }
    
    return {
      type: 'success' as const,
      file
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Error fetching file details:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Error loading file details'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(`<div class="text-red-500">${result.message}</div>`)
    }

    const detailsData: MediaFileDetailsData = { file: result.file }
    return c.html(renderMediaFileDetails(detailsData))
  })
})

// Upload files endpoint (HTMX compatible) with Pure Effect
adminMediaRoutes.post('/upload', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const db = c.env.DB
    const bucket = c.env.MEDIA_BUCKET
    
    if (!bucket) {
      console.error('[MEDIA UPLOAD] MEDIA_BUCKET is not available!')
      return {
        type: 'error' as const,
        message: 'Media storage (R2) is not configured. Please check your wrangler.jsonc configuration.'
      }
    }

    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new Error('Failed to parse form data')
      })
    
    
    const filesData = formData.getAll('files')
    const files: File[] = []
    for (const f of filesData) {
      if (typeof f !== 'string') {
        files.push(f as File)
      }
    }
    
    if (files.length === 0) {
      return {
        type: 'error' as const,
        message: 'No files provided'
      }
    }

    const folder = formData.get('folder') as string || 'uploads'
    const uploadResults: any[] = []
    const errors: Array<{ filename: string; error: string }> = []

    // Upload each file
    for (const file of files) {
      const uploadResult = yield* 
        mediaService.uploadFile(file, folder, user!.userId).pipe(
          Effect.catchAll((error) => {
            errors.push({
              filename: file.name,
              error: error._tag === 'FileValidationError'
                ? error.message
                : 'Upload failed: ' + error.message
            })
            return Effect.succeed(null)
          })
        )
      

      if (uploadResult) {
        // Save to database
        yield* 
          dbService.execute(
            `INSERT INTO media (
              id, filename, original_name, mime_type, size, width, height,
              folder, r2_key, public_url, thumbnail_url, uploaded_by, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uploadResult.id,
              uploadResult.filename,
              uploadResult.originalName,
              uploadResult.mimeType,
              uploadResult.size,
              uploadResult.width ?? null,
              uploadResult.height ?? null,
              folder,
              uploadResult.r2_key,
              uploadResult.publicUrl,
              uploadResult.thumbnailUrl ?? null,
              user!.userId,
              Math.floor(Date.now() / 1000)
            ]
          ).pipe(
            Effect.catchAll((error) => {
              errors.push({
                filename: file.name,
                error: 'Failed to save to database'
              })
              return Effect.succeed(undefined)
            })
          )
        

        uploadResults.push(uploadResult)
      }
    }

    return {
      type: 'success' as const,
      uploadResults,
      errors
    }
  })
  
  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)), // MediaService first
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer for DatabaseService
      Effect.catchAll((error) => {
        console.error('Upload error:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Upload failed',
          errors: []
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ${result.message}
        </div>
      `)
    }

    const { uploadResults, errors } = result

    return c.html(html`
      ${uploadResults.length > 0 ? html`
        <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          Successfully uploaded ${uploadResults.length} file${uploadResults.length > 1 ? 's' : ''}
        </div>
      ` : ''}

      ${errors.length > 0 ? html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p class="font-medium">Upload errors:</p>
          <ul class="list-disc list-inside mt-2">
            ${errors.map(error => html`
              <li>${error.filename}: ${error.error}</li>
            `)}
          </ul>
        </div>
      ` : ''}

      ${uploadResults.length > 0 ? html`
        <script>
          // Close modal and refresh page after successful upload with cache busting
          setTimeout(() => {
            document.getElementById('upload-modal').classList.add('hidden');
            window.location.href = '/admin/media?t=' + Date.now();
          }, 1500);
        </script>
      ` : ''}
    `)
  })
})

// Serve files from R2 storage with Pure Effect
adminMediaRoutes.get('/file/*', (c) => {
  const program = Effect.gen(function* (_) {
    const r2Key = c.req.path.replace('/admin/media/file/', '')
    
    if (!r2Key) {
      return { type: 'not_found' as const }
    }

    const mediaService = yield* MediaService

    // Get file from R2
    const object = yield* 
      mediaService.getFile(r2Key).pipe(
        Effect.catchAll((error) => {
          console.error('Error getting file from R2:', error)
          return Effect.fail({ type: 'not_found' as const })
        })
      )
    

    // Set appropriate headers
    const headers = new Headers()
    object.httpMetadata?.contentType && headers.set('Content-Type', object.httpMetadata.contentType)
    object.httpMetadata?.contentDisposition && headers.set('Content-Disposition', object.httpMetadata.contentDisposition)
    headers.set('Cache-Control', 'public, max-age=31536000') // 1 year cache
    
    return {
      type: 'success' as const,
      body: object.body,
      headers
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)),
      Effect.catchAll((error) => {
        console.error('Error serving file:', error)
        return Effect.succeed({ type: 'not_found' as const })
      })
    )
  ).then(result => {
    if (result.type === 'not_found') {
      return c.notFound()
    }

    return new Response(result.body as any, {
      headers: result.headers
    })
  })
})

// Update media file metadata (HTMX compatible) with Pure Effect
adminMediaRoutes.put('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const fileId = c.req.param('id')
    const dbService = yield* DatabaseService
    
    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new Error('Failed to parse form data')
      })
    
    
    // Get file record
    const fileRecord = yield* 
      dbService.queryFirst<any>(
        'SELECT * FROM media WHERE id = ? AND deleted_at IS NULL',
        [fileId]
      )
    
    
    if (!fileRecord) {
      return {
        type: 'error' as const,
        message: 'File not found'
      }
    }

    // Check permissions (only allow updates by uploader or admin)
    if (fileRecord.uploaded_by !== user!.userId && user!.role !== 'admin') {
      return {
        type: 'error' as const,
        message: 'Permission denied'
      }
    }

    // Extract form data
    const alt = formData.get('alt') as string || null
    const caption = formData.get('caption') as string || null
    const tagsString = formData.get('tags') as string || ''
    const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag) : []

    // Update database
    yield* 
      dbService.execute(
        `UPDATE media
         SET alt = ?, caption = ?, tags = ?, updated_at = ?
         WHERE id = ?`,
        [alt, caption, JSON.stringify(tags), Math.floor(Date.now() / 1000), fileId]
      )
    

    return {
      type: 'success' as const
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer
      Effect.catchAll((error) => {
        console.error('Update error:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Update failed'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          ${result.message}
        </div>
      `)
    }

    return c.html(html`
      <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
        File updated successfully
      </div>
      <script>
        // Refresh the file details
        setTimeout(() => {
          htmx.trigger('#file-modal-content', 'htmx:load');
        }, 1000);
      </script>
    `)
  })
})

// Cleanup unused media files (HTMX compatible) with Pure Effect
adminMediaRoutes.delete('/cleanup', requireRole('admin'), (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService

    // Find all media files
    const allMedia = yield* 
      dbService.query<{ id: string; r2_key: string; filename: string }>(
        'SELECT id, r2_key, filename FROM media WHERE deleted_at IS NULL'
      )
    

    // Find media files referenced in content
    const contentRecords = yield* 
      dbService.query<{ data: any }>('SELECT data FROM content')
    

    // Extract all media URLs from content
    const referencedUrls = new Set<string>()
    for (const record of contentRecords) {
      if (record.data) {
        const dataStr = typeof record.data === 'string' ? record.data : JSON.stringify(record.data)
        const urlMatches = dataStr.matchAll(/\/files\/([^\s"',]+)/g)
        for (const match of urlMatches) {
          referencedUrls.add(match[1]!)
        }
      }
    }

    // Find unreferenced media files
    const unusedFiles = allMedia.filter(file => !referencedUrls.has(file.r2_key))

    if (unusedFiles.length === 0) {
      return {
        type: 'no_unused' as const
      }
    }

    // Delete unused files from R2 and database
    let deletedCount = 0
    const errors: Array<{ filename: string; error: string }> = []

    for (const file of unusedFiles) {
      // Delete from R2
      yield* 
        mediaService.deleteFile(file.r2_key).pipe(
          Effect.catchAll((error) => {
            console.error(`Failed to delete ${file.filename}:`, error)
            errors.push({
              filename: file.filename,
              error: 'R2 deletion failed'
            })
            return Effect.succeed(undefined)
          })
        )
      

      // Soft delete in database
      yield* 
        dbService.execute(
          'UPDATE media SET deleted_at = ? WHERE id = ?',
          [Math.floor(Date.now() / 1000), file.id]
        ).pipe(
          Effect.catchAll((error) => {
            errors.push({
              filename: file.filename,
              error: 'Database deletion failed'
            })
            return Effect.succeed(undefined)
          })
        )
      

      if (errors.length === 0 || !errors.find(e => e.filename === file.filename)) {
        deletedCount++
      }
    }

    return {
      type: 'success' as const,
      deletedCount,
      errors
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)), // MediaService first
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer for DatabaseService
      Effect.catchAll((error) => {
        console.error('Cleanup error:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Cleanup failed',
          deletedCount: 0,
          errors: []
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          ${result.message}
        </div>
      `)
    }

    if (result.type === 'no_unused') {
      return c.html(html`
        <div class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          No unused media files found. All files are referenced in content.
        </div>
        <script>
          setTimeout(() => {
            window.location.href = '/admin/media?t=' + Date.now();
          }, 2000);
        </script>
      `)
    }

    const { deletedCount, errors } = result

    return c.html(html`
      <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
        Successfully cleaned up ${deletedCount} unused media file${deletedCount !== 1 ? 's' : ''}.
        ${errors.length > 0 ? html`
          <br><span class="text-sm">Failed to delete ${errors.length} file${errors.length !== 1 ? 's' : ''}.</span>
        ` : ''}
      </div>

      ${errors.length > 0 ? html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p class="font-medium">Cleanup errors:</p>
          <ul class="list-disc list-inside mt-2 text-sm">
            ${errors.map(error => html`
              <li>${error.filename}: ${error.error}</li>
            `)}
          </ul>
        </div>
      ` : ''}

      <script>
        // Refresh media library after cleanup
        setTimeout(() => {
          window.location.href = '/admin/media?t=' + Date.now();
        }, 2500);
      </script>
    `)
  })
})

// Delete media file (HTMX compatible)
adminMediaRoutes.delete('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')
    const fileId = c.req.param('id')
    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService

    // Get file record
    const fileRecord = yield* 
      dbService.queryFirst<any>(
        'SELECT * FROM media WHERE id = ? AND deleted_at IS NULL',
        [fileId]
      )
    

    if (!fileRecord) {
      return {
        type: 'error' as const,
        message: 'File not found'
      }
    }

    // Check permissions (only allow deletion by uploader or admin)
    if (fileRecord.uploaded_by !== user!.userId && user!.role !== 'admin') {
      return {
        type: 'error' as const,
        message: 'Permission denied'
      }
    }

    // Delete from R2
    yield* 
      mediaService.deleteFile(fileRecord.r2_key).pipe(
        Effect.catchAll((error) => {
          console.warn('Failed to delete from R2:', error)
          return Effect.succeed(undefined)
        })
      )
    

    // Soft delete in database
    yield* 
      dbService.execute(
        'UPDATE media SET deleted_at = ? WHERE id = ?',
        [Math.floor(Date.now() / 1000), fileId]
      )
    

    return {
      type: 'success' as const
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)), // MediaService first
      Effect.provide(makeAppLayer(c.env.DB)), // ✅ Unified layer for DatabaseService
      Effect.catchAll((error) => {
        console.error('Delete error:', error)
        return Effect.succeed({
          type: 'error' as const,
          message: 'Delete failed'
        })
      })
    )
  ).then(result => {
    if (result.type === 'error') {
      return c.html(html`
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          ${result.message}
        </div>
      `)
    }

    return c.html(html`
      <script>
        // Close modal if open
        const modal = document.getElementById('file-modal');
        if (modal) {
          modal.classList.add('hidden');
        }
        // Redirect to media library
        window.location.href = '/admin/media';
      </script>
    `)
  })
})

// Helper function to generate media item HTML
function generateMediaItemHTML(file: any): string {
  const isImage = file.isImage
  const isVideo = file.isVideo
  
  return `
    <div 
      class="media-item bg-white rounded-lg shadow-sm overflow-hidden cursor-pointer" 
      data-file-id="${file.id}"
      onclick="toggleFileSelection('${file.id}')"
    >
      <div class="aspect-square relative">
        ${isImage ? `
          <img 
            src="${file.public_url}" 
            alt="${file.alt || file.filename}"
            class="w-full h-full object-cover"
            loading="lazy"
          >
        ` : isVideo ? `
          <video 
            src="${file.public_url}" 
            class="w-full h-full object-cover"
            muted
          ></video>
        ` : `
          <div class="w-full h-full flex items-center justify-center bg-gray-100">
            <div class="text-center">
              <svg class="file-icon mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span class="text-xs text-gray-500 mt-1">${file.filename.split('.').pop()?.toUpperCase()}</span>
            </div>
          </div>
        `}
        
        <div class="preview-overlay flex items-center justify-center">
          <div class="flex space-x-2">
            <button 
              onclick="event.stopPropagation(); showFileDetails('${file.id}')"
              class="p-2 bg-white bg-opacity-20 rounded-full hover:bg-opacity-30"
            >
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
              </svg>
            </button>
            <button 
              onclick="event.stopPropagation(); copyToClipboard('${file.public_url}')"
              class="p-2 bg-white bg-opacity-20 rounded-full hover:bg-opacity-30"
            >
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <div class="p-3">
        <h4 class="text-sm font-medium text-gray-900 truncate" title="${file.original_name}">
          ${file.original_name}
        </h4>
        <div class="flex justify-between items-center mt-1">
          <span class="text-xs text-gray-500">${file.fileSize}</span>
          <span class="text-xs text-gray-500">${file.uploadedAt}</span>
        </div>
        ${file.tags.length > 0 ? `
          <div class="flex flex-wrap gap-1 mt-2">
            ${file.tags.slice(0, 2).map((tag: string) => `
              <span class="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                ${tag}
              </span>
            `).join('')}
            ${file.tags.length > 2 ? `<span class="text-xs text-gray-400">+${file.tags.length - 2}</span>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export { adminMediaRoutes }