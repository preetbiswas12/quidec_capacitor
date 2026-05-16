/**
 * Centralized Logger for Quidec
 * - Log levels for filtering in production
 * - Automatic PII/sensitive data sanitization
 * - Timestamps and structured output
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

// Production: only errors; Development: everything
const currentLevel = import.meta.env.PROD ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG;

// Fields to remove from logs (PII, tokens, large data)
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'avatar', // Base64 images are huge
  'photoURL',
  'email', // May be considered PII
  'phoneNumber',
  'fcmToken',
  'pushToken',
  'encryptionKey',
  'privateKey',
  'secret',
  'apiKey',
  'ssid',
  'authuid',
];

// Fields to truncate (large but not sensitive)
const TRUNCATE_FIELDS = [
  'message',
  'content',
  'body',
  'description',
];

/**
 * Sanitize an object for logging
 * Removes sensitive fields, truncates large strings
 */
export function sanitizeForLog(obj: unknown, depth = 0): unknown {
  if (depth > 5) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // Remove sensitive fields
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Truncate large string fields
    if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + '...[TRUNCATED]';
      continue;
    }

    // Recurse into nested objects (limited depth)
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value, depth + 1);
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Format log message with timestamp and context
 */
function formatMessage(level: string, context: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const sanitized = args.map((arg) => {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: import.meta.env.DEV ? arg.stack : undefined,
      };
    }
    return sanitizeForLog(arg);
  });
  return `[${timestamp}] [${level}] [${context}] ${JSON.stringify(sanitized, null, 2)}`;
}

// Main logger instance
export const logger = {
  debug: (context: string, ...args: unknown[]) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.debug(formatMessage('DEBUG', context, args));
    }
  },

  info: (context: string, ...args: unknown[]) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.info(formatMessage('INFO', context, args));
    }
  },

  warn: (context: string, ...args: unknown[]) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', context, args));
    }
  },

  error: (context: string, ...args: unknown[]) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', context, args));
    }
  },

  // Group logs for readability
  group: (context: string, label: string, fn: () => void) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.group(`[${context}] ${label}`);
      fn();
      console.groupEnd();
    }
  },

  // Time operations
  time: (context: string, label: string) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.time(`[${context}] ${label}`);
    }
  },

  timeEnd: (context: string, label: string) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.timeEnd(`[${context}] ${label}`);
    }
  },
};

// Default export for convenience
export default logger;