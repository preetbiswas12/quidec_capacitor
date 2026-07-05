/**
 * Persistent Message Queue
 * Saves unsent messages to localStorage and auto-retries on reconnect
 * 
 * Features:
 * - Auto-saves messages that fail to send
 * - Persists across app restarts
 * - Auto-flushes queue when connection restored
 * - 24-hour TTL for old messages
 * - Max 1000 messages to prevent storage bloat
 */

import logger from './logger';

export interface QueuedMessage {
  id: string;
  conversationId: string;
  fromUid: string;
  toUid: string;
  content: string;
  mediaFile?: File;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'link';
  mediaUrl?: string | null;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
  expiresAt?: number;
  keyVersion?: number;
  timestamp: string;
  attempts: number;
  maxRetries: number;
  createdAt: number;
  groupId?: string;
}

export interface QueuedReadReceipt {
  id: string;
  conversationId: string;
  messageId: string;
  senderUid: string;
  readerUid: string;
  receiptType: 'delivered' | 'read';
  timestamp: number;
  createdAt: number;
  expiresAt: number;
}

const QUEUE_KEY = 'message_queue_v1';
const RECEIPT_QUEUE_KEY = 'read_receipt_queue_v1';
const MAX_QUEUE_SIZE = 1000;
const MESSAGE_TTL = 24 * 60 * 60 * 1000;
const MAX_RETRIES = 10;

class PersistentMessageQueue {
  private queue: Map<string, QueuedMessage> = new Map();
  private receiptQueue: Map<string, QueuedReadReceipt> = new Map();
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor() {
    this.loadQueue();
    this.loadReceiptQueue();
    this.startAutoFlush();
  }

  /**
   * Add message to queue
   */
  addMessage(message: Omit<QueuedMessage, 'id' | 'attempts' | 'createdAt'>): string {
    const now = Date.now();
    const messageId = `msg_${now}_${Math.random().toString(36).substr(2, 9)}`;

    const queuedMessage: QueuedMessage = {
      ...message,
      id: messageId,
      attempts: 0,
      maxRetries: message.maxRetries || MAX_RETRIES,
      createdAt: now,
      expiresAt: message.expiresAt || now + MESSAGE_TTL,
    };

    // Check queue size
    if (this.queue.size >= MAX_QUEUE_SIZE) {
      logger.warn('messageQueue', 'Queue full, removing oldest message');
      const oldest = Array.from(this.queue.values()).sort(
        (a, b) => a.createdAt - b.createdAt
      )[0];
      if (oldest) {
        this.queue.delete(oldest.id);
      }
    }

    this.queue.set(messageId, queuedMessage);
    this.persistQueue();

    logger.info('messageQueue', `Message queued: ${messageId} (${this.queue.size} in queue)`);
    return messageId;
  }

  /**
   * Get all queued messages
   */
  getMessages(): QueuedMessage[] {
    return Array.from(this.queue.values())
      .filter(msg => !msg.expiresAt || msg.expiresAt > Date.now()) // Remove expired
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Remove message from queue (after successful send)
   */
  removeMessage(messageId: string): void {
    this.queue.delete(messageId);
    this.persistQueue();
    logger.debug('messageQueue', `Message removed: ${messageId}`);
  }

  /**
   * Increment retry count for failed message
   */
  incrementRetries(messageId: string): boolean {
    const message = this.queue.get(messageId);
    if (!message) return false;

    message.attempts++;
    if (message.attempts >= message.maxRetries) {
      logger.warn('messageQueue', `Message exhausted retries: ${messageId}`);
      this.queue.delete(messageId);
      this.persistQueue();
      return false;
    }

    this.persistQueue();
    return true;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Clear entire queue (for testing/manual clear)
   */
  clearQueue(): void {
    const count = this.queue.size;
    this.queue.clear();
    this.persistQueue();
    logger.info('messageQueue', `Queue cleared (removed ${count} messages)`);
  }

  /**
   * Get queue stats
   */
  getStats() {
    const messages = Array.from(this.queue.values());
    return {
      totalMessages: messages.length,
      byConversation: this.groupBy(messages, 'conversationId'),
      byStatus: {
        pending: messages.filter(m => m.attempts === 0).length,
        retrying: messages.filter(m => m.attempts > 0 && m.attempts < m.maxRetries).length,
        exhausted: messages.filter(m => m.attempts >= m.maxRetries).length,
      },
      oldestMessage: messages.length > 0 ? messages[0].createdAt : null,
      oldestExpiry: messages.length > 0 ? messages[0].expiresAt : null,
    };
  }

  /**
   * Add read receipt to queue
   */
  addReceipt(receipt: Omit<QueuedReadReceipt, 'id' | 'createdAt' | 'expiresAt'>): string {
    const now = Date.now();
    const id = `rcpt_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const queuedReceipt: QueuedReadReceipt = {
      ...receipt,
      id,
      createdAt: now,
      expiresAt: now + MESSAGE_TTL,
    };
    this.receiptQueue.set(id, queuedReceipt);
    this.persistReceiptQueue();
    return id;
  }

  /**
   * Get all queued read receipts
   */
  getReceipts(): QueuedReadReceipt[] {
    return Array.from(this.receiptQueue.values())
      .filter(r => !r.expiresAt || r.expiresAt > Date.now())
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Remove read receipt from queue
   */
  removeReceipt(receiptId: string): void {
    this.receiptQueue.delete(receiptId);
    this.persistReceiptQueue();
  }

  /**
   * Get receipt queue size
   */
  getReceiptQueueSize(): number {
    return this.receiptQueue.size;
  }

  /**
   * Persist queue to localStorage
   */
  private persistQueue(): void {
    try {
      const data = Array.from(this.queue.values()).map(msg => ({
        ...msg,
        mediaFile: null, // Don't persist File objects
      }));

      localStorage.setItem(QUEUE_KEY, JSON.stringify(data));
      logger.debug('messageQueue', `Queue persisted (${data.length} messages)`);
    } catch (err) {
      logger.error('messageQueue', `Failed to persist queue: ${err}`);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (!stored) {
        logger.info('messageQueue', 'No persisted queue found');
        return;
      }

      const messages: QueuedMessage[] = JSON.parse(stored);
      let loadedCount = 0;
      let skippedExpired = 0;

      messages.forEach(msg => {
        // Skip expired messages
        if (msg.expiresAt && msg.expiresAt < Date.now()) {
          skippedExpired++;
          return;
        }

        this.queue.set(msg.id, msg);
        loadedCount++;
      });

      logger.info(
        'messageQueue',
        `Queue loaded: ${loadedCount} messages, ${skippedExpired} expired`
      );
    } catch (err) {
      logger.error('messageQueue', `Failed to load queue: ${err}`);
      this.queue.clear();
    }
  }

  /**
   * Persist read receipts to localStorage
   */
  private persistReceiptQueue(): void {
    try {
      const data = Array.from(this.receiptQueue.values());
      localStorage.setItem(RECEIPT_QUEUE_KEY, JSON.stringify(data));
    } catch (err) {
      logger.error('messageQueue', `Failed to persist receipt queue: ${err}`);
    }
  }

  /**
   * Load read receipts from localStorage
   */
  private loadReceiptQueue(): void {
    try {
      const stored = localStorage.getItem(RECEIPT_QUEUE_KEY);
      if (!stored) return;
      const receipts: QueuedReadReceipt[] = JSON.parse(stored);
      receipts.forEach(r => {
        if (!r.expiresAt || r.expiresAt > Date.now()) {
          this.receiptQueue.set(r.id, r);
        }
      });
    } catch {
      this.receiptQueue.clear();
    }
  }

  /**
   * Start auto-flush on interval
   */
  private startAutoFlush(): void {
    // Flush every 30 seconds if there are queued messages
    this.flushInterval = setInterval(() => {
      if (this.queue.size > 0 && !this.isProcessing) {
        logger.debug('messageQueue', 'Auto-flush triggered');
        // Emit event for app to flush (handled by message service)
        window.dispatchEvent(new CustomEvent('messageQueueFlush'));
      }
    }, 30000);
  }

  /**
   * Stop auto-flush
   */
  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Set processing flag
   */
  setProcessing(isProcessing: boolean): void {
    this.isProcessing = isProcessing;
  }

  /**
   * Helper: group array by key
   */
  private groupBy(arr: QueuedMessage[], key: keyof QueuedMessage): Record<string, number> {
    return arr.reduce(
      (acc, item) => {
        const k = String(item[key]);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}

export { PersistentMessageQueue };

// Singleton instance
export const messageQueue = new PersistentMessageQueue();

/**
 * Export for cleanup
 */
export function cleanupMessageQueue(): void {
  messageQueue.stopAutoFlush();
}
