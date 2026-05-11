/**
 * LocalMessageStore
 * ─────────────────
 * Stores messages locally on the device in per-chat binary chunk files.
 * Each chunk file grows as new messages arrive.
 *
 * ENCRYPTION: Two independent AES-256-GCM passes (double encryption):
 *   plaintext → AES-GCM(Key₂, IV₂) → AES-GCM(Key₁, IV₁) → chunk bytes
 *   Keys are derived via PBKDF2 from (userUID + deviceId + chatId + salt)
 *   Salt is stored in device Keychain via @capacitor/preferences.
 *
 * CHUNK FORMAT (per message):
 *   [4 bytes: payload length] [12 bytes: IV₁] [12 bytes: IV₂] [N bytes: ciphertext]
 *
 * FILE: Documents/qchat_{chatId}.bin  (one file per chat, grows forever)
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'system' | 'link';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  reactions?: { emoji: string; count: number }[];
  isStarred?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
  mediaPath?: string; // local path for media
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SALT_PREF_KEY = 'quidec_local_store_salt';
const FILE_DIR = Directory.Documents;
const CHUNK_HEADER_SIZE = 4 + 12 + 12; // payloadLen + IV1 + IV2

// ─── Key Derivation ───────────────────────────────────────────────────────────

/** Derive two independent AES-256-GCM keys from device/user/chat context */
async function deriveKeys(
  userUid: string,
  chatId: string,
  salt: Uint8Array
): Promise<{ key1: CryptoKey; key2: CryptoKey }> {
  const enc = new TextEncoder();

  // Base material = userUid + chatId
  const baseMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userUid + chatId),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Key 1 — primary layer (derived with info = "layer1")
  const key1 = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: concat(salt, enc.encode('quidec-layer1')),
      iterations: 310_000,
      hash: 'SHA-256',
    },
    baseMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Key 2 — secondary layer (derived with info = "layer2", different iteration count)
  const key2 = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: concat(salt, enc.encode('quidec-layer2')),
      iterations: 250_000,
      hash: 'SHA-256',
    },
    baseMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return { key1, key2 };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const buffer = new ArrayBuffer(total);
  const out = new Uint8Array(buffer);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function numToBytes(n: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(4);
  const b = new Uint8Array(buffer);
  new DataView(buffer).setUint32(0, n, false);
  return b;
}

function bytesToNum(b: Uint8Array, offset = 0): number {
  // Use a fresh ArrayBuffer slice so DataView gets a clean ArrayBuffer
  const slice = b.slice(offset, offset + 4);
  return new DataView(slice.buffer).getUint32(0, false);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Wrap any Uint8Array into a guaranteed ArrayBuffer-backed one for Web Crypto */
function toArrayBuffer(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(src.length);
  const out = new Uint8Array(buffer);
  out.set(src);
  return out;
}

function chatFilename(chatId: string): string {
  // Sanitize chatId for filesystem use
  return `qchat_${chatId.replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`;
}

// ─── Salt Management ──────────────────────────────────────────────────────────

async function getOrCreateSalt(): Promise<Uint8Array> {
  const { value } = await Preferences.get({ key: SALT_PREF_KEY });
  if (value) return fromBase64(value);

  // Generate new salt (32 bytes) and persist in Keychain
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await Preferences.set({ key: SALT_PREF_KEY, value: toBase64(salt) });
  return salt;
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Double-encrypt a message payload:
 *   plaintext → AES-GCM(key2, iv2) → AES-GCM(key1, iv1)
 * Returns: { iv1, iv2, ciphertext }
 */
async function doubleEncrypt(
  payload: Uint8Array,
  key1: CryptoKey,
  key2: CryptoKey
): Promise<{ iv1: Uint8Array<ArrayBuffer>; iv2: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> }> {
  const iv2 = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const iv1 = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const safePayload = toArrayBuffer(payload);

  // First pass — key2
  const pass1 = toArrayBuffer(new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, key2, safePayload)
  ));

  // Second pass — key1
  const pass2 = toArrayBuffer(new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv1 }, key1, pass1)
  ));

  return { iv1, iv2, ciphertext: pass2 };
}

/**
 * Decrypt in reverse:
 *   ciphertext → AES-GCM-decrypt(key1, iv1) → AES-GCM-decrypt(key2, iv2)
 */
async function doubleDecrypt(
  ciphertext: Uint8Array,
  iv1: Uint8Array<ArrayBuffer>,
  iv2: Uint8Array<ArrayBuffer>,
  key1: CryptoKey,
  key2: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> {
  const safeCipher = toArrayBuffer(ciphertext);
  const pass1 = toArrayBuffer(new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv1 }, key1, safeCipher)
  ));
  const pass2 = toArrayBuffer(new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv2 }, key2, pass1)
  ));
  return pass2;
}

// ─── Chunk Serialisation ──────────────────────────────────────────────────────

/** Encode one message into a chunk: [4-byte len][IV1 12B][IV2 12B][ciphertext] */
function encodeChunk(iv1: Uint8Array, iv2: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const payloadLen = numToBytes(ciphertext.length);
  return concat(payloadLen, iv1, iv2, ciphertext);
}

// ─── File I/O Helpers ─────────────────────────────────────────────────────────

async function readFileBytes(filename: string): Promise<Uint8Array | null> {
  try {
    const result = await Filesystem.readFile({ path: filename, directory: FILE_DIR });
    // result.data is base64 string on native, or base64 on web
    const data = result.data as string;
    return fromBase64(data);
  } catch {
    return null; // file doesn't exist yet
  }
}

async function writeFileBytes(filename: string, bytes: Uint8Array): Promise<void> {
  await Filesystem.writeFile({
    path: filename,
    data: toBase64(bytes),
    directory: FILE_DIR,
    recursive: true,
  });
}

async function appendToFile(filename: string, chunk: Uint8Array): Promise<void> {
  const existing = await readFileBytes(filename);
  const combined = existing ? concat(existing, chunk) : chunk;
  await writeFileBytes(filename, combined);
}

// ─── Key Cache (avoid re-deriving on every message) ──────────────────────────

const keyCache = new Map<string, { key1: CryptoKey; key2: CryptoKey }>();

async function getKeys(userUid: string, chatId: string): Promise<{ key1: CryptoKey; key2: CryptoKey }> {
  const cacheKey = `${userUid}:${chatId}`;
  if (keyCache.has(cacheKey)) return keyCache.get(cacheKey)!;

  const salt = await getOrCreateSalt();
  const keys = await deriveKeys(userUid, chatId, salt);
  keyCache.set(cacheKey, keys);
  return keys;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Append a single message to the chat's local chunk file (encrypted).
 * Called every time a message is sent or received.
 */
export async function appendMessage(
  userUid: string,
  message: StoredMessage
): Promise<void> {
  try {
    const { chatId } = message;
    const { key1, key2 } = await getKeys(userUid, chatId);

    const payload = new TextEncoder().encode(JSON.stringify(message));
    const { iv1, iv2, ciphertext } = await doubleEncrypt(payload, key1, key2);
    const chunk = encodeChunk(iv1, iv2, ciphertext);

    await appendToFile(chatFilename(chatId), chunk);
  } catch (err) {
    console.error(`[LocalStore] appendMessage failed for chat ${message.chatId}:`, err);
  }
}

/**
 * Load and decrypt all messages for a chat from the local chunk file.
 * Returns messages in insertion order (oldest first).
 */
export async function loadMessages(
  userUid: string,
  chatId: string
): Promise<StoredMessage[]> {
  try {
    const filename = chatFilename(chatId);
    const fileBytes = await readFileBytes(filename);
    if (!fileBytes || fileBytes.length === 0) return [];

    const { key1, key2 } = await getKeys(userUid, chatId);
    const messages: StoredMessage[] = [];
    let offset = 0;

    while (offset < fileBytes.length) {
      // Need at least header
      if (offset + CHUNK_HEADER_SIZE > fileBytes.length) break;

      const payloadLen = bytesToNum(fileBytes, offset);
      offset += 4;

      const iv1 = fileBytes.slice(offset, offset + 12);
      offset += 12;

      const iv2 = fileBytes.slice(offset, offset + 12);
      offset += 12;

      if (offset + payloadLen > fileBytes.length) break;
      const ciphertext = fileBytes.slice(offset, offset + payloadLen);
      offset += payloadLen;

      try {
        const plainBytes = await doubleDecrypt(ciphertext, iv1, iv2, key1, key2);
        const msg = JSON.parse(new TextDecoder().decode(plainBytes)) as StoredMessage;
        messages.push(msg);
      } catch (chunkErr) {
        console.warn('[LocalStore] Skipping corrupted chunk:', chunkErr);
        // Continue reading remaining chunks
      }
    }

    return messages;
  } catch (err) {
    console.error(`[LocalStore] loadMessages failed for chat ${chatId}:`, err);
    return [];
  }
}

/**
 * Load messages for multiple chats at once (used on app startup).
 * Returns a map of chatId → messages[].
 */
export async function loadAllChats(
  userUid: string,
  chatIds: string[]
): Promise<Record<string, StoredMessage[]>> {
  const results: Record<string, StoredMessage[]> = {};
  await Promise.all(
    chatIds.map(async (chatId) => {
      results[chatId] = await loadMessages(userUid, chatId);
    })
  );
  return results;
}

/**
 * List all chat IDs that have a local chunk file on this device.
 * Parses filenames matching qchat_{chatId}.bin
 */
export async function listLocalChatIds(): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path: '.', directory: FILE_DIR });
    return files
      .map(f => (typeof f === 'string' ? f : (f as any).name ?? ''))
      .map(name => name.startsWith('qchat_') && name.endsWith('.bin')
        ? name.slice(6, -4)
        : null
      )
      .filter((id): id is string => id !== null);
  } catch {
    return [];
  }
}

/**
 * Delete the local chunk file for a specific chat (e.g. user leaves chat).
 */
export async function deleteLocalChat(chatId: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: chatFilename(chatId), directory: FILE_DIR });
    keyCache.delete(`${chatId}`); // clear from cache too
  } catch {
    // File may not exist — ignore
  }
}

/**
 * Update the status of a specific message in a chat file.
 * Since chunk files are append-only, we rewrite the entire file with the updated message.
 * For large files this is expensive — call sparingly (only on read receipt).
 */
export async function updateMessageStatus(
  userUid: string,
  chatId: string,
  messageId: string,
  status: 'sent' | 'delivered' | 'read'
): Promise<void> {
  const messages = await loadMessages(userUid, chatId);
  const updated = messages.map(m => m.id === messageId ? { ...m, status } : m);

  // Rewrite file
  const { key1, key2 } = await getKeys(userUid, chatId);
  const filename = chatFilename(chatId);

  let combined = new Uint8Array(0);
  for (const msg of updated) {
    const payload = new TextEncoder().encode(JSON.stringify(msg));
    const { iv1, iv2, ciphertext } = await doubleEncrypt(payload, key1, key2);
    const chunk = encodeChunk(iv1, iv2, ciphertext);
    combined = concat(combined, chunk);
  }

  await writeFileBytes(filename, combined);
}

/** Clear the key cache (call on logout) */
export function clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Update the reactions of a specific message in a chat file.
 */
export async function updateMessageReactions(
  userUid: string,
  chatId: string,
  messageId: string,
  reactions: { emoji: string; count: number }[]
): Promise<void> {
  const messages = await loadMessages(userUid, chatId);
  const updated = messages.map(m => m.id === messageId ? { ...m, reactions } : m);

  // Rewrite file
  const { key1, key2 } = await getKeys(userUid, chatId);
  const filename = chatFilename(chatId);

  let combined = new Uint8Array(0);
  for (const msg of updated) {
    const payload = new TextEncoder().encode(JSON.stringify(msg));
    const { iv1, iv2, ciphertext } = await doubleEncrypt(payload, key1, key2);
    const chunk = encodeChunk(iv1, iv2, ciphertext);
    combined = concat(combined, chunk);
  }

  await writeFileBytes(filename, combined);
}
