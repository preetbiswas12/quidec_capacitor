/**
 * Error Monitoring with Sentry
 * Captures and reports all errors to Sentry for production debugging
 * 
 * Integration Points:
 * - All thrown exceptions caught
 * - React error boundaries
 * - WebSocket errors
 * - Firebase errors
 * - Network failures
 * - User actions with breadcrumbs
 */

import * as Sentry from '@sentry/react';
import logger from './logger';

/**
 * Initialize Sentry for error monitoring
 * Call this in main.tsx before rendering React
 */
export function initializeSentry() {
  const isDevelopment = import.meta.env.MODE === 'development';
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.VITE_ENVIRONMENT || 'development';
  
  // Only initialize in production or if DSN is explicitly set
  if (!sentryDsn) {
    if (!isDevelopment) {
      logger.warn('errorMonitoring', 'Sentry DSN not configured - error monitoring disabled');
    }
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      tracesSampleRate: isDevelopment ? 1.0 : 0.1, // 10% in production, 100% in dev
      integrations: [], // Minimal integrations for Sentry v10 compatibility
      
      // Don't capture errors from localhost/development
      ignoreErrors: isDevelopment ? [] : [
        // Ignore known non-critical errors
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
 * Call this after user authentication
 */
export function setUserContext(userId: string, username?: string, email?: string) {
  try {
    Sentry.setUser({
      id: userId,
      username: username || 'unknown',
      email: email,
    });

    logger.info('errorMonitoring', `User context set: ${username || userId}`);
  } catch (err) {
    logger.warn('errorMonitoring', `Failed to set user context: ${err}`);
  }
}

/**
 * Clear user context on logout
 */
export function clearUserContext() {
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
  data?: Record<string, any>
) {
  try {
    // In Sentry v10, use addBreadcrumb method directly
    Sentry.addBreadcrumb({
      category,
      level: level as any,
      message,
      data,
      timestamp: Date.now() / 1000,
    });
  } catch (err) {
    // Silently fail - don't break app on breadcrumb errors
    console.debug('Failed to add breadcrumb:', err);
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
    extra?: Record<string, any>;
  }
) {
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
 * Note: Sentry v10 has limited performance monitoring support
 */
export function startTransaction(
  name: string,
  operation: string = 'http.client'
): { finish: () => void } | null {
  try {
    // In Sentry v10, we just log the transaction
    logger.debug('errorMonitoring', `Transaction started: ${name} (op: ${operation})`);
    // Return a dummy transaction object for compatibility
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
  try {
    Sentry.captureMessage(message, level);
  } catch (err) {
    logger.warn('errorMonitoring', `Failed to capture message: ${err}`);
  }
}

/**
 * Get current platform
 */
function getPlatform(): string {
  if (typeof window === 'undefined') return 'unknown';
  
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

/**
 * React Error Boundary Higher-Order Component
 */
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
) => {
  const Wrapped = (props: P) => (
    <Sentry.ErrorBoundary
      onError={(error: unknown, componentStack: string, eventId: string) => {
        reportError(error instanceof Error ? error : String(error), {
          component: componentName,
          severity: 'fatal',
          extra: { componentStack, eventId }
        });
      }}
    >
      <Component {...props} />
    </Sentry.ErrorBoundary>
  );
  
  Wrapped.displayName = `withErrorBoundary(${componentName})`;
  return Wrapped;
};


