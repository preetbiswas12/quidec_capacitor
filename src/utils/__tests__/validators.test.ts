import { describe, it, expect } from 'vitest';
import {
  validateMessage,
  validateUsername,
  validateEmail,
  validatePassword,
  validateConversationId,
  sanitizeHTML,
  validateMediaSize,
  validateMediaType,
  validateMessageStructure,
  RateLimiter,
} from '../validators';

describe('validateEmail', () => {
  it('accepts a valid email and lowercases it', () => {
    expect(validateEmail('  User@Example.com  ')).toBe('user@example.com');
  });

  it('rejects non-string input', () => {
    expect(() => validateEmail(null as any)).toThrow('must be a string');
  });

  it('rejects malformed email', () => {
    expect(() => validateEmail('notanemail')).toThrow('incorrect format');
    expect(() => validateEmail('missing@domain')).toThrow('incorrect format');
  });

  it('rejects email with local part over 64 chars', () => {
    const longLocal = 'a'.repeat(65) + '@x.com';
    expect(() => validateEmail(longLocal)).toThrow('local part too long');
  });

  it('rejects consecutive dots', () => {
    expect(() => validateEmail('a..b@example.com')).toThrow('consecutive dots');
  });
});

describe('validatePassword', () => {
  it('accepts a valid password', () => {
    expect(validatePassword('Valid1Pass')).toBe('Valid1Pass');
  });

  it('rejects non-string input', () => {
    expect(() => validatePassword(123 as any)).toThrow('must be a string');
  });

  it('rejects password shorter than 6 chars', () => {
    expect(() => validatePassword('Ab1')).toThrow('at least 6 characters');
  });

  it('rejects password exceeding 128 chars', () => {
    expect(() => validatePassword('Aa1' + 'x'.repeat(130))).toThrow('exceeds maximum length');
  });
});

describe('validateUsername', () => {
  it('accepts a valid username', () => {
    expect(validateUsername('preet.biswas')).toBe('preet.biswas');
  });

  it('rejects non-string input', () => {
    expect(() => validateUsername(null as any)).toThrow('must be a string');
  });

  it('rejects too-short and too-long usernames', () => {
    expect(() => validateUsername('ab')).toThrow('3-20 characters');
    expect(() => validateUsername('a'.repeat(21))).toThrow('3-20 characters');
  });

  it('rejects special characters', () => {
    expect(() => validateUsername('user name')).toThrow('only letters, numbers, dot, dash, underscore');
    expect(() => validateUsername('user@name')).toThrow('only letters, numbers, dot, dash, underscore');
  });

  it('rejects consecutive special characters', () => {
    expect(() => validateUsername('user..name')).toThrow('consecutive special characters');
  });

  it('rejects leading/trailing special characters', () => {
    expect(() => validateUsername('.username')).toThrow('cannot start/end with special character');
    expect(() => validateUsername('username-')).toThrow('cannot start/end with special character');
  });
});

describe('validateMessage', () => {
  it('accepts a valid message', () => {
    expect(validateMessage('Hello world')).toBe('Hello world');
  });

  it('rejects non-string input', () => {
    expect(() => validateMessage(null as any)).toThrow('must be a string');
  });

  it('rejects whitespace-only message', () => {
    // Note: empty string '' is caught by the `!` falsy guard ("must be a string")
    // before the trim check. Whitespace-only reaches the trim check.
    expect(() => validateMessage('   ')).toThrow('cannot be empty');
  });

  it('rejects empty string via falsy guard', () => {
    expect(() => validateMessage('')).toThrow('must be a string');
  });

  it('rejects message exceeding 10000 chars', () => {
    expect(() => validateMessage('a'.repeat(10001))).toThrow('cannot exceed 10,000 characters');
  });

  it('rejects words longer than 1000 chars (DoS protection)', () => {
    expect(() => validateMessage('a'.repeat(1001))).toThrow('word too long');
  });

  it('sanitizes HTML in message', () => {
    const result = validateMessage('<b>bold</b>');
    expect(result).not.toContain('<b>');
  });
});

describe('sanitizeHTML', () => {
  it('escapes benign HTML tags', () => {
    // <b> is not a suspicious pattern, so it gets escaped rather than throwing
    expect(sanitizeHTML('<b>bold</b>')).not.toContain('<b>');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHTML(null as any)).toBe('');
  });

  it('strips suspicious content patterns (script, onerror, onload)', () => {
    expect(sanitizeHTML('<script>alert(1)</script>')).not.toContain('<script>');
    expect(sanitizeHTML('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(sanitizeHTML('<img onerror=alert(1)>')).not.toContain('<img');
    expect(sanitizeHTML('Hello <b>world</b>')).toBe('Hello &lt;b&gt;world&lt;/b&gt;');
  });
});

describe('validateConversationId', () => {
  it('accepts a valid conversation id (two 28-char UIDs)', () => {
    const uid1 = 'a'.repeat(28);
    const uid2 = 'b'.repeat(28);
    expect(validateConversationId(`${uid1}_${uid2}`)).toBe(`${uid1}_${uid2}`);
  });

  it('rejects malformed conversation id', () => {
    expect(() => validateConversationId('nope')).toThrow('format');
    expect(() => validateConversationId('short_uid')).toThrow('invalid UID format');
  });
});

describe('validateMediaSize', () => {
  it('accepts image under 1GB', () => {
    expect(validateMediaSize(500 * 1024 * 1024, 'image')).toBe('Valid image');
  });

  it('rejects image over 1GB', () => {
    expect(() => validateMediaSize(1025 * 1024 * 1024, 'image')).toThrow('exceeds 1024MB limit');
  });

  it('rejects video over 1GB', () => {
    expect(() => validateMediaSize(1025 * 1024 * 1024, 'video')).toThrow('exceeds 1024MB limit');
  });
});

describe('validateMediaType', () => {
  it('accepts allowed image types', () => {
    expect(validateMediaType('image/png', 'image')).toBe('image/png');
  });

  it('rejects disallowed type', () => {
    expect(() => validateMediaType('application/pdf', 'image')).toThrow('not supported');
  });
});

describe('validateMessageStructure', () => {
  it('accepts a valid message object', () => {
    expect(() =>
      validateMessageStructure({ content: 'hi', timestamp: 1234, messageId: 'm1' })
    ).not.toThrow();
  });

  it('rejects missing content', () => {
    expect(() => validateMessageStructure({ timestamp: 1234 } as any)).toThrow('content');
  });

  it('rejects missing timestamp', () => {
    expect(() => validateMessageStructure({ content: 'hi' } as any)).toThrow('timestamp');
  });
});

describe('RateLimiter', () => {
  it('allows attempts under the limit', async () => {
    const limiter = new RateLimiter(3, 60000);
    await limiter.checkLimit('user1');
    await limiter.checkLimit('user1');
    await expect(limiter.checkLimit('user1')).resolves.toBeUndefined();
  });

  it('blocks attempts over the limit', async () => {
    const limiter = new RateLimiter(2, 60000);
    await limiter.checkLimit('user2');
    await limiter.checkLimit('user2');
    await expect(limiter.checkLimit('user2')).rejects.toThrow('Rate limit exceeded');
  });

  it('tracks remaining attempts', async () => {
    const limiter = new RateLimiter(5, 60000);
    expect(limiter.getRemaining('user3')).toBe(5);
    await limiter.checkLimit('user3');
    expect(limiter.getRemaining('user3')).toBe(4);
  });

  it('resets attempts for an identifier', async () => {
    const limiter = new RateLimiter(1, 60000);
    await limiter.checkLimit('user4');
    await expect(limiter.checkLimit('user4')).rejects.toThrow();
    limiter.reset('user4');
    await expect(limiter.checkLimit('user4')).resolves.toBeUndefined();
  });
});
