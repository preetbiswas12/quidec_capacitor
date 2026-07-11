import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  realtimeDb: {},
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../shared', () => ({
  sanitizePathComponent: (s: string) => s,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, ...parts: string[]) => ({ path: parts.join('/') })),
  setDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ forEach: vi.fn() })),
  onSnapshot: vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => 'server-ts'),
  documentId: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => ({
    forEach: (cb: any) => {
      cb({ key: 'user1', val: () => ({ online: true, username: 'alice' }) });
      cb({ key: 'user2', val: () => ({ online: false, username: 'bob' }) });
    },
  })),
  onValue: vi.fn(() => vi.fn()),
  remove: vi.fn(() => Promise.resolve()),
  onChildAdded: vi.fn(() => vi.fn()),
  onDisconnect: vi.fn((_ref: any) => ({ set: vi.fn(() => Promise.resolve()) })),
  serverTimestamp: vi.fn(() => 1234567890),
}));

import { ref, set, get, onValue, remove, onChildAdded } from 'firebase/database';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { presenceService } from '../presenceService';

const mockRef = vi.mocked(ref);
const mockSet = vi.mocked(set);
const mockGet = vi.mocked(get);
const mockOnValue = vi.mocked(onValue);
const mockRemove = vi.mocked(remove);
const mockOnChildAdded = vi.mocked(onChildAdded);
const mockDoc = vi.mocked(doc);
const mockSetDoc = vi.mocked(setDoc);
const mockOnSnapshot = vi.mocked(onSnapshot);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setUserOnline', () => {
  it('writes online status to RTDB using uid (custom handle)', async () => {
    await presenceService.setUserOnline('uid1', 'alice');

    expect(mockRef).toHaveBeenCalledWith({}, 'presence/uid1');
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, payload] = mockSet.mock.calls[0] as any[];
    expect(payload.online).toBe(true);
    expect(payload.username).toBe('alice');
  });

  it('writes online status to Firestore using uid (custom handle)', async () => {
    await presenceService.setUserOnline('uid1', 'alice');

    expect(mockDoc).toHaveBeenCalledWith({}, 'users', 'uid1');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload, options] = mockSetDoc.mock.calls[0] as any[];
    expect(payload.isOnline).toBe(true);
    expect(options.merge).toBe(true);
  });

  it('continues when Firestore fails', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('Firestore error'));

    await expect(
      presenceService.setUserOnline('uid1', 'alice')
    ).resolves.not.toThrow();

    expect(mockSet).toHaveBeenCalled();
  });

  it('does not throw on RTDB failure', async () => {
    mockSet.mockRejectedValueOnce(new Error('RTDB error'));

    await expect(
      presenceService.setUserOnline('uid1', 'alice')
    ).resolves.not.toThrow();
  });
});

describe('setUserOffline', () => {
  it('writes offline status to RTDB', async () => {
    await presenceService.setUserOffline('uid1');

    expect(mockRef).toHaveBeenCalledWith({}, 'presence/uid1');
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, payload] = mockSet.mock.calls[0] as any[];
    expect(payload.online).toBe(false);
  });

  it('writes offline status to Firestore', async () => {
    await presenceService.setUserOffline('uid1');

    expect(mockDoc).toHaveBeenCalledWith({}, 'users', 'uid1');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, payload, options] = mockSetDoc.mock.calls[0] as any[];
    expect(payload.isOnline).toBe(false);
    expect(options.merge).toBe(true);
  });

  it('continues when Firestore fails', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('Firestore error'));

    await expect(
      presenceService.setUserOffline('uid1')
    ).resolves.not.toThrow();

    expect(mockSet).toHaveBeenCalled();
  });

  it('does not throw on RTDB failure', async () => {
    mockSet.mockRejectedValueOnce(new Error('RTDB error'));

    await expect(
      presenceService.setUserOffline('uid1')
    ).resolves.not.toThrow();
  });
});

describe('listenToUserPresence', () => {
  it('sets up onValue listener on the correct presence path', () => {
    presenceService.listenToUserPresence('uid1', vi.fn());

    expect(mockOnValue).toHaveBeenCalledTimes(1);
    const [refArg] = mockOnValue.mock.calls[0] as any[];
    expect(refArg.path).toBe('presence/uid1');
  });

  it('returns an unsubscribe function', () => {
    const mockUnsub = vi.fn();
    mockOnValue.mockReturnValueOnce(mockUnsub as any);

    const unsub = presenceService.listenToUserPresence('uid1', vi.fn());

    expect(typeof unsub).toBe('function');
    unsub();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });

  it('calls callback with isOnline and lastSeen from RTDB snapshot', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({
        val: () => ({
          online: true,
          lastSeen: 1234567890,
          username: 'alice',
        }),
      });
      return vi.fn();
    });

    presenceService.listenToUserPresence('uid1', callback);

    expect(callback).toHaveBeenCalledWith(true, 1234567890);
  });

  it('returns false for isOnline when data is absent', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({
        val: () => null,
      });
      return vi.fn();
    });

    presenceService.listenToUserPresence('uid1', callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it('defaults isOnline to false when field is missing', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({
        val: () => ({ lastSeen: 1234567890 }),
      });
      return vi.fn();
    });

    presenceService.listenToUserPresence('uid1', callback);

    expect(callback).toHaveBeenCalledWith(false, 1234567890);
  });
});

describe('getOnlineUsers', () => {
  it('reads from the presence node', async () => {
    await presenceService.getOnlineUsers();

    expect(mockRef).toHaveBeenCalledWith({}, 'presence');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('returns only online users', async () => {
    const result = await presenceService.getOnlineUsers();

    expect(result).toEqual({
      user1: { online: true, username: 'alice' },
    });
    expect(result).not.toHaveProperty('user2');
  });

  it('returns empty object on error', async () => {
    mockGet.mockRejectedValueOnce(new Error('RTDB read error'));

    const result = await presenceService.getOnlineUsers();

    expect(result).toEqual({});
  });
});

describe('sendSignaling', () => {
  it('writes signal data to the correct RTDB path', async () => {
    const signal = { type: 'offer', sdp: 'mock-sdp' };

    const signalId = await presenceService.sendSignaling('fromUid', 'toUid', signal);

    expect(mockRef).toHaveBeenCalledWith({}, expect.stringMatching(/^signaling\/toUid\//));
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, payload] = mockSet.mock.calls[0] as any[];
    expect(payload.type).toBe('offer');
    expect(payload.sdp).toBe('mock-sdp');
    expect(payload.fromUid).toBe('fromUid');
    expect(typeof signalId).toBe('string');
  });

  it('returns a signalId string', async () => {
    const signalId = await presenceService.sendSignaling('from', 'to', { type: 'answer' });

    expect(typeof signalId).toBe('string');
    expect(signalId.length).toBeGreaterThan(0);
  });
});

describe('listenToSignaling', () => {
  it('sets up onChildAdded listener on the signaling path', () => {
    presenceService.listenToSignaling('uid1', vi.fn());

    expect(mockOnChildAdded).toHaveBeenCalledTimes(1);
    const [refArg] = mockOnChildAdded.mock.calls[0] as any[];
    expect(refArg.path).toBe('signaling/uid1');
  });

  it('returns an unsubscribe function', () => {
    const mockUnsub = vi.fn();
    mockOnChildAdded.mockReturnValueOnce(mockUnsub as any);

    const unsub = presenceService.listenToSignaling('uid1', vi.fn());

    expect(typeof unsub).toBe('function');
    unsub();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });

  it('calls callback with signal data including snapshot key', () => {
    const callback = vi.fn();
    mockOnChildAdded.mockImplementation((_ref: any, cb: any) => {
      cb({
        key: 'sig123',
        val: () => ({ type: 'offer', fromUid: 'sender1' }),
      });
      return vi.fn();
    });

    presenceService.listenToSignaling('uid1', callback);

    expect(callback).toHaveBeenCalledWith({
      id: 'sig123',
      type: 'offer',
      fromUid: 'sender1',
    });
  });

  it('deletes the signal from server after delivery', async () => {
    mockOnChildAdded.mockImplementation((_ref: any, cb: any) => {
      cb({
        key: 'sig456',
        val: () => ({ type: 'answer' }),
      });
      return vi.fn();
    });

    await presenceService.listenToSignaling('uid1', vi.fn());

    expect(mockRemove).toHaveBeenCalledWith({ path: 'signaling/uid1/sig456' });
  });

  it('does not call callback when snapshot data is null', () => {
    const callback = vi.fn();
    mockOnChildAdded.mockImplementation((_ref: any, cb: any) => {
      cb({
        key: 'sig789',
        val: () => null,
      });
      return vi.fn();
    });

    presenceService.listenToSignaling('uid1', callback);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('error handling', () => {
  it('setUserOnline does not throw on complete failure', async () => {
    mockSet.mockRejectedValueOnce(new Error('network'));
    mockSetDoc.mockRejectedValueOnce(new Error('firestore'));

    await expect(
      presenceService.setUserOnline('uid1', 'alice')
    ).resolves.not.toThrow();
  });

  it('setUserOffline does not throw on complete failure', async () => {
    mockSet.mockRejectedValueOnce(new Error('network'));
    mockSetDoc.mockRejectedValueOnce(new Error('firestore'));

    await expect(
      presenceService.setUserOffline('uid1')
    ).resolves.not.toThrow();
  });

  it('getOnlineUsers returns empty object on failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network'));

    const result = await presenceService.getOnlineUsers();

    expect(result).toEqual({});
  });

  it('listenToUserPresence does not throw when callback errors', () => {
    const badCallback = vi.fn(() => {
      throw new Error('callback crash');
    });
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      expect(() => cb({ val: () => ({ online: true, lastSeen: 1 }) })).toThrow(
        'callback crash'
      );
      return vi.fn();
    });

    expect(() =>
      presenceService.listenToUserPresence('uid1', badCallback)
    ).not.toThrow();
  });
});
