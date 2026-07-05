import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  realtimeDb: {},
}));

const { mockSetDoc, mockGetDocs, mockDeleteDoc, mockWriteBatch, mockOnSnapshot, mockServerTimestamp, mockQuery, mockOrderBy, mockLimit, mockCollection, mockDoc, mockWhere } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockWriteBatch: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'mock-timestamp'),
  mockQuery: vi.fn((_collection: any, ...args: any[]) => ({ _query: true, args })),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn((_db: any, ...segments: string[]) => ({ _path: segments })),
  mockWhere: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  setDoc: mockSetDoc,
  query: mockQuery,
  orderBy: mockOrderBy,
  limit: mockLimit,
  getDocs: mockGetDocs,
  deleteDoc: mockDeleteDoc,
  writeBatch: mockWriteBatch,
  serverTimestamp: mockServerTimestamp,
  onSnapshot: mockOnSnapshot,
  where: mockWhere,
}));

import { callService } from '../callService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveCallRecord', () => {
  it('calls setDoc with correct path and record data', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    await callService.saveCallRecord('user1', {
      callId: 'call-abc',
      contactId: 'user2',
      contactName: 'Alice',
      type: 'voice',
      direction: 'outgoing',
      duration: 120,
    });

    expect(mockDoc).toHaveBeenCalledWith({}, 'users', 'user1', 'callHistory', 'call-abc');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = mockSetDoc.mock.calls[0];
    expect(ref._path).toEqual(['users', 'user1', 'callHistory', 'call-abc']);
    expect(data.uid).toBe('user1');
    expect(data.callId).toBe('call-abc');
    expect(data.contactId).toBe('user2');
    expect(data.contactName).toBe('Alice');
    expect(data.type).toBe('voice');
    expect(data.direction).toBe('outgoing');
    expect(data.duration).toBe(120);
    expect(data.timestamp).toBe('mock-timestamp');
    expect(data.contactAvatar).toBeNull();
  });

  it('defaults duration to 0 when not provided', async () => {
    mockSetDoc.mockResolvedValue(undefined);

    await callService.saveCallRecord('user1', {
      callId: 'call-xyz',
      contactId: 'user2',
      contactName: 'Bob',
      type: 'video',
      direction: 'incoming',
    });

    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.duration).toBe(0);
  });

  it('re-throws errors from setDoc', async () => {
    mockSetDoc.mockRejectedValue(new Error('permission-denied'));

    await expect(
      callService.saveCallRecord('user1', {
        callId: 'call-fail',
        contactId: 'user2',
        contactName: 'Eve',
        type: 'voice',
        direction: 'missed',
      }),
    ).rejects.toThrow('permission-denied');
  });
});

describe('getCallHistory', () => {
  it('returns sorted call records', async () => {
    const docs = [
      { id: 'call-1', data: () => ({ contactName: 'Alice', timestamp: 200 }) },
      { id: 'call-2', data: () => ({ contactName: 'Bob', timestamp: 100 }) },
    ];
    mockGetDocs.mockResolvedValue({ docs });

    const result = await callService.getCallHistory('user1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'call-1', contactName: 'Alice', timestamp: 200 });
    expect(result[1]).toEqual({ id: 'call-2', contactName: 'Bob', timestamp: 100 });
  });

  it('returns empty array when no records exist', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await callService.getCallHistory('user1');

    expect(result).toEqual([]);
  });

  it('passes custom limit to query', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockLimit.mockReturnValue('limitRef');

    await callService.getCallHistory('user1', 10);

    expect(mockQuery).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('returns empty array on error', async () => {
    mockGetDocs.mockRejectedValue(new Error('unavailable'));

    const result = await callService.getCallHistory('user1');

    expect(result).toEqual([]);
  });
});

describe('listenToCallHistory', () => {
  it('sets up onSnapshot listener and returns unsubscribe', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const result = callService.listenToCallHistory('user1', vi.fn());

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(unsubscribe);
  });

  it('invokes callback with mapped records on snapshot', () => {
    const callback = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, onNext: (...args: unknown[]) => void) => {
      const snapshot = {
        docs: [
          { id: 'call-1', data: () => ({ contactName: 'Alice' }) },
        ],
      };
      onNext(snapshot);
      return vi.fn();
    });

    callService.listenToCallHistory('user1', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([
      { id: 'call-1', contactName: 'Alice' },
    ]);
  });

  it('invokes callback with empty array on listener error', () => {
    const callback = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, _onNext: any, onError: (...args: unknown[]) => void) => {
      onError({ code: 'failed-precondition', message: 'index required' });
      return vi.fn();
    });

    callService.listenToCallHistory('user1', callback);

    expect(callback).toHaveBeenCalledWith([]);
  });
});

describe('listenToIncomingCalls', () => {
  it('sets up onSnapshot listener on calls collection', () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribe);

    const result = callService.listenToIncomingCalls('user1', vi.fn());

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(unsubscribe);
  });

  it('returns null when no incoming calls', () => {
    const callback = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, onNext: (...args: unknown[]) => void) => {
      onNext({ empty: true, docs: [] });
      return vi.fn();
    });

    callService.listenToIncomingCalls('user1', callback);

    expect(callback).toHaveBeenCalledWith(null);
  });

  it('returns most recent ringing call', () => {
    const callback = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, onNext: (...args: unknown[]) => void) => {
      onNext({
        empty: false,
        docs: [
          { id: 'call-old', data: () => ({ timestamp: 100, status: 'ringing' }) },
          { id: 'call-new', data: () => ({ timestamp: 200, status: 'ringing' }) },
        ],
      });
      return vi.fn();
    });

    callService.listenToIncomingCalls('user1', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const call = callback.mock.calls[0][0];
    expect(call.id).toBe('call-new');
  });

  it('invokes callback with null on error', () => {
    const callback = vi.fn();
    mockOnSnapshot.mockImplementation((_q: any, _onNext: any, onError: (...args: unknown[]) => void) => {
      onError(new Error('permission-denied'));
      return vi.fn();
    });

    callService.listenToIncomingCalls('user1', callback);

    expect(callback).toHaveBeenCalledWith(null);
  });
});

describe('deleteCallRecord', () => {
  it('calls deleteDoc with correct path', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    await callService.deleteCallRecord('user1', 'call-abc');

    expect(mockDoc).toHaveBeenCalledWith({}, 'users', 'user1', 'callHistory', 'call-abc');
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it('silently handles errors', async () => {
    mockDeleteDoc.mockRejectedValue(new Error('not-found'));

    await expect(
      callService.deleteCallRecord('user1', 'call-missing'),
    ).resolves.toBeUndefined();
  });
});

describe('clearCallHistory', () => {
  it('batch deletes all call records', async () => {
    const batchRef = { delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    mockWriteBatch.mockReturnValue(batchRef);
    mockGetDocs.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [
        { id: 'call-1', ref: 'ref-1' },
        { id: 'call-2', ref: 'ref-2' },
      ],
    });

    await callService.clearCallHistory('user1');

    expect(mockGetDocs).toHaveBeenCalled();
    expect(mockWriteBatch).toHaveBeenCalled();
    expect(batchRef.delete).toHaveBeenCalledTimes(2);
    expect(batchRef.delete).toHaveBeenCalledWith('ref-1');
    expect(batchRef.delete).toHaveBeenCalledWith('ref-2');
    expect(batchRef.commit).toHaveBeenCalled();
  });

  it('skips batch commit when history is empty', async () => {
    const batchRef = { delete: vi.fn(), commit: vi.fn() };
    mockWriteBatch.mockReturnValue(batchRef);
    mockGetDocs.mockResolvedValue({ empty: true, size: 0, docs: [] });

    await callService.clearCallHistory('user1');

    expect(batchRef.commit).not.toHaveBeenCalled();
  });

  it('silently handles errors', async () => {
    mockGetDocs.mockRejectedValue(new Error('unavailable'));

    await expect(callService.clearCallHistory('user1')).resolves.toBeUndefined();
  });
});
