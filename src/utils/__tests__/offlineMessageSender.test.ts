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

let mockOnLine = true;
Object.defineProperty(navigator, 'onLine', {
  get: () => mockOnLine,
  configurable: true,
});

const { mockRecordMessage } = vi.hoisted(() => ({
  mockRecordMessage: vi.fn(),
}));

vi.mock('../services/messageService', () => ({
  messageService: {
    recordMessage: mockRecordMessage,
    getConversationId: (uid1: string, uid2: string) => [uid1, uid2].sort().join('_'),
  },
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../errorMonitoring', () => ({
  reportError: vi.fn(),
}));

import { sendMessageWhenAvailable, flushMessageQueue, getQueueStatus, getQueuedCount } from '../offlineMessageSender';
import { messageQueue } from '../persistentMessageQueue';

describe('sendMessageWhenAvailable', () => {
  beforeEach(() => {
    localStorageStore.clear();
    messageQueue.clearQueue();
    messageQueue.stopAutoFlush();
    vi.clearAllMocks();
    mockOnLine = true;
    mockRecordMessage.mockResolvedValue({ success: true, messageId: 'msg_1', conversationId: 'conv_1' });
  });

  it('sends message when online', async () => {
    mockOnLine = true;
    mockRecordMessage.mockResolvedValue({ success: true, messageId: 'msg_1', conversationId: 'user_a_user_b' });

    const result = await sendMessageWhenAvailable('user_a', 'user_b', 'hello');

    expect(result.status).toBe('sent');
    expect(result.messageId).toBe('msg_1');
    expect(mockRecordMessage).toHaveBeenCalledWith('user_a', 'user_b', 'hello', expect.objectContaining({
      messageType: 'text',
    }));
  });

  it('queues message when offline', async () => {
    mockOnLine = false;

    const result = await sendMessageWhenAvailable('user_a', 'user_b', 'hello offline');

    expect(result.status).toBe('queued');
    expect(result.messageId).toMatch(/^msg_\d+_/);
    expect(mockRecordMessage).not.toHaveBeenCalled();
  });

  it('queues message when send fails', async () => {
    mockOnLine = true;
    mockRecordMessage.mockRejectedValue(new Error('Network error'));

    const result = await sendMessageWhenAvailable('user_a', 'user_b', 'hello fail');

    expect(result.status).toBe('queued');
    expect(result.messageId).toMatch(/^msg_\d+_/);
  });

  it('generates correct conversation ID', async () => {
    mockOnLine = false;

    const result = await sendMessageWhenAvailable('zebra', 'alpha', 'test');
    expect(result.conversationId).toBe('alpha_zebra');
  });

  it('passes options to recordMessage when online', async () => {
    mockOnLine = true;
    mockRecordMessage.mockResolvedValue({ success: true, messageId: 'msg_2', conversationId: 'a_b' });

    await sendMessageWhenAvailable('a', 'b', 'reply', {
      messageType: 'text',
      replyToId: 'parent_1',
      replyToContent: 'parent text',
      replyToSender: 'a',
      expiresAt: Date.now() + 3600000,
    });

    expect(mockRecordMessage).toHaveBeenCalledWith('a', 'b', 'reply', expect.objectContaining({
      replyToId: 'parent_1',
      replyToContent: 'parent text',
      replyToSender: 'a',
    }));
  });
});

describe('flushMessageQueue', () => {
  beforeEach(() => {
    localStorageStore.clear();
    messageQueue.clearQueue();
    messageQueue.stopAutoFlush();
    vi.clearAllMocks();
    mockOnLine = true;
    mockRecordMessage.mockResolvedValue({ success: true, messageId: 'msg_1', conversationId: 'conv_1' });
  });

  it('returns zero counts when queue is empty', async () => {
    const result = await flushMessageQueue('user_a');
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it('sends queued messages when online', async () => {
    mockOnLine = true;
    mockRecordMessage.mockResolvedValue({ success: true, messageId: 'msg_1', conversationId: 'conv_1' });

    messageQueue.addMessage({
      conversationId: 'user_a_user_b',
      fromUid: 'user_a',
      toUid: 'user_b',
      content: 'queued message',
      messageType: 'text',
      timestamp: new Date().toISOString(),
      maxRetries: 3,
    });

    const result = await flushMessageQueue('user_a');

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it('handles send failures during flush — message stays in queue', async () => {
    mockOnLine = true;
    mockRecordMessage.mockRejectedValue(new Error('Send failed'));

    messageQueue.addMessage({
      conversationId: 'user_a_user_b',
      fromUid: 'user_a',
      toUid: 'user_b',
      content: 'fail message',
      messageType: 'text',
      timestamp: new Date().toISOString(),
      maxRetries: 3,
    });

    const result = await flushMessageQueue('user_a');

    // Message should not be in "sent" since recordMessage threw
    expect(result.sent).toBe(0);
    // Message should remain in queue with incremented retry count
    const remaining = messageQueue.getMessages();
    expect(remaining.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getQueueStatus / getQueuedCount', () => {
  beforeEach(() => {
    localStorageStore.clear();
    messageQueue.clearQueue();
    messageQueue.stopAutoFlush();
    vi.clearAllMocks();
  });

  it('returns correct queue size', () => {
    expect(getQueuedCount()).toBe(0);
  });

  it('returns stats object', () => {
    const stats = getQueueStatus();
    expect(stats).toHaveProperty('totalMessages');
    expect(stats).toHaveProperty('byConversation');
    expect(stats).toHaveProperty('byStatus');
  });
});
