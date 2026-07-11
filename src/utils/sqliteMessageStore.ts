/**
 * SQLite Message Store
 * ─────────────────────
 * Replaces the .bin chunk-based localMessageStore with SQLite.
 * 
 * Benefits over .bin files:
 *   - Single-row UPDATE for status/star/content/reactions (O(1) vs O(N) full rewrite)
 *   - Indexed search across all messages (no full-file scan)
 *   - SQL queries for starred messages, chat listing, etc.
 *   - In-memory DB for fast reads, persisted to filesystem on writes
 *
 * Encryption: Message content is AES-256-GCM encrypted before storage.
 * The DB file itself is stored as binary in Documents/qchat_messages.db.
 */

import initSqlJs, { Database } from 'sql.js';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import logger from './logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  chatId: string;
  messageId: string;
  content: string;
  senderId: string;
  timestamp: string;
}

export interface StoredMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'system' | 'link' | 'sticker';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  reactions?: { emoji: string; count: number }[];
  isStarred?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
  mediaPath?: string;
  expiresAt?: number;
  isEdited?: boolean;
  keyVersion?: number;
  hmac?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_FILENAME = 'qchat_messages.db';
const SALT_KEY = 'quidec_sqlite_salt';
const DB_DIR = Directory.Documents;

// ─── Encryption ──────────────────────────────────────────────────────────────

let cachedKey: CryptoKey | null = null;
let cachedSalt: Uint8Array | null = null;

async function getOrCreateSalt(): Promise<Uint8Array> {
  if (cachedSalt) return cachedSalt;
  const { value } = await Preferences.get({ key: SALT_KEY });
  if (value) {
    cachedSalt = base64ToBytes(value);
    return cachedSalt;
  }
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await Preferences.set({ key: SALT_KEY, value: bytesToBase64(salt) });
  cachedSalt = salt;
  return salt;
}

async function getEncryptionKey(userUid: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const salt = await getOrCreateSalt();
  const enc = new TextEncoder();
  const baseMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userUid + '_sqlite_store'),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: concat(salt, enc.encode('sqlite-content')),
      iterations: 200_000,
      hash: 'SHA-256',
    },
    baseMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedKey;
}

async function encryptContent(userUid: string, plaintext: string): Promise<string> {
  const key = await getEncryptionKey(userUid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

async function decryptContent(userUid: string, encrypted: string): Promise<string> {
  try {
    const key = await getEncryptionKey(userUid);
    const data = base64ToBytes(encrypted);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn('[sqlite] Decrypt failed, returning raw ciphertext:', err);
    return encrypted;
  }
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

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ─── Database ────────────────────────────────────────────────────────────────

let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let currentUid: string | null = null;
let initPromise: Promise<Database> | null = null;

async function initDatabase(userUid: string): Promise<Database> {
  if (db && currentUid === userUid) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {

  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      if (file.endsWith('.wasm')) {
        return `/sql-wasm-browser.wasm`;
      }
      return file;
    },
  });

  try {
    const { data } = await Filesystem.readFile({
      path: DB_FILENAME,
      directory: DB_DIR,
    });
    let uint8: Uint8Array;
    if (typeof data === 'string') {
      uint8 = base64ToBytes(data);
    } else if (data instanceof ArrayBuffer) {
      uint8 = new Uint8Array(data);
    } else if (data && typeof (data as any).arrayBuffer === 'function') {
      uint8 = new Uint8Array(await (data as Blob).arrayBuffer());
    } else {
      uint8 = new Uint8Array(data as any);
    }
    db = new SQL.Database(uint8);
    logger.info('sqliteStore', 'Database loaded from filesystem');
  } catch {
    db = new SQL.Database();
    logger.info('sqliteStore', 'New database created');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      content TEXT NOT NULL,
      encryptedContent TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      reactions TEXT DEFAULT '[]',
      isStarred INTEGER DEFAULT 0,
      replyToId TEXT,
      replyToContent TEXT,
      replyToSender TEXT,
      mediaPath TEXT,
      expiresAt INTEGER,
      isEdited INTEGER DEFAULT 0,
      keyVersion INTEGER,
      hmac TEXT,
      createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_chatId_timestamp ON messages(chatId, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_isStarred ON messages(isStarred);
  `);

  currentUid = userUid;
  initPromise = null;
  return db;
  })();
  return initPromise;
}

function schedulePersist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistDatabase(), 500);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function persistDatabase(): Promise<void> {
  if (!db) return;
  try {
    const data = db.export();
    const uint8 = new Uint8Array(data);
    const b64 = toBase64(uint8);
    await Filesystem.writeFile({
      path: DB_FILENAME,
      data: b64,
      directory: DB_DIR,
    });
  } catch (err) {
    logger.error('sqliteStore', `Failed to persist database: ${err}`);
  }
}

async function rowToMessage(row: (string | number | null)[], userUid?: string): Promise<StoredMessage> {
  let content = row[3] as string;
  const encryptedContent = row[4] as string;
  if (encryptedContent && userUid) {
    try {
      content = await decryptContent(userUid, encryptedContent);
    } catch (err) {
      console.warn('[sqlite] Failed to decrypt message, falling back to plaintext:', err);
    }
  }
  return {
    id: row[0] as string,
    chatId: row[1] as string,
    senderId: row[2] as string,
    content,
    type: row[5] as StoredMessage['type'],
    timestamp: row[6] as string,
    status: row[7] as StoredMessage['status'],
    reactions: row[8] ? JSON.parse(row[8] as string) : [],
    isStarred: row[9] === 1,
    replyToId: row[10] as string || undefined,
    replyToContent: row[11] as string || undefined,
    replyToSender: row[12] as string || undefined,
    mediaPath: row[13] as string || undefined,
    expiresAt: row[14] as number || undefined,
    isEdited: row[15] === 1,
    keyVersion: row[16] as number || undefined,
    hmac: row[17] as string || undefined,
  };
}

function messageToRow(msg: StoredMessage, encryptedContent: string): any[] {
  return [
    msg.id,
    msg.chatId,
    msg.senderId,
    msg.content,
    encryptedContent,
    msg.type,
    msg.timestamp,
    msg.status,
    JSON.stringify(msg.reactions || []),
    msg.isStarred ? 1 : 0,
    msg.replyToId || null,
    msg.replyToContent || null,
    msg.replyToSender || null,
    msg.mediaPath || null,
    msg.expiresAt || null,
    msg.isEdited ? 1 : 0,
    msg.keyVersion || null,
    msg.hmac || null,
    Date.now(),
  ];
}

// ─── Exported API ────────────────────────────────────────────────────────────

export async function appendMessage(userUid: string, message: StoredMessage): Promise<void> {
  const d = await initDatabase(userUid);
  const encryptedContent = await encryptContent(userUid, message.content);
  d.run(
    `INSERT OR REPLACE INTO messages (id, chatId, senderId, content, encryptedContent, type, timestamp, status, reactions, isStarred, replyToId, replyToContent, replyToSender, mediaPath, expiresAt, isEdited, keyVersion, hmac, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    messageToRow(message, encryptedContent)
  );
  schedulePersist();
}

export async function loadMessages(userUid: string, chatId: string): Promise<StoredMessage[]> {
  const d = await initDatabase(userUid);
  const results = d.exec(
    `SELECT id, chatId, senderId, content, encryptedContent, type, timestamp, status, reactions, isStarred, replyToId, replyToContent, replyToSender, mediaPath, expiresAt, isEdited, keyVersion, hmac
     FROM messages WHERE chatId = ? ORDER BY timestamp ASC`,
    [chatId]
  );
  if (!results.length) return [];
  return Promise.all(results[0].values.map(row => rowToMessage(row, userUid)));
}

export async function loadAllChats(userUid: string, chatIds: string[]): Promise<Record<string, StoredMessage[]>> {
  const d = await initDatabase(userUid);
  const out: Record<string, StoredMessage[]> = {};
  for (const cid of chatIds) {
    const results = d.exec(
      `SELECT id, chatId, senderId, content, encryptedContent, type, timestamp, status, reactions, isStarred, replyToId, replyToContent, replyToSender, mediaPath, expiresAt, isEdited, keyVersion, hmac
       FROM messages WHERE chatId = ? ORDER BY timestamp ASC`,
      [cid]
    );
    out[cid] = results.length ? await Promise.all(results[0].values.map(row => rowToMessage(row, userUid))) : [];
  }
  return out;
}

export async function listLocalChatIds(userUid?: string): Promise<string[]> {
  if (userUid) await initDatabase(userUid);
  if (!db) return [];
  const results = db.exec(`SELECT DISTINCT chatId FROM messages`);
  if (!results.length) return [];
  return results[0].values.map(row => row[0] as string);
}

export async function deleteLocalChat(chatId: string): Promise<void> {
  if (!db) return;
  db.run(`DELETE FROM messages WHERE chatId = ?`, [chatId]);
  schedulePersist();
}

export async function clearAllMessages(): Promise<void> {
  if (!db) return;
  db.run(`DELETE FROM messages`);
  schedulePersist();
}

export async function updateMessageStatus(
  _userUid: string,
  _chatId: string,
  messageId: string,
  status: 'sent' | 'delivered' | 'read'
): Promise<void> {
  if (!db) return;
  db.run(`UPDATE messages SET status = ? WHERE id = ?`, [status, messageId]);
  schedulePersist();
}

export async function markChatMessagesRead(
  _userUid: string,
  chatId: string
): Promise<void> {
  if (!db) return;
  db.run(`UPDATE messages SET status = 'read' WHERE chatId = ? AND senderId != ? AND status != 'read'`, [chatId, _userUid]);
  schedulePersist();
}

export async function updateMessageStar(
  _userUid: string,
  _chatId: string,
  messageId: string,
  isStarred: boolean
): Promise<void> {
  if (!db) return;
  db.run(`UPDATE messages SET isStarred = ? WHERE id = ?`, [isStarred ? 1 : 0, messageId]);
  schedulePersist();
}

export async function updateMessageContent(
  userUid: string,
  _chatId: string,
  messageId: string,
  content: string,
  isEdited: boolean
): Promise<void> {
  if (!db) return;
  const encryptedContent = await encryptContent(userUid, content);
  db.run(`UPDATE messages SET content = ?, encryptedContent = ?, isEdited = ? WHERE id = ?`, [content, encryptedContent, isEdited ? 1 : 0, messageId]);
  schedulePersist();
}

export async function saveMessages(userUid: string, chatId: string, messages: StoredMessage[]): Promise<void> {
  const d = await initDatabase(userUid);
  d.run(`DELETE FROM messages WHERE chatId = ?`, [chatId]);
  for (const msg of messages) {
    const encryptedContent = await encryptContent(userUid, msg.content);
    d.run(
      `INSERT INTO messages (id, chatId, senderId, content, encryptedContent, type, timestamp, status, reactions, isStarred, replyToId, replyToContent, replyToSender, mediaPath, expiresAt, isEdited, keyVersion, hmac, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      messageToRow(msg, encryptedContent)
    );
  }
  schedulePersist();
}

export async function deleteMessageById(_userUid: string, _chatId: string, messageId: string): Promise<void> {
  if (!db) return;
  db.run(`DELETE FROM messages WHERE id = ?`, [messageId]);
  schedulePersist();
}

export async function getStarredMessages(userUid: string): Promise<StoredMessage[]> {
  const d = await initDatabase(userUid);
  const results = d.exec(
    `SELECT id, chatId, senderId, content, encryptedContent, type, timestamp, status, reactions, isStarred, replyToId, replyToContent, replyToSender, mediaPath, expiresAt, isEdited, keyVersion, hmac
     FROM messages WHERE isStarred = 1 ORDER BY timestamp DESC`
  );
  if (!results.length) return [];
  return Promise.all(results[0].values.map(row => rowToMessage(row, userUid)));
}

export async function searchAllMessages(userUid: string, query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const d = await initDatabase(userUid);
  const results = d.exec(
    `SELECT chatId, id, content, senderId, timestamp
     FROM messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT 50`,
    [`%${query}%`]
  );
  if (!results.length) return [];
  return results[0].values.map((row: (string | number | null)[]) => ({
    chatId: row[0] as string,
    messageId: row[1] as string,
    content: row[2] as string,
    senderId: row[3] as string,
    timestamp: row[4] as string,
  }));
}

export function clearKeyCache(): void {
  cachedKey = null;
  cachedSalt = null;
}

const ENCRYPTION_MIGRATION_KEY = 'quidec_encryption_migration_v3';

/**
 * One-time migration: clears old SQLite data and encryption preferences
 * that were created with the old device-salt-based key derivation.
 * Messages encrypted with the old key are incompatible with the new
 * deterministic-salt-based getConversationKey.
 */
export async function migrateOldEncryptionData(): Promise<void> {
  try {
    const migrated = localStorage.getItem(ENCRYPTION_MIGRATION_KEY);
    if (migrated === '3') return;

    console.log('🔄 Running one-time encryption migration (v1→v2)...');

    // 1. Delete the old SQLite database file
    try {
      await Filesystem.deleteFile({
        path: DB_FILENAME,
        directory: DB_DIR,
      });
    } catch (err) {
      console.warn('[sqlite] Could not delete old SQLite database during migration:', err);
    }

    // 2. Reset in-memory DB so initDatabase creates a fresh one
    db = null;
    currentUid = null;
    cachedKey = null;
    cachedSalt = null;

    // 3. Reset encryption Preferences to clean state
    try {
      await Preferences.remove({ key: 'encryption_device_salt_v1' });
      // Set key version to 1 and last-rotation to now so checkAndRotateKey
      // does NOT immediately bump the version on next startup
      await Preferences.set({ key: 'encryption_key_version_v1', value: '1' });
      await Preferences.set({ key: 'encryption_last_rotation_v1', value: String(Date.now()) });
      await Preferences.remove({ key: SALT_KEY });
    } catch (err) {
      console.warn('[sqlite] Failed to reset encryption Preferences during migration:', err);
    }

    // 4. Clear conversation key cache (from old device-salt derivation)
    try {
      const { clearConversationKeyCache } = await import('./encryption');
      clearConversationKeyCache();
    } catch (err) {
      console.warn('[sqlite] Failed to clear conversation key cache during migration:', err);
    }

    // 5. Mark migration complete
    localStorage.setItem(ENCRYPTION_MIGRATION_KEY, '3');
    console.log('✅ Encryption migration complete — old data cleared');
  } catch (err) {
    console.warn('⚠️ Encryption migration failed:', err);
    // Mark as done anyway to avoid repeated failures
    localStorage.setItem(ENCRYPTION_MIGRATION_KEY, '3');
  }
}

export async function updateMessageReactions(
  _userUid: string,
  _chatId: string,
  messageId: string,
  reactions: { emoji: string; count: number }[]
): Promise<void> {
  if (!db) return;
  db.run(`UPDATE messages SET reactions = ? WHERE id = ?`, [JSON.stringify(reactions), messageId]);
  schedulePersist();
}
