/**
 * Firebase Cloud Functions for Quidec
 * Handles server-side operations that require API secrets
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const CLOUDINARY_CLOUD_NAME = 'yrclkuaq';
const CLOUDINARY_API_KEY = '339257421286331';
const CLOUDINARY_API_SECRET = 'jpWuE3UE6oZhQFbMTMqC14maFpo';
const CLOUDINARY_FOLDER = 'quidec-relay';

/**
 * Delete encrypted chunks from Cloudinary after recipient downloads.
 * Called by client after local SQLite cache is confirmed.
 *
 * @param fileId - The media file ID
 * @param totalChunks - Number of chunks to delete
 */
export const deleteCloudinaryChunks = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to delete chunks'
    );
  }

  const { fileId, totalChunks } = data;

  if (!fileId || typeof fileId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'fileId is required'
    );
  }

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('❌ Cloudinary credentials not configured');
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cloudinary not configured'
    );
  }

  let deleted = 0;
  const errors: string[] = [];

  // Delete each chunk
  const numChunks = typeof totalChunks === 'number' ? totalChunks : 50;
  for (let i = 0; i < numChunks; i++) {
    try {
      const publicId = `${CLOUDINARY_FOLDER}/${fileId}/chunk_${i}`;
      await deleteCloudinaryResource(publicId);
      deleted++;
    } catch (err: any) {
      errors.push(`chunk_${i}: ${err.message}`);
    }
  }

  // Delete metadata file
  try {
    const metaId = `${CLOUDINARY_FOLDER}/${fileId}/_metadata`;
    await deleteCloudinaryResource(metaId);
    deleted++;
  } catch (err: any) {
    errors.push(`_metadata: ${err.message}`);
  }

  if (errors.length > 0) {
    console.warn(`⚠️ Partial deletion for ${fileId}: ${errors.join(', ')}`);
  }

  console.log(`✅ Deleted ${deleted} chunks for ${fileId}`);

  return {
    success: deleted > 0,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  };
});

/**
 * Delete a single resource from Cloudinary using signed API.
 */
async function deleteCloudinaryResource(publicId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Create signature for delete
  const crypto = require('crypto');
  const params_to_sign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(params_to_sign).digest('hex');

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/raw/upload`;

  const formData = new URLSearchParams();
  formData.append('public_ids[]', publicId);
  formData.append('timestamp', timestamp);
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('signature', signature);

  const response = await fetch(url, {
    method: 'DELETE',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudinary delete failed (${response.status}): ${errorText}`);
  }
}
