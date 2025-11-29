/**
 * Media Service - Pure Effect Implementation
 * Handles media file operations with R2 storage
 */

import { Context, Effect, Layer } from 'effect'
import type { R2Bucket } from '@cloudflare/workers-types'

/**
 * Media file metadata
 */
export interface MediaFile {
  id: string
  filename: string
  original_name: string
  mime_type: string
  size: number
  width?: number
  height?: number
  folder: string
  r2_key: string
  public_url: string
  thumbnail_url?: string
  alt?: string
  caption?: string
  tags?: string[]
  uploaded_by: string
  uploaded_at: number
  updated_at?: number
  deleted_at?: number
}

/**
 * Upload result
 */
export interface UploadResult {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  width?: number
  height?: number
  r2_key: string
  publicUrl: string
  thumbnailUrl?: string
  uploadedAt: string
}

/**
 * Image dimensions
 */
export interface ImageDimensions {
  width: number
  height: number
}

/**
 * Media Service Error types
 */
export class MediaError {
  readonly _tag = 'MediaError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

export class FileNotFoundError {
  readonly _tag = 'FileNotFoundError'
  constructor(readonly message: string = 'File not found') {}
}

export class FileValidationError {
  readonly _tag = 'FileValidationError'
  constructor(readonly message: string, readonly details?: string) {}
}

export class StorageError {
  readonly _tag = 'StorageError'
  constructor(readonly message: string, readonly cause?: unknown) {}
}

export class PermissionError {
  readonly _tag = 'PermissionError'
  constructor(readonly message: string = 'Permission denied') {}
}

/**
 * Media Service Interface
 */
export interface MediaService {
  /**
   * Upload file to R2 storage
   */
  readonly uploadFile: (
    file: File,
    folder: string,
    userId: string,
    bucketName?: string
  ) => Effect.Effect<UploadResult, MediaError | FileValidationError | StorageError>

  /**
   * Get file from R2 storage
   */
  readonly getFile: (
    r2Key: string
  ) => Effect.Effect<R2ObjectBody, MediaError | FileNotFoundError>

  /**
   * Delete file from R2 storage
   */
  readonly deleteFile: (
    r2Key: string
  ) => Effect.Effect<void, MediaError | StorageError>

  /**
   * Copy file to new location in R2
   */
  readonly copyFile: (
    sourceKey: string,
    targetKey: string,
    metadata?: Record<string, string>
  ) => Effect.Effect<void, MediaError | FileNotFoundError | StorageError>

  /**
   * Extract image dimensions from buffer
   */
  readonly getImageDimensions: (
    arrayBuffer: ArrayBuffer
  ) => Effect.Effect<ImageDimensions, MediaError>

  /**
   * Validate file before upload
   */
  readonly validateFile: (
    file: File
  ) => Effect.Effect<void, FileValidationError>

  /**
   * Generate unique file ID
   */
  readonly generateFileId: () => Effect.Effect<string, never>

  /**
   * Format file size for display
   */
  readonly formatFileSize: (bytes: number) => Effect.Effect<string, never>
}

/**
 * R2 Object Body type (simplified)
 */
export interface R2ObjectBody {
  body: ReadableStream | null
  httpMetadata?: {
    contentType?: string
    contentDisposition?: string
  }
  customMetadata?: Record<string, string>
}

/**
 * Media Service Tag for dependency injection
 */
export const MediaService = Context.GenericTag<MediaService>('@services/MediaService')

/**
 * Allowed MIME types for file upload
 */
const ALLOWED_MIME_TYPES = [
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

/**
 * Maximum file size (50MB)
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * Internal helper: Validate file
 */
const validateFileInternal = (file: File): Effect.Effect<void, FileValidationError> =>
  Effect.gen(function* (_) {
    // Check file name
    if (!file.name || file.name.length === 0) {
      return yield* Effect.fail(new FileValidationError('File name is required'))
    }

    if (file.name.length > 255) {
      return yield* Effect.fail(new FileValidationError('File name is too long (max 255 characters)'))
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return yield* Effect.fail(
        new FileValidationError('Unsupported file type', `Type: ${file.type}`)
      )
    }

    // Check file size
    if (file.size < 1) {
      return yield* Effect.fail(new FileValidationError('File is empty'))
    }

    if (file.size > MAX_FILE_SIZE) {
      return yield* Effect.fail(
        new FileValidationError('File is too large (max 50MB)', `Size: ${file.size} bytes`)
      )
    }
  })

/**
 * Internal helper: Get image dimensions
 */
const getImageDimensionsInternal = (arrayBuffer: ArrayBuffer): Effect.Effect<ImageDimensions, never> =>
  Effect.sync(() => {
    const uint8Array = new Uint8Array(arrayBuffer)

    // Check for JPEG
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      return getJPEGDimensions(uint8Array)
    }

    // Check for PNG
    if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 &&
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
      return getPNGDimensions(uint8Array)
    }

    // Default fallback
    return { width: 0, height: 0 }
  })

/**
 * Internal helper: Format file size
 */
const formatFileSizeInternal = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Helper function to get JPEG dimensions
 */
function getJPEGDimensions(uint8Array: Uint8Array): ImageDimensions {
  let i = 2
  while (i < uint8Array.length - 8) {
    if (uint8Array[i] === 0xFF && uint8Array[i + 1] === 0xC0) {
      return {
        height: (uint8Array[i + 5]! << 8) | uint8Array[i + 6]!,
        width: (uint8Array[i + 7]! << 8) | uint8Array[i + 8]!
      }
    }
    const segmentLength = (uint8Array[i + 2]! << 8) | uint8Array[i + 3]!
    i += 2 + segmentLength
  }
  return { width: 0, height: 0 }
}

/**
 * Helper function to get PNG dimensions
 */
function getPNGDimensions(uint8Array: Uint8Array): ImageDimensions {
  if (uint8Array.length < 24) {
    return { width: 0, height: 0 }
  }
  return {
    width: (uint8Array[16]! << 24) | (uint8Array[17]! << 16) | (uint8Array[18]! << 8) | uint8Array[19]!,
    height: (uint8Array[20]! << 24) | (uint8Array[21]! << 16) | (uint8Array[22]! << 8) | uint8Array[23]!
  }
}

/**
 * Media Service Live Implementation - Closed Service Pattern
 * Dependencies (R2Bucket) are resolved at Layer creation time
 */
export const MediaServiceLive = (bucket: R2Bucket): Layer.Layer<MediaService> =>
  Layer.succeed(MediaService, {
  uploadFile: (file: File, folder: string, userId: string, bucketName?: string) =>
    Effect.gen(function* (_) {
      // Validate file
      yield* validateFileInternal(file)

      // Generate unique filename
      const fileId = crypto.randomUUID()
      const fileExtension = file.name.split('.').pop() || ''
      const filename = `${fileId}.${fileExtension}`
      const r2Key = `${folder}/${filename}`

      // Read file content
      const arrayBuffer = yield* 
        Effect.tryPromise({
          try: () => file.arrayBuffer(),
          catch: (error) => new MediaError('Failed to read file content', error)
        })
      

      // Upload to R2
      yield* 
        Effect.tryPromise({
          try: async () => {
            const uploadResult = await bucket.put(r2Key, arrayBuffer, {
              httpMetadata: {
                contentType: file.type,
                contentDisposition: `inline; filename="${file.name}"`
              },
              customMetadata: {
                originalName: file.name,
                uploadedBy: userId,
                uploadedAt: new Date().toISOString()
              }
            })

            if (!uploadResult) {
              throw new Error('Upload failed - no result returned')
            }

            return uploadResult
          },
          catch: (error) => new StorageError('Failed to upload file to R2', error)
        })
      

      // Extract image dimensions if it's an image
      let dimensions: ImageDimensions | undefined
      if (file.type.startsWith('image/') && !file.type.includes('svg')) {
        dimensions = yield* 
          getImageDimensionsInternal(arrayBuffer).pipe(
            Effect.tapError((e) => Effect.logWarning("Selhání service lookup", e)),
            Effect.catchAll(() => Effect.succeed({ width: 0, height: 0 }))
          )
        
      }

      // Generate public URL
      const publicUrl = `/files/${r2Key}`
      const thumbnailUrl = file.type.startsWith('image/') ? publicUrl : undefined

      return {
        id: fileId,
        filename,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        width: dimensions?.width,
        height: dimensions?.height,
        r2_key: r2Key,
        publicUrl,
        thumbnailUrl,
        uploadedAt: new Date().toISOString()
      }
    }),

  getFile: (r2Key: string) =>
    Effect.gen(function* (_) {
      const object = yield* 
        Effect.tryPromise({
          try: async () => {
            const obj = await bucket.get(r2Key)
            if (!obj) {
              throw new Error('File not found in storage')
            }
            return obj
          },
          catch: (error) => {
            if (error instanceof Error && error.message.includes('not found')) {
              return new FileNotFoundError(`File not found: ${r2Key}`)
            }
            return new MediaError('Failed to get file from R2', error)
          }
        })
      

      return object as R2ObjectBody
    }),

  deleteFile: (r2Key: string) =>
    Effect.tryPromise({
      try: async () => {
        await bucket.delete(r2Key)
      },
      catch: (error) => new StorageError('Failed to delete file from R2', error)
    }),

  copyFile: (sourceKey: string, targetKey: string, metadata?: Record<string, string>) =>
    Effect.gen(function* (_) {
      // Get source file
      const sourceObject = yield* 
        Effect.tryPromise({
          try: async () => {
            const obj = await bucket.get(sourceKey)
            if (!obj) {
              throw new Error('Source file not found')
            }
            return obj
          },
          catch: (error) => new FileNotFoundError(`Source file not found: ${sourceKey}`)
        })
      

      // Copy to new location
      yield* 
        Effect.tryPromise({
          try: async () => {
            await bucket.put(targetKey, sourceObject.body as any, {
              httpMetadata: sourceObject.httpMetadata,
              customMetadata: {
                ...sourceObject.customMetadata,
                ...metadata
              }
            })
          },
          catch: (error) => new StorageError('Failed to copy file in R2', error)
        })
      
    }),

  getImageDimensions: (arrayBuffer: ArrayBuffer) =>
    getImageDimensionsInternal(arrayBuffer),

  validateFile: (file: File) =>
    validateFileInternal(file),

  generateFileId: () =>
    Effect.succeed(crypto.randomUUID()),

  formatFileSize: (bytes: number) =>
    Effect.succeed(formatFileSizeInternal(bytes))
  })

/**
 * Create a Layer for providing MediaService
 * Still needed for route handlers (MediaService is config-dependent, requires R2Bucket)
 */
export const makeMediaServiceLayer = (bucket: R2Bucket): Layer.Layer<MediaService> =>
  MediaServiceLive(bucket)