/**
 * Notification Service
 * Handles FCM push notifications, local notifications, and in-app notification storage.
 */

import {
  getMessaging,
  getToken,
  onMessage,
} from 'firebase/messaging';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { getDatabase, ref, set } from 'firebase/database';
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

        await updateDoc(doc(getFirestore(), 'users', uid), {
          fcmToken: token,
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

  listenToUserNotifications(
    uid: string,
    callback: (notifications: any[]) => void
  ) {
    const notificationsRef = collection(
      getFirestore(),
      'users',
      uid,
      'notifications'
    );
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(notifications);
    });

    return unsubscribe;
  },

  async markNotificationAsRead(uid: string, notificationId: string) {
    try {
      await updateDoc(
        doc(getFirestore(), 'users', uid, 'notifications', notificationId),
        { read: true }
      );
    } catch (error: any) {
      console.error('❌ Error marking notification as read:', error.message);
    }
  },
};