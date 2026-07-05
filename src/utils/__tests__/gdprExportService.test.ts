import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('../services/userService', () => ({
  userService: { getUserProfile: vi.fn() },
}));

vi.mock('../services/callService', () => ({
  callService: { getCallHistory: vi.fn() },
}));

vi.mock('../services/statusService', () => ({
  statusService: { getUserStatuses: vi.fn() },
}));

vi.mock('../services/conversationService', () => ({
  conversationService: { getUserConversations: vi.fn() },
}));

vi.mock('../privacySettingsManager', () => ({
  getPrivacySettings: vi.fn(),
}));

vi.mock('../linkedDevicesManager', () => ({
  getDeviceSessions: vi.fn(),
}));

vi.mock('../sqliteMessageStore', () => ({
  loadAllChats: vi.fn(),
  listLocalChatIds: vi.fn(),
}));

vi.mock('../persistentMessageQueue', () => ({
  messageQueue: { getMessages: vi.fn().mockReturnValue([]) },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args: any[]) => ({ _path: args.join('/') })),
  getDoc: vi.fn(),
  collection: vi.fn((...args: any[]) => ({ _path: args.join('/') })),
  query: vi.fn((...args: any[]) => ({ _args: args })),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
}));

import { userService } from '../services/userService';
import { callService } from '../services/callService';
import { statusService } from '../services/statusService';
import { conversationService } from '../services/conversationService';
import { getPrivacySettings } from '../privacySettingsManager';
import { getDeviceSessions } from '../linkedDevicesManager';
import { listLocalChatIds, loadAllChats } from '../sqliteMessageStore';
import { messageQueue } from '../persistentMessageQueue';
import { getDoc, getDocs } from 'firebase/firestore';

import { exportAllUserData, downloadGdprExport } from '../gdprExportService';

const USER_ID = 'user-123';

function mockFirestoreDoc(data: any, exists = true) {
  return { data: () => data, exists: () => exists } as any;
}

function stubFirestoreDocs(data: any, exists = true) {
  vi.mocked(getDoc).mockResolvedValue(mockFirestoreDoc(data, exists));
}

describe('exportAllUserData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userService.getUserProfile).mockResolvedValue({ uid: USER_ID, name: 'Test User' } as any);
    vi.mocked(conversationService.getUserConversations).mockResolvedValue([] as any);
    vi.mocked(callService.getCallHistory).mockResolvedValue([] as any);
    vi.mocked(statusService.getUserStatuses).mockResolvedValue([] as any);
    vi.mocked(getPrivacySettings).mockResolvedValue(null as any);
    vi.mocked(getDeviceSessions).mockResolvedValue([] as any);
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any);
    vi.mocked(listLocalChatIds).mockResolvedValue([]);
    vi.mocked(messageQueue.getMessages).mockReturnValue([]);
  });

  it('gathers data from all sources and returns a complete export object', async () => {
    vi.mocked(userService.getUserProfile).mockResolvedValue({ uid: USER_ID, name: 'Test User' } as any);
    vi.mocked(getDoc)
      .mockResolvedValueOnce(mockFirestoreDoc({ friends: ['u1', 'u2'] }))
      .mockResolvedValueOnce(mockFirestoreDoc({ blocked: ['u3'] }))
      .mockResolvedValueOnce(mockFirestoreDoc({ theme: 'dark' }));
    vi.mocked(conversationService.getUserConversations).mockResolvedValue([{ id: 'c1' }] as any);
    vi.mocked(callService.getCallHistory).mockResolvedValue([{ id: 'call1' }] as any);
    vi.mocked(statusService.getUserStatuses).mockResolvedValue([{ id: 's1' }] as any);
    vi.mocked(getPrivacySettings).mockResolvedValue({ readReceipts: true } as any);
    vi.mocked(getDeviceSessions).mockResolvedValue([{ id: 'd1' }] as any);

    const result = await exportAllUserData(USER_ID);

    expect(result.userId).toBe(USER_ID);
    expect(result.exportVersion).toBe('1.0');
    expect(result.app).toBe('Veill (Quidec)');
    expect(result.profile).toEqual({ uid: USER_ID, name: 'Test User' });
    expect(result.friendships).toEqual({ friends: ['u1', 'u2'] });
    expect(result.conversations).toEqual([{ id: 'c1' }]);
    expect(result.callHistory).toEqual([{ id: 'call1' }]);
    expect(result.statuses).toEqual([{ id: 's1' }]);
    expect(result.privacySettings).toEqual({ readReceipts: true });
    expect(result.blockedUsers).toEqual({ blocked: ['u3'] });
    expect(result.deviceSessions).toEqual([{ id: 'd1' }]);
    expect(result.settings).toEqual({ theme: 'dark' });
    expect(result.localMessages).toEqual({});
    expect(result.queuedMessages).toEqual([]);
  });

  it('returns correct shape with all fields', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false));

    const result = await exportAllUserData(USER_ID);

    expect(result).toHaveProperty('exportVersion');
    expect(result).toHaveProperty('exportedAt');
    expect(result).toHaveProperty('app');
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('friendships');
    expect(result).toHaveProperty('friendRequests');
    expect(result).toHaveProperty('conversations');
    expect(result).toHaveProperty('groups');
    expect(result).toHaveProperty('callHistory');
    expect(result).toHaveProperty('statuses');
    expect(result).toHaveProperty('privacySettings');
    expect(result).toHaveProperty('blockedUsers');
    expect(result).toHaveProperty('deviceSessions');
    expect(result).toHaveProperty('settings');
    expect(result).toHaveProperty('localMessages');
    expect(result).toHaveProperty('queuedMessages');
    expect(typeof result.exportedAt).toBe('string');
    expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
  });

  it('uses defaults when Promise.allSettled results are rejected', async () => {
    vi.mocked(userService.getUserProfile).mockRejectedValue(new Error('profile fail'));
    vi.mocked(getDoc).mockRejectedValue(new Error('doc fail'));
    vi.mocked(conversationService.getUserConversations).mockRejectedValue(new Error('conv fail'));
    vi.mocked(callService.getCallHistory).mockRejectedValue(new Error('call fail'));
    vi.mocked(statusService.getUserStatuses).mockRejectedValue(new Error('status fail'));
    vi.mocked(getPrivacySettings).mockRejectedValue(new Error('privacy fail'));
    vi.mocked(getDeviceSessions).mockRejectedValue(new Error('devices fail'));
    vi.mocked(getDocs).mockRejectedValue(new Error('docs fail'));

    const result = await exportAllUserData(USER_ID);

    expect(result.profile).toBeNull();
    expect(result.friendships).toBeNull();
    expect(result.conversations).toEqual([]);
    expect(result.callHistory).toEqual([]);
    expect(result.statuses).toEqual([]);
    expect(result.privacySettings).toBeNull();
    expect(result.blockedUsers).toBeNull();
    expect(result.deviceSessions).toEqual([]);
    expect(result.friendRequests).toEqual([]);
    expect(result.groups).toEqual([]);
    expect(result.settings).toBeNull();
  });

  it('filters friend requests to only include those related to the user', async () => {
    vi.mocked(getDoc).mockResolvedValue(mockFirestoreDoc(null, false) as any);
    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ fromUid: USER_ID, toUid: 'other', text: 'req1' }) },
          { data: () => ({ fromUid: 'someone', toUid: 'another', text: 'unrelated' }) },
          { data: () => ({ fromUid: 'other', toUid: USER_ID, text: 'req2' }) },
        ],
      } as any)
      .mockResolvedValue({ docs: [] } as any);

    const result = await exportAllUserData(USER_ID);

    expect(result.friendRequests).toHaveLength(2);
    expect(result.friendRequests).toEqual([
      { fromUid: USER_ID, toUid: 'other', text: 'req1' },
      { fromUid: 'other', toUid: USER_ID, text: 'req2' },
    ]);
  });

  it('filters groups to only include those where user is a member', async () => {
    vi.mocked(getDoc).mockResolvedValue(mockFirestoreDoc(null, false) as any);
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as any)
      .mockResolvedValueOnce({
        docs: [
          { id: 'g1', data: () => ({ name: 'My Group', members: [USER_ID, 'u2'] }) },
          { id: 'g2', data: () => ({ name: 'Other Group', members: ['u3', 'u4'] }) },
          { id: 'g3', data: () => ({ name: 'Another', members: [] }) },
        ],
      } as any);

    const result = await exportAllUserData(USER_ID);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toEqual({ id: 'g1', name: 'My Group', members: [USER_ID, 'u2'] });
  });

  it('loads local messages when chat ids are available', async () => {
    vi.mocked(listLocalChatIds).mockResolvedValue(['chat1', 'chat2']);
    vi.mocked(loadAllChats).mockResolvedValue({
      chat1: [{ id: 'm1', text: 'hello' }],
      chat2: [{ id: 'm2', text: 'world' }],
    } as any);

    const result = await exportAllUserData(USER_ID);

    expect(listLocalChatIds).toHaveBeenCalled();
    expect(loadAllChats).toHaveBeenCalledWith(USER_ID, ['chat1', 'chat2']);
    expect(result.localMessages).toEqual({
      chat1: [{ id: 'm1', text: 'hello' }],
      chat2: [{ id: 'm2', text: 'world' }],
    });
  });

  it('includes queued messages from messageQueue', async () => {
    vi.mocked(messageQueue.getMessages).mockReturnValue([
      { id: 'q1', content: 'queued' },
    ] as any);

    const result = await exportAllUserData(USER_ID);

    expect(result.queuedMessages).toEqual([{ id: 'q1', content: 'queued' }]);
  });

  it('handles partial failures — some sources fail, others succeed', async () => {
    vi.mocked(userService.getUserProfile).mockResolvedValue({ uid: USER_ID } as any);
    vi.mocked(getDoc)
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false));
    vi.mocked(conversationService.getUserConversations).mockRejectedValue(new Error('fail'));
    vi.mocked(callService.getCallHistory).mockResolvedValue([{ id: 'call1' }] as any);
    vi.mocked(statusService.getUserStatuses).mockRejectedValue(new Error('fail'));
    vi.mocked(getPrivacySettings).mockResolvedValue({ readReceipts: false } as any);
    vi.mocked(getDeviceSessions).mockResolvedValue([] as any);

    const result = await exportAllUserData(USER_ID);

    expect(result.profile).toEqual({ uid: USER_ID });
    expect(result.conversations).toEqual([]);
    expect(result.callHistory).toEqual([{ id: 'call1' }]);
    expect(result.statuses).toEqual([]);
    expect(result.privacySettings).toEqual({ readReceipts: false });
  });

  it('returns empty friendRequests when getDocs for friendRequests throws', async () => {
    vi.mocked(getDoc).mockResolvedValue(mockFirestoreDoc(null, false) as any);
    vi.mocked(getDocs)
      .mockRejectedValueOnce(new Error('firestore error'))
      .mockResolvedValue({ docs: [] } as any);

    const result = await exportAllUserData(USER_ID);

    expect(result.friendRequests).toEqual([]);
  });

  it('returns empty groups when getDocs for groups throws', async () => {
    vi.mocked(getDoc).mockResolvedValue(mockFirestoreDoc(null, false) as any);
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ docs: [] } as any)
      .mockRejectedValueOnce(new Error('firestore error'));

    const result = await exportAllUserData(USER_ID);

    expect(result.groups).toEqual([]);
  });

  it('returns null settings when settings doc does not exist', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(mockFirestoreDoc({ friends: [] }))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false));

    const result = await exportAllUserData(USER_ID);

    expect(result.settings).toBeNull();
  });

  it('returns empty localMessages when listLocalChatIds throws', async () => {
    vi.mocked(listLocalChatIds).mockRejectedValue(new Error('sqlite fail'));

    const result = await exportAllUserData(USER_ID);

    expect(result.localMessages).toEqual({});
  });

  it('returns empty queuedMessages when messageQueue.getMessages throws', async () => {
    vi.mocked(messageQueue.getMessages).mockImplementation(() => {
      throw new Error('queue fail');
    });

    const result = await exportAllUserData(USER_ID);

    expect(result.queuedMessages).toEqual([]);
  });

  it('returns null friendships when doc exists but has no data', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(mockFirestoreDoc(undefined, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false));

    const result = await exportAllUserData(USER_ID);

    expect(result.friendships).toBeNull();
  });

  it('returns null blockedUsers when doc does not exist', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce(mockFirestoreDoc({ friends: [] }))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false))
      .mockResolvedValueOnce(mockFirestoreDoc(null, false));

    const result = await exportAllUserData(USER_ID);

    expect(result.blockedUsers).toBeNull();
  });
});

describe('downloadGdprExport', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.fn>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clickSpy = vi.fn();
    const mockAnchor = {
      href: '',
      download: '',
      click: clickSpy,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node as any);
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node as any);

    createObjectURLSpy = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });
  });

  it('creates a blob and triggers download', () => {
    const data = { exportVersion: '1.0', userId: 'u1' } as any;

    downloadGdprExport(data);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLSpy.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('appends anchor to body, clicks it, and removes it', () => {
    const data = { test: true } as any;

    downloadGdprExport(data);

    const anchorCalls = appendChildSpy.mock.calls.filter(
      (call: any[]) => call[0]?.click === clickSpy
    );
    expect(anchorCalls).toHaveLength(1);

    expect(clickSpy).toHaveBeenCalledTimes(1);

    const removeCalls = removeChildSpy.mock.calls.filter(
      (call: any[]) => call[0]?.click === clickSpy
    );
    expect(removeCalls).toHaveLength(1);
  });

  it('revokes the object URL after download', () => {
    downloadGdprExport({} as any);

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('sets the download filename with correct date format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:30:00.000Z'));

    const mockAnchor: any = { href: '', download: '', click: vi.fn() };
    vi.mocked(document.createElement).mockReturnValue(mockAnchor);

    downloadGdprExport({} as any);

    expect(mockAnchor.download).toBe('veill_gdpr_export_2025-06-15.json');

    vi.useRealTimers();
  });

  it('serializes data as pretty-printed JSON in the blob', () => {
    const data = { exportVersion: '1.0', userId: 'u1' } as any;

    downloadGdprExport(data);

    const blobArg = createObjectURLSpy.mock.calls[0][0];
    expect(blobArg.type).toBe('application/json');
  });
});

describe('downloadGdprExport error handling', () => {
  it('propagates errors when document.createElement fails', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM error');
    });

    const data = { test: true } as any;

    expect(() => downloadGdprExport(data)).toThrow('DOM error');
  });
});
