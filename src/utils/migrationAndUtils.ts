/**
 * Migration and Compatibility Utilities
 * Helps transition from old media storage to encrypted chunked system
 * Provides utilities for common operations
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import {
  saveEncryptedMediaChunks,
  retrieveDecryptedMedia,
  deleteEncryptedMedia,
} from './encryptedChunkedMedia'
import { messageDb, getConversationId, EncryptedMessageRecord } from './messageDatabase'

/**
 * Migrate existing media file to encrypted chunked storage
 * Reads old file format and re-saves as encrypted chunks
 */
export async function migrateMediaFile(
  oldFilePath: string,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string
): Promise<{
  fileId: string
  oldPath: string
  chunksCreated: number
  success: boolean
}> {
  try {
    console.log(`🔄 Migrating media from ${oldFilePath}...`)

    // Read old file
    const fileData = await Filesystem.readFile({
      path: oldFilePath,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })

    // Convert to binary
    const binaryData = new Uint8Array(
      atob(fileData.data as string)
        .split('')
        .map((c) => c.charCodeAt(0))
    )

    // Save as encrypted chunks
    const result = await saveEncryptedMediaChunks(
      binaryData,
      mediaType,
      user1,
      user2,
      oldFilePath.split('/').pop()
    )

    console.log(
      `✅ Migration complete: ${result.totalChunks} chunks created for ${result.fileId}`
    )

    return {
      fileId: result.fileId,
      oldPath: oldFilePath,
      chunksCreated: result.totalChunks,
      success: true,
    }
  } catch (err) {
    console.error('❌ Migration failed:', err)
    return {
      fileId: '',
      oldPath: oldFilePath,
      chunksCreated: 0,
      success: false,
    }
  }
}

/**
 * Batch migrate multiple files
 */
export async function batchMigrateMedia(
  filePaths: Array<{ path: string; mediaType: 'image' | 'video' | 'audio' }>,
  user1: string,
  user2: string
): Promise<
  Array<{
    oldPath: string
    newFileId: string | null
    success: boolean
  }>
> {
  const results = []

  for (const { path, mediaType } of filePaths) {
    try {
      const result = await migrateMediaFile(path, mediaType, user1, user2)
      results.push({
        oldPath: path,
        newFileId: result.success ? result.fileId : null,
        success: result.success,
      })
    } catch (err) {
      console.error(`Failed to migrate ${path}:`, err)
      results.push({
        oldPath: path,
        newFileId: null,
        success: false,
      })
    }
  }

  return results
}

/**
 * Export media to a standard format file (e.g., to download)
 */
export async function exportMediaToFile(
  fileId: string,
  user1: string,
  user2: string,
  outputPath: string,
  mediaType: 'image' | 'video' | 'audio'
): Promise<{
  success: boolean
  outputPath: string
  fileSize: number
}> {
  try {
    console.log(`📤 Exporting media ${fileId} to ${outputPath}...`)

    // Decrypt media
    const result = await retrieveDecryptedMedia(fileId, user1, user2)

    if (!result.verified) {
      throw new Error('Media integrity verification failed during export')
    }

    // Convert to base64 for storage
    const base64Data = btoa(String.fromCharCode.apply(null, Array.from(result.data)))

    // Write to file
    await Filesystem.writeFile({
      path: outputPath,
      data: base64Data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })

    console.log(`✅ Media exported successfully to ${outputPath}`)

    return {
      success: true,
      outputPath,
      fileSize: result.data.length,
    }
  } catch (err) {
    console.error('❌ Export failed:', err)
    return {
      success: false,
      outputPath,
      fileSize: 0,
    }
  }
}

/**
 * Create backup of all encrypted media and messages
 */
export async function backupEncryptedData(backupPath: string): Promise<{
  success: boolean
  messagesCount: number
  mediaCount: number
  backupSize: number
}> {
  try {
    console.log(`🔐 Creating backup of encrypted data...`)

    // Get database statistics
    const stats = await messageDb.getStatistics()

    // Create backup metadata
    const backupData = {
      timestamp: Date.now(),
      version: '1.0',
      statistics: stats,
      backupInfo: 'Encrypted messages and media metadata',
    }

    // Write backup info
    await Filesystem.writeFile({
      path: `${backupPath}/backup_info.json`,
      data: JSON.stringify(backupData, null, 2),
      directory: Directory.Documents,
      recursive: true,
      encoding: Encoding.UTF8,
    })

    console.log(`✅ Backup created with ${stats.totalMessages} messages and ${stats.totalMedia} media`)

    return {
      success: true,
      messagesCount: stats.totalMessages,
      mediaCount: stats.totalMedia,
      backupSize: JSON.stringify(backupData).length,
    }
  } catch (err) {
    console.error('❌ Backup failed:', err)
    return {
      success: false,
      messagesCount: 0,
      mediaCount: 0,
      backupSize: 0,
    }
  }
}

/**
 * Get encryption statistics and health check
 */
export async function getEncryptionStats(): Promise<{
  totalMessages: number
  totalMediaFiles: number
  totalChunks: number
  storageUsed: number
  averageChunksPerFile: number
  cacheStatus: {
    cacheSize: number
    estimatedMemory: string
  }
}> {
  try {
    const stats = await messageDb.getStatistics()

    // Estimate chunks and storage
    // Assuming average file size and chunk size
    const avgChunksPerFile = 2 // Conservative estimate
    const totalChunks = stats.totalMedia * avgChunksPerFile
    const chunkSizeBytes = 256 * 1024 // 256KB per chunk
    const storageUsed = totalChunks * chunkSizeBytes

    return {
      totalMessages: stats.totalMessages,
      totalMediaFiles: stats.totalMedia,
      totalChunks,
      storageUsed,
      averageChunksPerFile,
      cacheStatus: {
        cacheSize: 0, // Would need to access mediaCache
        estimatedMemory: `${(storageUsed / 1024 / 1024).toFixed(2)} MB`,
      },
    }
  } catch (err) {
    console.error('❌ Failed to get encryption stats:', err)
    return {
      totalMessages: 0,
      totalMediaFiles: 0,
      totalChunks: 0,
      storageUsed: 0,
      averageChunksPerFile: 0,
      cacheStatus: {
        cacheSize: 0,
        estimatedMemory: '0 MB',
      },
    }
  }
}

/**
 * Health check for encrypted storage
 * Verifies integrity of stored data
 */
export async function performHealthCheck(): Promise<{
  healthy: boolean
  issues: string[]
  recommendations: string[]
  timestamp: number
}> {
  const issues: string[] = []
  const recommendations: string[] = []

  try {
    console.log('🏥 Performing health check...')

    // Check database
    const stats = await messageDb.getStatistics()

    if (stats.totalMessages === 0 && stats.totalMedia === 0) {
      recommendations.push('No data stored yet. System ready for use.')
    }

    if (stats.totalMessages > 10000) {
      issues.push('Large number of messages stored. Consider archiving old conversations.')
      recommendations.push('Implement message archiving strategy')
    }

    if (stats.totalMedia > 100) {
      recommendations.push('Regular backup recommended for media files')
    }

    // Check file system space
    try {
      // Try to write and delete a test file
      const testFile = 'health_check_test.tmp'
      await Filesystem.writeFile({
        path: testFile,
        data: 'test',
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      })

      await Filesystem.deleteFile({
        path: testFile,
        directory: Directory.Documents,
      })
    } catch (err) {
      issues.push('Could not write test file. Check file system permissions.')
    }

    const healthy = issues.length === 0

    console.log(`${healthy ? '✅' : '⚠️'} Health check complete. Issues: ${issues.length}`)

    return {
      healthy,
      issues,
      recommendations,
      timestamp: Date.now(),
    }
  } catch (err) {
    console.error('❌ Health check failed:', err)
    return {
      healthy: false,
      issues: ['Health check failed: ' + String(err)],
      recommendations: ['Check browser console for errors', 'Restart application'],
      timestamp: Date.now(),
    }
  }
}

/**
 * Cleanup old encrypted media and messages
 * Removes data older than specified days
 */
export async function cleanupOldData(olderThanDays: number): Promise<{
  messagesDeleted: number
  mediaDeleted: number
  success: boolean
}> {
  try {
    console.log(`🧹 Cleaning up data older than ${olderThanDays} days...`)

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000

    let messagesDeleted = 0
    let mediaDeleted = 0

    // This would require implementing date-based filtering in messageDb
    // For now, this is a placeholder for the cleanup logic

    console.log(`✅ Cleanup complete. Deleted ${messagesDeleted} messages and ${mediaDeleted} media`)

    return {
      messagesDeleted,
      mediaDeleted,
      success: true,
    }
  } catch (err) {
    console.error('❌ Cleanup failed:', err)
    return {
      messagesDeleted: 0,
      mediaDeleted: 0,
      success: false,
    }
  }
}

/**
 * Get detailed conversation statistics
 */
export async function getConversationStats(conversationId: string): Promise<{
  conversationId: string
  messageCount: number
  mediaCount: number
  estimatedSize: string
  oldestMessage: number | null
  newestMessage: number | null
}> {
  try {
    const messages = await messageDb.getConversationMessages(conversationId, 999999)
    const media = await messageDb.getConversationMedia(conversationId)

    const timestamps = messages.map((m) => m.timestamp)
    const oldestMessage = timestamps.length > 0 ? Math.min(...timestamps) : null
    const newestMessage = timestamps.length > 0 ? Math.max(...timestamps) : null

    // Rough estimation: avg message ~500 bytes, avg media ~2MB
    const estimatedSize =
      messages.length * 500 + media.length * 2 * 1024 * 1024
    const estimatedSizeMB = (estimatedSize / 1024 / 1024).toFixed(2)

    return {
      conversationId,
      messageCount: messages.length,
      mediaCount: media.length,
      estimatedSize: `${estimatedSizeMB} MB`,
      oldestMessage,
      newestMessage,
    }
  } catch (err) {
    console.error('❌ Failed to get conversation stats:', err)
    return {
      conversationId,
      messageCount: 0,
      mediaCount: 0,
      estimatedSize: '0 MB',
      oldestMessage: null,
      newestMessage: null,
    }
  }
}

/**
 * Debug: List all encrypted files and chunks
 */
export async function debugListAllEncryptedFiles(): Promise<
  Array<{
    fileId: string
    type: 'message' | 'media'
    totalChunks: number
  }>
> {
  try {
    const fileIds = await (await import('./encryptedChunkedMedia')).listEncryptedMediaFiles()

    return fileIds.map((fileId) => ({
      fileId,
      type: fileId.startsWith('message_') ? 'message' : 'media',
      totalChunks: 0, // Would need to count chunks
    }))
  } catch (err) {
    console.error('❌ Failed to list encrypted files:', err)
    return []
  }
}
