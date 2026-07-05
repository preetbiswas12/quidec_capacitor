import { describe, it, expect } from 'vitest';
import {
  sanitizePathComponent,
  normalizeFirestoreTimestamp,
  generateUserIdSync,
  getConversationId,
  generateInviteCode,
  MESSAGE_STATUS,
} from '../shared';

describe('MESSAGE_STATUS', () => {
  it('has correct values', () => {
    expect(MESSAGE_STATUS.SENT).toBe('sent');
    expect(MESSAGE_STATUS.DELIVERED).toBe('delivered');
    expect(MESSAGE_STATUS.READ).toBe('read');
  });
});

describe('sanitizePathComponent', () => {
  it('replaces invalid Firebase RTDB characters', () => {
    expect(sanitizePathComponent('user.name')).toBe('user_name');
    expect(sanitizePathComponent('user#123')).toBe('user_123');
    expect(sanitizePathComponent('user$dollar')).toBe('user_dollar');
    expect(sanitizePathComponent('user[0]')).toBe('user_0_');
    expect(sanitizePathComponent('user@home')).toBe('user_home');
  });

  it('returns "unknown" for empty/falsy input', () => {
    expect(sanitizePathComponent('')).toBe('unknown');
    expect(sanitizePathComponent(null as any)).toBe('unknown');
    expect(sanitizePathComponent(undefined as any)).toBe('unknown');
  });

  it('preserves valid characters', () => {
    expect(sanitizePathComponent('abc123')).toBe('abc123');
    expect(sanitizePathComponent('user-name_123')).toBe('user-name_123');
  });
});

describe('normalizeFirestoreTimestamp', () => {
  it('returns current ISO string for falsy input', () => {
    const result = normalizeFirestoreTimestamp(null);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('passes through ISO string values', () => {
    const iso = '2024-01-15T10:30:00.000Z';
    expect(normalizeFirestoreTimestamp(iso)).toBe(iso);
  });

  it('converts Firestore toDate() objects', () => {
    const date = new Date('2024-06-01T12:00:00Z');
    const firestoreTs = { toDate: () => date };
    expect(normalizeFirestoreTimestamp(firestoreTs)).toBe(date.toISOString());
  });

  it('converts Firestore seconds-based timestamps', () => {
    const seconds = Math.floor(new Date('2024-03-15T08:00:00Z').getTime() / 1000);
    const result = normalizeFirestoreTimestamp({ seconds });
    expect(result).toBe(new Date(seconds * 1000).toISOString());
  });

  it('converts Date objects', () => {
    const date = new Date('2024-07-04T00:00:00Z');
    expect(normalizeFirestoreTimestamp(date)).toBe(date.toISOString());
  });

  it('converts numeric timestamps', () => {
    const ts = 1700000000000;
    expect(normalizeFirestoreTimestamp(ts)).toBe(new Date(ts).toISOString());
  });
});

describe('generateUserIdSync', () => {
  it('generates username.1234 pattern', () => {
    const result = generateUserIdSync('Alice');
    expect(result).toMatch(/^alice\.\d{4}$/);
  });

  it('strips spaces from name', () => {
    const result = generateUserIdSync('John Doe');
    expect(result).toMatch(/^johndoe\.\d{4}$/);
  });

  it('lowercases the name', () => {
    const result = generateUserIdSync('ADMIN');
    expect(result).toMatch(/^admin\.\d{4}$/);
  });

  it('generates 4-digit numeric suffix', () => {
    const result = generateUserIdSync('test');
    const suffix = parseInt(result.split('.')[1], 10);
    expect(suffix).toBeGreaterThanOrEqual(1000);
    expect(suffix).toBeLessThanOrEqual(9999);
  });
});

describe('getConversationId', () => {
  it('sorts and joins UIDs', () => {
    expect(getConversationId('bob', 'alice')).toBe('alice_bob');
  });

  it('is order-independent', () => {
    const id1 = getConversationId('user1', 'user2');
    const id2 = getConversationId('user2', 'user1');
    expect(id1).toBe(id2);
  });

  it('handles same UID (self-chat edge case)', () => {
    expect(getConversationId('user1', 'user1')).toBe('user1_user1');
  });
});

describe('generateInviteCode', () => {
  it('generates 10-character alphanumeric code', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[A-Z0-9]{10}$/);
  });

  it('generates different codes on each call', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
