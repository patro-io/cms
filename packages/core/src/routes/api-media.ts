import { Hono } from 'hono'
import { Effect, Schema } from 'effect'
import { requireAuth } from '../middleware'
import type { Bindings, Variables } from '../app'
import {
  DatabaseService,
  makeDatabaseLayer,
  MediaService,
  makeMediaServiceLayer
} from '../services'

// Helper function to generate short IDs (replacement for nanoid)
function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 21)
}

// Helper function for emitting events (simplified for core package)
async function emitEvent(eventName: string, data: any) {
  console.log(`[Event] ${eventName}:`, data)
  // TODO: Implement proper event system when plugin architecture is ready
}

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

export const apiMediaRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// NOTE: Middleware (requireAuth) now applied in app.ts
// This keeps routes clean and focused on business logic

// Upload single file with Pure Effect
apiMediaRoutes.post('/upload', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')!
    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService

    // Parse form data
    const formData = yield* 
      Effect.tryPromise({
        try: () => c.req.formData(),
        catch: (error) => new Error('Failed to parse form data')
      })
    

    const fileData = formData.get('file')

    if (!fileData || typeof fileData === 'string') {
      return {
        error: 'No file provided',
        statusCode: 400
      }
    }

    const file = fileData as File
    const folder = formData.get('folder') as string || 'uploads'

    // Upload file using MediaService
    const uploadResult = yield* 
      mediaService.uploadFile(file, folder, user.userId, c.env.BUCKET_NAME)
    

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
          user.userId,
          Math.floor(Date.now() / 1000)
        ]
      )
    

    // Emit media upload event
    yield* 
      Effect.tryPromise({
        try: () => emitEvent('media.upload', { id: uploadResult.id, filename: uploadResult.filename }),
        catch: () => new Error('Event emission failed')
      }).pipe(
        Effect.tapError(Effect.logDebug),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    

    return {
      success: true,
      file: {
        id: uploadResult.id,
        filename: uploadResult.filename,
        originalName: uploadResult.originalName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        width: uploadResult.width,
        height: uploadResult.height,
        r2_key: uploadResult.r2_key,
        publicUrl: uploadResult.publicUrl,
        thumbnailUrl: uploadResult.thumbnailUrl,
        uploadedAt: uploadResult.uploadedAt
      },
      statusCode: 200
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)),
      Effect.catchAll((error) => {
        console.error('Upload error:', error)
        if (typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'FileValidationError') {
          return Effect.succeed({
            error: 'File validation failed',
            details: (error as any).message,
            statusCode: 400
          })
        }
        return Effect.succeed({
          error: 'Upload failed',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 500)
  })
})

// Upload multiple files with Pure Effect
apiMediaRoutes.post('/upload-multiple', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')!
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
        error: 'No files provided',
        statusCode: 400
      }
    }

    const folder = formData.get('folder') as string || 'uploads'
    const uploadResults: any[] = []
    const errors: Array<{ filename: string; error: string; details?: string }> = []

    // Upload each file
    for (const file of files) {
      const uploadResult = yield* 
        mediaService.uploadFile(file, folder, user.userId, c.env.BUCKET_NAME).pipe(
          Effect.catchAll((error) => {
            errors.push({
              filename: file.name,
              error: 'Upload failed',
              details: error.message
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
              user.userId,
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
        

        uploadResults.push({
          id: uploadResult.id,
          filename: uploadResult.filename,
          originalName: uploadResult.originalName,
          mimeType: uploadResult.mimeType,
          size: uploadResult.size,
          width: uploadResult.width,
          height: uploadResult.height,
          r2_key: uploadResult.r2_key,
          publicUrl: uploadResult.publicUrl,
          thumbnailUrl: uploadResult.thumbnailUrl,
          uploadedAt: uploadResult.uploadedAt
        })
      }
    }

    // Emit media upload event if any uploads succeeded
    if (uploadResults.length > 0) {
      yield* 
        Effect.tryPromise({
          try: () => emitEvent('media.upload', { count: uploadResults.length }),
          catch: () => new Error('Event emission failed')
        }).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      
    }

    return {
      success: uploadResults.length > 0,
      uploaded: uploadResults,
      errors: errors,
      summary: {
        total: files.length,
        successful: uploadResults.length,
        failed: errors.length
      },
      statusCode: 200
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)),
      Effect.catchAll((error) => {
        console.error('Multiple upload error:', error)
        return Effect.succeed({
          error: 'Upload failed',
          statusCode: 500
        })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 500)
  })
})

// Bulk delete files with Pure Effect
apiMediaRoutes.post('/bulk-delete', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')!
    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService

    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new Error('Failed to parse JSON')
      })
    

    const fileIds = body.fileIds as string[]
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return { error: 'No file IDs provided', statusCode: 400 }
    }

    if (fileIds.length > 50) {
      return { error: 'Too many files selected. Maximum 50 files per operation.', statusCode: 400 }
    }

    const results: any[] = []
    const errors: any[] = []

    for (const fileId of fileIds) {
      const fileRecord = yield* 
        dbService.queryFirst<any>('SELECT * FROM media WHERE id = ?', [fileId]).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      

      if (!fileRecord) {
        errors.push({ fileId, error: 'File not found' })
        continue
      }

      if (fileRecord.deleted_at !== null) {
        results.push({
          fileId,
          filename: fileRecord.original_name,
          success: true,
          alreadyDeleted: true
        })
        continue
      }

      if (fileRecord.uploaded_by !== user.userId && user.role !== 'admin') {
        errors.push({ fileId, error: 'Permission denied' })
        continue
      }

      yield* 
        mediaService.deleteFile(fileRecord.r2_key).pipe(
          Effect.catchAll((error) => {
            console.warn(`Failed to delete from R2 for file ${fileId}:`, error)
            return Effect.succeed(undefined)
          })
        )
      

      yield* 
        dbService.execute(
          'UPDATE media SET deleted_at = ? WHERE id = ?',
          [Math.floor(Date.now() / 1000), fileId]
        ).pipe(
          Effect.catchAll((error) => {
            errors.push({ fileId, error: 'Delete failed' })
            return Effect.succeed(undefined)
          })
        )
      

      if (!errors.find(e => e.fileId === fileId)) {
        results.push({
          fileId,
          filename: fileRecord.original_name,
          success: true
        })
      }
    }

    if (results.length > 0) {
      yield* 
        Effect.tryPromise({
          try: () => emitEvent('media.delete', { count: results.length, ids: fileIds }),
          catch: () => new Error('Event emission failed')
        }).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      
    }

    return {
      success: results.length > 0,
      deleted: results,
      errors: errors,
      summary: {
        total: fileIds.length,
        successful: results.length,
        failed: errors.length
      },
      statusCode: 200
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)),
      Effect.catchAll((error) => {
        console.error('Bulk delete error:', error)
        return Effect.succeed({ error: 'Bulk delete failed', statusCode: 500 })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 500)
  })
})

// Create folder with Pure Effect
apiMediaRoutes.post('/create-folder', (c) => {
  const program = Effect.gen(function* (_) {
    const dbService = yield* DatabaseService

    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new Error('Failed to parse JSON')
      })
    

    const folderName = body.folderName as string

    if (!folderName || typeof folderName !== 'string') {
      return { success: false, error: 'No folder name provided', statusCode: 400 }
    }

    const folderPattern = /^[a-z0-9-_]+$/
    if (!folderPattern.test(folderName)) {
      return {
        success: false,
        error: 'Folder name can only contain lowercase letters, numbers, hyphens, and underscores',
        statusCode: 400
      }
    }

    const existingFolder = yield* 
      dbService.queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM media WHERE folder = ? AND deleted_at IS NULL',
        [folderName]
      ).pipe(
        Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
        Effect.catchAll(() => Effect.succeed(null))
      )
    

    if (existingFolder && existingFolder.count > 0) {
      return { success: false, error: `Folder "${folderName}" already exists`, statusCode: 400 }
    }

    return {
      success: true,
      message: `Folder "${folderName}" is ready. Upload files to this folder to make it appear in the media library.`,
      folder: folderName,
      note: 'Folders appear automatically when you upload files to them',
      statusCode: 200
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.catchAll((error) => {
        console.error('Create folder error:', error)
        return Effect.succeed({ success: false, error: 'Failed to create folder', statusCode: 500 })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 500)
  })
})

// Bulk move files to folder with Pure Effect
apiMediaRoutes.post('/bulk-move', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')!
    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService

    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new Error('Failed to parse JSON')
      })
    

    const fileIds = body.fileIds as string[]
    const targetFolder = body.folder as string

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return { error: 'No file IDs provided', statusCode: 400 }
    }

    if (!targetFolder || typeof targetFolder !== 'string') {
      return { error: 'No target folder provided', statusCode: 400 }
    }

    if (fileIds.length > 50) {
      return { error: 'Too many files selected. Maximum 50 files per operation.', statusCode: 400 }
    }

    const results: any[] = []
    const errors: any[] = []

    for (const fileId of fileIds) {
      const fileRecord = yield* 
        dbService.queryFirst<any>('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL', [fileId]).pipe(
          Effect.tapError((e) => Effect.logError("Chyba pohlcena v middleware/route", e)),
          Effect.catchAll(() => Effect.succeed(null))
        )
      

      if (!fileRecord) {
        errors.push({ fileId, error: 'File not found' })
        continue
      }

      if (fileRecord.uploaded_by !== user.userId && user.role !== 'admin') {
        errors.push({ fileId, error: 'Permission denied' })
        continue
      }

      if (fileRecord.folder === targetFolder) {
        results.push({
          fileId,
          filename: fileRecord.original_name,
          success: true,
          skipped: true
        })
        continue
      }

      const oldR2Key = fileRecord.r2_key
      const filename = oldR2Key.split('/').pop() || fileRecord.filename
      const newR2Key = `${targetFolder}/${filename}`

      const moveResult = yield* 
        mediaService.getFile(oldR2Key).pipe(
          Effect.flatMap((object) =>
            Effect.tryPromise({
              try: async () => {
                await c.env.MEDIA_BUCKET.put(newR2Key, object.body, {
                  httpMetadata: object.httpMetadata,
                  customMetadata: {
                    ...object.customMetadata,
                    movedBy: user.userId,
                    movedAt: new Date().toISOString()
                  }
                })
              },
              catch: (error) => new Error('Failed to copy file')
            })
          ),
          Effect.flatMap(() => mediaService.deleteFile(oldR2Key)),
          Effect.catchAll((error) => {
            errors.push({ fileId, error: 'Failed to move file in storage' })
            return Effect.succeed(null)
          })
        )
      

      if (moveResult === null) {
        continue
      }

      const bucketName = c.env.BUCKET_NAME || 'patro-media-dev'
      const newPublicUrl = `https://pub-${bucketName}.r2.dev/${newR2Key}`

      yield* 
        dbService.execute(
          `UPDATE media SET folder = ?, r2_key = ?, public_url = ?, updated_at = ? WHERE id = ?`,
          [targetFolder, newR2Key, newPublicUrl, Math.floor(Date.now() / 1000), fileId]
        ).pipe(
          Effect.catchAll((error) => {
            errors.push({ fileId, error: 'Failed to update database' })
            return Effect.succeed(undefined)
          })
        )
      

      if (!errors.find(e => e.fileId === fileId)) {
        results.push({
          fileId,
          filename: fileRecord.original_name,
          success: true,
          skipped: false
        })
      }
    }

    if (results.length > 0) {
      yield* 
        Effect.tryPromise({
          try: () => emitEvent('media.move', { count: results.length, targetFolder, ids: fileIds }),
          catch: () => new Error('Event emission failed')
        }).pipe(
          Effect.tapError(Effect.logDebug),
          Effect.catchAll(() => Effect.succeed(undefined))
        )
      
    }

    return {
      success: results.length > 0,
      moved: results,
      errors: errors,
      summary: {
        total: fileIds.length,
        successful: results.length,
        failed: errors.length
      },
      statusCode: 200
    }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)),
      Effect.catchAll((error) => {
        console.error('Bulk move error:', error)
        return Effect.succeed({ error: 'Bulk move failed', statusCode: 500 })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 500)
  })
})

// Delete file with Pure Effect
apiMediaRoutes.delete('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')!
    const fileId = c.req.param('id')
    const dbService = yield* DatabaseService
    const mediaService = yield* MediaService
    
    const fileRecord = yield* 
      dbService.queryFirst<any>('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL', [fileId])
    
    
    if (!fileRecord) {
      return { error: 'File not found', statusCode: 404 }
    }

    if (fileRecord.uploaded_by !== user.userId && user.role !== 'admin') {
      return { error: 'Permission denied', statusCode: 403 }
    }

    yield* 
      mediaService.deleteFile(fileRecord.r2_key).pipe(
        Effect.catchAll((error) => {
          console.warn('Failed to delete from R2:', error)
          return Effect.succeed(undefined)
        })
      )
    

    yield* 
      dbService.execute(
        'UPDATE media SET deleted_at = ? WHERE id = ?',
        [Math.floor(Date.now() / 1000), fileId]
      )
    

    yield* 
      Effect.tryPromise({
        try: () => emitEvent('media.delete', { id: fileId }),
        catch: () => new Error('Event emission failed')
      }).pipe(
        Effect.tapError(Effect.logDebug),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    

    return { success: true, message: 'File deleted successfully', statusCode: 200 }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.provide(makeMediaServiceLayer(c.env.MEDIA_BUCKET)),
      Effect.catchAll((error) => {
        console.error('Delete error:', error)
        return Effect.succeed({ error: 'Delete failed', statusCode: 500 })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 403 | 404 | 500)
  })
})

// Update file metadata with Pure Effect
apiMediaRoutes.patch('/:id', (c) => {
  const program = Effect.gen(function* (_) {
    const user = c.get('user')!
    const fileId = c.req.param('id')
    const dbService = yield* DatabaseService

    const body = yield* 
      Effect.tryPromise({
        try: () => c.req.json(),
        catch: (error) => new Error('Failed to parse JSON')
      })
    
    
    const fileRecord = yield* 
      dbService.queryFirst<any>('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL', [fileId])
    
    
    if (!fileRecord) {
      return { error: 'File not found', statusCode: 404 }
    }

    if (fileRecord.uploaded_by !== user.userId && user.role !== 'admin') {
      return { error: 'Permission denied', statusCode: 403 }
    }

    const allowedFields = ['alt', 'caption', 'tags', 'folder']
    const updates: string[] = []
    const values: any[] = []
    
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`)
        values.push(key === 'tags' ? JSON.stringify(value) : value)
      }
    }

    if (updates.length === 0) {
      return { error: 'No valid fields to update', statusCode: 400 }
    }

    updates.push('updated_at = ?')
    values.push(Math.floor(Date.now() / 1000))
    values.push(fileId)

    yield* 
      dbService.execute(
        `UPDATE media SET ${updates.join(', ')} WHERE id = ?`,
        values
      )
    

    yield* 
      Effect.tryPromise({
        try: () => emitEvent('media.update', { id: fileId }),
        catch: () => new Error('Event emission failed')
      }).pipe(
        Effect.tapError(Effect.logDebug),
        Effect.catchAll(() => Effect.succeed(undefined))
      )
    

    return { success: true, message: 'File updated successfully', statusCode: 200 }
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeDatabaseLayer(c.env.DB)),
      Effect.catchAll((error) => {
        console.error('Update error:', error)
        return Effect.succeed({ error: 'Update failed', statusCode: 500 })
      })
    )
  ).then(result => {
    const statusCode = (result as any).statusCode || 200
    delete (result as any).statusCode
    return c.json(result, statusCode as 200 | 400 | 403 | 404 | 500)
  })
})


export default apiMediaRoutes