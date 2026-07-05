import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    time: vi.fn(),
    timeEnd: vi.fn(),
  },
}));

let idbPaginator: Awaited<typeof import('../idbPaginator')>['idbPaginator'];

function createMessage(overrides: Record<string, any> = {}) {
  return {
    id: `msg_${Math.random().toString(36).substr(2, 9)}`,
    conversationId: 'conv_test',
    content: 'test message',
    senderUid: 'user_a',
    timestamp: Date.now(),
    ...overrides,
  };
}

async function clearStore() {
  const dbs = await indexedDB.databases();
  for (const dbInfo of dbs) {
    if (dbInfo.name === 'quidec_messages') {
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('quidec_messages', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('messages', 'readwrite');
          const store = tx.objectStore('messages');
          store.clear();
          tx.oncomplete = () => { db.close(); resolve(); };
        };
        req.onerror = () => resolve();
      });
      return;
    }
  }
}

describe('idbPaginator', () => {
  beforeAll(async () => {
    const mod = await import('../idbPaginator');
    idbPaginator = mod.idbPaginator;
    await new Promise((r) => setTimeout(r, 100));
  });

  beforeEach(async () => {
    await clearStore();
  });

  it('returns empty result when DB has no messages', async () => {
    const result = await idbPaginator.loadPage('conv_empty');
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('loads first page of messages', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_1', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const result = await idbPaginator.loadPage('conv_1', 1, 10);
    expect(result.items).toHaveLength(5);
    expect(result.hasMore).toBe(false);
    expect(result.pageNumber).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('paginates forward across multiple pages', async () => {
    const msgs = Array.from({ length: 25 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_2', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const page1 = await idbPaginator.loadPage('conv_2', 1, 10);
    expect(page1.items).toHaveLength(10);
    expect(page1.hasMore).toBe(true);

    const page2 = await idbPaginator.loadPage('conv_2', 2, 10);
    expect(page2.items).toHaveLength(10);
    expect(page2.hasMore).toBe(true);

    const page3 = await idbPaginator.loadPage('conv_2', 3, 10);
    expect(page3.items).toHaveLength(5);
    expect(page3.hasMore).toBe(false);
  });

  it('respects page size limit (max 100)', async () => {
    const msgs = Array.from({ length: 200 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_3', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const result = await idbPaginator.loadPage('conv_3', 1, 200);
    expect(result.items.length).toBeLessThanOrEqual(100);
  });

  it('uses default page size (50) when not specified', async () => {
    const msgs = Array.from({ length: 80 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_4', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const result = await idbPaginator.loadPage('conv_4', 1);
    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it('loadBefore returns older messages for infinite scroll', async () => {
    const msgs = Array.from({ length: 30 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_5', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const result = await idbPaginator.loadBefore('conv_5', 1015, 10);
    expect(result.items).toHaveLength(10);
    expect(result.hasMore).toBe(true);
    expect(result.items.every((m: any) => m.timestamp < 1015)).toBe(true);
  });

  it('loadBefore returns remaining messages when fewer than page size', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_6', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const result = await idbPaginator.loadBefore('conv_6', 1002, 10);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it('loadBefore returns empty when no messages before timestamp', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_7', timestamp: 5000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const result = await idbPaginator.loadBefore('conv_7', 5000, 10);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('returns correct message count', async () => {
    const msgs = Array.from({ length: 15 }, (_, i) =>
      createMessage({ id: `msg_${i}`, conversationId: 'conv_count', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const count = await idbPaginator.getMessageCount('conv_count');
    expect(count).toBe(15);
  });

  it('returns 0 count for non-existent conversation', async () => {
    const count = await idbPaginator.getMessageCount('conv_nonexistent');
    expect(count).toBe(0);
  });

  it('clearConversation removes all messages for that conversation', async () => {
    const msgsA = Array.from({ length: 10 }, (_, i) =>
      createMessage({ id: `clear_${i}`, conversationId: 'conv_clear', timestamp: 1000 + i })
    );
    const msgsB = Array.from({ length: 5 }, (_, i) =>
      createMessage({ id: `keep_${i}`, conversationId: 'conv_keep', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages([...msgsA, ...msgsB]);

    await idbPaginator.clearConversation('conv_clear');

    const countCleared = await idbPaginator.getMessageCount('conv_clear');
    const countKept = await idbPaginator.getMessageCount('conv_keep');
    expect(countCleared).toBe(0);
    expect(countKept).toBe(5);
  });

  it('returns stats with correct fields', async () => {
    const msgs = Array.from({ length: 20 }, (_, i) =>
      createMessage({ id: `stat_${i}`, conversationId: 'conv_stats', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages(msgs);

    const stats = await idbPaginator.getStats();
    expect(stats.totalMessages).toBe(20);
    expect(stats.pageSizeDefault).toBe(50);
    expect(stats.pageSizeLimit).toBe(100);
    expect(stats.maxMessages).toBe(5000);
  });

  it('does not return messages from other conversations', async () => {
    const msgsA = Array.from({ length: 5 }, (_, i) =>
      createMessage({ id: `a_${i}`, conversationId: 'conv_a', timestamp: 1000 + i })
    );
    const msgsB = Array.from({ length: 3 }, (_, i) =>
      createMessage({ id: `b_${i}`, conversationId: 'conv_b', timestamp: 1000 + i })
    );
    await idbPaginator.addMessages([...msgsA, ...msgsB]);

    const result = await idbPaginator.loadPage('conv_a', 1, 100);
    expect(result.items).toHaveLength(5);
    expect(result.items.every((m: any) => m.conversationId === 'conv_a')).toBe(true);
  });
});
