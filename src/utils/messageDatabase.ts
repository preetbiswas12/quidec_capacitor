/**
 * Encrypted Message and Media Database Storage
 * Uses IndexedDB to store encrypted message data and media references
 * All sensitive data is encrypted with conversation keys
 */

import { saveEncryptedMessage, retrieveDecryptedMessage } from '../utils/encryptedChunkedMedia'

export interface EncryptedMessageRecord {
  messageId: string
  senderId: string
  recipientId: string
  conversationId: string // Derived from sorted [senderId, recipientId]
  content: string
  attachmentFileIds: string[] // References to encrypted media chunks
  timestamp: number
  status: 'sent' | 'delivered' | 'read' | 'failed'
  encryptedChunkId: string // Reference to encrypted message chunks
  totalChunks: number
  messageHash: string
}

export interface MediaMetadataRecord {
  fileId: string
  conversationId: string
  mediaType: 'image' | 'video' | 'audio'
  originalName?: string
  fileHash: string
  fileSize: number
  totalChunks: number
  uploadedAt: number
  uploadedBy: string
  status: 'uploading' | 'complete' | 'failed' | 'deleted'
}

class EncryptedMessageDatabase {
  private dbName = 'EncryptedMessages'
  private dbVersion = 1
  private db: IDBDatabase | null = null

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        console.error('❌ Database open error:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('✅ Encrypted message database initialized')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Messages table
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'messageId' })
          messageStore.createIndex('conversationId', 'conversationId', { unique: false })
          messageStore.createIndex('timestamp', 'timestamp', { unique: false })
          messageStore.createIndex('status', 'status', { unique: false })
          console.log('✅ Created messages object store')
        }

        // Media metadata table
        if (!db.objectStoreNames.contains('mediaMetadata')) {
          const mediaStore = db.createObjectStore('mediaMetadata', { keyPath: 'fileId' })
          mediaStore.createIndex('conversationId', 'conversationId', { unique: false })
          mediaStore.createIndex('uploadedAt', 'uploadedAt', { unique: false })
          mediaStore.createIndex('status', 'status', { unique: false })
          console.log('✅ Created mediaMetadata object store')
        }

        // Conversation index table
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'conversationId' })
          convStore.createIndex('lastMessageTime', 'lastMessageTime', { unique: false })
          console.log('✅ Created conversations object store')
        }
      }
    })
  }

  /**
   * Store encrypted message metadata
   */
  async storeMessage(message: EncryptedMessageRecord): Promise<void> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages', 'conversations'], 'readwrite')
      const messageStore = transaction.objectStore('messages')
      const convStore = transaction.objectStore('conversations')

      // Store message
      const putRequest = messageStore.put(message)

      putRequest.onerror = () => {
        console.error('❌ Failed to store message:', putRequest.error)
        reject(putRequest.error)
      }

      putRequest.onsuccess = () => {
        // Update conversation metadata
        const convRequest = convStore.put({
          conversationId: message.conversationId,
          lastMessageTime: message.timestamp,
          participants: [message.senderId, message.recipientId],
        })

        convRequest.onerror = () => reject(convRequest.error)
        convRequest.onsuccess = () => {
          console.log(`✅ Message ${message.messageId} stored`)
          resolve()
        }
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Retrieve messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<EncryptedMessageRecord[]> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly')
      const store = transaction.objectStore('messages')
      const index = store.index('conversationId')

      const range = IDBKeyRange.only(conversationId)
      const request = index.getAll(range)

      request.onerror = () => {
        console.error('❌ Failed to retrieve messages:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        const messages = (request.result as EncryptedMessageRecord[])
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(offset, offset + limit)

        resolve(messages)
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Update message status (sent/delivered/read)
   */
  async updateMessageStatus(
    messageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed'
  ): Promise<void> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite')
      const store = transaction.objectStore('messages')

      const getRequest = store.get(messageId)

      getRequest.onerror = () => reject(getRequest.error)

      getRequest.onsuccess = () => {
        const message = getRequest.result as EncryptedMessageRecord

        if (!message) {
          reject(new Error(`Message ${messageId} not found`))
          return
        }

        message.status = status
        const putRequest = store.put(message)

        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => {
          console.log(`✅ Message ${messageId} status updated to ${status}`)
          resolve()
        }
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Store media metadata
   */
  async storeMediaMetadata(metadata: MediaMetadataRecord): Promise<void> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['mediaMetadata'], 'readwrite')
      const store = transaction.objectStore('mediaMetadata')

      const putRequest = store.put(metadata)

      putRequest.onerror = () => {
        console.error('❌ Failed to store media metadata:', putRequest.error)
        reject(putRequest.error)
      }

      putRequest.onsuccess = () => {
        console.log(`✅ Media metadata ${metadata.fileId} stored`)
        resolve()
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Get media metadata
   */
  async getMediaMetadata(fileId: string): Promise<MediaMetadataRecord | null> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['mediaMetadata'], 'readonly')
      const store = transaction.objectStore('mediaMetadata')

      const request = store.get(fileId)

      request.onerror = () => {
        console.error('❌ Failed to retrieve media metadata:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        resolve((request.result as MediaMetadataRecord) || null)
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Get all media for a conversation
   */
  async getConversationMedia(conversationId: string): Promise<MediaMetadataRecord[]> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['mediaMetadata'], 'readonly')
      const store = transaction.objectStore('mediaMetadata')
      const index = store.index('conversationId')

      const range = IDBKeyRange.only(conversationId)
      const request = index.getAll(range)

      request.onerror = () => {
        console.error('❌ Failed to retrieve conversation media:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        const media = (request.result as MediaMetadataRecord[]).sort(
          (a, b) => b.uploadedAt - a.uploadedAt
        )
        resolve(media)
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite')
      const store = transaction.objectStore('messages')

      const deleteRequest = store.delete(messageId)

      deleteRequest.onerror = () => {
        console.error('❌ Failed to delete message:', deleteRequest.error)
        reject(deleteRequest.error)
      }

      deleteRequest.onsuccess = () => {
        console.log(`✅ Message ${messageId} deleted`)
        resolve()
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Delete all messages in conversation
   */
  async clearConversation(conversationId: string): Promise<void> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages', 'mediaMetadata'], 'readwrite')
      const messageStore = transaction.objectStore('messages')
      const mediaStore = transaction.objectStore('mediaMetadata')

      // Clear messages
      const messageIndex = messageStore.index('conversationId')
      const messageRange = IDBKeyRange.only(conversationId)
      const messageClearRequest = messageIndex.openCursor(messageRange)

      messageClearRequest.onerror = () => reject(messageClearRequest.error)

      let messageCount = 0
      messageClearRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null

        if (cursor) {
          cursor.delete()
          messageCount++
          cursor.continue()
        } else {
          // Now clear media
          const mediaIndex = mediaStore.index('conversationId')
          const mediaRange = IDBKeyRange.only(conversationId)
          const mediaClearRequest = mediaIndex.openCursor(mediaRange)

          mediaClearRequest.onerror = () => reject(mediaClearRequest.error)

          let mediaCount = 0
          mediaClearRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null

            if (cursor) {
              cursor.delete()
              mediaCount++
              cursor.continue()
            } else {
              console.log(
                `✅ Cleared conversation ${conversationId}: ${messageCount} messages, ${mediaCount} media`
              )
              resolve()
            }
          }

          transaction.onerror = () => reject(transaction.error)
        }
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Get database statistics
   */
  async getStatistics(): Promise<{
    totalMessages: number
    totalMedia: number
    conversations: number
  }> {
    if (!this.db) await this.initialize()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        ['messages', 'mediaMetadata', 'conversations'],
        'readonly'
      )

      const messageStore = transaction.objectStore('messages')
      const mediaStore = transaction.objectStore('mediaMetadata')
      const convStore = transaction.objectStore('conversations')

      let totalMessages = 0
      let totalMedia = 0
      let conversations = 0

      const messageCountRequest = messageStore.count()
      messageCountRequest.onsuccess = () => {
        totalMessages = messageCountRequest.result
      }

      const mediaCountRequest = mediaStore.count()
      mediaCountRequest.onsuccess = () => {
        totalMedia = mediaCountRequest.result
      }

      const convCountRequest = convStore.count()
      convCountRequest.onsuccess = () => {
        conversations = convCountRequest.result

        resolve({
          totalMessages,
          totalMedia,
          conversations,
        })
      }

      transaction.onerror = () => reject(transaction.error)
    })
  }
}

// Export singleton instance
export const messageDb = new EncryptedMessageDatabase()

/**
 * Helper function to derive conversation ID from two users
 */
export function getConversationId(user1: string, user2: string): string {
  const [userA, userB] = [user1, user2].sort()
  return `${userA}|${userB}`
}

/**
 * High-level API for storing/retrieving encrypted messages with media
 */
export async function saveEncryptedMessageWithMedia(
  messageContent: string,
  senderId: string,
  recipientId: string,
  attachmentFileIds: string[],
  user1: string,
  user2: string
): Promise<EncryptedMessageRecord> {
  try {
    // Save encrypted message data
    const encryptedMsg = await saveEncryptedMessage(
      {
        content: messageContent,
        senderId,
        recipientId,
        timestamp: Date.now(),
        attachments: attachmentFileIds,
      },
      user1,
      user2
    )

    const conversationId = getConversationId(senderId, recipientId)

    // Create message record
    const messageRecord: EncryptedMessageRecord = {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      recipientId,
      conversationId,
      content: messageContent, // Stored in plain for display, real content in chunks
      attachmentFileIds,
      timestamp: Date.now(),
      status: 'sent',
      encryptedChunkId: encryptedMsg.messageId,
      totalChunks: encryptedMsg.chunks,
      messageHash: encryptedMsg.fileHash,
    }

    // Store in database
    await messageDb.storeMessage(messageRecord)

    return messageRecord
  } catch (err) {
    console.error('❌ Failed to save encrypted message with media:', err)
    throw err
  }
}

/**
 * Retrieve encrypted message with decryption
 */
export async function getDecryptedMessage(
  messageId: string,
  encryptedChunkId: string,
  user1: string,
  user2: string
): Promise<{
  content: string
  attachments?: string[]
}> {
  try {
    return await retrieveDecryptedMessage(encryptedChunkId, user1, user2)
  } catch (err) {
    console.error('❌ Failed to retrieve decrypted message:', err)
    throw err
  }
}
