/**
 * Firebase Messaging Service Worker
 * Handles background push notifications for Veill.
 *
 * The Render relay sends FCM with both `notification` (for display) and `data` (for app logic).
 * This service worker shows the notification and handles click-to-open.
 */

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: 'AIzaSyDRjYVeogF29znhNtSVNm9OvELFalusumc',
  authDomain: 'octate-wee.firebaseapp.com',
  projectId: 'octate-wee',
  storageBucket: 'octate-wee.firebasestorage.app',
  messagingSenderId: '1016231429284',
  appId: '1:1016231429284:web:4118fbe8207adfc8a9d231',
  databaseURL: 'https://octate-wee-default-rtdb.europe-west1.firebasedatabase.app',
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ─── Background Messages ─────────────────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  // Use the notification payload from FCM (sent by Render relay)
  // The relay sends: notification.title = senderName, notification.body = "Preet sent a Video"
  const title = payload.notification?.title || 'New Message';
  const body = payload.notification?.body || 'You have a new message';

  const notificationOptions = {
    body,
    icon: '/manifest.json',
    badge: '/manifest.json',
    tag: 'veill-message',
    requireInteraction: true,
    data: payload.data || {},  // { type: "new_video", fromName: "Preet" }
  };

  return self.registration.showNotification(title, notificationOptions);
});

// ─── Notification Click ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const data = event.notification.data || {};
  const conversationId = data.conversationId || data.groupId || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'OPEN_CONVERSATION', conversationId });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        const url = conversationId ? `${self.location.origin}/?chat=${conversationId}` : self.location.origin;
        return clients.openWindow(url);
      }
    })
  );
});
