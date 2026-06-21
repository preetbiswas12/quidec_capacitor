/**
 * Firebase Cloud Messaging (FCM) integration
 * Handles push notifications for incoming messages and calls.
 *
 * Flow:
 * 1. Sender writes to RTDB → calls Render /notify → Render sends FCM
 * 2. Recipient's device receives FCM (foreground or background)
 * 3. On tap: app opens, RTDB listener reconnects, drains delivery pipe
 *
 * Privacy: FCM payload contains ONLY sender name + message type.
 * Actual message content travels exclusively through RTDB delivery pipe.
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { decryptMessage } from './encryption';

let encryptionKey = null;
let notificationsEnabled = true;
let onMessageCallback = null;  // Set by AppContext to trigger RTDB pipe drain

/**
 * Set callback that fires when a message notification is received.
 * Used by AppContext to trigger RTDB reconnection + pipe drain.
 */
export function setOnMessageCallback(cb) {
  onMessageCallback = cb;
}

/**
 * Enable or disable all notifications (Mute)
 */
export function setNotificationsEnabled(enabled) {
  notificationsEnabled = enabled;
  console.log(`🔔 Notifications ${enabled ? 'enabled' : 'MUTED'}`);
}

/**
 * Initialize push notifications
 */
export async function initializePushNotifications(userId, key) {
  if (Capacitor.getPlatform() === 'web') {
    console.log('🌐 Web platform: push handled by service worker');
    return;
  }
  try {
    encryptionKey = key;

    await PushNotifications.requestPermissions();
    await PushNotifications.register();

    PushNotifications.addListener('registration', (token) => {
      console.log('✅ FCM Registration token:', token.value);
      sendTokenToBackend(userId, token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('❌ FCM Registration error:', error.error);
    });

    // Foreground notification received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📬 Notification received in foreground:', notification);
      handleIncomingNotification(notification);
    });

    // User tapped notification
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('🔔 Notification tapped:', notification);
      handleNotificationAction(notification);
    });

    console.log('✅ Push notifications initialized');
  } catch (err) {
    console.error('❌ Push notifications init failed:', err);
  }
}

/**
 * Send FCM token to Firestore (saved by login flow in firebaseServices.ts)
 * Kept here for native-specific token updates
 */
async function sendTokenToBackend(userId, fcmToken) {
  try {
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    await setDoc(doc(db, 'users', userId), {
      fcmToken: fcmToken,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log('✅ FCM token saved to Firestore');
  } catch (err) {
    console.error('❌ Error saving FCM token:', err);
  }
}

/**
 * Handle incoming FCM notification (foreground)
 * Shows local notification + triggers RTDB pipe drain
 */
async function handleIncomingNotification(notification) {
  if (!notificationsEnabled) {
    console.log('🔇 Notification suppressed (Mute is ON)');
    return;
  }

  const data = notification.data || {};
  const type = data.type || 'new_text';
  const fromName = data.fromName || 'Someone';

  // Trigger RTDB pipe drain — this is the critical wake-up step
  if (onMessageCallback) {
    onMessageCallback(type, fromName);
  }

  // Show local notification
  const typeLabels = {
    new_text: 'sent a message',
    new_image: 'sent an Image',
    new_video: 'sent a Video',
    new_audio: 'sent a Voice message',
  };
  const body = `${fromName} ${typeLabels[type] || 'sent a message'}`;

  await LocalNotifications.schedule({
    notifications: [{
      id: Date.now() % 100000,
      title: fromName,
      body,
      smallIcon: 'ic_launcher',
      sound: true,
      vibrate: [200],
      extra: data,
    }],
  });
}

/**
 * Handle notification tap (background → foreground transition)
 * Triggers RTDB pipe drain so messages are picked up
 */
function handleNotificationAction(notification) {
  const data = notification.notification?.data || notification.data || {};

  // Trigger RTDB pipe drain
  if (onMessageCallback) {
    onMessageCallback(data.type || 'new_text', data.fromName || 'Someone');
  }

  // Handle call actions
  if (data.actionTypeId === 'call-action') {
    const actionId = notification.actionId;
    if (actionId === 'accept') {
      window.dispatchEvent(new CustomEvent('acceptCall', { detail: { from: data?.from } }));
    } else if (actionId === 'reject') {
      window.dispatchEvent(new CustomEvent('rejectCall', { detail: { from: data?.from } }));
    }
  }
}

/**
 * Show generic local notification
 */
export async function showLocalNotification(title, body, notificationId = null) {
  if (!notificationsEnabled) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: notificationId || (Date.now() % 100000),
        title,
        body,
        smallIcon: 'ic_launcher',
      }],
    });
  } catch (err) {
    console.error('❌ Failed to show notification:', err);
  }
}

/**
 * Configure local notification actions (call accept/reject)
 */
export async function setupNotificationActions() {
  if (Capacitor.getPlatform() === 'web') return;
  try {
    await LocalNotifications.createActionGroup({
      id: 'call-action',
      actions: [
        { id: 'accept', title: 'Accept', foreground: true },
        { id: 'reject', title: 'Reject', foreground: false },
      ],
    });
    console.log('✅ Notification actions configured');
  } catch (err) {
    console.error('❌ Failed to setup notification actions:', err);
  }
}
