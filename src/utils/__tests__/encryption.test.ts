import { describe, it, expect, beforeAll } from 'vitest';

// jsdom does not implement Web Crypto — provide Node's via globalThis before importing
beforeAll(async () => {
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = await import('node:crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  }
  // jsdom lacks structuredClone in some versions
  if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = (val: unknown) => JSON.parse(JSON.stringify(val));
  }
});

import {
  deriveKey,
  getConversationKey,
  encryptMessage,
  decryptMessage,
  generateHash,
} from '../encryption';

describe('deriveKey', () => {
  it('derives a key from a seed string', async () => {
    const key = await deriveKey('test-seed');
    expect(key).toBeDefined();
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('produces the same key for the same seed (deterministic)', async () => {
    const key1 = await deriveKey('same-seed');
    const key2 = await deriveKey('same-seed');
    // AES-GCM keys are not directly comparable, but both should encrypt/decrypt the same data
    const msg = { text: 'hello' };
    const encrypted = await encryptMessage(msg, key1);
    const decrypted = await decryptMessage(encrypted, key2);
    expect(decrypted).toEqual(msg);
  });
});

describe('getConversationKey', () => {
  it('is deterministic for the same pair of users', async () => {
    const key1 = await getConversationKey('alice', 'bob');
    const key2 = await getConversationKey('alice', 'bob');
    const msg = { text: 'secret' };
    const encrypted = await encryptMessage(msg, key1);
    const decrypted = await decryptMessage(encrypted, key2);
    expect(decrypted).toEqual(msg);
  });

  it('is order-independent (alice,bob === bob,alice)', async () => {
    const keyAb = await getConversationKey('alice', 'bob');
    const keyBa = await getConversationKey('bob', 'alice');
    const msg = { text: 'order test' };
    const encrypted = await encryptMessage(msg, keyAb);
    const decrypted = await decryptMessage(encrypted, keyBa);
    expect(decrypted).toEqual(msg);
  });

  it('produces different keys for different user pairs', async () => {
    const keyAb = await getConversationKey('alice', 'bob');
    const keyAc = await getConversationKey('alice', 'charlie');
    const msg = { text: 'pair test' };
    const encrypted = await encryptMessage(msg, keyAb);
    // Decrypting with the wrong pair's key should fail
    await expect(decryptMessage(encrypted, keyAc)).rejects.toThrow();
  });
});

describe('encryptMessage / decryptMessage', () => {
  it('round-trips a text message', async () => {
    const key = await deriveKey('roundtrip-seed');
    const original = { text: 'Hello, Veill!', sender: 'alice', timestamp: 1234567890 };
    const encrypted = await encryptMessage(original, key);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain('Hello');
    const decrypted = await decryptMessage(encrypted, key);
    expect(decrypted).toEqual(original);
  });

  it('produces different ciphertext for the same message (random IV)', async () => {
    const key = await deriveKey('iv-seed');
    const msg = { text: 'same text' };
    const encrypted1 = await encryptMessage(msg, key);
    const encrypted2 = await encryptMessage(msg, key);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('fails to decrypt with the wrong key', async () => {
    const key1 = await deriveKey('key-one');
    const key2 = await deriveKey('key-two');
    const msg = { text: 'secret' };
    const encrypted = await encryptMessage(msg, key1);
    await expect(decryptMessage(encrypted, key2)).rejects.toThrow();
  });
});

describe('generateHash', () => {
  it('produces a 64-char hex string (SHA-256)', async () => {
    const hash = await generateHash('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', async () => {
    const hash1 = await generateHash('same input');
    const hash2 = await generateHash('same input');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', async () => {
    const hash1 = await generateHash('input-a');
    const hash2 = await generateHash('input-b');
    expect(hash1).not.toBe(hash2);
  });
});
