import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  realtimeDb: {},
}));

vi.mock('../shared', () => ({
  sanitizePathComponent: vi.fn((s: string) => s),
}));

vi.mock('../../validators', () => ({
  friendRequestLimiter: {
    checkLimit: vi.fn(() => true),
  },
}));

const { mockSetDoc, mockUpdateDoc, mockGetDoc, mockGetDocs, mockWriteBatch, mockCollection, mockDoc, mockQuery, mockWhere, mockOnSnapshot, mockServerTimestamp, mockArrayUnion, mockArrayRemove } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockWriteBatch: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockQuery: vi.fn(),
  mockWhere: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockArrayUnion: vi.fn((val: any) => ({ __type: 'arrayUnion', value: val })),
  mockArrayRemove: vi.fn((val: any) => ({ __type: 'arrayRemove', value: val })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  query: mockQuery,
  where: mockWhere,
  getDocs: mockGetDocs,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  writeBatch: mockWriteBatch,
  onSnapshot: mockOnSnapshot,
  serverTimestamp: () => mockServerTimestamp(),
  arrayUnion: (val: any) => mockArrayUnion(val),
  arrayRemove: (val: any) => mockArrayRemove(val),
  getFirestore: vi.fn(() => ({})),
}));

import { friendRequestService } from '../friendRequestService';
import { friendRequestLimiter } from '../../validators';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockReturnValue('mockDocRef');
  mockCollection.mockReturnValue('mockCollectionRef');
  mockQuery.mockReturnValue('mockQueryRef');
  mockWhere.mockReturnValue('mockWhereRef');
  (friendRequestLimiter.checkLimit as any).mockReturnValue(true);
});

describe('sendFriendRequest', () => {
  it('creates request doc with correct fields', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ data: () => ({ username: 'Alice' }) })
      .mockResolvedValueOnce({ data: () => ({ username: 'Bob' }) });
    mockSetDoc.mockResolvedValue(undefined);

    const result = await friendRequestService.sendFriendRequest('uid_alice', 'uid_bob');

    expect(result.success).toBe(true);
    expect(result.requestId).toBeDefined();
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    const [docRef, data] = mockSetDoc.mock.calls[0];
    expect(docRef).toBe('mockDocRef');
    expect(data.fromUid).toBe('uid_alice');
    expect(data.toUid).toBe('uid_bob');
    expect(data.fromUsername).toBe('Alice');
    expect(data.toUsername).toBe('Bob');
    expect(data.status).toBe('pending');
    expect(data.createdAt).toBe('SERVER_TIMESTAMP');
    expect(data.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('sends notification to the target user', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ data: () => ({ username: 'Alice' }) })
      .mockResolvedValueOnce({ data: () => ({ username: 'Bob' }) });
    mockSetDoc.mockResolvedValue(undefined);

    await friendRequestService.sendFriendRequest('uid_alice', 'uid_bob');

    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    const notifCall = mockSetDoc.mock.calls[1];
    expect(notifCall[1]).toMatchObject({
      type: 'friend-request',
      from: 'uid_alice',
      message: 'Alice sent you a friend request',
      read: false,
    });
  });

  it('throws when rate limit is exceeded', async () => {
    (friendRequestLimiter.checkLimit as any).mockReturnValue(false);

    await expect(
      friendRequestService.sendFriendRequest('uid_alice', 'uid_bob')
    ).rejects.toThrow('Too many friend requests');
  });

  it('throws when Firestore setDoc fails', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ data: () => ({ username: 'A' }) })
      .mockResolvedValueOnce({ data: () => ({ username: 'B' }) });
    mockSetDoc.mockRejectedValue(new Error('Firestore error'));

    await expect(
      friendRequestService.sendFriendRequest('uid_a', 'uid_b')
    ).rejects.toThrow('Failed to send friend request');
  });

  it('falls back to Unknown when user info fetch fails', async () => {
    mockGetDoc.mockRejectedValue(new Error('user not found'));
    mockSetDoc.mockResolvedValue(undefined);

    const result = await friendRequestService.sendFriendRequest('uid_a', 'uid_b');

    expect(result.success).toBe(true);
    const data = mockSetDoc.mock.calls[0][1];
    expect(data.fromUsername).toBe('Unknown');
    expect(data.toUsername).toBe('Unknown');
  });
});

describe('acceptFriendRequest', () => {
  it('batch updates request status and both friendships', async () => {
    const mockBatch = {
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);
    mockGetDoc.mockResolvedValue({ data: () => ({ username: 'Bob' }) });

    const result = await friendRequestService.acceptFriendRequest('req_1', 'uid_alice', 'uid_bob');

    expect(result.success).toBe(true);
    expect(mockBatch.update).toHaveBeenCalledTimes(3);

    expect(mockBatch.update).toHaveBeenCalledWith('mockDocRef', {
      status: 'accepted',
      updatedAt: 'SERVER_TIMESTAMP',
    });

    expect(mockBatch.update).toHaveBeenCalledWith('mockDocRef', {
      friends: { __type: 'arrayUnion', value: 'uid_bob' },
    });

    expect(mockBatch.update).toHaveBeenCalledWith('mockDocRef', {
      friends: { __type: 'arrayUnion', value: 'uid_alice' },
    });

    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('sends acceptance notification to the requester', async () => {
    const mockBatch = {
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);
    mockGetDoc.mockResolvedValue({ data: () => ({ username: 'Bob' }) });

    await friendRequestService.acceptFriendRequest('req_1', 'uid_alice', 'uid_bob');

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const notifData = mockSetDoc.mock.calls[0][1];
    expect(notifData.type).toBe('friend-request-accepted');
    expect(notifData.from).toBe('uid_bob');
    expect(notifData.message).toBe('Bob accepted your friend request');
  });

  it('throws when batch commit fails', async () => {
    const mockBatch = {
      update: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error('batch-fail')),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    await expect(
      friendRequestService.acceptFriendRequest('req_1', 'uid_a', 'uid_b')
    ).rejects.toThrow('batch-fail');
  });
});

describe('rejectFriendRequest', () => {
  it('updates request status to rejected', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    const result = await friendRequestService.rejectFriendRequest('req_1', 'uid_bob');

    expect(result.success).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      status: 'rejected',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('throws when Firestore updateDoc fails', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('update-fail'));

    await expect(
      friendRequestService.rejectFriendRequest('req_1', 'uid_bob')
    ).rejects.toThrow('update-fail');
  });
});

describe('getPendingRequests', () => {
  it('returns filtered pending requests for a user', async () => {
    const docs = [
      { id: 'req_1', data: () => ({ fromUid: 'uid_a', toUid: 'uid_b', status: 'pending' }) },
      { id: 'req_2', data: () => ({ fromUid: 'uid_c', toUid: 'uid_b', status: 'pending' }) },
    ];
    mockGetDocs.mockResolvedValue({ docs });

    const result = await friendRequestService.getPendingRequests('uid_b');

    expect(result).toEqual([
      { id: 'req_1', fromUid: 'uid_a', toUid: 'uid_b', status: 'pending' },
      { id: 'req_2', fromUid: 'uid_c', toUid: 'uid_b', status: 'pending' },
    ]);
  });

  it('returns empty array when no pending requests exist', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await friendRequestService.getPendingRequests('uid_none');

    expect(result).toEqual([]);
  });

  it('returns empty array on Firestore error', async () => {
    mockGetDocs.mockRejectedValue(new Error('query-failed'));

    const result = await friendRequestService.getPendingRequests('uid_err');

    expect(result).toEqual([]);
  });
});

describe('listenToPendingRequests', () => {
  it('calls onSnapshot and invokes callback with requests', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, cb: any) => {
      cb({
        docs: [
          { id: 'req_1', data: () => ({ fromUid: 'uid_a', status: 'pending' }) },
        ],
      });
      return unsubscribe;
    });

    const unsub = friendRequestService.listenToPendingRequests('uid_b', callback);

    expect(callback).toHaveBeenCalledWith([
      { id: 'req_1', fromUid: 'uid_a', status: 'pending' },
    ]);
    expect(unsub).toBe(unsubscribe);
  });

  it('returns the unsubscribe function from onSnapshot', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const unsub = friendRequestService.listenToPendingRequests('uid_b', vi.fn());

    expect(unsub).toBe(unsubscribe);
  });
});

describe('removeFriend', () => {
  it('batch removes friend from both friend lists', async () => {
    const mockBatch = {
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    const result = await friendRequestService.removeFriend('uid_alice', 'uid_bob');

    expect(result.success).toBe(true);
    expect(mockBatch.update).toHaveBeenCalledTimes(2);

    expect(mockBatch.update).toHaveBeenCalledWith('mockDocRef', {
      friends: { __type: 'arrayRemove', value: 'uid_bob' },
    });

    expect(mockBatch.update).toHaveBeenCalledWith('mockDocRef', {
      friends: { __type: 'arrayRemove', value: 'uid_alice' },
    });

    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('throws when batch commit fails', async () => {
    const mockBatch = {
      update: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error('batch-fail')),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    await expect(
      friendRequestService.removeFriend('uid_a', 'uid_b')
    ).rejects.toThrow('batch-fail');
  });
});

describe('getFriendsList', () => {
  it('returns friends list with user details', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ data: () => ({ friends: ['uid_bob', 'uid_charlie'] }) })
      .mockResolvedValueOnce({ data: () => ({ username: 'Bob' }) })
      .mockResolvedValueOnce({ data: () => ({ username: 'Charlie' }) });

    const result = await friendRequestService.getFriendsList('uid_alice');

    expect(result).toEqual([
      { username: 'Bob' },
      { username: 'Charlie' },
    ]);
  });

  it('returns empty array when user has no friends', async () => {
    mockGetDoc.mockResolvedValue({ data: () => ({ friends: [] }) });

    const result = await friendRequestService.getFriendsList('uid_alice');

    expect(result).toEqual([]);
  });

  it('returns empty array when friendships doc does not exist', async () => {
    mockGetDoc.mockResolvedValue({ data: () => undefined });

    const result = await friendRequestService.getFriendsList('uid_alice');

    expect(result).toEqual([]);
  });

  it('returns empty array on Firestore error', async () => {
    mockGetDoc.mockRejectedValue(new Error('doc-fail'));

    const result = await friendRequestService.getFriendsList('uid_err');

    expect(result).toEqual([]);
  });

  it('filters out null friend info entries', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ data: () => ({ friends: ['uid_bob', 'uid_charlie'] }) })
      .mockResolvedValueOnce({ data: () => ({ username: 'Bob' }) })
      .mockResolvedValueOnce({ data: () => null });

    const result = await friendRequestService.getFriendsList('uid_alice');

    expect(result).toEqual([{ username: 'Bob' }]);
  });
});

describe('getUserInfo', () => {
  it('returns user document data', async () => {
    mockGetDoc.mockResolvedValue({ data: () => ({ username: 'Alice', email: 'a@test.com' }) });

    const result = await friendRequestService.getUserInfo('uid_alice');

    expect(result).toEqual({ username: 'Alice', email: 'a@test.com' });
  });

  it('returns null on Firestore error', async () => {
    mockGetDoc.mockRejectedValue(new Error('not-found'));

    const result = await friendRequestService.getUserInfo('uid_none');

    expect(result).toBeNull();
  });
});

describe('sendNotificationToUser', () => {
  it('writes notification doc to user subcollection', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    await friendRequestService.sendNotificationToUser('uid_bob', {
      type: 'friend-request',
      message: 'Hello',
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.type).toBe('friend-request');
    expect(data.message).toBe('Hello');
    expect(data.read).toBe(false);
    expect(data.createdAt).toBe('SERVER_TIMESTAMP');
  });

  it('does not throw when Firestore write fails', async () => {
    mockSetDoc.mockRejectedValue(new Error('write-fail'));

    await expect(
      friendRequestService.sendNotificationToUser('uid_bob', {
        type: 'test',
        message: 'test',
      })
    ).resolves.toBeUndefined();
  });
});
