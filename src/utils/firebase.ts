/**
 * Firebase Setup & Configuration
 * Initializes Firebase services with all required modules:
 * - Authentication (Email/Password, Google, Apple)
 * - Firestore Database
 * - Realtime Database (for presence/typing)
 * - Cloud Storage
 * - Cloud Messaging (Push notifications)
 */

import { initializeApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';
import { getMessaging, Messaging, onMessage } from 'firebase/messaging';

let firebaseApp: any = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let realtimeDatabaseInstance: Database | null = null;
let messagingInstance: Messaging | null = null;

/**
 * Initialize Firebase with all services
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
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    };

    if (!firebaseConfig.apiKey) {
      console.warn('⚠️ Firebase credentials not configured in .env');
      return null;
    }

    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      console.log('✅ Firebase initialized successfully');
    }

    return firebaseApp;
  } catch (err) {
    console.error('❌ Firebase initialization failed:', err);
    return null;
  }
}

/**
 * Get Firebase Auth instance
 */
export function getAuthInstance(): Auth {
  if (!authInstance) {
    initializeFirebase();
    authInstance = getAuth(firebaseApp);
  }
  return authInstance;
}

/**
 * Get Firestore instance
 */
export function getFirestoreInstance(): Firestore {
  if (!firestoreInstance) {
    initializeFirebase();
    firestoreInstance = getFirestore(firebaseApp);
  }
  return firestoreInstance;
}

/**
 * Get Realtime Database instance
 */
export function getRealtimeDatabaseInstance(): Database {
  if (!realtimeDatabaseInstance) {
    initializeFirebase();
    realtimeDatabaseInstance = getDatabase(firebaseApp);
  }
  return realtimeDatabaseInstance;
}

// Export instances for backward compatibility
export const auth = getAuthInstance();
export const db = getFirestoreInstance();
export const realtimeDb = getRealtimeDatabaseInstance();


// ============ CLOUD MESSAGING SERVICES ============

/**
 * Get Firebase Messaging instance
 */
export function getMessagingInstance(): Messaging | null {
  if (!messagingInstance) {
    try {
      initializeFirebase();
      messagingInstance = getMessaging(firebaseApp);
    } catch (err) {
      console.error('❌ Failed to get messaging instance:', err);
      return null;
    }
  }
  return messagingInstance;
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
 * Requires VAPID key to be configured
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const msg = getMessagingInstance();

    if (!msg) {
      console.warn('⚠️ Messaging not available for token generation');
      return null;
    }

    // Import getToken dynamically to avoid circular dependencies
    const { getToken } = await import('firebase/messaging');
    
    const permission = await requestNotificationPermission();
    
    if (!permission) {
      console.warn('⚠️ Notification permission not granted');
      return null;
    }

    const vapidKey = import.meta.env.REACT_APP_VAPID_KEY;
    if (!vapidKey) {
      console.warn('⚠️ VAPID key not configured in .env');
      return null;
    }

    const token = await getToken(msg, { vapidKey });
    console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
    return token;
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

    console.log('✅ Push notifications initialized');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize push notifications:', err);
    return false;
  }
}

export default {
  initializeFirebase,
  getAuthInstance,
  getFirestoreInstance,
  getRealtimeDatabaseInstance,
  getMessagingInstance,
  setupForegroundMessageHandler,
  requestNotificationPermission,
  registerServiceWorker,
  getFCMToken,
  initializePushNotifications,
};
