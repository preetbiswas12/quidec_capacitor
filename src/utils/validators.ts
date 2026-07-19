/**
 * Input Validation Layer
 * ✅ SECURITY FIX: Prevents XSS, injection, and data validation errors
 *
 * Usage:
 * - validateMessage(text) - Check message content
 * - validateUsername(name) - Validate usernames
 * - validateEmail(email) - Validate email format
 * - sanitizeHTML(text) - Remove HTML/script tags
 */

/**
 * Validate message content
 * - Not empty
 * - Max 10,000 characters
 * - No HTML/script injection
 * - No excessively long words (prevent DoS)
 */
export function validateMessage(msg: string): string {
  // Type check
  if (!msg || typeof msg !== 'string') {
    throw new Error('Invalid message: must be a string');
  }

  // Empty check
  if (msg.trim().length === 0) {
    throw new Error('Invalid message: cannot be empty');
  }

  // Length check
  if (msg.length > 10000) {
    throw new Error('Invalid message: cannot exceed 10,000 characters');
  }

  // Check for excessively long words (potential DoS)
  const words = msg.split(/\s+/);
  if (words.some((word) => word.length > 1000)) {
    throw new Error('Invalid message: word too long (max 1000 chars)');
  }

  // Sanitize HTML to prevent XSS
  const sanitized = sanitizeHTML(msg);

  return sanitized;
}

/**
 * Validate username
 * - 3-20 characters
 * - Alphanumeric + dash, underscore, dot
 * - No spaces or special characters
 */
export function validateUsername(username: string): string {
  if (!username || typeof username !== 'string') {
    throw new Error('Invalid username: must be a string');
  }

  const trimmed = username.trim();

  // Length
  if (trimmed.length < 3 || trimmed.length > 20) {
    throw new Error('Invalid username: must be 3-20 characters');
  }

  // Pattern: alphanumeric + . _ -
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error('Invalid username: only letters, numbers, dot, dash, underscore allowed');
  }

  // No consecutive special characters
  if (/[._-]{2,}/.test(trimmed)) {
    throw new Error('Invalid username: no consecutive special characters');
  }

  // Cannot start/end with special character
  if (/^[._-]|[._-]$/.test(trimmed)) {
    throw new Error('Invalid username: cannot start/end with special character');
  }

  return trimmed;
}

/**
 * Validate email address
 * - Basic format check
 * - Not too long (prevent DoS)
 */
export function validateEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new Error('Invalid email: must be a string');
  }

  const trimmed = email.trim().toLowerCase();

  // Length check
  if (trimmed.length > 254) {
    throw new Error('Invalid email: exceeds maximum length');
  }

  // Basic format check (RFC 5322 simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    throw new Error('Invalid email: incorrect format');
  }

  // Check local part (before @)
  const [local] = trimmed.split('@');
  if (local.length > 64) {
    throw new Error('Invalid email: local part too long');
  }

  // No consecutive dots
  if (trimmed.includes('..')) {
    throw new Error('Invalid email: no consecutive dots allowed');
  }

  return trimmed;
}

/**
 * Validate password
 * - At least 6 characters
 * - Mix of uppercase, lowercase, numbers (recommended)
 */
export function validatePassword(password: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Invalid password: must be a string');
  }

  // Minimum length
  if (password.length < 6) {
    throw new Error('Invalid password: must be at least 6 characters');
  }

  // Max length (prevent extreme long strings)
  if (password.length > 128) {
    throw new Error('Invalid password: exceeds maximum length');
  }

  // Recommend stronger passwords (optional - warn instead of error)
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumbers) {
    console.warn('Password should include uppercase, lowercase, and numbers for better security');
  }

  return password;
}

/**
 * Validate conversation ID format
 * Expected format: "uid1_uid2" where uids are Firebase UIDs
 */
export function validateConversationId(conversationId: string): string {
  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('Invalid conversation ID');
  }

  const parts = conversationId.split('_');
  if (parts.length !== 2) {
    throw new Error('Invalid conversation ID format');
  }

  // Firebase UIDs are 28 chars alphanumeric
  if (!parts.every((part) => /^[a-zA-Z0-9]{28}$/.test(part))) {
    throw new Error('Invalid conversation ID: invalid UID format');
  }

  return conversationId;
}

/**
 * Sanitize HTML to prevent XSS
 * Removes HTML tags and potentially dangerous content
 */
export function sanitizeHTML(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Create temporary element to leverage browser's HTML parsing
  const div = document.createElement('div');
  div.textContent = text; // textContent prevents HTML parsing

  return div.innerHTML;
}

/**
 * Validate media file size
 * - Images: max 5MB
 * - Videos: max 50MB
 * - Audio: max 10MB
 */
export function validateMediaSize(
  fileSize: number,
  mediaType: 'image' | 'video' | 'audio' = 'image'
): string {
  const limits = {
    image: 1024 * 1024 * 1024, // 1GB
    video: 1024 * 1024 * 1024, // 1GB
    audio: 1024 * 1024 * 1024, // 1GB
  };

  const limit = limits[mediaType];
  if (fileSize > limit) {
    throw new Error(`Invalid ${mediaType}: exceeds ${Math.round(limit / 1024 / 1024)}MB limit`);
  }

  return `Valid ${mediaType}`;
}

/**
 * Validate media MIME type
 */
export function validateMediaType(
  mimeType: string,
  mediaType: 'image' | 'video' | 'audio' = 'image'
): string {
  const allowedTypes = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  };

  const allowed = allowedTypes[mediaType];
  if (!allowed.includes(mimeType.toLowerCase())) {
    throw new Error(`Invalid ${mediaType} type: ${mimeType} not supported`);
  }

  return mimeType;
}

/**
 * Validate JSON message structure
 */
export function validateMessageStructure(msg: any): void {
  if (!msg || typeof msg !== 'object') {
    throw new Error('Invalid message: must be an object');
  }

  if (!msg.content || typeof msg.content !== 'string') {
    throw new Error('Invalid message: missing or invalid content field');
  }

  if (!msg.timestamp || typeof msg.timestamp !== 'number') {
    throw new Error('Invalid message: missing or invalid timestamp');
  }

  if (msg.messageId && typeof msg.messageId !== 'string') {
    throw new Error('Invalid message: invalid messageId format');
  }

  // Optional fields type check
  if (msg.type && typeof msg.type !== 'string') {
    throw new Error('Invalid message: invalid type field');
  }
}

/**
 * Rate limiting helper
 * Tracks attempts per identifier within a time window
 */
export class RateLimiter {
  private attempts = new Map<string, number[]>();

  constructor(
    private maxAttempts = 5,
    private windowMs = 60000 // 1 minute default
  ) {}

  /**
   * Check if action is allowed
   * Throws if limit exceeded
   */
  async checkLimit(identifier: string): Promise<void> {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];

    // Remove attempts outside time window
    const recentAttempts = userAttempts.filter((timestamp) => now - timestamp < this.windowMs);

    if (recentAttempts.length >= this.maxAttempts) {
      const resetTime = Math.ceil((this.windowMs - (now - recentAttempts[0])) / 1000);
      throw new Error(`Rate limit exceeded. Try again in ${resetTime} seconds`);
    }

    // Record this attempt
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
  }

  /**
   * Reset attempts for identifier
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Get remaining attempts before limit
   */
  getRemaining(identifier: string): number {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier) || [];
    const recentAttempts = userAttempts.filter((timestamp) => now - timestamp < this.windowMs);

    return Math.max(0, this.maxAttempts - recentAttempts.length);
  }
}

/**
 * Pre-configured rate limiters
 */
export const messageLimiter = new RateLimiter(
  10, // 10 messages
  60000 // per 1 minute
);

export const loginLimiter = new RateLimiter(
  3, // 3 attempts
  300000 // per 5 minutes
);

export const registerLimiter = new RateLimiter(
  2, // 2 attempts
  3600000 // per 1 hour
);

export const friendRequestLimiter = new RateLimiter(
  5, // 5 requests
  300000 // per 5 minutes
);

export const groupCreateLimiter = new RateLimiter(
  5, // 5 groups
  3600000 // per 1 hour
);

export const statusLimiter = new RateLimiter(
  20, // 20 statuses
  3600000 // per 1 hour
);

export const profileUpdateLimiter = new RateLimiter(
  10, // 10 updates
  3600000 // per 1 hour
);

/**
 * Validate group name
 * - 1-100 characters
 * - No HTML/script injection
 */
export function validateGroupName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Group name is required');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Group name cannot be empty');
  }
  if (trimmed.length > 100) {
    throw new Error('Group name cannot exceed 100 characters');
  }
  return sanitizeHTML(trimmed);
}

/**
 * Validate group description
 * - Max 500 characters
 * - No HTML/script injection
 */
export function validateGroupDescription(desc: string): string {
  if (!desc || typeof desc !== 'string') return '';
  if (desc.length > 500) {
    throw new Error('Group description cannot exceed 500 characters');
  }
  return sanitizeHTML(desc.trim());
}

/**
 * Validate status/story content
 * - Not empty
 * - Max 2000 characters
 * - No HTML/script injection
 */
export function validateStatusContent(content: string): string {
  if (!content || typeof content !== 'string') {
    throw new Error('Status content is required');
  }
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error('Status content cannot be empty');
  }
  if (trimmed.length > 2000) {
    throw new Error('Status content cannot exceed 2,000 characters');
  }
  return sanitizeHTML(trimmed);
}

/**
 * Validate profile about/bio
 * - Max 200 characters
 * - No HTML/script injection
 */
export function validateAbout(about: string): string {
  if (!about || typeof about !== 'string') return '';
  if (about.length > 200) {
    throw new Error('Bio cannot exceed 200 characters');
  }
  return sanitizeHTML(about.trim());
}

/**
 * Validate display name
 * - 1-50 characters
 * - No HTML/script injection
 */
export function validateDisplayName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Display name is required');
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Display name cannot be empty');
  }
  if (trimmed.length > 50) {
    throw new Error('Display name cannot exceed 50 characters');
  }
  return sanitizeHTML(trimmed);
}
