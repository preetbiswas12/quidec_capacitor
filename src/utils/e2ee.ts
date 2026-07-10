/**
 * E2EE v2 — ECDH Key Exchange + HKDF + Hash Ratchet
 *
 * Key agreement:
 *   ECDH(P-256) → shared secret → HKDF → base session key
 *
 * Per-message ratchet:
 *   message_key = HKDF(base_key, "ratchet-{counter}")
 *   After encryption, counter increments — old keys are never reused.
 *
 * Backward compatibility:
 *   Messages encrypted with the old PBKDF2 system are detected by the
 *   absence of `e2ee` metadata and decrypted via the legacy path.
 */

import { Preferences } from '@capacitor/preferences';

// ─── Helpers ────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface E2EEKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface E2EEPayload {
  ciphertext: string;
  iv: string;
  counter: number;
  version: 2;
}

// ─── ECDH Key Generation ───────────────────────────────────────────────────

export async function generateECDHKeyPair(): Promise<E2EEKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits', 'deriveKey']
  );
}

export async function exportPublicKeyBase64(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', publicKey);
  return bufferToBase64(raw);
}

export async function importPublicKeyBase64(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBuffer(b64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// ─── Private Key Persistence ────────────────────────────────────────────────

const PRIVATE_KEY_PREFIX = 'e2ee_privkey_';
const PUBLIC_KEY_PREFIX = 'e2ee_pubkey_';

export async function storePrivateKeyLocal(userId: string, privateKey: CryptoKey): Promise<void> {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  await Preferences.set({
    key: `${PRIVATE_KEY_PREFIX}${userId}`,
    value: JSON.stringify(jwk),
  });
}

export async function loadPrivateKeyLocal(userId: string): Promise<CryptoKey | null> {
  try {
    const { value } = await Preferences.get({ key: `${PRIVATE_KEY_PREFIX}${userId}` });
    if (!value) return null;
    return crypto.subtle.importKey(
      'jwk',
      JSON.parse(value),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits', 'deriveKey']
    );
  } catch (err) {
    console.warn('[e2ee] Failed to load ECDH private key from storage:', err);
    return null;
  }
}

export async function storePublicKeyLocal(userId: string, publicKeyBase64: string): Promise<void> {
  await Preferences.set({ key: `${PUBLIC_KEY_PREFIX}${userId}`, value: publicKeyBase64 });
}

export async function loadPublicKeyLocal(userId: string): Promise<string | null> {
  const { value } = await Preferences.get({ key: `${PUBLIC_KEY_PREFIX}${userId}` });
  return value || null;
}

// ─── Public Key Exchange via Firestore ──────────────────────────────────────

export async function publishPublicKey(userId: string, publicKeyBase64: string): Promise<void> {
  const { doc, setDoc } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  await setDoc(doc(db, 'users', userId), { e2eePublicKey: publicKeyBase64 }, { merge: true });
}

export async function fetchRemotePublicKey(userId: string): Promise<string | null> {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data.e2eePublicKey || null;
  } catch (err) {
    console.warn('[e2ee] Failed to fetch remote public key from Firestore:', err);
    return null;
  }
}

// ─── Key Agreement (ECDH → HKDF) ───────────────────────────────────────────

async function deriveSharedSecret(
  myPrivate: CryptoKey,
  theirPublic: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublic },
    myPrivate,
    256
  );
}

export async function deriveBaseSessionKey(
  sharedSecret: ArrayBuffer,
  user1: string,
  user2: string
): Promise<CryptoKey> {
  const [a, b] = [user1, user2].sort();

  const saltSeed = new TextEncoder().encode(`${a}|${b}|e2e-hkdf-salt-v2`);
  const salt = await crypto.subtle.digest('SHA-256', saltSeed);

  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, [
    'deriveBits',
  ]);

  const info = new TextEncoder().encode(`quidec-e2ee-v2|${a}|${b}`);

  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    256
  );

  return crypto.subtle.importKey('raw', derived, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ─── Hash Ratchet ──────────────────────────────────────────────────────────

async function ratchetKey(baseKey: CryptoKey, counter: number): Promise<CryptoKey> {
  const raw = await crypto.subtle.exportKey('raw', baseKey);

  const hkdfKey = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);

  const salt = new Uint8Array(32);
  const info = new TextEncoder().encode(`ratchet-${counter}`);

  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    256
  );

  return crypto.subtle.importKey('raw', derived, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// ─── Session Setup ──────────────────────────────────────────────────────────

let sessionKeyCache = new Map<string, CryptoKey>();

function sessionCacheKey(me: string, them: string): string {
  return [me, them].sort().join(':');
}

/**
 * Derive the base session key for a conversation.
 * Uses ECDH if both parties have key pairs; falls back to null.
 */
export async function getSessionKey(
  myUserId: string,
  theirUserId: string
): Promise<CryptoKey | null> {
  const cacheK = sessionCacheKey(myUserId, theirUserId);
  if (sessionKeyCache.has(cacheK)) return sessionKeyCache.get(cacheK)!;

  const myPrivate = await loadPrivateKeyLocal(myUserId);
  if (!myPrivate) return null;

  let theirPubB64 = await fetchRemotePublicKey(theirUserId);
  if (!theirPubB64) theirPubB64 = await loadPublicKeyLocal(theirUserId);
  if (!theirPubB64) return null;

  const theirPublic = await importPublicKeyBase64(theirPubB64);
  const secret = await deriveSharedSecret(myPrivate, theirPublic);
  const key = await deriveBaseSessionKey(secret, myUserId, theirUserId);

  sessionKeyCache.set(cacheK, key);
  return key;
}

export function clearSessionCache(): void {
  sessionKeyCache.clear();
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────

export async function encryptE2EE(
  plaintext: object,
  sessionKey: CryptoKey,
  counter: number
): Promise<string> {
  const msgKey = await ratchetKey(sessionKey, counter);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(plaintext));

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, msgKey, data);

  const payload: E2EEPayload = {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv.buffer),
    counter,
    version: 2,
  };

  return JSON.stringify(payload);
}

export async function decryptE2EE(
  encryptedData: string,
  sessionKey: CryptoKey
): Promise<{ plaintext: object; counter: number }> {
  const payload: E2EEPayload = JSON.parse(encryptedData);
  if (payload.version !== 2) throw new Error('Not an E2EE v2 payload');

  const msgKey = await ratchetKey(sessionKey, payload.counter);
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    msgKey,
    new Uint8Array(ciphertext)
  );

  return {
    plaintext: JSON.parse(new TextDecoder().decode(decrypted)),
    counter: payload.counter,
  };
}

/**
 * Check if an encrypted string is an E2EE v2 payload.
 */
export function isE2EEPayload(encryptedData: string): boolean {
  try {
    const payload = JSON.parse(encryptedData);
    return payload && payload.version === 2 && typeof payload.ciphertext === 'string';
  } catch {
    return false;
  }
}

// ─── User Vault Key (ECDH self-agreement + HKDF → AES-GCM) ─────────────────

let vaultKeyCache = new Map<string, CryptoKey>();

/**
 * Derive a user-specific vault key using ECDH self-agreement.
 * Only someone with the user's ECDH private key can compute this key.
 * Used to encrypt/decrypt sensitive Firestore user data (email, about, etc).
 */
export async function deriveUserVaultKey(userId: string): Promise<CryptoKey> {
  if (vaultKeyCache.has(userId)) return vaultKeyCache.get(userId)!;

  const privateKey = await loadPrivateKeyLocal(userId);
  if (!privateKey) throw new Error('No ECDH key pair — cannot derive vault key');

  const pubB64 = await loadPublicKeyLocal(userId);
  if (!pubB64) throw new Error('No public key cached — cannot derive vault key');
  const publicKey = await importPublicKeyBase64(pubB64);

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );

  const saltSeed = new TextEncoder().encode(`${userId}|user-vault-salt-v1`);
  const salt = await crypto.subtle.digest('SHA-256', saltSeed);

  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('quidec-user-vault-v1') },
    hkdfKey,
    256
  );

  const key = await crypto.subtle.importKey('raw', derived, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);

  vaultKeyCache.set(userId, key);
  return key;
}

export function clearVaultKeyCache(): void {
  vaultKeyCache.clear();
}

/**
 * Encrypt a string field using the user's vault key.
 * Returns base64(iv + ciphertext).
 */
export async function encryptUserField(plaintext: string, vaultKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, data);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bufferToBase64(combined.buffer);
}

/**
 * Decrypt a vault-encrypted field back to plaintext.
 */
export async function decryptUserField(encryptedB64: string, vaultKey: CryptoKey): Promise<string> {
  const combined = new Uint8Array(base64ToBuffer(encryptedB64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

const VAULT_ENCRYPTED_FIELDS = ['email', 'about', 'fcmToken'] as const;
const VAULT_SUFFIX = '_enc';
export const VAULT_VERSION_KEY = '_vaultVersion';

/**
 * Encrypt sensitive user fields in-place for Firestore storage.
 * Returns a new object with plaintext fields removed and encrypted versions added.
 * Skips fields that are null/undefined.
 */
export async function encryptUserData(
  userId: string,
  fields: Record<string, any>
): Promise<Record<string, any>> {
  let vaultKey: CryptoKey;
  try {
    vaultKey = await deriveUserVaultKey(userId);
  } catch {
    console.warn('⚠️ Vault key unavailable — storing sensitive fields as plaintext');
    return fields;
  }

  const result = { ...fields };
  for (const field of VAULT_ENCRYPTED_FIELDS) {
    if (result[field] != null && typeof result[field] === 'string' && result[field] !== '') {
      result[`${field}${VAULT_SUFFIX}`] = await encryptUserField(result[field], vaultKey);
      delete result[field];
    }
  }
  result[VAULT_VERSION_KEY] = 1;
  return result;
}

/**
 * Decrypt sensitive user fields read from Firestore.
 * Handles both encrypted (_enc suffix) and legacy plaintext fields.
 * Returns a new object with decrypted values under original field names.
 */
export async function decryptUserData(
  userId: string,
  docData: Record<string, any>
): Promise<Record<string, any>> {
  if (!docData) return docData;

  const vaultVersion = docData[VAULT_VERSION_KEY];
  if (!vaultVersion) return docData;

  let vaultKey: CryptoKey;
  try {
    vaultKey = await deriveUserVaultKey(userId);
  } catch {
    console.warn('⚠️ Vault key unavailable — returning raw doc data');
    return docData;
  }

  const result = { ...docData };
  for (const field of VAULT_ENCRYPTED_FIELDS) {
    const encKey = `${field}${VAULT_SUFFIX}`;
    if (result[encKey]) {
      try {
        result[field] = await decryptUserField(result[encKey], vaultKey);
      } catch (err) {
        console.warn(`⚠️ Failed to decrypt ${field}:`, err);
        result[field] = null;
      }
      delete result[encKey];
    }
  }
  return result;
}

// ─── Initialisation ─────────────────────────────────────────────────────────

/**
 * Ensure the current user has an ECDH key pair.
 * Generates one if missing, publishes the public key to Firestore.
 */
export async function ensureKeyPair(userId: string): Promise<E2EEKeyPair> {
  const existing = await loadPrivateKeyLocal(userId);
  if (existing) {
    const pubB64 = await loadPublicKeyLocal(userId);
    if (pubB64) {
      return { privateKey: existing, publicKey: await importPublicKeyBase64(pubB64) };
    }
  }

  const kp = await generateECDHKeyPair();
  const pubB64 = await exportPublicKeyBase64(kp.publicKey);

  await storePrivateKeyLocal(userId, kp.privateKey);
  await storePublicKeyLocal(userId, pubB64);

  try {
    await publishPublicKey(userId, pubB64);
  } catch (err) {
    console.warn('⚠️ Failed to publish E2EE public key:', err);
  }

  console.log(`🔐 E2EE key pair ready for ${userId}`);
  return kp;
}
