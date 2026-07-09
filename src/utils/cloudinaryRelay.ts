/**
 * Cloudinary Relay — Temporary storage for encrypted media chunks
 *
 * Upload: Client-side unsigned upload (no API secret exposed)
 * Delete: Orphans handled by Cloudinary free tier (25GB) or manual cleanup
 *
 * Flow:
 *   Sender uploads encrypted chunks + metadata JSON → Cloudinary (temporary)
 *   Recipient downloads metadata → downloads chunks → decrypts → caches locally
 *   Chunks accumulate on Cloudinary free tier (25GB) until Blaze plan upgrade
 */

import type { ChunkMetadata } from './encryptedChunkedMedia';

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
 * Stored alongside chunks so the receiver can fetch metadata to know
 * totalChunks, mediaType, encryption iv/salt/keyVersion for each chunk.
 */
export async function uploadChunkMetadata(
  chunksMetadata: ChunkMetadata[],
  fileId: string
): Promise<UploadResult> {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('VITE_CLOUDINARY_CLOUD_NAME not configured');
  }

  const publicId = `${CLOUDINARY_FOLDER}/${fileId}/_metadata`;
  // Store the full array — receiver uses index 0 for totalChunks/mediaType
  const jsonBlob = new Blob([JSON.stringify(chunksMetadata)], { type: 'application/json' });

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

/**
 * Fetch chunk metadata JSON from Cloudinary.
 * Returns the ChunkMetadata[] array uploaded alongside the chunks.
 * The receiver uses index 0 to determine totalChunks/mediaType,
 * and each element for per-chunk encryption iv/salt/keyVersion.
 */
export async function fetchMetadataFromCloudinary(
  fileId: string
): Promise<ChunkMetadata[]> {
  if (!CLOUDINARY_CLOUD_NAME) {
    throw new Error('VITE_CLOUDINARY_CLOUD_NAME not configured');
  }

  const publicId = `${CLOUDINARY_FOLDER}/${fileId}/_metadata`;
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/raw/upload/${publicId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Cloudinary metadata fetch failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return JSON.parse(text) as ChunkMetadata[];
}

// ─── Delete ────────────────────────────────────────────────────────────────

/**
 * Delete all chunks for a file from Cloudinary.
 * Cloudinary REST DELETE requires API secret (server-side only).
 * Cannot work from browser due to CORS. Chunks accumulate on Cloudinary
 * free tier (25GB) until a server-side cleanup solution is deployed.
 */
export async function deleteChunksFromCloudinary(
  _fileId: string,
  _totalChunks: number
): Promise<{ success: boolean; deleted: number }> {
  console.log(`ℹ️ Cloudinary chunk deletion not available from browser — chunks will remain on Cloudinary free tier`);
  return { success: false, deleted: 0 };
}

/**
 * Delete chunks for multiple files (batch cleanup).
 */
export async function deleteMultipleFileChunks(
  files: Array<{ fileId: string; totalChunks: number }>
): Promise<{ success: boolean; totalDeleted: number }> {
  // No-op: Cloudinary delete not available from browser
  return { success: false, totalDeleted: 0 };
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
