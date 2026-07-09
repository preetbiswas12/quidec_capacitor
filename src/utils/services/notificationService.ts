/**
 * Notification Service
 * Handles FCM push notifications, local notifications, and app icon badge.
 */

import {
  getMessaging,
  getToken,
  onMessage,
} from 'firebase/messaging';
import {
  doc,
  updateDoc,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { encryptUserData } from '../e2ee';
import { db, realtimeDb, getFCMToken, EMBEDDED_VAPID_KEY } from '../firebase';

export const notificationService = {
  async requestFCMPermission(uid: string) {
    try {
      const messaging = getMessaging();
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: EMBEDDED_VAPID_KEY,
        });

        const enc = await encryptUserData(uid, { fcmToken: token }).catch(() => ({}));
        await updateDoc(doc(db, 'users', uid), {
          ...enc,
          notificationsEnabled: true,
        });

        console.log(`✅ FCM token obtained and saved`);
        return token;
      } else {
        console.log('⚠️ Notification permission denied');
        return null;
      }
    } catch (error: any) {
      console.error('❌ Error requesting FCM permission:', error.message);
      return null;
    }
  },

  listenToNotifications(
    callback: (notification: Record<string, any>) => void
  ) {
    try {
      const messaging = getMessaging();
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('📬 Foreground notification received:', payload);
        callback({
          title: payload.notification?.title,
          body: payload.notification?.body,
          data: payload.data,
        });
      });
      return unsubscribe;
    } catch (error: any) {
      console.error('❌ Error listening to notifications:', error.message);
      return () => {};
    }
  },

  async sendLocalNotification(
    title: string,
    options?: NotificationOptions
  ) {
    if ('Notification' in window && Notification.permission === 'granted') {
      return new Notification(title, options);
    }
  },
};

/**
 * App icon badge utilities using @capawesome/capacitor-badge.
 * Shows the OS-native red circle with number on the app icon.
 */
let Badge: any = null;

async function getBadgePlugin() {
  if (Badge) return Badge;
  if (Capacitor.getPlatform() === 'web') return null;
  try {
    const mod = await import('@capawesome/capacitor-badge');
    Badge = mod.Badge;
    return Badge;
  } catch {
    return null;
  }
}

export async function setAppBadge(count: number) {
  const plugin = await getBadgePlugin();
  if (!plugin) return;
  try {
    if (count > 0) {
      await plugin.setBadge({ count });
    } else {
      await plugin.clear();
    }
  } catch { /* non-critical */ }
}

export async function clearAppBadge() {
  const plugin = await getBadgePlugin();
  if (!plugin) return;
  try {
    await plugin.clear();
  } catch { /* non-critical */ }
}
