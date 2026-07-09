/**
 * Cloudinary Relay — Temporary storage for encrypted media chunks
 *
 * Upload: Client-side unsigned upload (no API secret exposed)
 * Delete: Server-side via Firebase Cloud Function (holds API secret)
 *
 * Flow:
 *   Sender uploads encrypted chunks → Cloudinary (temporary)
 *   Recipient downloads + decrypts → caches in local SQLite
 *   After SQLite confirms cache → chunks permanently deleted from Cloudinary
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

// ─── Configuration (hardcoded for mobile — no env vars needed) ──────────────

const CLOUDINARY_CLOUD_NAME = 'yrclkuaq';
const CLOUDINARY_UPLOAD_PRESET = 'quidec-relay';
const CLOUDINARY_FOLDER = 'quidec-relay';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UploadResult {
  publicId: string;
  secureUrl: string;
  bytes: number;
}

export interface ChunkRelayInfo {
  fileId: string;
  totalChunks: number;
  uploadedBy: string;
  intendedFor: string | string[];
  uploadedAt: number;
}

// ─── Upload ─────────────────────────────────────────────────────────────────

/**
 * Upload a single encrypted chunk to Cloudinary as a raw file.
 * Uses unsigned upload preset — no API secret needed on client.
 *
 * @param chunkBase64 - Base64-encoded encrypted chunk data
 * @param fileId - Unique file identifier (e.g. "image_12345_abc")
 * @param chunkIndex - Chunk index (0, 1, 2, ...)
 * @returns Upload result with public ID and URL
 */
export async function uploadChunkToCloudinary(
  chunkBase64: string,
  fileId: string,
  chunkIndex: number
): Promise<UploadResult> {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('VITE_CLOUDINARY_CLOUD_NAME not configured');
  }

  const publicId = `${CLOUDINARY_FOLDER}/${fileId}/chunk_${chunkIndex}`;

  // Convert base64 to blob for upload
  const binary = atob(chunkBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/octet-stream' });

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('public_id', publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Cloudinary upload failed: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    bytes: result.bytes,
  };
}

/**
 * Upload chunk metadata to Cloudinary as a JSON file.
 * Stored alongside chunks for cleanup verification.
 */
export async function uploadChunkMetadata(
  metadata: ChunkRelayInfo,
  fileId: string
): Promise<UploadResult> {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('VITE_CLOUDINARY_CLOUD_NAME not configured');
  }

  const publicId = `${CLOUDINARY_FOLDER}/${fileId}/_metadata`;
  const jsonBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });

  const formData = new FormData();
  formData.append('file', jsonBlob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('public_id', publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Cloudinary metadata upload failed: ${error.error?.message || response.statusText}`);
  }

  const result = await response.json();

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    bytes: result.bytes,
  };
}

/**
 * Fetch a chunk from Cloudinary by public ID.
 * Returns base64-encoded encrypted chunk data.
 */
export async function fetchChunkFromCloudinary(
  fileId: string,
  chunkIndex: number
): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('VITE_CLOUDINARY_CLOUD_NAME not configured');
  }

  const publicId = `${CLOUDINARY_FOLDER}/${fileId}/chunk_${chunkIndex}`;
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/${publicId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Cloudinary fetch failed: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  // Convert blob to base64
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Extract base64 portion from data URL
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Delete (Server-side via Firebase Cloud Function) ───────────────────────

/**
 * Delete all chunks for a file from Cloudinary.
 * Calls a Firebase Cloud Function that holds the API secret.
 *
 * @param fileId - The file ID whose chunks to delete
 * @param totalChunks - Number of chunks to delete
 */
export async function deleteChunksFromCloudinary(
  fileId: string,
  totalChunks: number
): Promise<{ success: boolean; deleted: number }> {
  try {
    const functions = getFunctions();
    const deleteChunks = httpsCallable(functions, 'deleteCloudinaryChunks');

    const result = await deleteChunks({ fileId, totalChunks });
    return result.data as { success: boolean; deleted: number };
  } catch (err: any) {
    // CF may not be deployed yet, or auth failed — log but don't throw
    // The scheduled cleanup CF will handle orphaned chunks
    console.warn(`⚠️ Cloud Function deleteCloudinaryChunks failed for ${fileId}: ${err.message || err}`);
    return { success: false, deleted: 0 };
  }
}

/**
 * Direct delete fallback — NOT possible from browser.
 * Cloudinary REST API DELETE requires API key + signature (server-side only).
 * Browser requests are always blocked by CORS for Cloudinary admin API.
 * Returns failure immediately — caller should rely on Firebase Cloud Function.
 */
async function deleteChunksDirect(
  _fileId: string,
  _totalChunks: number
): Promise<{ success: boolean; deleted: number }> {
  // Cloudinary REST API DELETE requires api_key + api_secret + signature.
  // This can NEVER work from a browser due to CORS restrictions.
  // The Firebase Cloud Function (deleteCloudinaryChunks) is the ONLY way to delete.
  console.warn('⚠️ Client-side Cloudinary DELETE not possible — only Firebase CF can delete');
  return { success: false, deleted: 0 };
}

/**
 * Delete chunks for multiple files (batch cleanup).
 */
export async function deleteMultipleFileChunks(
  files: Array<{ fileId: string; totalChunks: number }>
): Promise<{ success: boolean; totalDeleted: number }> {
  let totalDeleted = 0;

  for (const file of files) {
    const result = await deleteChunksFromCloudinary(file.fileId, file.totalChunks);
    totalDeleted += result.deleted;
  }

  return { success: totalDeleted > 0, totalDeleted };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if Cloudinary relay is configured.
 */
export function isCloudinaryConfigured(): boolean {
  return !!CLOUDINARY_CLOUD_NAME && !!CLOUDINARY_UPLOAD_PRESET;
}

/**
 * Get the Cloudinary folder path for a file.
 */
export function getChunkCloudinaryPath(fileId: string, chunkIndex: number): string {
  return `${CLOUDINARY_FOLDER}/${fileId}/chunk_${chunkIndex}`;
}
