import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  realtimeDb: {},
  auth: {},
}));

vi.mock('../../e2ee', () => ({
  decryptUserData: vi.fn((_uid: string, data: any) => Promise.resolve(data)),
  encryptUserData: vi.fn((_uid: string, data: any) => Promise.resolve(data)),
}));

vi.mock('./shared', () => ({
  sanitizePathComponent: vi.fn((s: string) => s),
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { mockCheckLimit, mockGetDoc, mockGetDocs, mockDoc, mockCollection, mockQuery, mockWhere, mockWriteBatch, mockUpdateDoc, mockLimit, mockServerTimestamp, mockRemove } = vi.hoisted(() => ({
  mockCheckLimit: vi.fn().mockReturnValue(true),
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockDoc: vi.fn(),
  mockCollection: vi.fn(),
  mockQuery: vi.fn(),
  mockWhere: vi.fn(),
  mockWriteBatch: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockLimit: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockRemove: vi.fn(),
}));

vi.mock('../../validators', () => ({
  validateEmail: vi.fn((v: string) => v),
  validatePassword: vi.fn((v: string) => v),
  validateUsername: vi.fn((v: string) => v),
  validateDisplayName: vi.fn((v: string) => v),
  validateAbout: vi.fn((v: string) => v),
  profileUpdateLimiter: { checkLimit: (...args: any[]) => mockCheckLimit(...args) },
  loginLimiter: { checkLimit: vi.fn() },
  registerLimiter: { checkLimit: vi.fn() },
}));

vi.mock('firebase/firestore', () => ({
  getDoc: (...args: any[]) => mockGetDoc(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  doc: (...args: any[]) => mockDoc(...args),
  collection: (...args: any[]) => mockCollection(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  writeBatch: (...args: any[]) => mockWriteBatch(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  limit: (...args: any[]) => mockLimit(...args),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { now: vi.fn(() => 'TIMESTAMP') },
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => path),
  remove: (...args: any[]) => mockRemove(...args),
}));

import { userService } from '../userService';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockReturnValue('mockDocRef');
  mockCollection.mockReturnValue('mockCollectionRef');
  mockQuery.mockReturnValue('mockQueryRef');
  mockWhere.mockReturnValue('mockWhereRef');
  mockLimit.mockReturnValue('mockLimitRef');
  mockServerTimestamp.mockReturnValue('SERVER_TIMESTAMP');
  mockCheckLimit.mockReturnValue(true);
});

describe('getUserProfile', () => {
  it('returns user data for existing doc', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: 'u1', username: 'alice', displayName: 'Alice' }),
    });

    const result = await userService.getUserProfile('u1');

    expect(mockGetDoc).toHaveBeenCalledWith('mockDocRef');
    expect(result).toEqual({ uid: 'u1', username: 'alice', displayName: 'Alice' });
  });

  it('returns null for missing doc', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
    });

    const result = await userService.getUserProfile('u_missing');

    expect(result).toBeNull();
  });

  it('throws on permission-denied error', async () => {
    const err: any = new Error('permission denied');
    err.code = 'permission-denied';
    mockGetDoc.mockRejectedValue(err);

    await expect(userService.getUserProfile('u1')).rejects.toThrow(
      'Permission denied to access user profile'
    );
  });

  it('throws on unavailable error', async () => {
    const err: any = new Error('unavailable');
    err.code = 'unavailable';
    mockGetDoc.mockRejectedValue(err);

    await expect(userService.getUserProfile('u1')).rejects.toThrow(
      'Firebase service temporarily unavailable'
    );
  });

  it('returns null on generic error', async () => {
    mockGetDoc.mockRejectedValue(new Error('network error'));

    const result = await userService.getUserProfile('u1');

    expect(result).toBeNull();
  });
});

describe('updateUserProfile', () => {
  it('calls updateDoc with sanitized fields and serverTimestamp', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    const result = await userService.updateUserProfile('u1', {
      displayName: 'Bob',
      about: 'Hello world',
      photoURL: 'https://example.com/photo.jpg',
      notificationsEnabled: true,
    });

    expect(result).toEqual({ success: true });
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      displayName: 'Bob',
      about: 'Hello world',
      photoURL: 'https://example.com/photo.jpg',
      notificationsEnabled: true,
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('throws when rate limiter rejects', async () => {
    mockCheckLimit.mockReturnValue(false);

    await expect(
      userService.updateUserProfile('u1', { displayName: 'Bob' })
    ).rejects.toThrow('Too many profile updates');
  });

  it('throws on not-found error', async () => {
    const err: any = new Error('not found');
    err.code = 'not-found';
    mockUpdateDoc.mockRejectedValue(err);

    await expect(
      userService.updateUserProfile('u1', { displayName: 'Bob' })
    ).rejects.toThrow('User profile not found');
  });

  it('throws on permission-denied error', async () => {
    const err: any = new Error('permission denied');
    err.code = 'permission-denied';
    mockUpdateDoc.mockRejectedValue(err);

    await expect(
      userService.updateUserProfile('u1', { displayName: 'Bob' })
    ).rejects.toThrow('Permission denied to update profile');
  });

  it('wraps generic errors with message', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('some error'));

    await expect(
      userService.updateUserProfile('u1', { displayName: 'Bob' })
    ).rejects.toThrow('Failed to update profile: some error');
  });

  it('only includes provided fields in sanitized update', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    await userService.updateUserProfile('u1', { displayName: 'Only Name' });

    const callArgs = mockUpdateDoc.mock.calls[0][1];
    expect(callArgs).toHaveProperty('displayName', 'Only Name');
    expect(callArgs).toHaveProperty('updatedAt', 'SERVER_TIMESTAMP');
    expect(callArgs).not.toHaveProperty('about');
    expect(callArgs).not.toHaveProperty('photoURL');
  });
});

describe('searchUsers', () => {
  it('returns exact match excluding current user', async () => {
    const docs = [
      { id: 'preet_4736', data: () => ({ username: 'preet_4736', displayName: 'Preet' }) },
    ];
    mockGetDocs.mockResolvedValue({ docs });

    const result = await userService.searchUsers('preet_4736', 'other_user');

    expect(result).toEqual([
      { handle: 'preet_4736', username: 'preet_4736', displayName: 'Preet' },
    ]);
  });

  it('returns empty when partial match (no prefix matching)', async () => {
    const docs: any[] = [];
    mockGetDocs.mockResolvedValue({ docs });

    const result = await userService.searchUsers('preet', 'other_user');

    expect(result).toEqual([]);
  });

  it('returns empty array when no matches', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await userService.searchUsers('zzz_1234', 'u1');

    expect(result).toEqual([]);
  });

  it('returns empty array on Firestore error', async () => {
    mockGetDocs.mockRejectedValue(new Error('query failed'));

    const result = await userService.searchUsers('alice_1234', 'u1');

    expect(result).toEqual([]);
  });

  it('returns empty array for empty search term', async () => {
    const result = await userService.searchUsers('', 'u1');

    expect(result).toEqual([]);
  });

  it('strips @ prefix from search term', async () => {
    const docs = [
      { id: 'preet_4736', data: () => ({ username: 'preet_4736', displayName: 'Preet' }) },
    ];
    mockGetDocs.mockResolvedValue({ docs });

    const result = await userService.searchUsers('@preet_4736', 'other_user');

    expect(result).toEqual([
      { handle: 'preet_4736', username: 'preet_4736', displayName: 'Preet' },
    ]);
  });
});

describe('getUserByUsername', () => {
  it('returns user with matching username', async () => {
    const docs = [
      { id: 'u1', data: () => ({ username: 'alice', displayName: 'Alice' }) },
    ];
    mockGetDocs.mockResolvedValue({ docs, empty: false });

    const result = await userService.getUserByUsername('alice');

    expect(result).toEqual({ handle: 'u1', username: 'alice', displayName: 'Alice' });
  });

  it('returns null when no user found', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });

    const result = await userService.getUserByUsername('nonexistent');

    expect(result).toBeNull();
  });

  it('returns null on Firestore error', async () => {
    mockGetDocs.mockRejectedValue(new Error('query failed'));

    const result = await userService.getUserByUsername('alice');

    expect(result).toBeNull();
  });

  it('returns first matching user when multiple exist', async () => {
    const docs = [
      { id: 'u1', data: () => ({ username: 'alice' }) },
      { id: 'u2', data: () => ({ username: 'alice' }) },
    ];
    mockGetDocs.mockResolvedValue({ docs, empty: false });

    const result = await userService.getUserByUsername('alice');

    expect(result).toEqual({ handle: 'u1', username: 'alice' });
  });
});

describe('deleteUserAccount', () => {
  const setupBatchMock = () => {
    const mockBatch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);
    return mockBatch;
  };

  it('batch deletes user doc and friendships', async () => {
    const mockBatch = setupBatchMock();
    mockGetDocs
      .mockResolvedValueOnce({ forEach: vi.fn() })
      .mockResolvedValueOnce({ forEach: vi.fn() });
    mockRemove.mockResolvedValue(undefined);

    const result = await userService.deleteUserAccount('u1');

    expect(result).toEqual({ success: true });
    expect(mockBatch.delete).toHaveBeenCalledWith('mockDocRef');
    expect(mockBatch.commit).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('deletes sent friend requests', async () => {
    const mockBatch = setupBatchMock();
    const sentDelete = vi.fn();
    mockGetDocs
      .mockResolvedValueOnce({
        forEach: (cb: (doc: any) => void) => {
          cb({ ref: 'sent_ref_1' });
          cb({ ref: 'sent_ref_2' });
        },
      })
      .mockResolvedValueOnce({ forEach: vi.fn() });
    mockRemove.mockResolvedValue(undefined);

    await userService.deleteUserAccount('u1');

    expect(mockBatch.delete).toHaveBeenCalledWith('sent_ref_1');
    expect(mockBatch.delete).toHaveBeenCalledWith('sent_ref_2');
  });

  it('deletes received friend requests', async () => {
    const mockBatch = setupBatchMock();
    mockGetDocs
      .mockResolvedValueOnce({ forEach: vi.fn() })
      .mockResolvedValueOnce({
        forEach: (cb: (doc: any) => void) => {
          cb({ ref: 'recv_ref_1' });
        },
      });
    mockRemove.mockResolvedValue(undefined);

    await userService.deleteUserAccount('u1');

    expect(mockBatch.delete).toHaveBeenCalledWith('recv_ref_1');
  });

  it('deletes RTDB presence', async () => {
    const mockBatch = setupBatchMock();
    mockGetDocs
      .mockResolvedValueOnce({ forEach: vi.fn() })
      .mockResolvedValueOnce({ forEach: vi.fn() });
    mockRemove.mockResolvedValue(undefined);

    await userService.deleteUserAccount('u1');

    expect(mockRemove).toHaveBeenCalled();
  });

  it('throws on Firestore batch error', async () => {
    const mockBatch = {
      delete: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error('batch failed')),
    };
    mockWriteBatch.mockReturnValue(mockBatch);
    mockGetDocs
      .mockResolvedValueOnce({ forEach: vi.fn() })
      .mockResolvedValueOnce({ forEach: vi.fn() });

    await expect(userService.deleteUserAccount('u1')).rejects.toThrow('batch failed');
  });

  it('throws on RTDB removal error', async () => {
    const mockBatch = setupBatchMock();
    mockGetDocs
      .mockResolvedValueOnce({ forEach: vi.fn() })
      .mockResolvedValueOnce({ forEach: vi.fn() });
    mockRemove.mockRejectedValue(new Error('rtdb failed'));

    await expect(userService.deleteUserAccount('u1')).rejects.toThrow('rtdb failed');
  });
});

describe('markNotificationAsRead', () => {
  it('updates notification doc with read: true', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    await userService.markNotificationAsRead('u1', 'notif_1');

    expect(mockDoc).toHaveBeenCalledWith({}, 'users', 'u1', 'notifications', 'notif_1');
    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', { read: true });
  });

  it('does not throw on error (error is caught)', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('update failed'));

    await expect(
      userService.markNotificationAsRead('u1', 'notif_1')
    ).resolves.toBeUndefined();
  });
});
