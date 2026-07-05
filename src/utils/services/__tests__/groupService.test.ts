import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  realtimeDb: {},
}));

vi.mock('../../shared', () => ({
  getGroupKey: vi.fn().mockResolvedValue('mock-group-key'),
}));

vi.mock('../../encryption', () => ({
  encryptMessage: vi.fn().mockResolvedValue('encrypted-content'),
  decryptMessage: vi.fn().mockResolvedValue({ content: 'decrypted' }),
  deriveKey: vi.fn().mockResolvedValue('mock-derive-key'),
}));

vi.mock('../../validators', () => ({
  validateGroupName: vi.fn((name: string) => name),
  validateGroupDescription: vi.fn((desc: string) => desc),
  groupCreateLimiter: {
    checkLimit: vi.fn().mockReturnValue(true),
  },
}));

const { mockSetDoc, mockUpdateDoc, mockGetDoc, mockGetDocs, mockWriteBatch, mockCollection, mockDoc, mockQuery, mockWhere, mockOrderBy, mockLimit, mockArrayUnion, mockArrayRemove, mockOnSnapshot, mockServerTimestamp, mockRtdbSet } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockWriteBatch: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockQuery: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockArrayUnion: vi.fn((...args: any[]) => ({ __type: 'union', values: args })),
  mockArrayRemove: vi.fn((...args: any[]) => ({ __type: 'remove', values: args })),
  mockOnSnapshot: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockRtdbSet: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: any[]) => mockCollection(...args),
  doc: (...args: any[]) => mockDoc(...args),
  query: (...args: any[]) => mockQuery(...args),
  where: (...args: any[]) => mockWhere(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  limit: (...args: any[]) => mockLimit(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  writeBatch: (...args: any[]) => mockWriteBatch(...args),
  arrayUnion: (...args: any[]) => mockArrayUnion(...args),
  arrayRemove: (...args: any[]) => mockArrayRemove(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ __ref: path })),
  set: (...args: any[]) => mockRtdbSet(...args),
}));

import { groupService } from '../groupService';

beforeEach(() => {
  vi.clearAllMocks();
  mockDoc.mockReturnValue('mockDocRef');
  mockCollection.mockReturnValue('mockCollectionRef');
  mockQuery.mockReturnValue('mockQueryRef');
  mockWhere.mockReturnValue('mockWhereRef');
  mockOrderBy.mockReturnValue('mockOrderByRef');
  mockLimit.mockReturnValue('mockLimitRef');
  mockServerTimestamp.mockReturnValue('SERVER_TIMESTAMP');
  mockWriteBatch.mockReturnValue({
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  });
});

describe('createGroup', () => {
  it('generates groupId and creates doc with correct fields', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    const groupId = await groupService.createGroup('Test Group', 'A description', 'creator1', ['user2', 'user3']);

    expect(groupId).toMatch(/^group_\d+$/);
    expect(mockSetDoc).toHaveBeenCalledWith('mockDocRef', {
      groupId: expect.stringMatching(/^group_\d+$/),
      name: 'Test Group',
      description: 'A description',
      avatar: null,
      creatorId: 'creator1',
      members: ['creator1', 'user2', 'user3'],
      admins: ['creator1'],
      inviteCode: expect.any(String),
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('deduplicates creatorId from memberIds', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    await groupService.createGroup('G', 'D', 'creator1', ['creator1', 'user2']);

    const callData = mockSetDoc.mock.calls[0][1];
    expect(callData.members).toEqual(['creator1', 'user2']);
  });

  it('throws when rate limiter rejects', async () => {
    const { groupCreateLimiter } = await import('../../validators');
    (groupCreateLimiter.checkLimit as any).mockReturnValue(false);

    await expect(
      groupService.createGroup('G', 'D', 'creator1', [])
    ).rejects.toThrow('Failed to create group');

    (groupCreateLimiter.checkLimit as any).mockReturnValue(true);
  });

  it('throws when Firestore setDoc fails', async () => {
    mockSetDoc.mockRejectedValue(new Error('Firestore error'));

    await expect(
      groupService.createGroup('G', 'D', 'c1', [])
    ).rejects.toThrow('Failed to create group');
  });
});

describe('getGroup', () => {
  it('returns group data with id when found', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'group_123',
      data: () => ({ name: 'My Group', members: ['a'] }),
    });

    const result = await groupService.getGroup('group_123');

    expect(result).toEqual({ id: 'group_123', name: 'My Group', members: ['a'] });
  });

  it('returns null when group does not exist', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const result = await groupService.getGroup('nonexistent');

    expect(result).toBeNull();
  });

  it('returns null on Firestore error', async () => {
    mockGetDoc.mockRejectedValue(new Error('read-fail'));

    const result = await groupService.getGroup('group_err');

    expect(result).toBeNull();
  });
});

describe('updateGroup', () => {
  it('calls updateDoc with correct fields and callerId', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ admins: ['admin1'] }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.updateGroup('group_1', { name: 'New Name' }, 'admin1');

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      name: 'New Name',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('calls updateDoc without callerId (no admin check)', async () => {
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.updateGroup('group_1', { description: 'Updated desc' });

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      description: 'Updated desc',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('throws when callerId is not admin', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ admins: ['admin1'] }),
    });

    await expect(
      groupService.updateGroup('group_1', { name: 'X' }, 'notadmin')
    ).rejects.toThrow('Only group admins can perform this action');
  });

  it('throws when group not found', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(
      groupService.updateGroup('no_group', { name: 'X' }, 'admin1')
    ).rejects.toThrow('Group not found');
  });

  it('throws when Firestore updateDoc fails', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('write-fail'));

    await expect(
      groupService.updateGroup('group_1', { name: 'X' })
    ).rejects.toThrow('write-fail');
  });
});

describe('addMembers', () => {
  it('uses arrayUnion to add only new members', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['existing1'] }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.addMembers('group_1', ['existing1', 'newuser1', 'newuser2']);

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      members: { __type: 'union', values: ['newuser1', 'newuser2'] },
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('skips updateDoc when all members already exist', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['existing1', 'existing2'] }),
    });

    await groupService.addMembers('group_1', ['existing1']);

    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('throws when group not found', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(
      groupService.addMembers('no_group', ['user1'])
    ).rejects.toThrow('Group not found');
  });

  it('throws when callerId is not admin', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ admins: ['admin1'] }),
    });

    await expect(
      groupService.addMembers('group_1', ['user1'], 'notadmin')
    ).rejects.toThrow('Only group admins can perform this action');
  });

  it('throws when Firestore updateDoc fails', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: [] }),
    });
    mockUpdateDoc.mockRejectedValue(new Error('write-fail'));

    await expect(
      groupService.addMembers('group_1', ['user1'])
    ).rejects.toThrow('write-fail');
  });
});

describe('removeMember', () => {
  it('filters out member from members and admins arrays', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        members: ['admin1', 'user1', 'user2'],
        admins: ['admin1', 'user1'],
      }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.removeMember('group_1', 'user1');

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      members: ['admin1', 'user2'],
      admins: ['admin1'],
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('throws when group not found', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(
      groupService.removeMember('no_group', 'user1')
    ).rejects.toThrow('Group not found');
  });

  it('throws when callerId is not admin', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ admins: ['admin1'], members: ['admin1'] }),
    });

    await expect(
      groupService.removeMember('group_1', 'user1', 'notadmin')
    ).rejects.toThrow('Only group admins can perform this action');
  });

  it('throws when trying to remove another admin', async () => {
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ admins: ['admin1'] }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ admins: ['admin1', 'admin2'], members: ['admin1', 'admin2'] }),
      });

    await expect(
      groupService.removeMember('group_1', 'admin2', 'admin1')
    ).rejects.toThrow('Cannot remove another admin');
  });

  it('throws when Firestore updateDoc fails', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['user1'], admins: [] }),
    });
    mockUpdateDoc.mockRejectedValue(new Error('write-fail'));

    await expect(
      groupService.removeMember('group_1', 'user1')
    ).rejects.toThrow('write-fail');
  });
});

describe('leaveGroup', () => {
  it('delegates to removeMember with userId', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['user1', 'user2'], admins: [] }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.leaveGroup('group_1', 'user1');

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      members: ['user2'],
      admins: [],
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('propagates errors from removeMember', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(
      groupService.leaveGroup('no_group', 'user1')
    ).rejects.toThrow('Group not found');
  });
});

describe('transferOwnership', () => {
  it('updates creatorId and admins to new owner', async () => {
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ admins: ['admin1'] }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ members: ['admin1', 'newowner'] }),
      });
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.transferOwnership('group_1', 'newowner', 'admin1');

    expect(mockUpdateDoc).toHaveBeenCalledWith('mockDocRef', {
      creatorId: 'newowner',
      admins: ['newowner'],
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('throws when callerId is not admin', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ admins: ['admin1'] }),
    });

    await expect(
      groupService.transferOwnership('group_1', 'newowner', 'notadmin')
    ).rejects.toThrow('Only group admins can perform this action');
  });

  it('throws when group not found', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    await expect(
      groupService.transferOwnership('no_group', 'newowner', 'admin1')
    ).rejects.toThrow('Group not found');
  });

  it('throws when new owner is not a group member', async () => {
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ admins: ['admin1'] }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ members: ['admin1'] }),
      });

    await expect(
      groupService.transferOwnership('group_1', 'stranger', 'admin1')
    ).rejects.toThrow('New owner must be a group member');
  });

  it('throws when Firestore updateDoc fails', async () => {
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ admins: ['admin1'] }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ members: ['admin1', 'newowner'] }),
      });
    mockUpdateDoc.mockRejectedValue(new Error('write-fail'));

    await expect(
      groupService.transferOwnership('group_1', 'newowner', 'admin1')
    ).rejects.toThrow('write-fail');
  });
});

describe('sendGroupMessage', () => {
  it('creates message doc with encrypted content', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['sender1'] }),
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    const messageId = await groupService.sendGroupMessage('group_1', 'sender1', 'Hello world');

    expect(messageId).toMatch(/^gmsg_\d+_/);
    expect(mockSetDoc).toHaveBeenCalledWith(
      'mockDocRef',
      expect.objectContaining({
        groupId: 'group_1',
        senderId: 'sender1',
        content: 'encrypted-content',
        isEncrypted: true,
        messageType: 'text',
        readBy: ['sender1'],
      })
    );
  });

  it('updates group with lastMessage metadata', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['sender1'] }),
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    await groupService.sendGroupMessage('group_1', 'sender1', 'Hello');

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'mockDocRef',
      expect.objectContaining({
        lastMessage: 'Hello',
        lastMessageSender: 'sender1',
        lastMessageTime: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      })
    );
  });

  it('throws when Firestore setDoc fails', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ members: ['sender1'] }),
    });
    mockSetDoc.mockRejectedValue(new Error('write-fail'));

    await expect(
      groupService.sendGroupMessage('group_1', 'sender1', 'Hello')
    ).rejects.toThrow('write-fail');
  });
});

describe('listenToUserGroups', () => {
  it('calls onSnapshot and invokes callback with groups', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, cb: any) => {
      cb({
        docs: [
          { id: 'g1', data: () => ({ name: 'Group A' }) },
          { id: 'g2', data: () => ({ name: 'Group B' }) },
        ],
      });
      return unsubscribe;
    });

    const unsub = groupService.listenToUserGroups('uid_a', callback);

    expect(callback).toHaveBeenCalledWith([
      { id: 'g1', name: 'Group A' },
      { id: 'g2', name: 'Group B' },
    ]);
    expect(unsub).toBe(unsubscribe);
  });

  it('returns empty array on snapshot error', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, _cb: any, errCb: any) => {
      errCb(new Error('snapshot-fail'));
      return unsubscribe;
    });

    groupService.listenToUserGroups('uid_a', callback);

    expect(callback).toHaveBeenCalledWith([]);
  });
});

describe('markGroupMessagesRead', () => {
  it('batch updates readBy array for unread messages', async () => {
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({ update: batchUpdate, commit: batchCommit });

    mockGetDocs.mockResolvedValue({
      docs: [
        { ref: 'msg1', data: () => ({ readBy: [] }) },
        { ref: 'msg2', data: () => ({ readBy: ['user1'] }) },
      ],
    });

    await groupService.markGroupMessagesRead('group_1', 'user1');

    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(batchUpdate).toHaveBeenCalledWith('msg1', {
      readBy: { __type: 'union', values: ['user1'] },
    });
    expect(batchCommit).toHaveBeenCalled();
  });

  it('does not throw on Firestore error (warns instead)', async () => {
    mockGetDocs.mockRejectedValue(new Error('query-fail'));

    await expect(
      groupService.markGroupMessagesRead('group_1', 'user1')
    ).resolves.toBeUndefined();
  });
});

describe('sendGroupNotification', () => {
  it('writes notification to RTDB', async () => {
    mockRtdbSet.mockResolvedValue(undefined);

    await groupService.sendGroupNotification(
      'group_1', 'member1', 'My Group', 'Alice', 'Hello!'
    );

    expect(mockRtdbSet).toHaveBeenCalledWith(
      expect.objectContaining({ __ref: expect.stringContaining('notifications/member1/') }),
      {
        type: 'group_message',
        groupId: 'group_1',
        groupName: 'My Group',
        fromName: 'Alice',
        body: 'Alice: Hello!',
        messageType: 'text',
        timestamp: expect.any(Number),
      }
    );
  });

  it('does not throw on RTDB error (warns instead)', async () => {
    mockRtdbSet.mockRejectedValue(new Error('rtdb-fail'));

    await expect(
      groupService.sendGroupNotification('g1', 'm1', 'G', 'A', 'Hi')
    ).resolves.toBeUndefined();
  });
});
