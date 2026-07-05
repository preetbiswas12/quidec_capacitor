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
import { initializeFirestore, Firestore } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';
import { getMessaging, Messaging, onMessage } from 'firebase/messaging';
import logger from './logger';

const EMBEDDED_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDRjYVeogF29znhNtSVNm9OvELFalusumc',
  authDomain: 'octate-wee.firebaseapp.com',
  projectId: 'octate-wee',
  storageBucket: 'octate-wee.firebasestorage.app',
  messagingSenderId: '1016231429284',
  appId: '1:1016231429284:web:4118fbe8207adfc8a9d231',
  databaseURL: 'https://octate-wee-default-rtdb.europe-west1.firebasedatabase.app',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || EMBEDDED_FIREBASE_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || EMBEDDED_FIREBASE_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || EMBEDDED_FIREBASE_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || EMBEDDED_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || EMBEDDED_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || EMBEDDED_FIREBASE_CONFIG.appId,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || EMBEDDED_FIREBASE_CONFIG.databaseURL,
};

export const EMBEDDED_VAPID_KEY =
  import.meta.env.VITE_VAPID_KEY || 'BFZ6KQgsors1kgcaywsjQeeDrq_OD4PHwnRbmk0VjYV_yTlVBnwKfk7fm0prh-9vaRNyiKqEZOh5O_5Yp7DH9bs';

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
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
      logger.warn('Firebase', 'Firebase credentials not configured correctly. Please check your .env file.');
      return null;
    }

    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      logger.info('Firebase', `Firebase initialized for project: ${firebaseConfig.projectId}`);
    }

    return firebaseApp;
  } catch (err) {
    logger.error('Firebase', 'Firebase initialization failed', err);
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
    // Using initializeFirestore with experimentalForceLongPolling to resolve QUIC protocol errors 
    // and connection closed issues frequently seen in browser/web environments.
    firestoreInstance = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    }, 'quidec');
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
      logger.error('Firebase', 'Failed to get messaging instance', err);
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
    logger.warn('Firebase', 'Messaging not available');
    return;
  }

  onMessage(msg, (payload) => {
    logger.info('Firebase', 'Foreground message received', payload);
    
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

  logger.info('Firebase', 'Foreground message handler set up');
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission() {
  try {
    if (!('Notification' in window)) {
      logger.warn('Firebase', 'This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      logger.info('Firebase', 'Notification permission already granted');
      return true;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      logger.info('Firebase', 'Notification permission granted');
      return true;
    } else {
      logger.warn('Firebase', 'Notification permission denied');
      return false;
    }
  } catch (err) {
    logger.error('Firebase', 'Error requesting notification permission', err);
    return false;
  }
}

/**
 * Register service worker for background messages
 */
export async function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Firebase', 'Service Workers not supported');
      return false;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    logger.info('Firebase', 'Service Worker registered', registration);
    return true;
  } catch (err) {
    logger.error('Firebase', 'Service Worker registration failed', err);
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
      logger.warn('Firebase', 'Messaging not available for token generation');
      return null;
    }

    // Import getToken dynamically to avoid circular dependencies
    const { getToken } = await import('firebase/messaging');
    
    const permission = await requestNotificationPermission();
    
    if (!permission) {
      logger.warn('Firebase', 'Notification permission not granted');
      return null;
    }

    const vapidKey = EMBEDDED_VAPID_KEY;
    if (!vapidKey) {
      logger.warn('Firebase', 'VAPID key not configured');
      return null;
    }

    const token = await getToken(msg, { vapidKey });
    logger.info('Firebase', `FCM Token obtained: ${token.substring(0, 20)}...`);
    return token;
  } catch (err) {
    logger.error('Firebase', 'Error getting FCM token', err);
    return null;
  }
}

/**
 * Initialize complete push notification system
 */
export async function initializePushNotifications(onMessageCallback: (payload: any) => void) {
  try {
    logger.info('Firebase', 'Initializing push notifications...');

    // Initialize Firebase
    initializeFirebase();

    // Register service worker
    await registerServiceWorker();

    // Request notification permission
    await requestNotificationPermission();

    // Setup foreground message handler
    setupForegroundMessageHandler(onMessageCallback);

    logger.info('Firebase', 'Push notifications initialized');
    return true;
  } catch (err) {
    logger.error('Firebase', 'Failed to initialize push notifications', err);
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
