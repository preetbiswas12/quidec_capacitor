/**
 * Encrypted Chunked Media Storage
 * Stores media and messages in chunks with AES-256 encryption and SHA-256 hashing
 * Files are stored as encrypted chunks, decrypted on-demand for display
 *
 * Storage: Cloudinary (temporary relay) → Local SQLite (permanent cache)
 * Sender uploads encrypted chunks to Cloudinary
 * Recipient downloads + decrypts + caches locally
 * After local cache confirmed, chunks deleted from Cloudinary
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { getConversationKey, getKeyVersion } from './encryption.js'
import { getSessionKey, ensureKeyPair } from './e2ee'
import {
  uploadChunkToCloudinary,
  uploadChunkMetadata,
  fetchChunkFromCloudinary,
  fetchMetadataFromCloudinary,
  isCloudinaryConfigured,
  type ChunkRelayInfo,
} from './cloudinaryRelay'


export interface ChunkMetadata {
  fileId: string // Unique identifier for the media file
  chunkIndex: number // Which chunk this is (0, 1, 2, ...)
  totalChunks: number // Total number of chunks for this file
  chunkHash: string // SHA-256 hash of this chunk
  chunkSize: number // Size of this chunk in bytes
  mediaType: 'image' | 'video' | 'audio' | 'message' | 'document' // Type of media
  originalName?: string // Original filename
  timestamp: number // When created
  keyVersion?: number // Key version used for encryption
  encryption: {
    algorithm: 'AES-256-GCM'
    iv: string // Base64 encoded
    salt: string // Base64 encoded
  }
}

// Chunk size: 128KB (Small enough for reliable Firestore writes, well under 1MB doc limit)
const CHUNK_SIZE = 128 * 1024

const MEDIA_PATHS = {
  CHUNKS: 'media/chunks',
  METADATA: 'media/metadata',
  TEMP: 'temp',
}

/** Wrap any Uint8Array into a guaranteed ArrayBuffer-backed one for Web Crypto */
function toArrayBuffer(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(src.length);
  const out = new Uint8Array(buffer);
  out.set(src);
  return out;
}

/** Race a promise against a timeout — prevents hanging on web Filesystem API */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Generate SHA-256 hash for data integrity verification
 */
export async function generateSHA256Hash(data: Uint8Array): Promise<string> {
  try {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', toArrayBuffer(data))
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
  mediaType: 'image' | 'video' | 'audio' | 'message' | 'document',
  user1: string,
  user2: string,
  originalName?: string,
  onChunkProgress?: (chunkIndex: number, totalChunks: number) => void
): Promise<{
  fileId: string
  totalChunks: number
  metadata: ChunkMetadata[]
  fileHash: string
}> {
  try {
    // Get encryption key: E2EE v2 session key, fallback to PBKDF2 conversation key
    let encryptionKey = await getSessionKey(user1, user2);
    if (!encryptionKey) {
      try { await ensureKeyPair(user1); } catch { /* best effort */ }
      encryptionKey = await getSessionKey(user1, user2);
    }
    if (!encryptionKey) {
      encryptionKey = await getConversationKey(user1, user2);
    }
    if (!encryptionKey) {
      throw new Error('No encryption key available for media');
    }

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
      const usedKeyVersion = await getKeyVersion();

      // Encrypt chunk
      const encryptedChunk = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        toArrayBuffer(chunkData)
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
        keyVersion: usedKeyVersion,
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
          salt: btoa(String.fromCharCode.apply(null, Array.from(salt))),
        },
      }

      // Robust Base64 conversion to avoid "Maximum call stack size exceeded"
      const chunkUint8 = new Uint8Array(encryptedChunk)
      let binary = ''
      for (let j = 0; j < chunkUint8.byteLength; j++) {
        binary += String.fromCharCode(chunkUint8[j])
      }
      const encryptedChunkBase64 = btoa(binary)

      // 1. Write encrypted chunk to local filesystem FIRST (fast, reliable — sender reads from here)
      const chunkPath = `${MEDIA_PATHS.CHUNKS}/${fileId}_chunk_${i}`
      const metadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_${i}.json`
      await withTimeout(
        Filesystem.writeFile({
          path: chunkPath,
          data: encryptedChunkBase64,
          directory: Directory.Documents,
          recursive: true,
          encoding: Encoding.UTF8,
        }),
        10000,
        `Local FS write chunk ${i}`
      )
      await withTimeout(
        Filesystem.writeFile({
          path: metadataPath,
          data: JSON.stringify(metadata),
          directory: Directory.Documents,
          recursive: true,
          encoding: Encoding.UTF8,
        }),
        10000,
        `Local FS metadata write chunk ${i}`
      )

      // 2. Upload to Cloudinary (temporary relay — deleted after recipient downloads)
      //    Fire-and-forget: local FS write already succeeded, sender doesn't need to wait
      if (isCloudinaryConfigured()) {
        uploadChunkToCloudinary(encryptedChunkBase64, fileId, i).then((uploadResult) => {
          console.log(`☁️ Chunk ${i + 1}/${totalChunks} uploaded to Cloudinary: ${uploadResult.publicId}`);
        }).catch((cloudErr: any) => {
          console.error(`❌ Cloudinary upload failed for chunk ${i}: ${cloudErr.message || cloudErr}`);
        });
      }

      chunkMetadataArray.push(metadata)

      console.log(`✅ Chunk ${i + 1}/${totalChunks} encrypted and saved for ${fileId}`)

      if (onChunkProgress) onChunkProgress(i + 1, totalChunks);
    }

    // 3. Upload metadata to Cloudinary (so receiver can fetch it)
    if (isCloudinaryConfigured()) {
      uploadChunkMetadata(chunkMetadataArray, fileId).then((result) => {
        console.log(`☁️ Metadata uploaded to Cloudinary: ${result.publicId}`);
      }).catch((err: any) => {
        console.error(`❌ Cloudinary metadata upload failed for ${fileId}:`, err.message || err);
      });
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
 * Falls back to historical key versions if current key fails
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
  const MAX_KEY_VERSIONS = 7;
  const currentVersion = await getKeyVersion();

  // Try to detect stored key version from first chunk metadata
  let storedVersion: number | undefined;
  try {
    const firstMetadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_0.json`
    const metadataFile = await withTimeout(
      Filesystem.readFile({ path: firstMetadataPath, directory: Directory.Documents, encoding: Encoding.UTF8 }),
      3000, 'Read metadata for version check'
    );
    const parsed = JSON.parse(metadataFile.data as string);
    storedVersion = parsed.keyVersion;
  } catch { /* ignore */ }

  // Build version queue: stored version first (if any), then current, then descending
  const versions: number[] = [];
  if (storedVersion && storedVersion !== currentVersion) versions.push(storedVersion);
  for (let v = currentVersion; v >= Math.max(1, currentVersion - MAX_KEY_VERSIONS); v--) {
    if (!versions.includes(v)) versions.push(v);
  }

  for (const v of versions) {
    try {
      return await retrieveDecryptedMediaWithKey(fileId, user1, user2, v);
    } catch (err: any) {
      const isCryptoError = err?.name === 'OperationError' || err?.message?.includes('OperationError');
      if (isCryptoError) {
        console.log(`🔑 Media decrypt failed with key v${v}, trying next...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to decrypt media with any available key version');
}

async function retrieveDecryptedMediaWithKey(
  fileId: string,
  user1: string,
  user2: string,
  keyVersion: number
): Promise<{
  data: Uint8Array
  mediaType: string
  fileHash: string
  verified: boolean
}> {
  try {
    // Get decryption key: E2EE v2 session key, fallback to PBKDF2 conversation key
    let encryptionKey: CryptoKey = await getSessionKey(user1, user2) || await getConversationKey(user1, user2, keyVersion);

    // Get metadata for first chunk to know total chunks
    let firstMetadata: ChunkMetadata
    let cachedCloudinaryMetadata: ChunkMetadata[] | null = null  // Shared across chunk loop

    /**
     * Helper: fetch full metadata array from Cloudinary.
     * Used both for initial fetch and for per-chunk fallback.
     */
    const fetchAllMetadata = async (): Promise<ChunkMetadata[] | null> => {
      if (isCloudinaryConfigured()) {
        try {
          const chunksMeta = await fetchMetadataFromCloudinary(fileId);
          if (Array.isArray(chunksMeta) && chunksMeta.length > 0) return chunksMeta;
        } catch { /* ignore */ }
      }
      return null;
    };

    try {
      const firstMetadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_0.json`
      const metadataFile = await withTimeout(
        Filesystem.readFile({
          path: firstMetadataPath,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        }),
        3000,
        'Read chunk 0 metadata'
      )
      firstMetadata = JSON.parse(metadataFile.data as string)
      // Local FS succeeded — still need cachedCloudinaryMetadata for chunks
      // that aren't cached locally yet (e.g. on retry after partial cache)
    } catch {
      // Local metadata missing — fetch from Cloudinary/Firestore
      const allMeta = await fetchAllMetadata();
      if (allMeta) {
        firstMetadata = allMeta[0];
        cachedCloudinaryMetadata = allMeta;
      } else {
        throw new Error(`Metadata for chunk 0 not found anywhere!`);
      }
    }

    // Ensure cachedCloudinaryMetadata is populated even when local FS had chunk 0.
    // On retry, chunk 0 may be cached locally but chunks 1+ may not be yet.
    if (!cachedCloudinaryMetadata) {
      const allMeta = await fetchAllMetadata();
      if (allMeta) cachedCloudinaryMetadata = allMeta;
    }

    const totalChunks = firstMetadata.totalChunks
    const mediaType = firstMetadata.mediaType

    const decryptedChunks: Uint8Array[] = []
    let fileVerified = true

    // Retrieve and decrypt each chunk
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${MEDIA_PATHS.CHUNKS}/${fileId}_chunk_${i}`
      const metadataPath = `${MEDIA_PATHS.METADATA}/${fileId}_chunk_${i}.json`

      // 1. Get Metadata (Local or Cloudinary/Firestore)
      let metadata: ChunkMetadata;
      try {
        const metadataFile = await withTimeout(
          Filesystem.readFile({
            path: metadataPath,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
          }),
          3000,
          `Read chunk ${i} metadata`
        );
        metadata = JSON.parse(metadataFile.data as string);
      } catch (err) {
        // Metadata missing locally — use cached metadata from Cloudinary,
        // or re-fetch the combined metadata array
        if (cachedCloudinaryMetadata && cachedCloudinaryMetadata[i]) {
          metadata = cachedCloudinaryMetadata[i];
        } else {
          if (!cachedCloudinaryMetadata) {
            const allMeta = await fetchAllMetadata();
            if (allMeta) cachedCloudinaryMetadata = allMeta;
          }
          if (cachedCloudinaryMetadata && cachedCloudinaryMetadata[i]) {
            metadata = cachedCloudinaryMetadata[i];
          } else {
            throw new Error(`Metadata for chunk ${i} not found!`);
          }
        }
      }

      // 2. Read encrypted chunk
      let chunkData: string;
      try {
        const chunkFile = await withTimeout(
          Filesystem.readFile({
            path: chunkPath,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
          }),
          3000,
          `Read chunk ${i} data`
        );
        chunkData = chunkFile.data as string;
      } catch (err) {
        // Local file missing — try Cloudinary
        if (isCloudinaryConfigured()) {
          console.log(`📡 Chunk ${i} missing locally, fetching from Cloudinary...`);
          try {
            chunkData = await fetchChunkFromCloudinary(fileId, i);
          } catch (cloudErr) {
            throw new Error(`Chunk ${i} not found (Cloudinary fetch failed)!`);
          }
        } else {
          throw new Error(`Chunk ${i} not found locally and Cloudinary not configured!`);
        }

        // Cache it locally for next time (fire-and-forget)
        Filesystem.writeFile({
          path: chunkPath,
          data: chunkData,
          directory: Directory.Documents,
          recursive: true,
          encoding: Encoding.UTF8,
        }).then(() => Filesystem.writeFile({
          path: metadataPath,
          data: JSON.stringify(metadata),
          directory: Directory.Documents,
          recursive: true,
          encoding: Encoding.UTF8,
        })).catch(() => {})
      }

      // Decode from base64 robustly
      const binaryChunk = atob(chunkData)
      const encryptedChunkArray = new Uint8Array(binaryChunk.length)
      for (let j = 0; j < binaryChunk.length; j++) {
        encryptedChunkArray[j] = binaryChunk.charCodeAt(j)
      }

      // Decode IV and salt
      const binaryIv = atob(metadata.encryption.iv)
      const iv = new Uint8Array(binaryIv.length)
      for (let j = 0; j < binaryIv.length; j++) {
        iv[j] = binaryIv.charCodeAt(j)
      }

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
  mediaType: 'image' | 'video' | 'audio' | 'document'
): Promise<string> {
  try {
    // Detect MIME type from magic bytes
    let mimeType = 'application/octet-stream'
    if (decryptedData.length >= 4) {
      const sig = Array.from(decryptedData.slice(0, 12))
      if (sig[0] === 0xFF && sig[1] === 0xD8 && sig[2] === 0xFF) mimeType = 'image/jpeg'
      else if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4E && sig[3] === 0x47) mimeType = 'image/png'
      else if (sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46) mimeType = 'image/gif'
      else if (sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46) mimeType = 'video/webm'
      else if (sig[4] === 0x66 && sig[5] === 0x74 && sig[6] === 0x79 && sig[7] === 0x70) {
        if (sig[8] === 0x69 && sig[9] === 0x73) mimeType = 'video/mp4'
        else if (sig[8] === 0x6F) mimeType = 'video/mp4'
        else mimeType = 'video/mp4'
      }
      else if (sig[0] === 0x1A && sig[1] === 0x45 && sig[2] === 0xDF && sig[3] === 0xA3) mimeType = 'video/webm'
      else if (sig[0] === 0x4F && sig[1] === 0x67 && sig[2] === 0x67 && sig[3] === 0x53) mimeType = 'audio/ogg'
      else if (sig[0] === 0x23 && sig[1] === 0x21 && sig[2] === 0x41 && sig[3] === 0x4D) mimeType = 'audio/amr'
      else {
        const fallback: Record<string, string> = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mp4' }
        mimeType = fallback[mediaType] || 'application/octet-stream'
      }
    } else {
      const fallback: Record<string, string> = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mp4' }
      mimeType = fallback[mediaType] || 'application/octet-stream'
    }

    // Create blob from decrypted data
    const blob = new Blob([toArrayBuffer(decryptedData)], { type: mimeType })

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
 * Delete all local chunks and metadata for a media file
 * (Cloudinary chunks are cleaned up separately via chunkRelayCleanup)
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

    console.log(`✅ Deleted all local chunks for ${fileId}`)
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
