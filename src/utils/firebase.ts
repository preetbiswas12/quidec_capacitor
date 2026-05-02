/**
 * Firebase Cloud Messaging Setup
 * Handles push notifications for messages and calls
 */

import { initializeApp } from 'firebase/app';
import { getMessaging, onMessage } from 'firebase/messaging';

let firebaseApp: any = null;
let messaging: any = null;

/**
 * Initialize Firebase
 */
export function initializeFirebase() {
  try {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    if (!firebaseConfig.apiKey) {
      console.warn('⚠️ Firebase credentials not configured in .env');
      return null;
    }

    firebaseApp = initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized');

    return firebaseApp;
  } catch (err) {
    console.error('❌ Firebase initialization failed:', err);
    return null;
  }
}

/**
 * Get Firebase Messaging instance
 */
export function getMessagingInstance() {
  if (!firebaseApp) {
    initializeFirebase();
  }

  if (!messaging && firebaseApp) {
    try {
      messaging = getMessaging(firebaseApp);
    } catch (err) {
      console.error('❌ Failed to get messaging instance:', err);
    }
  }

  return messaging;
}

/**
 * Handle foreground messages
 */
export function setupForegroundMessageHandler(callback: (payload: any) => void) {
  const msg = getMessagingInstance();

  if (!msg) {
    console.warn('⚠️ Messaging not available');
    return;
  }

  onMessage(msg, (payload) => {
    console.log('📬 Foreground message received:', payload);
    
    const notification = payload.notification || {};
    const data = payload.data || {};

    // Show notification in foreground
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title || 'New Message', {
        body: notification.body,
        icon: '/manifest.json',
        data,
      });
    }

    callback(payload);
  });

  console.log('✅ Foreground message handler set up');
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission() {
  try {
    if (!('Notification' in window)) {
      console.warn('⚠️ This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      console.log('✅ Notification permission already granted');
      return true;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Notification permission granted');
      return true;
    } else {
      console.warn('⚠️ Notification permission denied');
      return false;
    }
  } catch (err) {
    console.error('❌ Error requesting notification permission:', err);
    return false;
  }
}

/**
 * Register service worker for background messages
 */
export async function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Workers not supported');
      return false;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('✅ Service Worker registered:', registration);
    return true;
  } catch (err) {
    console.error('❌ Service Worker registration failed:', err);
    return false;
  }
}

/**
 * Get FCM Token (for sending to backend)
 */
export async function getFCMToken() {
  try {
    const msg = getMessagingInstance();

    if (!msg) {
      console.warn('⚠️ Messaging not available for token generation');
      return null;
    }

    // This requires firebase-messaging-sw.js to be registered first
    const permission = await requestNotificationPermission();
    
    if (!permission) {
      console.warn('⚠️ Notification permission not granted, cannot get FCM token');
      return null;
    }

    // In a real app, you would use:
    // const token = await getToken(msg, { vapidKey: 'YOUR_VAPID_KEY' });
    // For now, we'll use the token from service worker
    
    console.log('ℹ️ FCM token generation requires VAPID key configuration');
    return null;
  } catch (err) {
    console.error('❌ Error getting FCM token:', err);
    return null;
  }
}

/**
 * Initialize complete push notification system
 */
export async function initializePushNotifications(onMessageCallback: (payload: any) => void) {
  try {
    console.log('🔔 Initializing push notifications...');

    // Initialize Firebase
    initializeFirebase();

    // Register service worker
    await registerServiceWorker();

    // Request notification permission
    await requestNotificationPermission();

    // Setup foreground message handler
    setupForegroundMessageHandler(onMessageCallback);

    // Get FCM token (optional)
    // const token = await getFCMToken();
    // if (token) {
    //   console.log('FCM Token:', token);
    //   // Send token to backend
    // }

    console.log('✅ Push notifications initialized');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize push notifications:', err);
    return false;
  }
}

export default {
  initializeFirebase,
  getMessagingInstance,
  setupForegroundMessageHandler,
  requestNotificationPermission,
  registerServiceWorker,
  getFCMToken,
  initializePushNotifications,
};
