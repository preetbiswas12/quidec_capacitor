/**
 * Error Monitoring with Sentry
 * Captures and reports all errors to Sentry for production debugging.
 *
 * Safe to import even if @sentry/react is not installed — all Sentry
 * calls are guarded and become no-ops when the SDK is absent.
 */

// ─── Lazy Sentry import (optional dependency) ────────────────────────────────
// @sentry/react is NOT a required dependency. If it's missing, every function
// here degrades to a no-op so the app still builds and runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sentry = require('@sentry/react');
} catch {
  // Package not installed — Sentry stays null, all calls below become no-ops.
}

import logger from './logger';

/**
 * Initialize Sentry for error monitoring
 * Call this in main.tsx before rendering React
 */
export function initializeSentry() {
  if (!Sentry) {
    logger.debug('errorMonitoring', '@sentry/react not installed — error monitoring disabled');
    return;
  }

  const isDevelopment = import.meta.env.MODE === 'development';
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.VITE_ENVIRONMENT || 'development';

  if (!sentryDsn) {
    if (!isDevelopment) {
      logger.warn('errorMonitoring', 'Sentry DSN not configured — error monitoring disabled');
    }
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      tracesSampleRate: isDevelopment ? 1.0 : 0.1,
      integrations: [],
      ignoreErrors: isDevelopment ? [] : [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
      ],
    });

    logger.info('errorMonitoring', `Sentry initialized for ${environment}`);
  } catch (err) {
    logger.error('errorMonitoring', `Failed to initialize Sentry: ${err}`);
  }
}

/**
 * Set user context for error tracking
 */
export function setUserContext(userId: string, username?: string, email?: string) {
  if (!Sentry) return;
  try {
    Sentry.setUser({ id: userId, username: username || 'unknown', email });
    logger.info('errorMonitoring', `User context set: ${username || userId}`);
  } catch (err) {
    logger.warn('errorMonitoring', `Failed to set user context: ${err}`);
  }
}

/**
 * Clear user context on logout
 */
export function clearUserContext() {
  if (!Sentry) return;
  try {
    Sentry.setUser(null);
    logger.info('errorMonitoring', 'User context cleared');
  } catch (err) {
    logger.warn('errorMonitoring', `Failed to clear user context: ${err}`);
  }
}

/**
 * Add breadcrumb for user actions
 */
export function addBreadcrumb(
  message: string,
  category: string = 'user-action',
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  data?: Record<string, unknown>
) {
  if (!Sentry) return;
  try {
    Sentry.addBreadcrumb({
      category,
      level: level as string,
      message,
      data,
      timestamp: Date.now() / 1000,
    });
  } catch {
    // Silently fail
  }
}

/**
 * Report an error to Sentry
 */
export function reportError(
  error: Error | string,
  context?: {
    component?: string;
    operation?: string;
    severity?: 'fatal' | 'error' | 'warning' | 'info';
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
) {
  if (!Sentry) return;
  try {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    Sentry.captureException(errorObj, {
      level: context?.severity || 'error',
      tags: {
        component: context?.component || 'unknown',
        operation: context?.operation || 'unknown',
        ...context?.tags,
      },
      extra: context?.extra,
    });
    logger.error(
      context?.component || 'errorMonitoring',
      `Error reported to Sentry: ${errorObj.message}`
    );
  } catch (err) {
    logger.error('errorMonitoring', `Failed to report error: ${err}`);
  }
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  _operation: string = 'http.client'
): { finish: () => void } | null {
  if (!Sentry) return null;
  try {
    logger.debug('errorMonitoring', `Transaction started: ${name}`);
    return {
      finish: () => {
        logger.debug('errorMonitoring', `Transaction finished: ${name}`);
      }
    };
  } catch (err) {
    logger.warn('errorMonitoring', `Failed to start transaction: ${err}`);
    return null;
  }
}

/**
 * Report a message to Sentry
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'
) {
  if (!Sentry) return;
  try {
    Sentry.captureMessage(message, level);
  } catch (err) {
    logger.warn('errorMonitoring', `Failed to capture message: ${err}`);
  }
}
