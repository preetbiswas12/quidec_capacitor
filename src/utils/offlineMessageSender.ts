/**
 * Offline Message Sender
 * Bridges the gap between AppContext.sendMessage and the persistent message queue.
 * When offline, messages are queued and retried when connectivity returns.
 *
 * Architecture:
 *   1. AppContext.sendMessage calls sendMessageWhenAvailable()
 *   2. If online → sends via messageService.recordMessage (RTDB delivery + local .bin)
 *   3. If offline → queues via messageQueue.addMessage() for retry later
 *   4. On reconnect → flushes the queue by retrying each message
 */

import { messageQueue } from './persistentMessageQueue';
import { messageService } from './services/messageService';
import logger from './logger';
import { reportError } from './errorMonitoring';

export interface SendMessageResult {
  status: 'sent' | 'queued' | 'failed';
  messageId: string;
  conversationId: string;
}

let isFlushInProgress = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Queue a read receipt for delivery when online.
 */
export function queueReadReceipt(
  conversationId: string,
  messageId: string,
  senderUid: string,
  readerUid: string,
  receiptType: 'delivered' | 'read'
): void {
  if (!navigator.onLine) {
    messageQueue.addReceipt({
      conversationId,
      messageId,
      senderUid,
      readerUid,
      receiptType,
      timestamp: Date.now(),
    });
    logger.info('offlineSender', `Receipt queued (${receiptType}) for ${messageId}`);
    return;
  }

  import('./services/messageService').then(({ messageService: svc }) => {
    if (receiptType === 'read') {
      svc.markMessageRead(conversationId, messageId, senderUid).catch(() => {});
    } else if (receiptType === 'delivered') {
      svc.markMessageDelivered(conversationId, messageId, senderUid).catch(() => {});
    }
  });
}

/**
 * Flush queued read receipts — called when connectivity is restored.
 */
export async function flushReadReceipts(): Promise<{ sent: number; failed: number }> {
  const receipts = messageQueue.getReceipts();
  if (receipts.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const receipt of receipts) {
    try {
      if (receipt.expiresAt < Date.now()) {
        messageQueue.removeReceipt(receipt.id);
        continue;
      }
      const { messageService: svc } = await import('./services/messageService');
      if (receipt.receiptType === 'read') {
        await svc.markMessageRead(receipt.conversationId, receipt.messageId, receipt.senderUid);
      } else if (receipt.receiptType === 'delivered') {
        await svc.markMessageDelivered(receipt.conversationId, receipt.messageId, receipt.senderUid);
      }
      messageQueue.removeReceipt(receipt.id);
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Flush queued statuses — called when connectivity is restored.
 */
async function flushQueuedStatuses(): Promise<void> {
  try {
    const stored = localStorage.getItem('queued_statuses');
    if (!stored) return;
    const statuses = JSON.parse(stored) as Array<{
      userId: string; content: string; type: 'text' | 'image';
      backgroundColor: string; mediaUrl: string | null; createdAt: number;
    }>;
    if (statuses.length === 0) return;

    const { statusService } = await import('./services/statusService');
    for (const s of statuses) {
      await statusService.createStatus(s.userId, s.content, s.type, s.backgroundColor, s.mediaUrl);
    }
    localStorage.removeItem('queued_statuses');
    logger.info('offlineSender', `Flushed ${statuses.length} queued statuses`);
  } catch {
    // Non-critical — statuses will retry on next reconnect
  }
}

/**
 * Send a message, queueing it if offline.
 * This is the primary entry point for AppContext.sendMessage.
 */
export async function sendMessageWhenAvailable(
  fromUid: string,
  toUid: string,
  content: string,
  options: {
    messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'link';
    mediaFile?: File;
    mediaUrl?: string | null;
    messageId?: string;
    replyToId?: string;
    replyToContent?: string;
    replyToSender?: string;
    expiresAt?: number;
    keyVersion?: number;
    groupId?: string;
    timestamp?: string;
  } = {}
): Promise<SendMessageResult> {
  const conversationId = options.groupId
    ? `group_${options.groupId}`
    : messageService.getConversationId(fromUid, toUid);

  if (!navigator.onLine) {
    logger.info('offlineSender', `Offline — queuing message to ${toUid}`);
    const queuedId = messageQueue.addMessage({
      conversationId,
      fromUid,
      toUid,
      content,
      messageType: options.messageType || 'text',
      timestamp: new Date().toISOString(),
      maxRetries: 10,
      mediaUrl: options.mediaUrl,
      replyToId: options.replyToId,
      replyToContent: options.replyToContent,
      replyToSender: options.replyToSender,
      expiresAt: options.expiresAt || Date.now() + 24 * 60 * 60 * 1000,
      keyVersion: options.keyVersion,
      groupId: options.groupId,
    });

    return {
      status: 'queued',
      messageId: queuedId,
      conversationId,
    };
  }

  try {
    const result = await messageService.recordMessage(fromUid, toUid, content, {
      messageId: options.messageId,
      messageType: options.messageType || 'text',
      mediaUrl: options.mediaUrl || null,
      status: 'sent',
      replyToId: options.replyToId,
      replyToContent: options.replyToContent,
      replyToSender: options.replyToSender,
      expiresAt: options.expiresAt,
      timestamp: options.timestamp,
    });

    return {
      status: 'sent',
      messageId: result.messageId,
      conversationId: result.conversationId,
    };
  } catch (err) {
    logger.warn('offlineSender', `Send failed, queuing for retry: ${err}`);
    const queuedId = messageQueue.addMessage({
      conversationId,
      fromUid,
      toUid,
      content,
      messageType: options.messageType || 'text',
      timestamp: new Date().toISOString(),
      maxRetries: 10,
      mediaUrl: options.mediaUrl,
      replyToId: options.replyToId,
      replyToContent: options.replyToContent,
      replyToSender: options.replyToSender,
      expiresAt: options.expiresAt || Date.now() + 24 * 60 * 60 * 1000,
      keyVersion: options.keyVersion,
      groupId: options.groupId,
    });

    reportError(err as Error, {
      severity: 'warning',
      extra: { fromUid, toUid, action: 'offlineSender.queue' },
    });

    return {
      status: 'queued',
      messageId: queuedId,
      conversationId,
    };
  }
}

/**
 * Flush all queued messages — called when connectivity is restored.
 */
export async function flushMessageQueue(_fromUid: string): Promise<{ sent: number; failed: number; remaining: number }> {
  if (isFlushInProgress) {
    logger.debug('offlineSender', 'Flush already in progress, skipping');
    return { sent: 0, failed: 0, remaining: messageQueue.getQueueSize() };
  }

  const queued = messageQueue.getMessages();
  if (queued.length === 0) {
    return { sent: 0, failed: 0, remaining: 0 };
  }

  isFlushInProgress = true;
  messageQueue.setProcessing(true);
  logger.info('offlineSender', `Flushing ${queued.length} queued messages`);

  let sent = 0;
  let failed = 0;

  for (const msg of queued) {
    try {
      if (msg.expiresAt && msg.expiresAt < Date.now()) {
        messageQueue.removeMessage(msg.id);
        continue;
      }

      if (msg.attempts >= msg.maxRetries) {
        logger.warn('offlineSender', `Message ${msg.id} exhausted retries, removing`);
        messageQueue.removeMessage(msg.id);
        failed++;
        continue;
      }

      if (msg.attempts > 0) {
        const backoffMs = Math.min(30000, Math.pow(2, msg.attempts) * 1000) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      await messageService.recordMessage(msg.fromUid, msg.toUid, msg.content, {
        messageType: msg.messageType,
        mediaUrl: msg.mediaUrl || null,
        status: 'sent',
        replyToId: msg.replyToId,
        replyToContent: msg.replyToContent,
        replyToSender: msg.replyToSender,
        expiresAt: msg.expiresAt,
      });

      messageQueue.removeMessage(msg.id);
      sent++;
      window.dispatchEvent(new CustomEvent('offlineFlushProgress', {
        detail: { sent, total: queued.length },
      }));
      logger.debug('offlineSender', `Queued message ${msg.id} sent successfully`);
    } catch (err) {
      const hasMoreRetries = messageQueue.incrementRetries(msg.id);
      if (!hasMoreRetries) {
        failed++;
      }
      logger.warn('offlineSender', `Failed to flush message ${msg.id}: ${err}`);
    }
  }

  isFlushInProgress = false;
  messageQueue.setProcessing(false);

  logger.info('offlineSender', `Flush complete: ${sent} sent, ${failed} failed, ${messageQueue.getQueueSize()} remaining`);

  if (failed > 0) {
    window.dispatchEvent(new CustomEvent('offlineFlushResult', {
      detail: { sent, failed, remaining: messageQueue.getQueueSize() },
    }));
  }

  await flushReadReceipts();
  await flushQueuedStatuses();

  window.dispatchEvent(new CustomEvent('messageQueueFlush'));

  return { sent, failed, remaining: messageQueue.getQueueSize() };
}

/**
 * Start auto-flush on reconnect events.
 * Listens for online events and flushes the queue.
 */
export function startAutoFlushOnReconnect(getUid: () => string | null): () => void {
  const handleOnline = async () => {
    const uid = getUid();
    if (!uid) return;

    // Small delay to let connection stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    await flushMessageQueue(uid);
  };

  window.addEventListener('online', handleOnline);

  // Also flush on interval if there are queued messages (every 60s)
  flushTimer = setInterval(async () => {
    if (!navigator.onLine || isFlushInProgress) return;
    const uid = getUid();
    if (!uid) return;
    if (messageQueue.getQueueSize() > 0) {
      await flushMessageQueue(uid);
    }
  }, 60000);

  return () => {
    window.removeEventListener('online', handleOnline);
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  };
}

/**
 * Get the current queue status for UI display.
 */
export function getQueueStatus() {
  return messageQueue.getStats();
}

/**
 * Get count of queued messages.
 */
export function getQueuedCount(): number {
  return messageQueue.getQueueSize();
}
