import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import {
  MediaService,
  makeMediaServiceLayer,
  MediaServiceLive,
  type UploadResult,
  FileValidationError,
  StorageError,
  FileNotFoundError,
  MediaError
} from '../../../services/media-effect'

// Mock R2 Bucket
const createMockR2Bucket = () => ({
  put: vi.fn().mockResolvedValue({}),
  get: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  head: vi.fn(),
  list: vi.fn()
})

// Mock File object
class MockFile {
  constructor(
    public name: string,
    public type: string,
    public size: number,
    public content: ArrayBuffer = new ArrayBuffer(size)
  ) {}

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.content
  }
}

describe('MediaService - Pure Effect Implementation', () => {
  let mockBucket: any
  let mediaServiceLayer: ReturnType<typeof makeMediaServiceLayer>

  beforeEach(() => {
    vi.clearAllMocks()
    mockBucket = createMockR2Bucket()
    mediaServiceLayer = makeMediaServiceLayer(mockBucket)
  })

  // Helper to run a program with the media service
  const runWithService = <A, E>(program: Effect.Effect<A, E, MediaService>) =>
    Effect.runPromise(program.pipe(Effect.provide(mediaServiceLayer)))

  describe('File Validation', () => {
    it('should validate a valid image file', async () => {
      const file = new MockFile('test.jpg', 'image/jpeg', 1024 * 1024) as any

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.validateFile(file)
        })
      )

      expect(result).toBeUndefined()
    })

    it('should reject file with empty name', async () => {
      const file = new MockFile('', 'image/jpeg', 1024) as any

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.validateFile(file).pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileValidationError)
      expect((result as FileValidationError).message).toContain('name is required')
    })

    it('should reject file with name too long', async () => {
      const longName = 'a'.repeat(256) + '.jpg'
      const file = new MockFile(longName, 'image/jpeg', 1024) as any

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.validateFile(file).pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileValidationError)
      expect((result as FileValidationError).message).toContain('too long')
    })

    it('should reject unsupported file type', async () => {
      const file = new MockFile('malware.exe', 'application/x-msdownload', 1024) as any

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.validateFile(file).pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileValidationError)
      expect((result as FileValidationError).message).toContain('Unsupported file type')
    })

    it('should reject file that is too large', async () => {
      const file = new MockFile('huge.jpg', 'image/jpeg', 51 * 1024 * 1024) as any

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.validateFile(file).pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileValidationError)
      expect((result as FileValidationError).message).toContain('too large')
    })

    it('should reject empty file', async () => {
      const file = new MockFile('empty.txt', 'text/plain', 0) as any

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.validateFile(file).pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileValidationError)
      expect((result as FileValidationError).message).toContain('empty')
    })

    it('should accept all supported image types', async () => {
      const imageTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml'
      ]

      for (const type of imageTypes) {
        const file = new MockFile(`test.${type.split('/')[1]}`, type, 1024) as any
        const result = await runWithService(
          Effect.gen(function* (_) {
            const service = yield* MediaService
            return yield* service.validateFile(file)
          })
        )
        expect(result).toBeUndefined()
      }
    })

    it('should accept supported document types', async () => {
      const docTypes = [
        { type: 'application/pdf', ext: 'pdf' },
        { type: 'text/plain', ext: 'txt' },
        { type: 'application/msword', ext: 'doc' }
      ]

      for (const { type, ext } of docTypes) {
        const file = new MockFile(`test.${ext}`, type, 1024) as any
        const result = await runWithService(
          Effect.gen(function* (_) {
            const service = yield* MediaService
            return yield* service.validateFile(file)
          })
        )
        expect(result).toBeUndefined()
      }
    })
  })

  describe('File Upload', () => {
    it('should upload a valid file successfully', async () => {
      const file = new MockFile('test.jpg', 'image/jpeg', 1024) as any
      mockBucket.put.mockResolvedValue({})

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.uploadFile(file, 'uploads', 'user-123', 'test-bucket')
        })
      )

      expect(result).toMatchObject({
        id: expect.any(String),
        filename: expect.stringContaining('.jpg'),
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        r2_key: expect.stringContaining('uploads/'),
        publicUrl: expect.stringContaining('/files/'),
        uploadedAt: expect.any(String)
      })

      expect(mockBucket.put).toHaveBeenCalledWith(
        expect.stringContaining('uploads/'),
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: expect.objectContaining({
            contentType: 'image/jpeg'
          }),
          customMetadata: expect.objectContaining({
            originalName: 'test.jpg',
            uploadedBy: 'user-123'
          })
        })
      )
    })

    it('should handle R2 upload failure', async () => {
      const file = new MockFile('test.jpg', 'image/jpeg', 1024) as any
      mockBucket.put.mockRejectedValue(new Error('R2 upload failed'))

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.uploadFile(file, 'uploads', 'user-123').pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(StorageError)
      expect((result as StorageError).message).toContain('Failed to upload')
    })

    it('should generate unique filenames for multiple uploads', async () => {
      const file1 = new MockFile('test.jpg', 'image/jpeg', 1024) as any
      const file2 = new MockFile('test.jpg', 'image/jpeg', 1024) as any

      const result1 = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.uploadFile(file1, 'uploads', 'user-123')
        })
      )

      const result2 = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.uploadFile(file2, 'uploads', 'user-123')
        })
      )

      expect(result1.filename).not.toBe(result2.filename)
      expect(result1.id).not.toBe(result2.id)
    })
  })

  describe('File Retrieval', () => {
    it('should retrieve an existing file', async () => {
      const mockObject = {
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { originalName: 'test.jpg' }
      }
      mockBucket.get.mockResolvedValue(mockObject)

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.getFile('uploads/test.jpg')
        })
      )

      expect(result).toEqual(mockObject)
      expect(mockBucket.get).toHaveBeenCalledWith('uploads/test.jpg')
    })

    it('should handle file not found', async () => {
      mockBucket.get.mockResolvedValue(null)

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.getFile('uploads/nonexistent.jpg').pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileNotFoundError)
    })
  })

  describe('File Deletion', () => {
    it('should delete a file successfully', async () => {
      mockBucket.delete.mockResolvedValue(undefined)

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.deleteFile('uploads/test.jpg')
        })
      )

      expect(result).toBeUndefined()
      expect(mockBucket.delete).toHaveBeenCalledWith('uploads/test.jpg')
    })

    it('should handle deletion failure', async () => {
      mockBucket.delete.mockRejectedValue(new Error('Delete failed'))

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.deleteFile('uploads/test.jpg').pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(StorageError)
      expect((result as StorageError).message).toContain('Failed to delete')
    })
  })

  describe('File Copy', () => {
    it('should copy a file successfully', async () => {
      const mockObject = {
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { originalName: 'test.jpg' }
      }
      mockBucket.get.mockResolvedValue(mockObject)
      mockBucket.put.mockResolvedValue({})

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.copyFile('uploads/source.jpg', 'backup/target.jpg', {
            copiedAt: new Date().toISOString()
          })
        })
      )

      expect(result).toBeUndefined()
      expect(mockBucket.get).toHaveBeenCalledWith('uploads/source.jpg')
      expect(mockBucket.put).toHaveBeenCalledWith(
        'backup/target.jpg',
        expect.anything(),
        expect.objectContaining({
          httpMetadata: mockObject.httpMetadata,
          customMetadata: expect.objectContaining({
            originalName: 'test.jpg',
            copiedAt: expect.any(String)
          })
        })
      )
    })

    it('should handle source file not found', async () => {
      mockBucket.get.mockResolvedValue(null)

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.copyFile('uploads/nonexistent.jpg', 'backup/target.jpg').pipe(
            Effect.catchAll((error) => Effect.succeed(error))
          )
        })
      )

      expect(result).toBeInstanceOf(FileNotFoundError)
    })
  })

  describe('Image Dimensions', () => {
    it('should extract dimensions from JPEG', async () => {
      // Simple JPEG header with dimensions
      const jpegHeader = new Uint8Array([
        0xFF, 0xD8, // JPEG SOI
        0xFF, 0xC0, 0x00, 0x11, // SOF0 marker
        0x08, // Precision
        0x01, 0x00, // Height: 256
        0x02, 0x00, // Width: 512
        ...new Array(100).fill(0)
      ])

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.getImageDimensions(jpegHeader.buffer)
        })
      )

      expect(result.width).toBe(512)
      expect(result.height).toBe(256)
    })

    it('should extract dimensions from PNG', async () => {
      // Simple PNG header with dimensions
      const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, // PNG signature
        0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x02, 0x00, // Width: 512
        0x00, 0x00, 0x01, 0x00, // Height: 256
        ...new Array(100).fill(0)
      ])

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.getImageDimensions(pngHeader.buffer)
        })
      )

      expect(result.width).toBe(512)
      expect(result.height).toBe(256)
    })

    it('should return zero dimensions for unsupported format', async () => {
      const unknownFormat = new Uint8Array(100).fill(0)

      const result = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.getImageDimensions(unknownFormat.buffer)
        })
      )

      expect(result.width).toBe(0)
      expect(result.height).toBe(0)
    })
  })

  describe('Utility Functions', () => {
    it('should generate unique file IDs', async () => {
      const id1 = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.generateFileId()
        })
      )
      
      const id2 = await runWithService(
        Effect.gen(function* (_) {
          const service = yield* MediaService
          return yield* service.generateFileId()
        })
      )

      expect(id1).toBeTruthy()
      expect(id2).toBeTruthy()
      expect(id1).not.toBe(id2)
      expect(typeof id1).toBe('string')
    })

    it('should format file sizes correctly', async () => {
      const testCases = [
        { bytes: 0, expected: '0 Bytes' },
        { bytes: 1024, expected: '1 KB' },
        { bytes: 1024 * 1024, expected: '1 MB' },
        { bytes: 1536 * 1024, expected: '1.5 MB' },
        { bytes: 1024 * 1024 * 1024, expected: '1 GB' }
      ]

      for (const { bytes, expected } of testCases) {
        const result = await runWithService(
          Effect.gen(function* (_) {
            const service = yield* MediaService
            return yield* service.formatFileSize(bytes)
          })
        )
        expect(result).toBe(expected)
      }
    })
  })

  describe('Layer Creation', () => {
    it('should create a valid MediaService layer', async () => {
      const layer = makeMediaServiceLayer(mockBucket)

      expect(layer).toBeDefined()

      // Test that the layer can be used to provide the service
      const program = Effect.gen(function* (_) {
        const service = yield* MediaService
        const id = yield* service.generateFileId()
        return id
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('Error Handling', () => {
    it('should properly categorize errors', async () => {
      const errors = [
        new MediaError('General media error'),
        new FileNotFoundError('File not found'),
        new FileValidationError('Validation failed'),
        new StorageError('Storage failed')
      ]

      errors.forEach(error => {
        expect(error._tag).toBeDefined()
        expect(error.message).toBeDefined()
      })

      expect(errors[0]!._tag).toBe('MediaError')
      expect(errors[1]!._tag).toBe('FileNotFoundError')
      expect(errors[2]!._tag).toBe('FileValidationError')
      expect(errors[3]!._tag).toBe('StorageError')
    })

    it('should handle validation error with details', () => {
      const error = new FileValidationError('Invalid file', 'Size: 100MB')

      expect(error._tag).toBe('FileValidationError')
      expect(error.message).toBe('Invalid file')
      expect(error.details).toBe('Size: 100MB')
    })

    it('should handle storage error with cause', () => {
      const cause = new Error('Network timeout')
      const error = new StorageError('Upload failed', cause)

      expect(error._tag).toBe('StorageError')
      expect(error.message).toBe('Upload failed')
      expect(error.cause).toBe(cause)
    })
  })

  describe('Integration with Effect', () => {
    it('should compose multiple operations', async () => {
      const file = new MockFile('test.jpg', 'image/jpeg', 1024) as any
      mockBucket.put.mockResolvedValue({})
      mockBucket.get.mockResolvedValue({
        body: new ReadableStream(),
        httpMetadata: { contentType: 'image/jpeg' }
      })

      const program = Effect.gen(function* (_) {
        const service = yield* MediaService

        // Upload file
        const uploadResult = yield* 
          service.uploadFile(file, 'uploads', 'user-123')
        

        // Retrieve file
        const fileObject = yield* 
          service.getFile(uploadResult.r2_key)
        

        // Delete file
        yield* service.deleteFile(uploadResult.r2_key)

        return { uploadResult, fileObject }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(mediaServiceLayer))
      )

      expect(result.uploadResult).toBeDefined()
      expect(result.fileObject).toBeDefined()
      expect(mockBucket.put).toHaveBeenCalled()
      expect(mockBucket.get).toHaveBeenCalled()
      expect(mockBucket.delete).toHaveBeenCalled()
    })

    it('should handle errors in composition', async () => {
      const file = new MockFile('test.jpg', 'image/jpeg', 1024) as any
      mockBucket.put.mockResolvedValue({})
      mockBucket.get.mockResolvedValue(null) // Simulate file not found

      const program = Effect.gen(function* (_) {
        const service = yield* MediaService
        
        const uploadResult = yield* 
          service.uploadFile(file, 'uploads', 'user-123')
        

        // This should fail
        yield* service.getFile(uploadResult.r2_key)

        return uploadResult
      })

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(mediaServiceLayer),
          Effect.catchAll((error) => Effect.succeed(error))
        )
      )

      expect(result).toBeInstanceOf(FileNotFoundError)
    })
  })
})