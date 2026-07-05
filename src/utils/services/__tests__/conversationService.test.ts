import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
}));

vi.mock('../shared', () => ({
  getConversationId: vi.fn((uid1: string, uid2: string) =>
    [uid1, uid2].sort().join('_')
  ),
}));

const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockDeleteDoc = vi.fn();
const mockWriteBatch = vi.fn();
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockOnSnapshot = vi.fn();
const mockServerTimestamp = vi.fn(() => 'SERVER_TIMESTAMP');

vi.mock('firebase/firestore', () => ({
  collection: (...args: any[]) => mockCollection(...args),
  doc: (...args: any[]) => mockDoc(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  writeBatch: (...args: any[]) => mockWriteBatch(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

import { conversationService } from '../conversationService';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockReturnValue('mockDocRef');
  mockCollection.mockReturnValue('mockCollectionRef');
  mockQuery.mockReturnValue('mockQueryRef');
  mockWhere.mockReturnValue('mockWhereRef');
  mockOrderBy.mockReturnValue('mockOrderByRef');
  mockServerTimestamp.mockReturnValue('SERVER_TIMESTAMP');
});

describe('createConversation', () => {
  it('generates correct sorted, underscored conversation ID', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockSetDoc.mockResolvedValue(undefined);

    const id = await conversationService.createConversation('uid_bob', 'uid_alice');

    expect(id).toBe('uid_alice_uid_bob');
  });

  it('returns existing conversation ID without creating a new doc', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true });
    mockSetDoc.mockResolvedValue(undefined);

    const id = await conversationService.createConversation('uid_alice', 'uid_bob');

    expect(id).toBe('uid_alice_uid_bob');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('calls setDoc with correct fields for a new conversation', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockSetDoc.mockResolvedValue(undefined);

    await conversationService.createConversation('uid_a', 'uid_b');

    expect(mockSetDoc).toHaveBeenCalledWith('mockDocRef', {
      participants: ['uid_a', 'uid_b'],
      createdAt: 'SERVER_TIMESTAMP',
      lastMessageTime: 'SERVER_TIMESTAMP',
      lastMessage: '',
      lastMessageSender: '',
      type: 'direct',
    });
  });

  it('throws when Firestore fails', async () => {
    mockGetDoc.mockRejectedValue(new Error('Firestore error'));

    await expect(
      conversationService.createConversation('uid_a', 'uid_b')
    ).rejects.toThrow('Firestore error');
  });
});

describe('updateConversationMetadata', () => {
  it('calls updateDoc with correct fields', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    await conversationService.updateConversationMetadata(
      'from_uid',
      'to_uid',
      'conv_123',
      'Hello!'
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      lastMessage: 'Hello!',
      lastMessageTime: 'SERVER_TIMESTAMP',
      participants: ['from_uid', 'to_uid'],
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('falls back to setDoc when updateDoc fails', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('not-found'));
    mockSetDoc.mockResolvedValue(undefined);

    await conversationService.updateConversationMetadata(
      'from_uid',
      'to_uid',
      'conv_123',
      'Hello!'
    );

    expect(mockSetDoc).toHaveBeenCalledWith('mockDocRef', {
      conversationId: 'conv_123',
      participants: ['from_uid', 'to_uid'],
      lastMessage: 'Hello!',
      lastMessageTime: 'SERVER_TIMESTAMP',
      createdAt: 'SERVER_TIMESTAMP',
    });
  });

  it('does not throw when updateDoc fails (error is caught internally)', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('firestore-fail'));
    mockSetDoc.mockRejectedValue(new Error('set-fail'));

    await expect(
      conversationService.updateConversationMetadata(
        'from_uid',
        'to_uid',
        'conv_123',
        'msg'
      )
    ).resolves.toBeUndefined();
  });
});

describe('deleteConversation', () => {
  it('batch deletes conversation and all messages', async () => {
    const mockBatch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    const messageDocs = [
      { ref: 'msg_ref_1' },
      { ref: 'msg_ref_2' },
    ];
    mockGetDocs.mockResolvedValue({
      forEach: (cb: (doc: any) => void) => messageDocs.forEach(cb),
    });

    await conversationService.deleteConversation('conv_123');

    expect(mockGetDocs).toHaveBeenCalled();
    expect(mockBatch.delete).toHaveBeenCalledTimes(3);
    expect(mockBatch.delete).toHaveBeenCalledWith('msg_ref_1');
    expect(mockBatch.delete).toHaveBeenCalledWith('msg_ref_2');
    expect(mockBatch.delete).toHaveBeenCalledWith('mockDocRef');
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('handles empty message subcollection', async () => {
    const mockBatch = {
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    mockGetDocs.mockResolvedValue({
      forEach: (cb: (doc: any) => void) => {},
    });

    await conversationService.deleteConversation('conv_456');

    expect(mockBatch.delete).toHaveBeenCalledTimes(1);
    expect(mockBatch.delete).toHaveBeenCalledWith('mockDocRef');
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('does not throw when Firestore batch fails', async () => {
    const mockBatch = {
      delete: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error('batch-fail')),
    };
    mockWriteBatch.mockReturnValue(mockBatch);

    mockGetDocs.mockResolvedValue({
      forEach: () => {},
    });

    await expect(
      conversationService.deleteConversation('conv_fail')
    ).resolves.toBeUndefined();
  });
});

describe('getUserConversations', () => {
  it('returns conversation list with id and data', async () => {
    const docs = [
      { id: 'conv_1', data: () => ({ participants: ['a', 'b'], lastMessage: 'hi' }) },
      { id: 'conv_2', data: () => ({ participants: ['a', 'c'], lastMessage: 'hey' }) },
    ];
    mockGetDocs.mockResolvedValue({ docs });

    const result = await conversationService.getUserConversations('uid_a');

    expect(result).toEqual([
      { id: 'conv_1', participants: ['a', 'b'], lastMessage: 'hi' },
      { id: 'conv_2', participants: ['a', 'c'], lastMessage: 'hey' },
    ]);
  });

  it('returns empty array when no conversations found', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await conversationService.getUserConversations('uid_none');

    expect(result).toEqual([]);
  });

  it('returns empty array on Firestore error', async () => {
    mockGetDocs.mockRejectedValue(new Error('query-failed'));

    const result = await conversationService.getUserConversations('uid_err');

    expect(result).toEqual([]);
  });
});

describe('listenToUserConversations', () => {
  it('calls onSnapshot and invokes callback with conversations', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, cb: any) => {
      cb({
        docs: [
          { id: 'c1', data: () => ({ lastMessage: 'a' }) },
        ],
      });
      return unsubscribe;
    });

    const unsub = conversationService.listenToUserConversations('uid_a', callback);

    expect(callback).toHaveBeenCalledWith([
      { id: 'c1', lastMessage: 'a' },
    ]);
    expect(unsub).toBe(unsubscribe);
  });

  it('returns the unsubscribe function from onSnapshot', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const unsub = conversationService.listenToUserConversations('uid_a', vi.fn());

    expect(unsub).toBe(unsubscribe);
  });
});
