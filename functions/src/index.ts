/**
 * Firebase Cloud Functions for Quidec
 * Handles server-side operations that require API secrets
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

admin.initializeApp();

const db = admin.firestore();

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
    console.error('Cloudinary credentials not configured');
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
      // 404 = already deleted, not an error worth reporting
      if (!err.message.includes('404')) {
        errors.push(`chunk_${i}: ${err.message}`);
      }
    }
  }

  // Delete metadata file
  try {
    const metaId = `${CLOUDINARY_FOLDER}/${fileId}/_metadata`;
    await deleteCloudinaryResource(metaId);
    deleted++;
  } catch (err: any) {
    if (!err.message.includes('404')) {
      errors.push(`_metadata: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`Partial deletion for ${fileId}: ${errors.join(', ')}`);
  }

  console.log(`Deleted ${deleted} chunks for ${fileId}`);

  return {
    success: deleted > 0,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  };
});

/**
 * Scheduled cleanup: delete Cloudinary chunks older than 24 hours.
 * Runs daily as a safety net for orphaned relay chunks.
 * Chunks should normally be deleted by recipients after download.
 */
export const cleanupOrphanedCloudinaryChunks = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    console.log('Running scheduled Cloudinary chunk cleanup...');
    // NOTE: With the removal of the mediaChunks Firestore collection,
    // this cleanup now relies on Cloudinary's own resource listing API.
    // We use the Cloudinary Admin API to find and delete old resources.
    
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      console.log('Cloudinary not configured, skipping cleanup');
      return null;
    }

    try {
      // List resources in the quidec-relay folder older than 24 hours
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params_to_sign = `max_results=500&prefix=quidec-relay/&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
      const signature = crypto.createHash('sha1').update(params_to_sign).digest('hex');

      const listUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/raw/upload?prefix=quidec-relay/&max_results=500&timestamp=${timestamp}&api_key=${CLOUDINARY_API_KEY}&signature=${signature}`;

      const response = await fetch(listUrl);
      if (!response.ok) {
        console.warn(`Cloudinary list failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      const resources = data.resources || [];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;

      const oldResources = resources.filter((r: any) => {
        const created = new Date(r.created_at).getTime();
        return created < cutoff;
      });

      if (oldResources.length === 0) {
        console.log('No orphaned chunks found');
        return null;
      }

      let totalDeleted = 0;
      for (const resource of oldResources) {
        try {
          await deleteCloudinaryResource(resource.public_id);
          totalDeleted++;
        } catch { /* chunk may already be deleted */ }
      }

      console.log(`Scheduled cleanup complete: ${totalDeleted} chunks deleted`);
    } catch (err: any) {
      console.error('Scheduled cleanup failed:', err.message);
    }

  return null;
});

/**
 * Send FCM push notification when a notification is queued in RTDB.
 * Client writes to notifications/{uid}/{timestamp}, this function picks it up and sends FCM.
 */
export const onNotificationQueued = functions.database
  .ref('notifications/{uid}/{timestamp}')
  .onCreate(async (snap, context) => {
    const { uid } = context.params;
    const notification = snap.val();

    if (!notification) return null;

    const { fromUid, fromName, body, messageType } = notification;

    console.log(`📬 Notification queued for ${uid} from ${fromName}`);

    try {
      // Get recipient's FCM token from Firestore
      const recipientDoc = await db.collection('users').doc(uid).get();
      const recipientData = recipientDoc.data();

      if (!recipientData) {
        console.log(`❌ Recipient ${uid} not found`);
        return null;
      }

      // Decrypt FCM token if encrypted
      let fcmToken = recipientData.fcmToken;
      if (!fcmToken) {
        console.log(`⚠️ No FCM token for ${uid}`);
        return null;
      }

      // Check if notifications are enabled
      if (recipientData.notificationsEnabled === false) {
        console.log(`🔇 Notifications disabled for ${uid}`);
        return null;
      }

      // Build notification
      const title = fromName || 'Someone';
      const bodyText = body || 'sent a message';

      await admin.messaging().send({
        notification: {
          title,
          body: bodyText,
        },
        data: {
          type: messageType || 'new_text',
          fromUid: fromUid || '',
          fromName: fromName || '',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        token: fcmToken,
      });

      console.log(`✅ FCM notification sent to ${uid}`);

      // Clean up the notification from RTDB after sending
      await snap.ref.remove();

      return null;
    } catch (error: any) {
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        // Remove invalid token
        await db.collection('users').doc(uid).update({
          fcmToken: admin.firestore.FieldValue.delete(),
        });
        console.log(`🗑️ Removed invalid FCM token for ${uid}`);
      } else {
        console.error(`❌ Failed to send FCM notification: ${error.message}`);
      }
      return null;
    }
  });

/**
 * Send FCM notification for friend requests
 */
export const onFriendRequestCreated = functions.firestore
  .document('friendRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data();
    const { fromUid, toUid } = request;

    try {
      const recipientDoc = await db.collection('users').doc(toUid).get();
      const recipientData = recipientDoc.data();

      if (!recipientData?.fcmToken) return null;

      const senderDoc = await db.collection('users').doc(fromUid).get();
      const senderName = senderDoc.data()?.username || senderDoc.data()?.displayName || 'Someone';

      await admin.messaging().send({
        notification: {
          title: `Friend request from ${senderName}`,
          body: `${senderName} sent you a friend request`,
        },
        data: {
          type: 'friend-request',
          fromUid,
          senderName,
          requestId: snap.id,
        },
        token: recipientData.fcmToken,
      });

      console.log(`✅ Friend request notification sent to ${toUid}`);
    } catch (error: any) {
      console.error(`❌ Friend request notification failed: ${error.message}`);
    }
    return null;
  });

/**
 * Send FCM notification when friend request is accepted
 */
export const onFriendRequestAccepted = functions.firestore
  .document('friendRequests/{requestId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === 'accepted' || after.status !== 'accepted') return null;

    const { fromUid, toUid } = after;

    try {
      const senderDoc = await db.collection('users').doc(fromUid).get();
      const senderData = senderDoc.data();

      if (!senderData?.fcmToken) return null;

      const acceptorDoc = await db.collection('users').doc(toUid).get();
      const acceptorName = acceptorDoc.data()?.username || acceptorDoc.data()?.displayName || 'Someone';

      await admin.messaging().send({
        notification: {
          title: 'Friend request accepted',
          body: `${acceptorName} accepted your friend request!`,
        },
        data: {
          type: 'friend-request-accepted',
          acceptorUid: toUid,
          acceptorName,
        },
        token: senderData.fcmToken,
      });

      console.log(`✅ Acceptance notification sent to ${fromUid}`);
    } catch (error: any) {
      console.error(`❌ Acceptance notification failed: ${error.message}`);
    }
    return null;
  });

/**
 * Delete a single resource from Cloudinary using signed API.
 */
async function deleteCloudinaryResource(publicId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Create signature for delete
  const params_to_sign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(params_to_sign).digest('hex');

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/raw/upload`;

  // Use URLSearchParams for form body
  const body = new URLSearchParams();
  body.append('public_ids[]', publicId);
  body.append('timestamp', timestamp);
  body.append('api_key', CLOUDINARY_API_KEY);
  body.append('signature', signature);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudinary delete failed (${response.status}): ${errorText}`);
  }
}
