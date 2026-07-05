import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../firebase', () => ({
  realtimeDb: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  set: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  onValue: vi.fn(() => vi.fn()),
  onDisconnect: vi.fn(() => ({ set: vi.fn(() => Promise.resolve()), remove: vi.fn(() => Promise.resolve()) })),
}));

vi.mock('../shared', () => ({
  sanitizePathComponent: (s: string) => s.replace(/[.#$\[\]@]/g, '_'),
}));

import { ref, set, remove, onValue } from 'firebase/database';
import {
  setTyping,
  setGroupTyping,
  listenToTyping,
  listenToGroupTyping,
  sendTypingIndicator,
  sendGroupTypingIndicator,
  listenToTypingIndicators,
  listenToGroupTypingIndicators,
} from '../typingService';

const mockRef = vi.mocked(ref);
const mockSet = vi.mocked(set);
const mockRemove = vi.mocked(remove);
const mockOnValue = vi.mocked(onValue);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setTyping', () => {
  it('writes typing state to RTDB with correct sorted conversation path', async () => {
    await setTyping('uid_b', 'uid_a', true);

    expect(mockRef).toHaveBeenCalledWith(
      {},
      'typing/uid_a_uid_b/uid_b',
    );
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, payload] = mockSet.mock.calls[0] as any[];
    expect(payload.uid).toBe('uid_b');
    expect(typeof payload.timestamp).toBe('number');
  });

  it('removes typing state when isTyping is false', async () => {
    await setTyping('uid_a', 'uid_b', false);

    expect(mockRef).toHaveBeenCalledWith(
      {},
      'typing/uid_a_uid_b/uid_a',
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does nothing when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    await setTyping('uid_a', 'uid_b', true);

    expect(mockRef).not.toHaveBeenCalled();
  });

  it('auto-removes typing indicator after 3 seconds', async () => {
    await setTyping('uid_a', 'uid_b', true);

    expect(mockRemove).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('sanitizes UIDs with dots in the path', async () => {
    await setTyping('preetb.5815', 'user_abc', true);

    // conversationId = ['preetb.5815', 'user_abc'].sort().join('_') = 'preetb.5815_user_abc'
    // sanitizePathComponent('preetb.5815_user_abc') = 'preetb_5815_user_abc'
    expect(mockRef).toHaveBeenCalledWith(
      {},
      'typing/preetb_5815_user_abc/preetb_5815',
    );
  });
});

describe('setGroupTyping', () => {
  it('writes group typing state to RTDB with correct path', async () => {
    await setGroupTyping('group1', 'uid_a', true);

    expect(mockRef).toHaveBeenCalledWith(
      {},
      'groupTyping/group1/uid_a',
    );
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [, payload] = mockSet.mock.calls[0] as any[];
    expect(payload.uid).toBe('uid_a');
    expect(typeof payload.timestamp).toBe('number');
  });

  it('removes group typing state when isTyping is false', async () => {
    await setGroupTyping('group1', 'uid_a', false);

    expect(mockRef).toHaveBeenCalledWith(
      {},
      'groupTyping/group1/uid_a',
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does nothing when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    await setGroupTyping('group1', 'uid_a', true);

    expect(mockRef).not.toHaveBeenCalled();
  });
});

describe('listenToTyping', () => {
  it('sets up onValue listener on the conversation typing path', () => {
    listenToTyping('uid_a', 'uid_b', vi.fn());

    expect(mockOnValue).toHaveBeenCalledTimes(1);
    const [refArg] = mockOnValue.mock.calls[0] as any[];
    expect(refArg.path).toBe('typing/uid_a_uid_b');
  });

  it('returns an unsubscribe function', () => {
    const mockUnsub = vi.fn();
    mockOnValue.mockReturnValueOnce(mockUnsub as any);

    const unsub = listenToTyping('uid_a', 'uid_b', vi.fn());

    expect(typeof unsub).toBe('function');

    unsub();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });

  it('calls callback with empty array when snapshot does not exist', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({ exists: () => false, val: () => null });
      return vi.fn();
    });

    listenToTyping('uid_a', 'uid_b', callback);

    expect(callback).toHaveBeenCalledWith([]);
  });

  it('filters out current user and returns other typing user IDs', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({
        exists: () => true,
        val: () => ({
          uid_a: { uid: 'uid_a', timestamp: 100 },
          uid_c: { uid: 'uid_c', timestamp: 200 },
          uid_d: { uid: 'uid_d', timestamp: 300 },
        }),
      });
      return vi.fn();
    });

    listenToTyping('uid_a', 'uid_b', callback);

    expect(callback).toHaveBeenCalledWith(['uid_c', 'uid_d']);
  });

  it('sanitizes UIDs with dots in the listener path', () => {
    listenToTyping('preetb.5815', 'all', vi.fn());

    const [refArg] = mockOnValue.mock.calls[0] as any[];
    // ['all', 'preetb.5815'].sort().join('_') = 'all_preetb.5815'
    // sanitizePathComponent('all_preetb.5815') = 'all_preetb_5815'
    expect(refArg.path).toBe('typing/all_preetb_5815');
  });
});

describe('listenToGroupTyping', () => {
  it('sets up onValue listener on the group typing path', () => {
    listenToGroupTyping('group1', 'uid_a', vi.fn());

    expect(mockOnValue).toHaveBeenCalledTimes(1);
    const [refArg] = mockOnValue.mock.calls[0] as any[];
    expect(refArg.path).toBe('groupTyping/group1');
  });

  it('returns an unsubscribe function', () => {
    const mockUnsub = vi.fn();
    mockOnValue.mockReturnValueOnce(mockUnsub as any);

    const unsub = listenToGroupTyping('group1', 'uid_a', vi.fn());

    expect(typeof unsub).toBe('function');

    unsub();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });

  it('calls callback with empty array when snapshot does not exist', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({ exists: () => false, val: () => null });
      return vi.fn();
    });

    listenToGroupTyping('group1', 'uid_a', callback);

    expect(callback).toHaveBeenCalledWith([]);
  });

  it('filters out current user and returns other typing user IDs', () => {
    const callback = vi.fn();
    mockOnValue.mockImplementation((_ref: any, cb: any) => {
      cb({
        exists: () => true,
        val: () => ({
          uid_a: { uid: 'uid_a', timestamp: 100 },
          uid_b: { uid: 'uid_b', timestamp: 200 },
          uid_c: { uid: 'uid_c', timestamp: 300 },
        }),
      });
      return vi.fn();
    });

    listenToGroupTyping('group1', 'uid_a', callback);

    expect(callback).toHaveBeenCalledWith(['uid_b', 'uid_c']);
  });
});

describe('alias exports', () => {
  it('sendTypingIndicator is the same function as setTyping', () => {
    expect(sendTypingIndicator).toBe(setTyping);
  });

  it('sendGroupTypingIndicator is the same function as setGroupTyping', () => {
    expect(sendGroupTypingIndicator).toBe(setGroupTyping);
  });

  it('listenToTypingIndicators is the same function as listenToTyping', () => {
    expect(listenToTypingIndicators).toBe(listenToTyping);
  });

  it('listenToGroupTypingIndicators is the same function as listenToGroupTyping', () => {
    expect(listenToGroupTypingIndicators).toBe(listenToGroupTyping);
  });
});
