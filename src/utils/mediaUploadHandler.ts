/**
 * Media Upload and Display Handler
 * Integrates chunked encrypted media storage with UI components
 * Handles conversion to/from display formats
 */

import {
  saveEncryptedMediaChunks,
  retrieveDecryptedMedia,
  createDisplayableMediaUrl,
  deleteEncryptedMedia,
  generateSHA256Hash,
} from './encryptedChunkedMedia'

export interface MediaUploadProgress {
  fileId: string
  totalSize: number
  processedSize: number
  percentComplete: number
  stage: 'preparing' | 'chunking' | 'encrypting' | 'saving' | 'complete'
}

export interface StoredMediaReference {
  fileId: string
  mediaType: 'image' | 'video' | 'audio'
  totalChunks: number
  originalName?: string
  fileHash: string
  uploadedAt: number
  fileSize: number // Original size before encryption
}

/**
 * Upload media file with progress tracking
 * File is converted to chunks, encrypted, and stored
 */
export async function uploadMediaWithProgress(
  file: File,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string,
  onProgress?: (progress: MediaUploadProgress) => void
): Promise<StoredMediaReference> {
  try {
    const fileSize = file.size
    const fileId = `${mediaType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Stage 1: Read file
    if (onProgress) {
      onProgress({
        fileId,
        totalSize: fileSize,
        processedSize: 0,
        percentComplete: 10,
        stage: 'preparing',
      })
    }

    const arrayBuffer = await file.arrayBuffer()
    const fileData = new Uint8Array(arrayBuffer)

    // Stage 2: Chunk and encrypt
    if (onProgress) {
      onProgress({
        fileId,
        totalSize: fileSize,
        processedSize: fileSize * 0.3,
        percentComplete: 30,
        stage: 'chunking',
      })
    }

    const chunkResult = await saveEncryptedMediaChunks(
      fileData,
      mediaType,
      user1,
      user2,
      file.name
    )

    if (onProgress) {
      onProgress({
        fileId: chunkResult.fileId,
        totalSize: fileSize,
        processedSize: fileSize * 0.8,
        percentComplete: 80,
        stage: 'encrypting',
      })
    }

    if (onProgress) {
      onProgress({
        fileId: chunkResult.fileId,
        totalSize: fileSize,
        processedSize: fileSize,
        percentComplete: 100,
        stage: 'complete',
      })
    }

    return {
      fileId: chunkResult.fileId,
      mediaType,
      totalChunks: chunkResult.totalChunks,
      originalName: file.name,
      fileHash: chunkResult.fileHash,
      uploadedAt: Date.now(),
      fileSize,
    }
  } catch (err) {
    console.error('❌ Media upload failed:', err)
    throw err
  }
}

/**
 * Load media for display in UI
 * Retrieves chunks, decrypts, and creates blob URL
 */
export async function loadMediaForDisplay(
  fileId: string,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string
): Promise<{
  displayUrl: string
  verified: boolean
  mediaType: string
}> {
  try {
    console.log(`📥 Loading media ${fileId} for display...`)

    // Retrieve and decrypt
    const result = await retrieveDecryptedMedia(fileId, user1, user2)

    // Create displayable URL
    const displayUrl = await createDisplayableMediaUrl(result.data, mediaType)

    console.log(`✅ Media loaded successfully. Integrity verified: ${result.verified}`)

    return {
      displayUrl,
      verified: result.verified,
      mediaType: result.mediaType,
    }
  } catch (err) {
    console.error('❌ Failed to load media for display:', err)
    throw err
  }
}

/**
 * Batch load multiple media files for display
 * Useful for loading media in message lists
 */
export async function batchLoadMediaForDisplay(
  fileIds: Array<{
    fileId: string
    mediaType: 'image' | 'video' | 'audio'
  }>,
  user1: string,
  user2: string
): Promise<Map<string, { displayUrl: string; verified: boolean }>> {
  const results = new Map()

  // Load sequentially to avoid overwhelming device resources
  for (const { fileId, mediaType } of fileIds) {
    try {
      const result = await loadMediaForDisplay(fileId, mediaType, user1, user2)
      results.set(fileId, {
        displayUrl: result.displayUrl,
        verified: result.verified,
      })
    } catch (err) {
      console.error(`❌ Failed to load ${fileId}:`, err)
      results.set(fileId, {
        displayUrl: '',
        verified: false,
      })
    }
  }

  return results
}

/**
 * Cache decrypted media for performance
 * Store as blob URLs in memory with TTL
 */
class MediaCache {
  private cache = new Map<string, { url: string; expiresAt: number }>()
  private readonly TTL_MS = 5 * 60 * 1000 // 5 minutes

  set(fileId: string, displayUrl: string): void {
    this.cache.set(fileId, {
      url: displayUrl,
      expiresAt: Date.now() + this.TTL_MS,
    })
  }

  get(fileId: string): string | null {
    const cached = this.cache.get(fileId)
    if (!cached) return null

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      // Revoke old blob URL
      URL.revokeObjectURL(cached.url)
      this.cache.delete(fileId)
      return null
    }

    return cached.url
  }

  clear(): void {
    // Revoke all blob URLs
    for (const { url } of this.cache.values()) {
      URL.revokeObjectURL(url)
    }
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

export const mediaCache = new MediaCache()

/**
 * Load media with caching
 * Checks cache first, then loads from storage if not cached
 */
export async function loadMediaWithCache(
  fileId: string,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string
): Promise<string> {
  // Check cache first
  const cached = mediaCache.get(fileId)
  if (cached) {
    console.log(`✅ Media loaded from cache: ${fileId}`)
    return cached
  }

  // Load from storage
  const result = await loadMediaForDisplay(fileId, mediaType, user1, user2)

  // Store in cache
  mediaCache.set(fileId, result.displayUrl)

  return result.displayUrl
}

/**
 * Delete media and clear from cache
 */
export async function deleteMediaFile(fileId: string, totalChunks: number): Promise<void> {
  try {
    // Clear from cache
    const cached = mediaCache.get(fileId)
    if (cached) {
      URL.revokeObjectURL(cached)
    }

    // Delete from storage
    await deleteEncryptedMedia(fileId, totalChunks)

    console.log(`✅ Media deleted: ${fileId}`)
  } catch (err) {
    console.error('❌ Failed to delete media:', err)
    throw err
  }
}

/**
 * Export media as downloadable file
 * Useful for saving media to device storage
 */
export async function exportMediaAsFile(
  fileId: string,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string,
  fileName: string
): Promise<Blob> {
  try {
    const result = await retrieveDecryptedMedia(fileId, user1, user2)

    if (!result.verified) {
      throw new Error('Media integrity verification failed during export')
    }

    // Determine MIME type based on media type and content
    let mimeType = 'application/octet-stream'
    if (mediaType === 'image') {
      // Try to detect format from magic bytes
      const magicBytes = result.data.slice(0, 4)
      if (
        magicBytes[0] === 0xff &&
        magicBytes[1] === 0xd8 &&
        magicBytes[2] === 0xff
      ) {
        mimeType = 'image/jpeg'
      } else if (
        magicBytes[0] === 0x89 &&
        magicBytes[1] === 0x50 &&
        magicBytes[2] === 0x4e &&
        magicBytes[3] === 0x47
      ) {
        mimeType = 'image/png'
      } else if (
        magicBytes[0] === 0x47 &&
        magicBytes[1] === 0x49 &&
        magicBytes[2] === 0x46
      ) {
        mimeType = 'image/gif'
      }
    } else if (mediaType === 'video') {
      mimeType = 'video/mp4'
    } else if (mediaType === 'audio') {
      mimeType = 'audio/mp4'
    }

    return new Blob([result.data], { type: mimeType })
  } catch (err) {
    console.error('❌ Failed to export media:', err)
    throw err
  }
}

/**
 * Get media integrity status
 */
export async function verifyMediaIntegrity(
  fileId: string,
  user1: string,
  user2: string
): Promise<{
  verified: boolean
  fileHash: string
  chunksVerified: number
  totalChunks: number
}> {
  try {
    const result = await retrieveDecryptedMedia(fileId, user1, user2)

    return {
      verified: result.verified,
      fileHash: result.fileHash,
      chunksVerified: result.verified ? (await getChunkCount(fileId)) : 0,
      totalChunks: await getChunkCount(fileId),
    }
  } catch (err) {
    console.error('❌ Failed to verify media integrity:', err)
    throw err
  }
}

/**
 * Helper: Get chunk count for a file
 */
async function getChunkCount(fileId: string): Promise<number> {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const metadataDir = await Filesystem.readdir({
      path: 'media/metadata',
      directory: Directory.Documents,
    })

    const matchingChunks = metadataDir.files.filter((f) =>
      f.name.startsWith(`${fileId}_chunk_`)
    ).length

    return matchingChunks
  } catch (err) {
    return 0
  }
}
