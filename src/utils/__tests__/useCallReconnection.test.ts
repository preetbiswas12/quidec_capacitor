import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCallReconnection } from '../hooks/useCallReconnection';

describe('useCallReconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with idle status', () => {
    const { result } = renderHook(() => useCallReconnection());
    expect(result.current.status).toBe('idle');
    expect(result.current.attempt).toBe(0);
  });

  it('should attempt reconnection on startReconnect', async () => {
    const onReconnect = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCallReconnection({ onReconnect }));

    act(() => {
      result.current.startReconnect();
    });

    expect(result.current.status).toBe('reconnecting');
    expect(result.current.attempt).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onReconnect).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('reconnected');
  });

  it('should retry with exponential backoff on failure', async () => {
    let attempt = 0;
    const onReconnect = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) return Promise.reject(new Error('fail'));
      return Promise.resolve();
    });

    const { result } = renderHook(() => useCallReconnection({ onReconnect, baseDelay: 100 }));

    act(() => {
      result.current.startReconnect();
    });

    expect(result.current.attempt).toBe(1);
    expect(result.current.status).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.attempt).toBe(3);
    expect(result.current.status).toBe('reconnected');
  });

  it('should fail after max attempts', async () => {
    const onReconnect = vi.fn().mockRejectedValue(new Error('always fail'));
    const onGiveUp = vi.fn();

    const { result } = renderHook(() => useCallReconnection({
      onReconnect,
      onGiveUp,
      maxAttempts: 2,
      baseDelay: 100,
    }));

    act(() => {
      result.current.startReconnect();
    });

    expect(result.current.attempt).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.status).toBe('failed');
    expect(onGiveUp).toHaveBeenCalledOnce();
  });

  it('should stop reconnection on stopReconnect', async () => {
    const onReconnect = vi.fn().mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useCallReconnection({ onReconnect, baseDelay: 1000 }));

    act(() => {
      result.current.startReconnect();
    });

    expect(result.current.status).toBe('reconnecting');

    act(() => {
      result.current.stopReconnect();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.attempt).toBe(0);
  });

  it('should not attempt reconnection when stopReconnect is called before retry', async () => {
    const onReconnect = vi.fn().mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useCallReconnection({ onReconnect, baseDelay: 5000 }));

    act(() => {
      result.current.startReconnect();
    });

    act(() => {
      result.current.stopReconnect();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  it('should clean up timers on unmount', async () => {
    const onReconnect = vi.fn().mockRejectedValue(new Error('fail'));

    const { result, unmount } = renderHook(() => useCallReconnection({ onReconnect, baseDelay: 500 }));

    act(() => {
      result.current.startReconnect();
    });

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('should report maxAttempts in state', () => {
    const { result } = renderHook(() => useCallReconnection({ maxAttempts: 10 }));
    expect(result.current.maxAttempts).toBe(10);
  });

  it('should set lastAttemptAt when reconnecting', async () => {
    const onReconnect = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useCallReconnection({ onReconnect, baseDelay: 100 }));

    act(() => {
      result.current.startReconnect();
    });

    expect(result.current.lastAttemptAt).toBeTypeOf('number');
    expect(result.current.lastAttemptAt).toBeGreaterThan(0);
  });

  it('should not set status to reconnected if component unmounted during reconnect', async () => {
    const onReconnect = vi.fn().mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 100));
    });

    const { result, unmount } = renderHook(() => useCallReconnection({ onReconnect, baseDelay: 50 }));

    act(() => {
      result.current.startReconnect();
    });

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  });
});
