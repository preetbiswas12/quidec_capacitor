/**
 * Network Retry Utility
 * Provides exponential backoff retry logic for Firebase and network operations.
 * Addresses audit finding: Network Resilience Grade C- (no retry logic).
 */

import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  operation?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
  operation: 'unknown',
};

/**
 * Execute a function with exponential backoff retry.
 * Retries on transient Firebase errors (unavailable, deadline-exceeded, etc.).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Only retry on transient/recoverable errors
      const code = err?.code || err?.message || '';
      const isTransient = isTransientError(code);

      if (!isTransient || attempt >= opts.maxRetries) {
        throw err;
      }

      // Calculate delay with exponential backoff
      let delay = opts.baseDelayMs * Math.pow(opts.backoffFactor, attempt);
      if (opts.jitter) {
        delay += Math.random() * opts.baseDelayMs;
      }
      delay = Math.min(delay, opts.maxDelayMs);

      logger.warn(
        'networkRetry',
        `Attempt ${attempt + 1}/${opts.maxRetries} failed for "${opts.operation}": ${err.message}. Retrying in ${Math.round(delay)}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`All ${opts.maxRetries} retries exhausted for "${opts.operation}"`);
}

/**
 * Check if an error is transient and worth retrying.
 */
function isTransientError(code: string): boolean {
  const transientCodes = [
    'unavailable',
    'deadline-exceeded',
    'resource-exhausted',
    'aborted',
    'internal',
    'cancelled',
    'network',
    'ECONNRESET',
    'ETIMEDOUT',
    'fetch_error',
  ];

  return transientCodes.some((c) => code.includes(c));
}

/**
 * Wrap a Firebase onSnapshot listener with error recovery.
 * Returns an unsubscribe function that handles cleanup.
 */
export function resilientSnapshot(
  ref: any,
  onNext: (snapshot: any) => void,
  onError: ((error: Error) => void) | null,
  operationName: string
): () => void {
  try {
    return ref(
      onNext,
      (error: Error) => {
        logger.error('networkRetry', `Snapshot error in "${operationName}": ${error.message}`);
        if (onError) onError(error);
      }
    );
  } catch (err: any) {
    logger.error('networkRetry', `Failed to attach snapshot listener "${operationName}": ${err.message}`);
    return () => {};
  }
}

/**
 * Check if the device is currently online.
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Wait for the device to come back online.
 * Returns a promise that resolves when online, or after timeout.
 */
export function waitForOnline(timeoutMs: number = 30000): Promise<boolean> {
  if (navigator.onLine) return Promise.resolve(true);

  return new Promise((resolve) => {
    const handler = () => {
      window.removeEventListener('online', handler);
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      window.removeEventListener('online', handler);
      resolve(false);
    }, timeoutMs);

    window.addEventListener('online', handler);
  });
}
