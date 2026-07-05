/**
 * Message Service
 * Handles all message-related operations including encryption, storage, and delivery.
 *
 * Importers/Callers: AppContext, ChatWindow component, messageStore
 * Affected APIs: recordMessage, sendMessage, handleIncomingMessage, markMessageDelivered, markMessageRead
 * Data schemas: StoredMessage, MESSAGE_STATUS, delivery/receipt RTDB structures
 */

import {
  MESSAGE_STATUS,
  sanitizePathComponent,
} from './shared';
import {
  appendMessage,
  loadMessages as loadLocalMessages,
  listLocalChatIds,
  StoredMessage,
} from '../sqliteMessageStore';
import { messageQueue } from '../persistentMessageQueue';
import logger from '../logger';
import { db, realtimeDb } from '../firebase';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  runTransaction,
} from 'firebase/firestore';
import { ref, set, onChildAdded, remove, get } from 'firebase/database';
import { encryptMessage, decryptMessage, decryptMessageWithHistoricalKeys, getConversationKey, deriveSigningKey, signMessage, verifySignature } from '../encryption';
import { uploadMediaWithProgress } from '../mediaUploadHandler';
import { presenceService } from './presenceService';
import { idbPaginator } from '../idbPaginator';

// Helper to generate conversation ID consistently for both directions
const getConversationId = (uid1: string, uid2: string) => {
  return [uid1, uid2].sort().join('_');
};

export const messageService = {
  /**
   * Persist a message record in Firestore without transport side-effects.
   * Used by both outgoing sends and any legacy inbound message bridges.
   */
  async recordMessage(
    fromUid: string,
    toUid: string,
    content: string,
    options: {
      mediaUrl?: string | null;
      messageType?: string;
      messageId?: string;
      timestamp?: any;
      status?: string;
      replyToId?: string;
      replyToContent?: string;
      replyToSender?: string;
      expiresAt?: number;
    } = {}
  ) {
    const startTime = Date.now();
    const conversationId = getConversationId(fromUid, toUid);
    const messageId = options.messageId || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      logger.info('recordMessage', `Recording message from ${fromUid} to ${toUid}`);

      // E2E Encryption: Encrypt content if it's a text message
      let encryptedContent = content;
      let hmacSignature: string | null = null;
      try {
        const convKey = await getConversationKey(fromUid, toUid);

        // Sign the message content before encryption (HMAC authentication)
        try {
          const signingKey = await deriveSigningKey(`${fromUid}:${toUid}`);
          hmacSignature = await signMessage({ content, fromUid, toUid, messageId }, signingKey);
        } catch (signErr) {
          logger.warn('recordMessage', `HMAC signing failed: ${signErr}`);
        }

        encryptedContent = await encryptMessage(content, convKey);
      } catch (encErr) {
        throw new Error(`Encryption failed — cannot send unencrypted message: ${encErr}`);
      }

      const messageData = {
        messageId,
        fromUid,
        toUid,
        content: encryptedContent, // Store encrypted
        hmac: hmacSignature, // HMAC signature for integrity verification
        mediaUrl: options.mediaUrl || null,
        messageType: options.messageType || 'text',
        timestamp: options.timestamp || serverTimestamp(),
        status: options.status || MESSAGE_STATUS.SENT,
        deliveredAt: null,
        readAt: null,
        typing: false,
        isEncrypted: true,
        replyToId: options.replyToId || null,
        replyToContent: options.replyToContent || null,
        replyToSender: options.replyToSender || null,
      };

      // TRANSIENT DELIVERY PIPE (Zero Persistence)
      // Messages stored temporarily in RTDB only for delivery - IMMEDIATELY deleted after recipient receives
      // _createdAt is used for TTL cleanup of undelivered messages (> 24h old)
      const deliveryRef = ref(realtimeDb, `delivery/${sanitizePathComponent(toUid)}/${messageId}`);

      try {
        await set(deliveryRef, {
          ...messageData,
          fromUid,
          conversationId,
          _createdAt: serverTimestamp(),
        });
      } catch (rtdbErr) {
        logger.error('recordMessage', `RTDB delivery failed: ${rtdbErr}`);
        // Log but don't fail - we have local persistence fallback
      }

      // Save to local persistence - This is our ONLY permanent store
      try {
        await appendMessage(fromUid, {
          id: messageId,
          chatId: conversationId,
          senderId: fromUid,
          content: content,
          type: (options.messageType as any) || 'text',
          timestamp: new Date().toISOString(),
          status: (options.status as any) || 'sent',
          replyToId: options.replyToId || undefined,
          replyToContent: options.replyToContent || undefined,
          replyToSender: options.replyToSender || undefined,
          expiresAt: options.expiresAt || undefined,
        });
      } catch (localErr) {
        logger.warn('recordMessage', `Local persistence failed: ${localErr}`);
        // Message still recorded in RTDB, local fallback failed
      }

      // Also index in IDB paginator for infinite scroll
      try {
        await idbPaginator.addMessages([{
          id: messageId,
          chatId: conversationId,
          senderId: fromUid,
          content: content,
          type: (options.messageType as any) || 'text',
          timestamp: new Date().toISOString(),
          status: (options.status as any) || 'sent',
          replyToId: options.replyToId || null,
          replyToContent: options.replyToContent || null,
          replyToSender: options.replyToSender || null,
        }]);
      } catch {
        // Non-critical — pagination falls back to primary store
      }

      const duration = Date.now() - startTime;
      logger.info('recordMessage', `Message recorded successfully in ${duration}ms`);

      return { success: true, messageId, conversationId, status: messageData.status };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error('recordMessage', `Failed after ${duration}ms: ${err.message}`);
      throw new Error(`Failed to record message: ${err.message}`);
    }
  },

  /**
   * Generate conversation ID (consistent for both directions)
   */
  getConversationId(uid1: string, uid2: string): string {
    return getConversationId(uid1, uid2);
  },

  /**
   * Prepare encrypted message for delivery (WebSocket + FCM)
   * Returns the encrypted payload that can be sent via WebSocket
   */
  async prepareMessageForDelivery(
    fromUid: string,
    toUid: string,
    content: string,
    messageId: string,
    messageType: string = 'text',
    mediaUrl: string | null = null
  ): Promise<{ encrypted: string; hmac: string | null; messageId: string; fromUid: string; toUid: string; messageType: string; mediaUrl: string | null; timestamp: string }> {
    try {
      // Encrypt the message content
      const conversationKey = await getConversationKey(fromUid, toUid);

      // Sign the payload before encryption
      let hmac: string | null = null;
      try {
        const signingKey = await deriveSigningKey(`${fromUid}:${toUid}`);
        hmac = await signMessage({ content, messageType, mediaUrl, messageId }, signingKey);
      } catch (signErr) {
        logger.warn('prepareMessageForDelivery', `HMAC signing failed: ${signErr}`);
      }

      const messagePayload = {
        content,
        messageType,
        mediaUrl,
        messageId,
        timestamp: new Date().toISOString(),
      };
      const encrypted = await encryptMessage(messagePayload, conversationKey);

      return {
        encrypted,
        hmac,
        messageId,
        fromUid,
        toUid,
        messageType,
        mediaUrl,
        timestamp: messagePayload.timestamp,
      };
    } catch (err) {
      console.error('❌ Failed to prepare message for delivery:', err);
      throw err;
    }
  },

  /**
   * Send push notification to recipient via FCM
   * This is the ONLY Firebase cloud function for messages - notifications only!
   */
  async sendPushNotification(toUid: string, fromUid: string, content: string, messageType: string) {
    try {
      // Get recipient's FCM token from their user document
      const userDoc = await getDoc(doc(db, 'users', toUid));
      if (!userDoc.exists()) {
        console.warn('⚠️ Recipient user not found for notification');
        return false;
      }

      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;

      if (!fcmToken) {
        console.warn('⚠️ Recipient has no FCM token');
        return false;
      }

      // Get sender name for notification
      const senderDoc = await getDoc(doc(db, 'users', fromUid));
      const senderName = senderDoc.exists() ? senderDoc.data().displayName || 'Someone' : 'Someone';

      // Build notification payload
      const notificationBody = messageType === 'text'
        ? content.substring(0, 50) + (content.length > 50 ? '...' : '')
        : `Sent a ${messageType}`;

      // Store notification request in RTDB (transient, not persisted)
      const notificationRef = ref(realtimeDb, `notifications/${toUid}/${Date.now()}`);
      await set(notificationRef, {
        type: 'new_message',
        fromUid,
        fromName: senderName,
        body: notificationBody,
        messageType,
        timestamp: Date.now(),
      });

      console.log(`📬 Push notification queued for ${toUid}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to send push notification:', err);
      return false;
    }
  },

  /**
   * Handle incoming encrypted message from WebSocket
   * Decrypts, saves to local .bin, returns decrypted message for UI
   */
  async handleIncomingMessage(
    currentUid: string,
    encryptedContent: string,
    messageId: string,
    fromUid: string,
    messageType: string,
    mediaUrl: string | null,
    timestamp: string,
    hmacSignature?: string
  ): Promise<{
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    type: string;
    timestamp: string;
    status: string;
    imageUrl?: string;
    hmacVerified: boolean;
  }> {
    try {
      // 1. Decrypt the message (with historical key fallback)
      let decryptedPayload;
      try {
        decryptedPayload = await decryptMessage(encryptedContent, await getConversationKey(fromUid, currentUid));
      } catch {
        // Current key failed — try historical versions
        decryptedPayload = await decryptMessageWithHistoricalKeys(encryptedContent, fromUid, currentUid);
      }
      const content = decryptedPayload.content || '';

      // Verify HMAC signature if present
      let hmacVerified = false;
      if (hmacSignature) {
        try {
          const signingKey = await deriveSigningKey(`${fromUid}:${currentUid}`);
          hmacVerified = await verifySignature(
            { content, fromUid, toUid: currentUid, messageId },
            hmacSignature,
            signingKey
          );
          if (!hmacVerified) {
            logger.warn('handleIncomingMessage', `HMAC verification failed for message ${messageId} — possible tampering`);
          }
        } catch (hmacErr) {
          logger.warn('handleIncomingMessage', `HMAC verification error: ${hmacErr}`);
        }
      }

      // 2. Save to local .bin storage
      const conversationId = getConversationId(currentUid, fromUid);
      try {
        await appendMessage(currentUid, {
          id: messageId,
          chatId: conversationId,
          senderId: fromUid,
          content: content,
          type: (messageType || 'text') as any,
          timestamp: timestamp || new Date().toISOString(),
          status: MESSAGE_STATUS.DELIVERED,
        });
      } catch (localErr) {
        console.warn('⚠️ Failed to save incoming message to local store:', localErr);
      }

      // Also index in IDB paginator for infinite scroll
      try {
        await idbPaginator.addMessages([{
          id: messageId,
          chatId: conversationId,
          senderId: fromUid,
          content: content,
          type: (messageType || 'text') as any,
          timestamp: timestamp || new Date().toISOString(),
          status: 'delivered',
          replyToId: null,
          replyToContent: null,
          replyToSender: null,
        }]);
      } catch {
        // Non-critical — pagination falls back to primary store
      }

      // 3. Return the decrypted message for UI
      return {
        id: messageId,
        chatId: conversationId,
        senderId: fromUid,
        content,
        type: messageType || 'text',
        timestamp: timestamp || new Date().toISOString(),
        status: 'received',
        imageUrl: mediaUrl || undefined,
        hmacVerified,
      };
    } catch (err) {
      console.error('❌ Failed to handle incoming message:', err);
      // Return the message with empty content if decryption fails
      return {
        id: messageId,
        chatId: getConversationId(currentUid, fromUid),
        senderId: fromUid,
        content: '[Message could not be decrypted]',
        type: messageType || 'text',
        timestamp: timestamp || new Date().toISOString(),
        status: 'received',
        hmacVerified: false,
      };
    }
  },

  /**
   * Send a message with delivery tracking
   */
  async sendMessage(
    fromUid: string,
    toUid: string,
    content: string,
    mediaFile?: File,
    messageType: 'text' | 'image' | 'video' | 'audio' = 'text'
  ) {
    const startTime = Date.now();
    let mediaRef: any = null;

    try {
      logger.info('sendMessage', `Sending message from ${fromUid} to ${toUid}`);

      let mediaUrl = null;

      // Handle Production-Grade Media Upload
      if (mediaFile) {
        try {
          logger.info('sendMessage', `Uploading encrypted ${messageType} (${mediaFile.size} bytes)`);
          mediaRef = await uploadMediaWithProgress(
            mediaFile,
            messageType === 'text' ? 'image' : messageType, // fallback
            fromUid,
            toUid
          );
          mediaUrl = mediaRef.fileId; // Use fileId as the reference
          logger.info('sendMessage', `Media uploaded: ${mediaUrl}`);
        } catch (uploadErr) {
          logger.error('sendMessage', `Media upload failed: ${uploadErr}`);
          throw new Error(`Failed to upload media: ${uploadErr}`);
        }
      }

      const result = await this.recordMessage(fromUid, toUid, content, {
        mediaUrl: mediaUrl,
        messageType: mediaRef ? messageType : 'text',
        status: MESSAGE_STATUS.SENT,
      });

      const { messageId, conversationId } = result;

      // Check if recipient is online, if so mark as delivered (don't fail on this)
      try {
        const unsubPresence = await presenceService.listenToUserPresence(
          toUid,
          async (isOnline) => {
            if (isOnline) {
              // Mark as delivered after 500ms if online
              setTimeout(() => {
                this.markMessageDelivered(conversationId, messageId, toUid)
                  .catch(err => logger.warn('sendMessage', `Failed to mark delivered: ${err}`));
              }, 500);
            }
            // Unsubscribe after first callback — we only need the initial presence check
            try { unsubPresence(); } catch { /* already unsubscribed */ }
          }
        );
      } catch (presenceErr) {
        logger.warn('sendMessage', `Failed to check presence: ${presenceErr}`);
        // Don't fail message send if presence check fails
      }

      // Notify recipient via Render FCM relay (fire-and-forget, non-blocking)
      const notifyUrl = import.meta.env.VITE_NOTIFY_URL;
      if (notifyUrl) {
        // Determine notification type (messageType: 'text' | 'image' | 'video' | 'audio')
        const notifyType = (messageType === 'image' || messageType === 'video' || messageType === 'audio')
          ? messageType
          : 'text';
        // Get sender name — if this fails, fall back to "Someone"
        getDoc(doc(db, 'users', fromUid))
          .then(senderDoc => {
            const senderName = senderDoc.data()?.displayName || 'Someone';
            return fetch(`${notifyUrl}/notify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: toUid, fromName: senderName, type: notifyType }),
            });
          })
          .catch(() => {
            // Non-critical: message was already saved locally and in RTDB
            logger.warn('sendMessage', 'Notification relay skipped (name lookup or fetch failed)');
          });
      }

      const duration = Date.now() - startTime;
      logger.info('sendMessage', `Message sent successfully in ${duration}ms`);
      return { ...result, status: MESSAGE_STATUS.SENT };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('sendMessage', `Failed after ${duration}ms: ${error.message}`);

      // Queue message for retry on reconnect
      const conversationId = getConversationId(fromUid, toUid);
      const messageId = messageQueue.addMessage({
        conversationId,
        fromUid,
        toUid,
        content,
        messageType,
        timestamp: new Date().toISOString(),
        maxRetries: 10
      });

      logger.info('sendMessage', `Message queued for retry: ${messageId}`);
      return { messageId, conversationId, status: MESSAGE_STATUS.QUEUED };
    }
  },

  /**
   * Mark message as delivered (double tick)
   * Uses RTDB transient pipe - receipt sent via RTDB, deleted after receipt
   */
  async markMessageDelivered(
    conversationId: string,
    messageId: string,
    recipientUid: string
  ) {
    try {
      // Send delivery receipt via RTDB transient pipe (sanitize UID for RTDB path)
      const receiptRef = ref(realtimeDb, `receipts/${sanitizePathComponent(recipientUid)}/delivered/${messageId}`);
      await set(receiptRef, {
        messageId,
        conversationId,
        deliveredAt: Date.now(),
        timestamp: serverTimestamp(),
      });

      console.log(`📨 Delivery receipt sent (📨 Double tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error sending delivery receipt:', error.message);
    }
  },

  /**
   * Mark message as read (double blue tick)
   * Uses RTDB transient pipe - receipt sent via RTDB, deleted after receipt
   */
  async markMessageRead(
    conversationId: string,
    messageId: string,
    readerUid: string
  ) {
    try {
      // Send read receipt via RTDB transient pipe (sanitize UID for RTDB path)
      const receiptRef = ref(realtimeDb, `receipts/${sanitizePathComponent(readerUid)}/read/${messageId}`);
      await set(receiptRef, {
        messageId,
        conversationId,
        readAt: Date.now(),
        timestamp: serverTimestamp(),
      });

      console.log(`💙 Read receipt sent (💙 Double blue tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error sending read receipt:', error.message);
    }
  },

  /**
   * Listen to incoming delivery/read receipts
   * Receipts are transient - immediately consumed and deleted
   */
  listenToReceipts(uid: string, callback: (receipt: { type: 'delivered' | 'read', messageId: string, conversationId: string }) => void) {
    // Listen to delivery receipts (sanitize UID for RTDB path)
    const deliveredRef = ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/delivered`);
    const unsubDelivered = onChildAdded(deliveredRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      callback({ type: 'delivered', messageId: snapshot.key!, conversationId: data.conversationId });

      // Immediately delete receipt after processing
      await remove(ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/delivered/${snapshot.key}`));
    });

    // Listen to read receipts (sanitize UID for RTDB path)
    const readRef = ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/read`);
    const unsubRead = onChildAdded(readRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      callback({ type: 'read', messageId: snapshot.key!, conversationId: data.conversationId });

      // Immediately delete receipt after processing
      await remove(ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/read/${snapshot.key}`));
    });

    return () => {
      unsubDelivered();
      unsubRead();
    };
  },

  /**
   * Legacy - kept for compatibility (points to RTDB)
   */
  async markMessageReadLegacy(
    conversationId: string,
    messageId: string
  ) {
    try {
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(messageRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === MESSAGE_STATUS.READ) return;
        transaction.update(messageRef, {
          status: MESSAGE_STATUS.READ,
          readAt: serverTimestamp(),
        });
      });

      console.log(`✅ Message read (👀 Double blue tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error marking message read:', error.message);
    }
  },

  /**
   * Mark all messages as read in a conversation
   * Sends read receipts via RTDB transient pipe - no Firestore storage
   */
  async markAllMessagesAsRead(
    conversationId: string,
    readerUid: string,
    senderUid: string
  ) {
    try {
      // Get local messages that need read receipt
      const { loadMessages } = await import('../localMessageStore');
      const localMessages = await loadMessages(readerUid, conversationId);

      // Send read receipts for each unread message from the other person
      const receiptsToSend = localMessages.filter(
        (m: any) => m.senderId !== readerUid && m.status !== 'read'
      );

      for (const msg of receiptsToSend) {
        const receiptRef = ref(realtimeDb, `receipts/${sanitizePathComponent(senderUid)}/read/${msg.id}`);
        await set(receiptRef, {
          messageId: msg.id,
          conversationId,
          readAt: Date.now(),
          timestamp: serverTimestamp(),
        });
      }

      console.log(`💙 Sent ${receiptsToSend.length} read receipts for conversation ${conversationId}`);
    } catch (error: any) {
      console.error('❌ Error sending read receipts:', error.message);
    }
  },

  /**
   * Listen to incoming messages (Pipe Model)
   * Recipient receives the message and IMMEDIATELY deletes it from RTDB
   */
  listenToIncomingMessages(uid: string, callback: (message: any) => void) {
    const deliveryRef = ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}`);

    // Use onChildAdded so we get each message one by one
    const unsubscribe = onChildAdded(deliveryRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // 1. Trigger the callback for the UI/Store
      callback({
        id: snapshot.key,
        ...data
      });

      // 2. IMMEDIATELY DELETE from server
      await remove(ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}/${snapshot.key}`));
      console.log(`🗑️ Message ${snapshot.key} wiped from server after delivery`);
    });

    return unsubscribe;
  },

  /**
   * Listen to messages in a conversation (LEGACY - now relies on local store + incoming listener)
   */
  listenToMessages(
    fromUid: string,
    toUid: string,
    callback: (messages: any[]) => void
  ) {
    const conversationId = getConversationId(fromUid, toUid);
    const messagesRef = collection(
      db,
      'conversations',
      conversationId,
      'messages'
    );
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messages = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        let decryptedContent = data.content;

        if (data.isEncrypted) {
          try {
            const decrypted = await decryptMessage(data.content, await getConversationKey(fromUid, toUid));
            decryptedContent = decrypted.content || '';
          } catch {
            try {
              const decrypted = await decryptMessageWithHistoricalKeys(data.content, fromUid, toUid);
              decryptedContent = decrypted.content || '';
            } catch (decErr) {
              console.warn('⚠️ Decryption failed for message:', doc.id);
            }
          }
        }

        return {
          id: doc.id,
          ...data,
          content: decryptedContent
        };
      }));
      callback(messages);
    }, (err) => {
      console.error('❌ Error listening to messages:', err);
      callback([]);
    });

    return unsubscribe;
  },

  /**
   * Get conversation history with pagination
   */
  async getConversationHistory(
    fromUid: string,
    toUid: string,
    pageSize: number = 50
  ) {
    try {
      const conversationId = getConversationId(fromUid, toUid);
      const messagesRef = collection(
        db,
        'conversations',
        conversationId,
        'messages'
      );
      const q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        limit(pageSize)
      );

      const snapshot = await getDocs(q);
      const messages = (await Promise.all(snapshot.docs
        .map(async (doc) => {
          const data = doc.data();
          let decryptedContent = data.content;

          if (data.isEncrypted) {
            try {
              const decrypted = await decryptMessage(data.content, await getConversationKey(fromUid, toUid));
              decryptedContent = decrypted.content || '';
            } catch {
              try {
                const decrypted = await decryptMessageWithHistoricalKeys(data.content, fromUid, toUid);
                decryptedContent = decrypted.content || '';
              } catch (decErr) {
                console.warn('⚠️ Decryption failed for message:', doc.id);
              }
            }
          }

          return {
            id: doc.id,
            ...data,
            content: decryptedContent,
          };
        })))
        .reverse();

      return messages;
    } catch (error: any) {
      console.error('❌ Error getting conversation history:', error.message);
      return [];
    }
  },

  /**
   * Update conversation metadata (last message, timestamp)
   */
  async updateConversationMetadata(
    fromUid: string,
    toUid: string,
    conversationId: string,
    lastMessage: string
  ) {
    try {
      const convRef = doc(db, 'conversations', conversationId);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(convRef);
        if (snap.exists()) {
          transaction.update(convRef, {
            lastMessage,
            lastMessageTime: serverTimestamp(),
            participants: [fromUid, toUid],
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.set(convRef, {
            conversationId,
            participants: [fromUid, toUid],
            lastMessage,
            lastMessageTime: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }
      });
    } catch (error: any) {
      console.error('❌ Error updating conversation metadata:', error.message);
    }
  },

  /**
   * Soft-delete a message (tombstone pattern).
   * Marks the message as deleted locally and notifies the other user via RTDB.
   * The message content is replaced with a tombstone; the document is not removed
   * so both sides can display "[Deleted]" consistently.
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    senderUid: string,
    recipientUid: string
  ) {
    try {
      // 1. Mark tombstone in Firestore (transactional — only if message exists)
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(messageRef);
        if (!snap.exists()) return;
        transaction.update(messageRef, {
          content: '[Deleted]',
          isDeleted: true,
          deletedAt: serverTimestamp(),
          messageType: 'system',
        });
      });

      // 2. Notify the other user via RTDB so their client also shows [Deleted]
      const notifyRef = ref(
        realtimeDb,
        `deletions/${sanitizePathComponent(recipientUid)}/${messageId}`
      );
      await set(notifyRef, {
        messageId,
        conversationId,
        deletedAt: Date.now(),
      });

      logger.info('deleteMessage', `Message ${messageId} soft-deleted`);
    } catch (error: any) {
      logger.error('deleteMessage', `Error deleting message: ${error.message}`);
    }
  },

  /**
   * Listen for incoming deletion notifications from the other user.
   * When a deletion is received, the local client should also mark the message
   * as deleted (content → [Deleted], type → system).
   */
  listenToDeletions(
    uid: string,
    callback: (payload: { messageId: string; conversationId: string }) => void
  ) {
    const deletionsRef = ref(realtimeDb, `deletions/${sanitizePathComponent(uid)}`);

    const unsubscribe = onChildAdded(deletionsRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      callback({
        messageId: snapshot.key!,
        conversationId: data.conversationId,
      });

      // Clean up the notification after processing
      await remove(ref(realtimeDb, `deletions/${sanitizePathComponent(uid)}/${snapshot.key}`));
    });

    return unsubscribe;
  },

  /**
   * Clean up undelivered messages older than 24 hours from the RTDB delivery pipe.
   * Prevents stale messages from accumulating when a recipient is offline/uninstalled.
   * Call this on app startup.
   */
  async cleanupDeliveryPipe(uid: string): Promise<void> {
    try {
      const deliveryRef = ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}`);
      const snapshot = await get(deliveryRef);
      if (!snapshot.exists()) return;

      const now = Date.now();
      const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
      const deletes: Promise<void>[] = [];

      snapshot.forEach((child) => {
        const data = child.val();
        const createdAt = data?._createdAt;
        // RTDB server timestamps resolve to millis on client
        const ts = typeof createdAt === 'number' ? createdAt : 0;
        if (ts > 0 && now - ts > TTL_MS) {
          deletes.push(remove(child.ref));
        }
      });

      if (deletes.length > 0) {
        await Promise.all(deletes);
        logger.info('cleanupDeliveryPipe', `Cleaned up ${deletes.length} stale delivery nodes`);
      }
    } catch (err) {
      logger.warn('cleanupDeliveryPipe', `Cleanup failed: ${err}`);
    }
  },

  /**
   * List all chat IDs that have local data on this device
   */
  async getChatsForUser(userId: string): Promise<string[]> {
    return listLocalChatIds();
  },

  /**
   * Add a reaction to a message
   */
  async reactToMessage(conversationId: string, messageId: string, reactions: any[]) {
    try {
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(messageRef);
        if (!snap.exists()) {
          throw new Error('Message not found');
        }
        transaction.update(messageRef, { reactions });
      });
    } catch (error: any) {
      console.error('❌ Error reacting to message:', error.message);
    }
  },

  async syncEditToFirestore(conversationId: string, messageId: string, newContent: string) {
    if (!navigator.onLine) return;
    try {
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(messageRef);
        if (snap.exists()) {
          transaction.update(messageRef, { content: newContent, isEdited: true });
        }
      });
    } catch {
      // Non-critical — local .bin is source of truth
    }
  },

};