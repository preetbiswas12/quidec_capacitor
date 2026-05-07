/**
 * Firebase Cloud Functions
 * Deploy these to Firebase Cloud Functions using Firebase CLI
 * 
 * Functions handle:
 * - Sending push notifications when user receives a message
 * - Sending notifications for friend requests
 * - Monitoring online/offline status changes
 * - Cleanup operations
 * 
 * Deploy with: firebase deploy --only functions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

admin.initializeApp();
const db = admin.firestore();
const messaging = getMessaging();

/**
 * FUNCTION 1: Send notification when message is received
 * Triggered when a new message is added to a conversation
 */
export const onMessageCreated = functions.firestore
  .document('conversations/{conversationId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const { conversationId } = context.params;
    const { fromUid, toUid, content } = message;

    console.log(
      `📬 New message from ${fromUid} to ${toUid}: ${content.substring(0, 50)}...`
    );

    try {
      // Get recipient user data including FCM token
      const recipientDoc = await db.collection('users').doc(toUid).get();
      const recipientData = recipientDoc.data();

      if (!recipientData) {
        console.log(`❌ Recipient ${toUid} not found`);
        return;
      }

      // Get sender name for notification
      const senderDoc = await db.collection('users').doc(fromUid).get();
      const senderData = senderDoc.data();
      const senderName = senderData?.username || 'Unknown';

      // Only send notification if recipient has notifications enabled
      if (!recipientData.notificationsEnabled) {
        console.log(`ℹ️ Notifications disabled for ${toUid}`);
        return;
      }

      // Check if recipient is online
      const presenceSnapshot = await admin
        .database()
        .ref(`presence/${toUid}`)
        .get();
      const isOnline = presenceSnapshot.val()?.online || false;

      // Send notification only if offline or if notifications are priority
      if (!isOnline || recipientData.showNotificationsWhenOnline) {
        const fcmToken = recipientData.fcmToken;

        if (fcmToken) {
          try {
            await messaging.send({
              notification: {
                title: `📨 New message from ${senderName}`,
                body: content.substring(0, 100),
              },
              data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                conversationId,
                fromUid,
                senderName,
                messagePreview: content.substring(0, 50),
              },
              token: fcmToken,
            });

            console.log(`✅ Notification sent to ${toUid}`);
          } catch (error: any) {
            if (error.code === 'messaging/invalid-registration-token') {
              // Remove invalid token
              await db.collection('users').doc(toUid).update({
                fcmToken: admin.firestore.FieldValue.delete(),
              });
              console.log(`🗑️ Removed invalid FCM token for ${toUid}`);
            } else {
              console.error(`❌ Failed to send notification: ${error.message}`);
            }
          }
        } else {
          console.log(`⚠️ No FCM token for user ${toUid}`);
        }
      } else {
        console.log(`ℹ️ User ${toUid} is online, notification not sent`);
      }
    } catch (error: any) {
      console.error(`❌ Error in onMessageCreated: ${error.message}`);
    }
  });

/**
 * FUNCTION 2: Send notification for incoming friend requests
 * Triggered when a new friend request is created
 */
export const onFriendRequestCreated = functions.firestore
  .document('friendRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data();
    const { fromUid, toUid } = request;

    console.log(`👥 Friend request from ${fromUid} to ${toUid}`);

    try {
      // Get recipient user data
      const recipientDoc = await db.collection('users').doc(toUid).get();
      const recipientData = recipientDoc.data();

      if (!recipientData) {
        return;
      }

      // Get sender name
      const senderDoc = await db.collection('users').doc(fromUid).get();
      const senderData = senderDoc.data();
      const senderName = senderData?.username || 'Unknown';

      // Save notification to user's notifications subcollection
      const notificationId = `${Date.now()}_${Math.random()}`;
      await db
        .collection('users')
        .doc(toUid)
        .collection('notifications')
        .doc(notificationId)
        .set({
          type: 'friend-request',
          from: fromUid,
          fromName: senderName,
          message: `${senderName} sent you a friend request`,
          read: false,
          createdAt: admin.firestore.Timestamp.now(),
          requestId: snap.id,
        });

      console.log(`✅ Friend request notification created for ${toUid}`);

      // Send FCM notification if user has token
      if (recipientData.fcmToken) {
        try {
          await messaging.send({
            notification: {
              title: `👥 Friend request from ${senderName}`,
              body: `${senderName} sent you a friend request`,
            },
            data: {
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
              type: 'friend-request',
              from: fromUid,
              senderName,
              requestId: snap.id,
            },
            token: recipientData.fcmToken,
          });

          console.log(
            `✅ Friend request FCM notification sent to ${toUid}`
          );
        } catch (error: any) {
          console.error(
            `❌ Failed to send friend request notification: ${error.message}`
          );
        }
      }
    } catch (error: any) {
      console.error(`❌ Error in onFriendRequestCreated: ${error.message}`);
    }
  });

/**
 * FUNCTION 3: Monitor online status changes
 * Triggered when user presence changes in Realtime Database
 */
export const onUserPresenceChanged = functions.database
  .ref('presence/{uid}')
  .onWrite(async (change, context) => {
    const { uid } = context.params;
    const presenceData = change.after.val();

    if (!presenceData) {
      return;
    }

    const { online, username } = presenceData;

    console.log(`👤 User ${username} is ${online ? 'online' : 'offline'}`);

    try {
      // Update Firestore user document
      await db.collection('users').doc(uid).update({
        isOnline: online,
        lastSeen: admin.firestore.Timestamp.now(),
      });

      // Broadcast status to user's friends
      const friendshipDoc = await db.collection('friendships').doc(uid).get();
      const friends = friendshipDoc.data()?.friends || [];

      for (const friendUid of friends) {
        // Save status update to friend's notifications
        const statusNotificationId = `status_${Date.now()}`;
        await db
          .collection('users')
          .doc(friendUid)
          .collection('notifications')
          .doc(statusNotificationId)
          .set({
            type: 'user-status-change',
            user: uid,
            userName: username,
            online,
            createdAt: admin.firestore.Timestamp.now(),
          });
      }

      console.log(`✅ Updated presence for ${username}`);
    } catch (error: any) {
      console.error(`❌ Error in onUserPresenceChanged: ${error.message}`);
    }
  });

/**
 * FUNCTION 4: Clean up old messages (older than 90 days)
 * Scheduled to run daily
 */
export const cleanupOldMessages = functions.pubsub
  .schedule('every day 02:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🗑️ Starting cleanup of old messages...');

    try {
      const ninetyDaysAgo = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000
      );

      // Get all conversations
      const conversationsSnapshot = await db
        .collection('conversations')
        .get();

      let messagesDeleted = 0;

      for (const conversationDoc of conversationsSnapshot.docs) {
        // Query old messages
        const oldMessagesSnapshot = await conversationDoc.ref
          .collection('messages')
          .where('timestamp', '<', ninetyDaysAgo)
          .get();

        // Delete old messages
        const batch = db.batch();
        oldMessagesSnapshot.forEach((messageDoc) => {
          batch.delete(messageDoc.ref);
          messagesDeleted++;
        });

        await batch.commit();
      }

      console.log(
        `✅ Cleanup complete. Deleted ${messagesDeleted} old messages`
      );
      return null;
    } catch (error: any) {
      console.error(`❌ Error in cleanupOldMessages: ${error.message}`);
      return null;
    }
  });

/**
 * FUNCTION 5: Send friend request accepted notification
 * Triggered when friend request is accepted
 */
export const onFriendRequestAccepted = functions.firestore
  .document('friendRequests/{requestId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Only trigger if status changed to accepted
    if (beforeData.status === 'accepted' || afterData.status !== 'accepted') {
      return;
    }

    const { fromUid, toUid } = afterData;

    console.log(`✅ Friend request accepted: ${fromUid} <-> ${toUid}`);

    try {
      // Notify the sender
      const senderDoc = await db.collection('users').doc(fromUid).get();
      const senderData = senderDoc.data();

      // Get acceptor name
      const acceptorDoc = await db.collection('users').doc(toUid).get();
      const acceptorData = acceptorDoc.data();
      const acceptorName = acceptorData?.username || 'Unknown';

      if (senderData?.fcmToken) {
        await messaging.send({
          notification: {
            title: `✅ Friend request accepted`,
            body: `${acceptorName} accepted your friend request!`,
          },
          data: {
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            type: 'friend-request-accepted',
            acceptorUid: toUid,
            acceptorName,
          },
          token: senderData.fcmToken,
        });

        console.log(`✅ Acceptance notification sent to ${fromUid}`);
      }
    } catch (error: any) {
      console.error(
        `❌ Error in onFriendRequestAccepted: ${error.message}`
      );
    }
  });

/**
 * FUNCTION 6: Delete user data when account is deleted from Authentication
 * Triggered when user is deleted from Firebase Authentication
 */
export const onUserDeleted = functions.auth
  .user()
  .onDelete(async (user) => {
    const uid = user.uid;

    console.log(`🗑️ Deleting data for user ${uid}...`);

    try {
      const batch = db.batch();

      // Delete user document
      batch.delete(db.collection('users').doc(uid));

      // Delete friendships
      batch.delete(db.collection('friendships').doc(uid));

      // Delete friend requests sent by user
      const sentRequests = await db
        .collection('friendRequests')
        .where('fromUid', '==', uid)
        .get();
      sentRequests.forEach((doc) => batch.delete(doc.ref));

      // Delete friend requests sent to user
      const receivedRequests = await db
        .collection('friendRequests')
        .where('toUid', '==', uid)
        .get();
      receivedRequests.forEach((doc) => batch.delete(doc.ref));

      await batch.commit();

      // Delete from Realtime Database
      await admin.database().ref(`presence/${uid}`).remove();

      console.log(`✅ User data deleted for ${uid}`);
      return null;
    } catch (error: any) {
      console.error(`❌ Error in onUserDeleted: ${error.message}`);
      return null;
    }
  });
