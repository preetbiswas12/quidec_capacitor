import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockRejectedValue(new Error('not found'));
const mockGetPref = vi.fn().mockResolvedValue({ value: null });
const mockSetPref = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
  Directory: { Documents: 'DOCUMENTS' },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: (...args: unknown[]) => mockGetPref(...args),
    set: (...args: unknown[]) => mockSetPref(...args),
  },
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  appendMessage,
  loadMessages,
  loadAllChats,
  listLocalChatIds,
  deleteLocalChat,
  clearAllMessages,
  updateMessageStatus,
  updateMessageStar,
  updateMessageContent,
  updateMessageReactions,
  deleteMessageById,
  getStarredMessages,
  searchAllMessages,
  clearKeyCache,
  saveMessages,
  type StoredMessage,
} from '../sqliteMessageStore';

const USER_UID = 'test-user-uid';

function makeMsg(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    chatId: 'chat-1',
    senderId: USER_UID,
    content: 'Hello world',
    type: 'text',
    timestamp: new Date().toISOString(),
    status: 'sent',
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearKeyCache();
  mockReadFile.mockRejectedValue(new Error('not found'));
  mockWriteFile.mockResolvedValue(undefined);
  mockGetPref.mockResolvedValue({ value: null });
  mockSetPref.mockResolvedValue(undefined);
  await clearAllMessages();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('appendMessage', () => {
  it('inserts a message and loads it back', async () => {
    const msg = makeMsg({ id: 'msg-1', content: 'Test message' });
    await appendMessage(USER_UID, msg);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('msg-1');
    expect(loaded[0].content).toBe('Test message');
  });

  it('handles replace (INSERT OR REPLACE)', async () => {
    const msg = makeMsg({ id: 'msg-dup', content: 'v1' });
    await appendMessage(USER_UID, msg);

    const updated = makeMsg({ id: 'msg-dup', content: 'v2' });
    await appendMessage(USER_UID, updated);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe('v2');
  });
});

describe('loadMessages', () => {
  it('returns empty array for nonexistent chat', async () => {
    const result = await loadMessages(USER_UID, 'nonexistent');
    expect(result).toEqual([]);
  });

  it('returns messages ordered by timestamp ASC', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'm2', timestamp: '2026-01-02T00:00:00Z' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm1', timestamp: '2026-01-01T00:00:00Z' }));

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('m1');
    expect(loaded[1].id).toBe('m2');
  });

  it('only returns messages for the specified chatId', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'm-chat1', chatId: 'chat-1' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm-chat2', chatId: 'chat-2' }));

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('m-chat1');
  });

  it('preserves all message fields', async () => {
    const msg = makeMsg({
      id: 'msg-fields',
      type: 'image',
      status: 'delivered',
      reactions: [{ emoji: '👍', count: 2 }],
      isStarred: true,
      replyToId: 'msg-orig',
      replyToContent: 'original',
      replyToSender: 'user-2',
      mediaPath: '/path/to/media',
      expiresAt: 1234567890,
      isEdited: true,
      keyVersion: 3,
      hmac: 'hmac-signature',
    });
    await appendMessage(USER_UID, msg);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0]).toMatchObject({
      id: 'msg-fields',
      type: 'image',
      status: 'delivered',
      reactions: [{ emoji: '👍', count: 2 }],
      isStarred: true,
      replyToId: 'msg-orig',
      replyToContent: 'original',
      replyToSender: 'user-2',
      mediaPath: '/path/to/media',
      expiresAt: 1234567890,
      isEdited: true,
      keyVersion: 3,
      hmac: 'hmac-signature',
    });
  });
});

describe('loadAllChats', () => {
  it('returns messages for multiple chats', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'm1', chatId: 'chat-1' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm2', chatId: 'chat-2' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm3', chatId: 'chat-1' }));

    const result = await loadAllChats(USER_UID, ['chat-1', 'chat-2']);
    expect(result['chat-1']).toHaveLength(2);
    expect(result['chat-2']).toHaveLength(1);
  });

  it('returns empty arrays for chats with no messages', async () => {
    const result = await loadAllChats(USER_UID, ['empty-chat']);
    expect(result['empty-chat']).toEqual([]);
  });
});

describe('listLocalChatIds', () => {
  it('returns empty when db is empty', async () => {
    const ids = await listLocalChatIds();
    expect(ids).toEqual([]);
  });

  it('returns unique chatIds', async () => {
    await appendMessage(USER_UID, makeMsg({ chatId: 'chat-a' }));
    await appendMessage(USER_UID, makeMsg({ chatId: 'chat-b' }));
    await appendMessage(USER_UID, makeMsg({ chatId: 'chat-a' }));

    const ids = await listLocalChatIds();
    expect(ids).toContain('chat-a');
    expect(ids).toContain('chat-b');
    expect(ids.length).toBe(2);
  });
});

describe('deleteLocalChat', () => {
  it('removes all messages for a chatId', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'm1', chatId: 'chat-del' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm2', chatId: 'chat-del' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm3', chatId: 'chat-other' }));

    await deleteLocalChat('chat-del');

    const loaded = await loadMessages(USER_UID, 'chat-del');
    expect(loaded).toEqual([]);
    const other = await loadMessages(USER_UID, 'chat-other');
    expect(other).toHaveLength(1);
  });
});

describe('clearAllMessages', () => {
  it('removes all messages from all chats', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'm1', chatId: 'c1' }));
    await appendMessage(USER_UID, makeMsg({ id: 'm2', chatId: 'c2' }));

    await clearAllMessages();

    const r1 = await loadMessages(USER_UID, 'c1');
    const r2 = await loadMessages(USER_UID, 'c2');
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
  });
});

describe('updateMessageStatus', () => {
  it('updates status from sent to delivered', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-st', status: 'sent' }));
    await updateMessageStatus(USER_UID, 'chat-1', 'msg-st', 'delivered');

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].status).toBe('delivered');
  });

  it('updates status from delivered to read', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-rd', status: 'delivered' }));
    await updateMessageStatus(USER_UID, 'chat-1', 'msg-rd', 'read');

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].status).toBe('read');
  });

  it('does nothing when db is null', async () => {
    await expect(updateMessageStatus(USER_UID, 'chat-1', 'msg-x', 'read')).resolves.toBeUndefined();
  });
});

describe('updateMessageStar', () => {
  it('stars a message', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-star', isStarred: false }));
    await updateMessageStar(USER_UID, 'chat-1', 'msg-star', true);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].isStarred).toBe(true);
  });

  it('unstars a message', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-unstar', isStarred: true }));
    await updateMessageStar(USER_UID, 'chat-1', 'msg-unstar', false);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].isStarred).toBe(false);
  });
});

describe('updateMessageContent', () => {
  it('updates message content and marks as edited', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-edit', content: 'old' }));
    await updateMessageContent(USER_UID, 'chat-1', 'msg-edit', 'new', true);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].content).toBe('new');
    expect(loaded[0].isEdited).toBe(true);
  });

  it('updates content without marking as edited', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-noedit', content: 'v1', isEdited: false }));
    await updateMessageContent(USER_UID, 'chat-1', 'msg-noedit', 'v2', false);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].content).toBe('v2');
    expect(loaded[0].isEdited).toBe(false);
  });
});

describe('updateMessageReactions', () => {
  it('sets reactions on a message', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-rx' }));
    await updateMessageReactions(USER_UID, 'chat-1', 'msg-rx', [
      { emoji: '❤️', count: 3 },
      { emoji: '👍', count: 1 },
    ]);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].reactions).toEqual([
      { emoji: '❤️', count: 3 },
      { emoji: '👍', count: 1 },
    ]);
  });

  it('clears reactions', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-rx2', reactions: [{ emoji: '👍', count: 1 }] }));
    await updateMessageReactions(USER_UID, 'chat-1', 'msg-rx2', []);

    const loaded = await loadMessages(USER_UID, 'chat-1');
    expect(loaded[0].reactions).toEqual([]);
  });
});

describe('deleteMessageById', () => {
  it('removes a single message', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'msg-del1', chatId: 'chat-del' }));
    await appendMessage(USER_UID, makeMsg({ id: 'msg-del2', chatId: 'chat-del' }));

    await deleteMessageById(USER_UID, 'chat-del', 'msg-del1');

    const loaded = await loadMessages(USER_UID, 'chat-del');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('msg-del2');
  });
});

describe('getStarredMessages', () => {
  it('returns only starred messages across all chats', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 's1', chatId: 'c1', isStarred: true, timestamp: '2026-01-01T00:00:00Z' }));
    await appendMessage(USER_UID, makeMsg({ id: 'ns1', chatId: 'c1', isStarred: false }));
    await appendMessage(USER_UID, makeMsg({ id: 's2', chatId: 'c2', isStarred: true, timestamp: '2026-01-02T00:00:00Z' }));

    const starred = await getStarredMessages(USER_UID);
    expect(starred).toHaveLength(2);
    expect(starred.every(m => m.isStarred)).toBe(true);
  });

  it('returns empty when no starred messages', async () => {
    await appendMessage(USER_UID, makeMsg({ isStarred: false }));
    const starred = await getStarredMessages(USER_UID);
    expect(starred).toEqual([]);
  });
});

describe('searchAllMessages', () => {
  it('returns matching messages by content', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 's1', content: 'Hello world' }));
    await appendMessage(USER_UID, makeMsg({ id: 's2', content: 'Goodbye moon' }));
    await appendMessage(USER_UID, makeMsg({ id: 's3', content: 'Hello again' }));

    const results = await searchAllMessages(USER_UID, 'Hello');
    expect(results).toHaveLength(2);
    expect(results.every(r => r.content.includes('Hello'))).toBe(true);
  });

  it('returns empty for empty query', async () => {
    await appendMessage(USER_UID, makeMsg());
    const results = await searchAllMessages(USER_UID, '');
    expect(results).toEqual([]);
  });

  it('returns empty for whitespace-only query', async () => {
    await appendMessage(USER_UID, makeMsg());
    const results = await searchAllMessages(USER_UID, '   ');
    expect(results).toEqual([]);
  });

  it('returns empty for no matches', async () => {
    await appendMessage(USER_UID, makeMsg({ content: 'Hello' }));
    const results = await searchAllMessages(USER_UID, 'xyz');
    expect(results).toEqual([]);
  });

  it('limits results to 50', async () => {
    for (let i = 0; i < 55; i++) {
      await appendMessage(USER_UID, makeMsg({ id: `msg-${i}`, content: 'searchable' }));
    }
    const results = await searchAllMessages(USER_UID, 'searchable');
    expect(results).toHaveLength(50);
  });
});

describe('saveMessages', () => {
  it('bulk inserts messages and replaces existing', async () => {
    await appendMessage(USER_UID, makeMsg({ id: 'old', chatId: 'bulk', content: 'old' }));

    await saveMessages(USER_UID, 'bulk', [
      makeMsg({ id: 'n1', chatId: 'bulk', content: 'new1' }),
      makeMsg({ id: 'n2', chatId: 'bulk', content: 'new2' }),
    ]);

    const loaded = await loadMessages(USER_UID, 'bulk');
    expect(loaded).toHaveLength(2);
    expect(loaded.find(m => m.id === 'old')).toBeUndefined();
  });
});

describe('clearKeyCache', () => {
  it('clears the cached encryption key', () => {
    expect(() => clearKeyCache()).not.toThrow();
  });
});
