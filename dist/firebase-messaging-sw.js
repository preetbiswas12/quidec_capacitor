/**
 * Firebase Messaging Service Worker
 * Handles background push notifications
 * File: web/public/firebase-messaging-sw.js
 */

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
const firebaseConfig = {
  apiKey: 'AIzaSyDRjYVeogF29znhNtSVNm9OvELFalusumc',
  authDomain: 'octate-wee.firebaseapp.com',
  projectId: 'octate-wee',
  storageBucket: 'octate-wee.firebasestorage.app',
  messagingSenderId: '1016231429284',
  appId: '1:1016231429284:web:4118fbe8207adfc8a9d231',
};

firebase.initializeApp(firebaseConfig);

// Get messaging instance
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('📬 Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/manifest.json',
    badge: '/manifest.json',
    tag: 'notification',
    requireInteraction: true,
    data: payload.data || {},
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);

  event.notification.close();

  // Open app or specific URL when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open app
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('❌ Notification closed:', event);
});
