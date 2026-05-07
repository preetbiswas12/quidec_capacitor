/**
 * Encrypted Chunked Media Storage
 * Stores media and messages in chunks with AES-256 encryption and SHA-256 hashing
 * Files are stored as encrypted chunks, decrypted on-demand for display
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { getConversationKey } from './encryption'

export interface ChunkMetadata {
  fileId: string // Unique identifier for the media file
  chunkIndex: number // Which chunk this is (0, 1, 2, ...)
  totalChunks: number // Total number of chunks for this file
  chunkHash: string // SHA-256 hash of this chunk
  chunkSize: number // Size of this chunk in bytes
  mediaType: 'image' | 'video' | 'audio' | 'message' // Type of media
  originalName?: string // Original filename
  timestamp: number // When created
  encryption: {
    algorithm: 'AES-256-GCM'
    iv: string // Base64 encoded
    salt: string // Base64 encoded
  }
}

// Chunk size: 256KB for balanced performance
const CHUNK_SIZE = 256 * 1024

const MEDIA_PATHS = {
  CHUNKS: 'media/chunks',
  METADATA: 'media/metadata',
  TEMP: 'temp',
}

/**
 * Generate SHA-256 hash for data integrity verification
 */
export async function generateSHA256Hash(data: Uint8Array): Promise<string> {
  try {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch (err) {
    console.error('❌ SHA-256 hash generation failed:', err)
    throw err
  }
}

/**
 * Split media into chunks and encrypt each chunk
 * Returns file metadata and chunk references
 */
export async function saveEncryptedMediaChunks(
  binaryData: Uint8Array,
  mediaType: 'image' | 'video' | 'audio' | 'message',
  user1: string,
  user2: string,
  originalName?: string
): Promise<{
  fileId: string
  totalChunks: number
  metadata: ChunkMetadata[]
  fileHash: string
}> {
  try {
    // Get conversation-specific encryption key
    const encryptionKey = await getConversationKey(user1, user2)

    // Generate unique file ID
    const fileId = `${mediaType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Calculate total chunks
    const totalChunks = Math.ceil(binaryData.length / CHUNK_SIZE)

    // Generate overall file hash before chunking
    const fileHash = await generateSHA256Hash(binaryData)

    const chunkMetadataArray: ChunkMetadata[] = []

    // Process each chunk
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, binaryData.length)
      const chunkData = binaryData.slice(start, end)

      // Generate chunk hash before encryption
      const chunkHash = await generateSHA256Hash(chunkData)

      // Generate random IV for this chunk
      const iv = window.crypto.getRandomValues(new Uint8Array(12))
      const salt = window.crypto.getRandomValues(new Uint8Array(16))

      // Encrypt chunk
      const encryptedChunk = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        chunkData
      )

      // Create chunk metadata
      const metadata: ChunkMetadata = {
        fileId,
        chunkIndex: i,
        totalChunks,
        chunkHash,
        chunkSize: chunkData.length,
        mediaType,
        originalName,
        timestamp: Date.now(),
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
          salt: btoa(String.fromCharCode.apply(null, Array.from(salt))),
        },
      }

      // Save encrypted chunk to filesystem
      const chunkPath = `${MEDIA_PATHS.CHUNKS}/${fileId}_chunk_${i}`
      const encryptedChunkBase64 = btoa(
        String.fromCharCode.apply(null, Array.from(new Uint8Array(encryptedChunk)))
      )

      await Filesystem.writeFile({
        path: chunkPath,
        data: encryptedChunkBase64,
        directory: Directory.Documents,
        recursive: true,
        encoding: Encoding.UTF8,
      })

      // Save chunk metadata
      const metadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_${i}.json`
      await Filesystem.writeFile({
        path: metadataPath,
        data: JSON.stringify(metadata),
        directory: Directory.Documents,
        recursive: true,
        encoding: Encoding.UTF8,
      })

      chunkMetadataArray.push(metadata)

      console.log(`✅ Chunk ${i + 1}/${totalChunks} encrypted and saved for ${fileId}`)
    }

    return {
      fileId,
      totalChunks,
      metadata: chunkMetadataArray,
      fileHash,
    }
  } catch (err) {
    console.error('❌ Failed to save encrypted media chunks:', err)
    throw err
  }
}

/**
 * Retrieve and decrypt all chunks for a media file
 * Verifies chunk integrity using SHA-256 hashes
 */
export async function retrieveDecryptedMedia(
  fileId: string,
  user1: string,
  user2: string
): Promise<{
  data: Uint8Array
  mediaType: string
  fileHash: string
  verified: boolean
}> {
  try {
    const encryptionKey = await getConversationKey(user1, user2)

    // Get metadata for first chunk to know total chunks
    const firstMetadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_0.json`
    const metadataFile = await Filesystem.readFile({
      path: firstMetadataPath,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })

    const firstMetadata: ChunkMetadata = JSON.parse(metadataFile.data as string)
    const totalChunks = firstMetadata.totalChunks
    const mediaType = firstMetadata.mediaType

    const decryptedChunks: Uint8Array[] = []
    let fileVerified = true

    // Retrieve and decrypt each chunk
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${MEDIA_PATHS.CHUNKS}/${fileId}_chunk_${i}`
      const metadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_${i}.json`

      // Read metadata
      const metadataFile = await Filesystem.readFile({
        path: metadataPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      })
      const metadata: ChunkMetadata = JSON.parse(metadataFile.data as string)

      // Read encrypted chunk
      const chunkFile = await Filesystem.readFile({
        path: chunkPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      })

      // Decode from base64
      const encryptedChunkArray = new Uint8Array(
        atob(chunkFile.data as string)
          .split('')
          .map((c) => c.charCodeAt(0))
      )

      // Decode IV and salt
      const iv = new Uint8Array(
        atob(metadata.encryption.iv)
          .split('')
          .map((c) => c.charCodeAt(0))
      )

      // Decrypt chunk
      const decryptedChunk = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        encryptedChunkArray
      )

      const decryptedChunkArray = new Uint8Array(decryptedChunk)

      // Verify chunk hash
      const calculatedHash = await generateSHA256Hash(decryptedChunkArray)
      if (calculatedHash !== metadata.chunkHash) {
        console.warn(`⚠️ Chunk ${i} hash mismatch! File may be corrupted.`)
        fileVerified = false
      }

      decryptedChunks.push(decryptedChunkArray)

      console.log(`✅ Chunk ${i + 1}/${totalChunks} decrypted and verified for ${fileId}`)
    }

    // Combine all chunks
    const totalSize = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const fullData = new Uint8Array(totalSize)
    let offset = 0

    for (const chunk of decryptedChunks) {
      fullData.set(chunk, offset)
      offset += chunk.length
    }

    // Verify overall file hash
    const calculatedFileHash = await generateSHA256Hash(fullData)
    const metadataForHash: ChunkMetadata = JSON.parse(
      (
        await Filesystem.readFile({
          path: `${MEDIA_PATHS.METADATA}/${fileId}_chunk_0.json`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
      ).data as string
    )

    if (calculatedFileHash !== metadataForHash.chunkHash) {
      console.warn('⚠️ File hash mismatch! Some chunks may be corrupted.')
      fileVerified = false
    }

    return {
      data: fullData,
      mediaType,
      fileHash: calculatedFileHash,
      verified: fileVerified,
    }
  } catch (err) {
    console.error('❌ Failed to retrieve and decrypt media:', err)
    throw err
  }
}

/**
 * Convert decrypted binary data to displayable format (blob URL)
 */
export async function createDisplayableMediaUrl(
  decryptedData: Uint8Array,
  mediaType: 'image' | 'video' | 'audio'
): Promise<string> {
  try {
    // Determine MIME type
    let mimeType = 'application/octet-stream'
    if (mediaType === 'image') {
      mimeType = 'image/jpeg' // Assuming JPEG, can be enhanced to detect format
    } else if (mediaType === 'video') {
      mimeType = 'video/mp4'
    } else if (mediaType === 'audio') {
      mimeType = 'audio/mp4'
    }

    // Create blob from decrypted data
    const blob = new Blob([decryptedData], { type: mimeType })

    // Create object URL for display
    const displayUrl = URL.createObjectURL(blob)

    return displayUrl
  } catch (err) {
    console.error('❌ Failed to create displayable media URL:', err)
    throw err
  }
}

/**
 * Encrypt and store message data with chunks
 * Messages are also stored in chunks for privacy
 */
export async function saveEncryptedMessage(
  messageData: {
    content: string
    senderId: string
    recipientId: string
    timestamp: number
    attachments?: string[] // File IDs if has media
  },
  user1: string,
  user2: string
): Promise<{
  messageId: string
  chunks: number
  fileHash: string
}> {
  try {
    // Convert message to binary
    const messageJson = JSON.stringify(messageData)
    const encoder = new TextEncoder()
    const messageBinary = encoder.encode(messageJson)
    const messageUint8 = new Uint8Array(messageBinary)

    // Save as encrypted chunks
    const result = await saveEncryptedMediaChunks(
      messageUint8,
      'message',
      user1,
      user2,
      `msg_${messageData.timestamp}`
    )

    return {
      messageId: result.fileId,
      chunks: result.totalChunks,
      fileHash: result.fileHash,
    }
  } catch (err) {
    console.error('❌ Failed to save encrypted message:', err)
    throw err
  }
}

/**
 * Retrieve and decrypt message data
 */
export async function retrieveDecryptedMessage(
  messageId: string,
  user1: string,
  user2: string
): Promise<{
  content: string
  senderId: string
  recipientId: string
  timestamp: number
  attachments?: string[]
}> {
  try {
    const result = await retrieveDecryptedMedia(messageId, user1, user2)

    if (!result.verified) {
      throw new Error('Message integrity verification failed')
    }

    const decoder = new TextDecoder()
    const messageJson = decoder.decode(result.data)
    return JSON.parse(messageJson)
  } catch (err) {
    console.error('❌ Failed to retrieve decrypted message:', err)
    throw err
  }
}

/**
 * Delete all chunks and metadata for a media file
 */
export async function deleteEncryptedMedia(fileId: string, totalChunks: number): Promise<void> {
  try {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${MEDIA_PATHS.CHUNKS}/${fileId}_chunk_${i}`
      const metadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_${i}.json`

      try {
        await Filesystem.deleteFile({
          path: chunkPath,
          directory: Directory.Documents,
        })
      } catch (err) {
        console.warn(`⚠️ Failed to delete chunk ${i}:`, err)
      }

      try {
        await Filesystem.deleteFile({
          path: metadataPath,
          directory: Directory.Documents,
        })
      } catch (err) {
        console.warn(`⚠️ Failed to delete metadata ${i}:`, err)
      }
    }

    console.log(`✅ Deleted all chunks for ${fileId}`)
  } catch (err) {
    console.error('❌ Failed to delete encrypted media:', err)
    throw err
  }
}

/**
 * List all stored file IDs (for debugging/management)
 */
export async function listEncryptedMediaFiles(): Promise<string[]> {
  try {
    const metadataDir = await Filesystem.readdir({
      path: MEDIA_PATHS.METADATA,
      directory: Directory.Documents,
    })

    const fileIds = new Set<string>()

    for (const file of metadataDir.files) {
      // Extract file ID from filename (e.g., "image_123456_abc_chunk_0.json")
      const match = file.name.match(/^(.+)_chunk_\d+\.json$/)
      if (match) {
        fileIds.add(match[1])
      }
    }

    return Array.from(fileIds)
  } catch (err) {
    console.error('❌ Failed to list encrypted media files:', err)
    return []
  }
}
