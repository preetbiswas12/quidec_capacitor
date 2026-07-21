const CACHE_NAME = 'veill-v2'
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

  // Stale-while-revalidate for API requests
  if (request.url.includes('/api/') || request.url.includes('googleapis.com') || request.url.includes('firebase')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetched = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone())
            }
            return response
          }).catch(() => {
            return cached || new Response('Offline', { status: 503 })
          })
          return cached || fetched
        })
      })
    )
    return
  }

  // Skip WebSocket requests - always network
  if (request.url.includes('ws')) {
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

// Push notifications — handle both data and notification FCM payload formats
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  // FCM notification payloads nest under data.notification; data payloads are flat
  const notification = data.notification || {}
  const title = data.title || notification.title || 'Veill'
  const body = data.body || notification.body || ''
  const senderName = data.fromName || data.senderName || ''
  const chatId = data.chatId || data.conversationId || ''
  const type = data.type || 'message'

  const options = {
    body: body || (senderName ? `${senderName} sent a message` : ''),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: chatId ? `veill-${chatId}` : 'veill-notification',
    requireInteraction: false,
    silent: false,
    data: { chatId, senderName, type },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Handle notification clicks — navigate to conversation if available
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const chatId = event.notification.data?.chatId || ''

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if (chatId) {
            client.postMessage({ type: 'OPEN_CONVERSATION', chatId })
          }
          return
        }
      }
      // Open new window and navigate to conversation
      const url = chatId ? `/?chat=${chatId}` : '/'
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
