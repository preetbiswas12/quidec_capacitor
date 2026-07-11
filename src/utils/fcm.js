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
 * Each step is isolated so a failure in one doesn't prevent the others.
 */
export async function initializePushNotifications(userId, key) {
  if (Capacitor.getPlatform() === 'web') {
    console.log('🌐 Web platform: push handled by service worker');
    return;
  }
  encryptionKey = key;

  // Step 1: Request permissions via PushNotifications API
  // On Android 13+ (API 33+), POST_NOTIFICATIONS is handled by the safe
  // LocalNotifications path in notificationSettingsManager.ts — skip here
  // to avoid the known crash (see permissionManager.ts).
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    const apiLevel = info.androidSDKVersion || 0;
    if (apiLevel >= 33) {
      console.log('📱 Android 13+: notification permission handled by LocalNotifications API');
    } else {
      await PushNotifications.requestPermissions();
      console.log('✅ Push notification permissions requested');
    }
  } catch (err) {
    console.warn('⚠️ Push notification permission request failed:', err);
  }

  // Step 2: Register for push (safe — may fail if permissions denied)
  try {
    await PushNotifications.register();
    console.log('✅ Push notifications register called');
  } catch (err) {
    console.warn('⚠️ Push notification register failed:', err);
  }

  // Step 3: Listen for registration token
  try {
    PushNotifications.addListener('registration', (token) => {
      console.log('✅ FCM Registration token:', token.value);
      sendTokenToBackend(userId, token.value);
    });
  } catch (err) {
    console.warn('⚠️ Failed to add registration listener:', err);
  }

  // Step 4: Listen for registration errors
  try {
    PushNotifications.addListener('registrationError', (error) => {
      console.error('❌ FCM Registration error:', error.error);
    });
  } catch (err) {
    console.warn('⚠️ Failed to add registration error listener:', err);
  }

  // Step 5: Listen for foreground notifications
  try {
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📬 Notification received in foreground:', notification);
      handleIncomingNotification(notification);
    });
  } catch (err) {
    console.warn('⚠️ Failed to add foreground notification listener:', err);
  }

  // Step 6: Listen for notification tap actions
  try {
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('🔔 Notification tapped:', notification);
      handleNotificationAction(notification);
    });
  } catch (err) {
    console.warn('⚠️ Failed to add notification action listener:', err);
  }

  console.log('✅ Push notifications initialization complete');
}

/**
 * Send FCM token to Firestore (saved by login flow in firebaseServices.ts)
 * Kept here for native-specific token updates
 */
async function sendTokenToBackend(userId, fcmToken) {
  try {
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    let fields = { fcmToken: fcmToken, updatedAt: serverTimestamp() };
    try {
      const { encryptUserData } = await import('./e2ee');
      const enc = await encryptUserData(userId, { fcmToken });
      // Only replace with encrypted fields if vault encryption actually succeeded
      // (encryptUserData returns original fields as-is when vault key fails)
      if (enc.fcmToken_enc) {
        fields = { ...fields, ...enc };
        delete fields.fcmToken;
      }
    } catch { /* vault key not ready yet — keep plaintext fcmToken */ }
    await setDoc(doc(db, 'users', userId), fields, { merge: true });
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
      smallIcon: 'ic_stat_quidec_logo',
      sound: true,
      vibrate: [200],
      extra: data,
    }],
  });

  // Increment app icon badge
  try {
    const { setAppBadge } = await import('./services/notificationService');
    // Badge is managed by AppContext via setAppBadge on chats state change.
    // Here we just ensure it's set for native foreground scenarios.
    const { Badge } = await import('@capawesome/capacitor-badge');
    const current = await Badge.getBadge();
    await Badge.setBadge({ count: (current.count || 0) + 1 });
  } catch { /* non-critical, badge managed by AppContext */ }
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
        smallIcon: 'ic_stat_quidec_logo',
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
