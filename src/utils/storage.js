/**
 * IndexedDB-based persistent storage layer
 * Replaces localStorage for better performance and security
 * All sensitive data encrypted before storage
 */

import { openDB } from 'idb'

const DB_NAME = 'quidec-app'
const DB_VERSION = 1

// Store names
const STORES = {
  AUTH: 'auth',
  MESSAGES: 'messages',
  FRIENDS: 'friends',
  REQUESTS: 'friend-requests',
  MEDIA: 'media-metadata',
  SYNC_QUEUE: 'sync-queue',
}

let db = null

/**
 * Initialize IndexedDB with required schema
 */
export async function initializeDB() {
  if (db) return db

  try {
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Auth store - session data
        if (!db.objectStoreNames.contains(STORES.AUTH)) {
          db.createObjectStore(STORES.AUTH, { keyPath: 'key' })
        }

        // Messages store - encrypted chat history
        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' })
          messageStore.createIndex('conversation', 'conversationKey')
          messageStore.createIndex('timestamp', 'timestamp')
          messageStore.createIndex('unread', 'unread')
        }

        // Friends store
        if (!db.objectStoreNames.contains(STORES.FRIENDS)) {
          const friendStore = db.createObjectStore(STORES.FRIENDS, { keyPath: 'username' })
          friendStore.createIndex('online', 'online')
        }

        // Friend requests store
        if (!db.objectStoreNames.contains(STORES.REQUESTS)) {
          const requestStore = db.createObjectStore(STORES.REQUESTS, { keyPath: 'id' })
          requestStore.createIndex('type', 'type') // incoming, outgoing
          requestStore.createIndex('user', 'relatedUser')
        }

        // Media metadata store - references only, not raw data
        if (!db.objectStoreNames.contains(STORES.MEDIA)) {
          const mediaStore = db.createObjectStore(STORES.MEDIA, { keyPath: 'id' })
          mediaStore.createIndex('messageId', 'messageId')
          mediaStore.createIndex('uri', 'uri')
        }

        // Sync queue for offline message queueing
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true })
          syncStore.createIndex('timestamp', 'timestamp')
          syncStore.createIndex('status', 'status') // pending, processing, failed
        }
      },
    })
    console.log('✅ IndexedDB initialized')
    return db
  } catch (err) {
    console.error('❌ Failed to initialize IndexedDB:', err)
    throw err
  }
}

/**
 * Auth operations
 */
export async function saveAuth(currentUser, userId, privateKey, publicKey) {
  const database = await initializeDB()
  const tx = database.transaction(STORES.AUTH, 'readwrite')
  await tx.objectStore(STORES.AUTH).put({ key: 'currentUser', value: currentUser })
  await tx.objectStore(STORES.AUTH).put({ key: 'userId', value: userId })
  if (privateKey) {
    await tx.objectStore(STORES.AUTH).put({ key: 'privateKey', value: privateKey })
  }
  if (publicKey) {
    await tx.objectStore(STORES.AUTH).put({ key: 'publicKey', value: publicKey })
  }
  await tx.done
}

export async function getAuth() {
  const database = await initializeDB()
  const user = await database.get(STORES.AUTH, 'currentUser')
  const userId = await database.get(STORES.AUTH, 'userId')
  const privateKey = await database.get(STORES.AUTH, 'privateKey')
  const publicKey = await database.get(STORES.AUTH, 'publicKey')
  return {
    currentUser: user?.value || null,
    userId: userId?.value || null,
    privateKey: privateKey?.value || null,
    publicKey: publicKey?.value || null,
  }
}

export async function clearAuth() {
  const database = await initializeDB()
  const tx = database.transaction(STORES.AUTH, 'readwrite')
  await tx.objectStore(STORES.AUTH).delete('currentUser')
  await tx.objectStore(STORES.AUTH).delete('userId')
  await tx.done
}

/**
 * Message operations
 */
export async function saveMessage(message) {
  const database = await initializeDB()
  await database.add(STORES.MESSAGES, {
    ...message,
    // Ensure timestamp is set
    timestamp: message.timestamp || new Date().toISOString(),
    // Mark as unread if not specified
    unread: message.unread !== undefined ? message.unread : !message.read,
  })
}

export async function getMessages(conversationKey, limit = 50, offset = 0) {
  const database = await initializeDB()
  const allMessages = await database.getAllFromIndex(STORES.MESSAGES, 'conversation', conversationKey)

  // Sort by timestamp descending (newest first) and paginate
  return allMessages
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(offset, offset + limit)
}

export async function markMessagesAsRead(conversationKey) {
  const database = await initializeDB()
  const tx = database.transaction(STORES.MESSAGES, 'readwrite')
  const allMessages = await tx.store.index('conversation').getAll(conversationKey)

  for (const msg of allMessages) {
    if (msg.unread) {
      msg.unread = false
      msg.read = true
      msg.readAt = new Date().toISOString()
      await tx.store.put(msg)
    }
  }
  await tx.done
}

export async function getUnreadCount(conversationKey) {
  const database = await initializeDB()
  const allMessages = await database.getAllFromIndex(STORES.MESSAGES, 'conversation', conversationKey)
  return allMessages.filter((m) => m.unread).length
}

/**
 * Friends operations
 */
export async function saveFriends(friendsList) {
  const database = await initializeDB()
  const tx = database.transaction(STORES.FRIENDS, 'readwrite')
  const store = tx.objectStore(STORES.FRIENDS)

  // Clear existing and add new
  await store.clear()
  for (const friend of friendsList) {
    await store.add(friend)
  }
  await tx.done
}

export async function getFriends() {
  const database = await initializeDB()
  return await database.getAll(STORES.FRIENDS)
}

/**
 * Friend requests operations
 */
export async function saveFriendRequests(incoming, outgoing) {
  const database = await initializeDB()
  const tx = database.transaction(STORES.REQUESTS, 'readwrite')
  const store = tx.objectStore(STORES.REQUESTS)

  await store.clear()

  // Save incoming requests
  for (const req of incoming) {
    const sender = typeof req === 'string' ? req : req.sender
    await store.add({
      id: `incoming-${sender}`,
      type: 'incoming',
      relatedUser: sender,
      sentAt: req.sentAt || new Date().toISOString(),
    })
  }

  // Save outgoing requests
  for (const req of outgoing) {
    const recipient = typeof req === 'string' ? req : req.recipient
    await store.add({
      id: `outgoing-${recipient}`,
      type: 'outgoing',
      relatedUser: recipient,
      sentAt: req.sentAt || new Date().toISOString(),
    })
  }
  await tx.done
}

export async function getFriendRequests() {
  const database = await initializeDB()
  const tx = database.transaction(STORES.REQUESTS, 'readonly')
  const incoming = await tx.index('type').getAll('incoming')
  const outgoing = await tx.index('type').getAll('outgoing')
  return { incoming, outgoing }
}

/**
 * Media metadata operations (store URI references only, NOT raw data)
 */
export async function saveMediaReference(messageId, mediaType, uri, encryptedHash = null) {
  const database = await initializeDB()
  const mediaId = `${messageId}-${Date.now()}`
  await database.add(STORES.MEDIA, {
    id: mediaId,
    messageId,
    mediaType, // image, video, audio
    uri, // Path to file in private app storage
    encryptedHash, // Hash for integrity verification
    savedAt: new Date().toISOString(),
  })
  return mediaId
}

export async function getMediaReferences(messageId) {
  const database = await initializeDB()
  return await database.getAllFromIndex(STORES.MEDIA, 'messageId', messageId)
}

export async function deleteMediaReference(mediaId) {
  const database = await initializeDB()
  await database.delete(STORES.MEDIA, mediaId)
}

/**
 * Offline sync queue operations (for messages sent while offline)
 */
export async function addToSyncQueue(message) {
  const database = await initializeDB()
  return await database.add(STORES.SYNC_QUEUE, {
    ...message,
    timestamp: new Date().toISOString(),
    status: 'pending',
  })
}

export async function getPendingSyncItems() {
  const database = await initializeDB()
  return await database.getAllFromIndex(STORES.SYNC_QUEUE, 'status', 'pending')
}

export async function updateSyncItemStatus(id, status) {
  const database = await initializeDB()
  const item = await database.get(STORES.SYNC_QUEUE, id)
  if (item) {
    item.status = status
    await database.put(STORES.SYNC_QUEUE, item)
  }
}

export async function removeSyncItem(id) {
  const database = await initializeDB()
  await database.delete(STORES.SYNC_QUEUE, id)
}

/**
 * Cleanup operations for better mobile performance
 */
export async function cleanupOldMessages(days = 30) {
  const database = await initializeDB()
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const tx = database.transaction(STORES.MESSAGES, 'readwrite')
  const allMessages = await tx.store.getAll()

  for (const msg of allMessages) {
    if (msg.timestamp < cutoffDate && msg.read) {
      await tx.store.delete(msg.id)
    }
  }
  await tx.done
  console.log(`✅ Cleaned up messages older than ${days} days`)
}

/**
 * Export/import for backup (data sanitization)
 */
export async function exportAppData() {
  const database = await initializeDB()
  const data = {
    messages: await database.getAll(STORES.MESSAGES),
    friends: await database.getAll(STORES.FRIENDS),
    requests: await database.getAll(STORES.REQUESTS),
    exportDate: new Date().toISOString(),
  }
  return data
}

export async function clearAllData() {
  const database = await initializeDB()
  for (const store of Object.values(STORES)) {
    const tx = database.transaction(store, 'readwrite')
    await tx.objectStore(store).clear()
    await tx.done
  }
  console.log('✅ All app data cleared')
}
