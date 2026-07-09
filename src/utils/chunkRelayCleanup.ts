/**
 * Chunk Relay Cleanup
 * Handles post-download cleanup of encrypted chunks from Cloudinary.
 *
 * Flow:
 *   1. Recipient downloads + decrypts chunks from Cloudinary
 *   2. Chunks cached in local SQLite (confirmed via Filesystem check)
 *   3. This module deletes the chunks from Cloudinary permanently
 *
 * Triggered by: LocalMedia component after successful media load
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { deleteChunksFromCloudinary } from './cloudinaryRelay';

const MEDIA_PATHS = {
  CHUNKS: 'media/chunks',
  METADATA: 'media/metadata',
};

/**
 * Verify that chunks exist in local SQLite/FileSystem before cleanup.
 * Returns true if at least one chunk is confirmed cached locally.
 */
async function verifyLocalCache(fileId: string, totalChunks: number): Promise<boolean> {
  let cachedCount = 0;

  for (let i = 0; i < Math.min(totalChunks, 3); i++) {
    try {
      const chunkPath = `${MEDIA_PATHS.CHUNKS}/${fileId}_chunk_${i}`;
      await Filesystem.readFile({
        path: chunkPath,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      cachedCount++;
    } catch {
      // Chunk not cached locally
    }
  }

  // At least first 3 chunks (or all if fewer) must be cached
  return cachedCount >= Math.min(totalChunks, 3);
}

/**
 * Confirm download and cleanup chunks from Cloudinary.
 * Only deletes after verifying local cache exists.
 *
 * @param fileId - The media file ID
 * @param totalChunks - Total number of chunks
 * @param userId - The user confirming (for logging)
 * @returns Cleanup result
 */
export async function confirmAndCleanup(
  fileId: string,
  totalChunks: number,
  userId: string
): Promise<{ success: boolean; reason: string }> {
  try {
    // 1. Verify local cache exists
    const isCached = await verifyLocalCache(fileId, totalChunks);
    if (!isCached) {
      console.warn(`⚠️ Cleanup skipped for ${fileId}: local cache not confirmed`);
      return { success: false, reason: 'local_cache_not_confirmed' };
    }

    console.log(`🧹 Cleanup confirmed for ${fileId}: local cache verified, deleting from Cloudinary`);

    // 2. Delete from Cloudinary
    const result = await deleteChunksFromCloudinary(fileId, totalChunks);

    if (result.success) {
      console.log(`✅ Cleaned up ${result.deleted} chunks for ${fileId} from Cloudinary`);
      return { success: true, reason: 'deleted' };
    } else {
      console.warn(`⚠️ Partial cleanup for ${fileId}: ${result.deleted}/${totalChunks} deleted`);
      return { success: false, reason: 'partial_delete' };
    }
  } catch (err: any) {
    console.error(`❌ Cleanup failed for ${fileId}:`, err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Cleanup chunks for a message being deleted by sender.
 * Called when sender deletes a message before recipient downloads.
 *
 * @param fileId - The media file ID
 * @param totalChunks - Total number of chunks
 */
export async function cleanupOnMessageDelete(
  fileId: string,
  totalChunks: number
): Promise<void> {
  try {
    console.log(`🗑️ Cleaning up Cloudinary chunks for deleted message: ${fileId}`);
    await deleteChunksFromCloudinary(fileId, totalChunks);
    console.log(`✅ Cleaned up chunks for deleted message: ${fileId}`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to cleanup chunks for deleted message ${fileId}:`, err.message);
  }
}

/**
 * Extract fileId and totalChunks from a message's media reference.
 * Returns null if the message doesn't have relayed media.
 *
 * NOTE: totalChunks must come from message.totalChunks (set during send).
 * This function only extracts the fileId from the mediaUrl.
 */
export function extractRelayInfo(mediaUrl: string | null | undefined, totalChunks?: number): {
  fileId: string;
  totalChunks: number;
} | null {
  if (!mediaUrl || typeof mediaUrl !== 'string') return null;
  if (!totalChunks || totalChunks <= 0) return null;

  return { fileId: mediaUrl, totalChunks };
}
