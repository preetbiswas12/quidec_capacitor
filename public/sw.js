const CACHE_NAME = 'quidec-v2'
const URLS_TO_CACHE = [
  '/',
  '/manifest.json',
]

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE)
    })
  )
  self.skipWaiting()
})

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) {
    return
  }

  // Skip API requests and Firebase - always network first
  if (request.url.includes('/api/') || request.url.includes('ws') ||
      request.url.includes('googleapis.com') || request.url.includes('firebase')) {
    event.respondWith(fetch(request).catch(() => {
      return new Response('Offline', { status: 503 })
    }))
    return
  }

  // Network-first strategy for HTML pages (always get fresh index.html)
  if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const cache = caches.open(CACHE_NAME)
          cache.then((c) => c.put(request, response.clone()))
        }
        return response
      }).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || new Response('Offline', { status: 503 })
        })
      })
    )
    return
  }

  // Cache first strategy for static assets (JS, CSS, images)
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const cache = caches.open(CACHE_NAME)
          cache.then((c) => c.put(request, response.clone()))
        }
        return response
      }).catch(() => {
        return new Response('Offline', { status: 503 })
      })
    })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Background sync for offline messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_MESSAGES',
          })
        })
      })
    )
  }
})

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: 'quidec-notification',
    requireInteraction: false,
    silent: false,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Quidec', options)
  )
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url === '/' && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/')
      }
    })
  )
})
