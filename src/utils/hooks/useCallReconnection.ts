import { useState, useCallback, useRef, useEffect } from 'react';
import logger from '../logger';

export interface ReconnectionState {
  status: 'idle' | 'reconnecting' | 'reconnected' | 'failed';
  attempt: number;
  maxAttempts: number;
  lastAttemptAt: number | null;
}

export interface UseCallReconnectionOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onReconnect?: () => Promise<void>;
  onGiveUp?: () => void;
}

export function useCallReconnection(options: UseCallReconnectionOptions = {}) {
  const {
    maxAttempts = 5,
    baseDelay = 1000,
    maxDelay = 30000,
    onReconnect,
    onGiveUp,
  } = options;

  const [state, setState] = useState<ReconnectionState>({
    status: 'idle',
    attempt: 0,
    maxAttempts,
    lastAttemptAt: null,
  });

  const abortRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const getDelay = useCallback((attempt: number) => {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = delay * 0.1 * Math.random();
    return delay + jitter;
  }, [baseDelay, maxDelay]);

  const attemptReconnect = useCallback(async (attemptNum: number) => {
    if (abortRef.current) return;

    setState(prev => ({
      ...prev,
      status: 'reconnecting',
      attempt: attemptNum,
      lastAttemptAt: Date.now(),
    }));

    logger.info('CallReconnection', `Attempt ${attemptNum}/${maxAttempts}`);

    try {
      if (onReconnect) {
        await onReconnect();
      }
      if (!abortRef.current) {
        setState(prev => ({ ...prev, status: 'reconnected' }));
        logger.info('CallReconnection', 'Reconnected successfully');
      }
    } catch (err) {
      if (abortRef.current) return;

      if (attemptNum >= maxAttempts) {
        logger.warn('CallReconnection', `Gave up after ${maxAttempts} attempts`);
        setState(prev => ({ ...prev, status: 'failed' }));
        onGiveUp?.();
        return;
      }

      const delay = getDelay(attemptNum);
      logger.info('CallReconnection', `Retrying in ${Math.round(delay)}ms`);
      timeoutRef.current = setTimeout(() => attemptReconnect(attemptNum + 1), delay);
    }
  }, [maxAttempts, onReconnect, onGiveUp, getDelay]);

  const startReconnect = useCallback(() => {
    abortRef.current = false;
    attemptReconnect(1);
  }, [attemptReconnect]);

  const stopReconnect = useCallback(() => {
    abortRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setState(prev => ({ ...prev, status: 'idle', attempt: 0 }));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startReconnect,
    stopReconnect,
  };
}
