import { describe, it, expect, beforeEach, vi } from 'vitest';

const localStorageStore = new Map<string, string>();

const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore.set(key, value); }),
  removeItem: vi.fn((key: string) => { localStorageStore.delete(key); }),
  clear: vi.fn(() => { localStorageStore.clear(); }),
  get length() { return localStorageStore.size; },
  key: vi.fn((index: number) => Array.from(localStorageStore.keys())[index] ?? null),
};

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

import { PersistentMessageQueue } from '../persistentMessageQueue';

function createBaseMessage(overrides: Record<string, any> = {}) {
  return {
    conversationId: 'conv_1',
    fromUid: 'user_a',
    toUid: 'user_b',
    content: 'hello',
    messageType: 'text' as const,
    timestamp: new Date().toISOString(),
    maxRetries: 3,
    ...overrides,
  };
}

describe('PersistentMessageQueue', () => {
  let queue: PersistentMessageQueue;

  beforeEach(() => {
    localStorageStore.clear();
    vi.clearAllMocks();
    queue = new PersistentMessageQueue();
    queue.stopAutoFlush();
  });

  it('adds a message and returns an ID', () => {
    const id = queue.addMessage(createBaseMessage());
    expect(id).toMatch(/^msg_\d+_/);
    expect(queue.getQueueSize()).toBe(1);
  });

  it('retrieves messages sorted by creation time', () => {
    queue.addMessage(createBaseMessage({ content: 'first' }));
    queue.addMessage(createBaseMessage({ content: 'second' }));
    const msgs = queue.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('first');
    expect(msgs[1].content).toBe('second');
  });

  it('removes a message by ID', () => {
    const id = queue.addMessage(createBaseMessage());
    expect(queue.getQueueSize()).toBe(1);
    queue.removeMessage(id);
    expect(queue.getQueueSize()).toBe(0);
  });

  it('increments retry count', () => {
    const id = queue.addMessage(createBaseMessage());
    const canRetry = queue.incrementRetries(id);
    expect(canRetry).toBe(true);
    const msgs = queue.getMessages();
    expect(msgs[0].attempts).toBe(1);
  });

  it('returns false when max retries exceeded', () => {
    const id = queue.addMessage(createBaseMessage());
    // Default maxRetries is 10, exhaust all of them
    for (let i = 0; i < 9; i++) {
      queue.incrementRetries(id);
    }
    // 10th attempt: attempts (10) >= maxRetries (10) → message deleted, returns false
    const canRetry = queue.incrementRetries(id);
    expect(canRetry).toBe(false);
    expect(queue.getQueueSize()).toBe(0);
  });

  it('clears the entire queue', () => {
    queue.addMessage(createBaseMessage());
    queue.addMessage(createBaseMessage());
    queue.clearQueue();
    expect(queue.getQueueSize()).toBe(0);
  });

  it('persists to localStorage', () => {
    queue.addMessage(createBaseMessage());
    expect(mockLocalStorage.setItem).toHaveBeenCalled();
    const stored = localStorageStore.get('message_queue_v1');
    expect(stored).toBeDefined();
  });

  it('loads persisted queue on construction', () => {
    const msg = createBaseMessage();
    const queuedMsg = {
      ...msg,
      id: 'msg_persisted',
      attempts: 0,
      maxRetries: 10,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    };
    localStorageStore.set('message_queue_v1', JSON.stringify([queuedMsg]));

    const newQueue = new PersistentMessageQueue();
    newQueue.stopAutoFlush();
    expect(newQueue.getQueueSize()).toBe(1);
  });

  it('filters out expired messages', () => {
    const expiredMsg = {
      ...createBaseMessage(),
      id: 'msg_expired',
      attempts: 0,
      maxRetries: 10,
      createdAt: Date.now() - 172800000,
      expiresAt: Date.now() - 86400000, // expired 24h ago
    };
    localStorageStore.set('message_queue_v1', JSON.stringify([expiredMsg]));

    const newQueue = new PersistentMessageQueue();
    newQueue.stopAutoFlush();
    expect(newQueue.getQueueSize()).toBe(0);
  });

  it('returns correct stats', () => {
    queue.addMessage(createBaseMessage({ conversationId: 'conv_1' }));
    queue.addMessage(createBaseMessage({ conversationId: 'conv_1' }));
    queue.addMessage(createBaseMessage({ conversationId: 'conv_2' }));

    const stats = queue.getStats();
    expect(stats.totalMessages).toBe(3);
    expect(stats.byConversation['conv_1']).toBe(2);
    expect(stats.byConversation['conv_2']).toBe(1);
  });

  it('evicts oldest message when queue is full', () => {
    const now = Date.now();
    const msgs = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg_${i}`,
      conversationId: 'conv_1',
      fromUid: 'user_a',
      toUid: 'user_b',
      content: `msg_${i}`,
      messageType: 'text',
      timestamp: new Date().toISOString(),
      attempts: 0,
      maxRetries: 10,
      createdAt: now + i,
      expiresAt: now + 86400000,
    }));
    localStorageStore.set('message_queue_v1', JSON.stringify(msgs));

    const newQueue = new PersistentMessageQueue();
    newQueue.stopAutoFlush();
    expect(newQueue.getQueueSize()).toBe(1000);

    const firstId = newQueue.getMessages()[0].id;
    newQueue.addMessage(createBaseMessage({ content: 'new_message' }));

    expect(newQueue.getQueueSize()).toBe(1000);
    expect(newQueue.getMessages().find((m) => m.id === firstId)).toBeUndefined();
  });

  it('setProcessing prevents auto-flush', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    queue.setProcessing(true);
    queue.addMessage(createBaseMessage());

    queue['flushInterval'] = setInterval(() => {}, 30000);
    queue['isProcessing'] = true;

    expect(queue['isProcessing']).toBe(true);
    dispatchSpy.mockRestore();
  });

  it('returns false when incrementing retries on non-existent message', () => {
    const result = queue.incrementRetries('msg_nonexistent');
    expect(result).toBe(false);
  });

  it('getStats returns correct status breakdown', () => {
    queue.addMessage(createBaseMessage());
    queue.addMessage(createBaseMessage());
    queue.addMessage(createBaseMessage());

    const id = queue.getMessages()[0].id;
    queue.incrementRetries(id);

    const stats = queue.getStats();
    expect(stats.byStatus.pending).toBe(2);
    expect(stats.byStatus.retrying).toBe(1);
    expect(stats.byStatus.exhausted).toBe(0);
  });

  it('getStats returns null timestamps when empty', () => {
    const stats = queue.getStats();
    expect(stats.oldestMessage).toBeNull();
    expect(stats.oldestExpiry).toBeNull();
  });

  it('removeMessage persists to localStorage', () => {
    const id = queue.addMessage(createBaseMessage());
    mockLocalStorage.setItem.mockClear();
    queue.removeMessage(id);
    expect(mockLocalStorage.setItem).toHaveBeenCalled();
  });

  it('handles corrupted localStorage data gracefully', () => {
    localStorageStore.set('message_queue_v1', '{invalid json');
    const newQueue = new PersistentMessageQueue();
    newQueue.stopAutoFlush();
    expect(newQueue.getQueueSize()).toBe(0);
  });

  it('stopAutoFlush clears the interval', () => {
    queue.stopAutoFlush();
    expect(queue['flushInterval']).toBeNull();
  });

  it('cleanupMessageQueue stops auto-flush on singleton', async () => {
    const { cleanupMessageQueue, messageQueue } = await import('../persistentMessageQueue');
    cleanupMessageQueue();
    expect(messageQueue['flushInterval']).toBeNull();
  });
});
