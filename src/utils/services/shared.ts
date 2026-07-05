/**
 * Shared utilities used across Firebase service modules.
 */

import { collection, query, where, getDocs, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getConversationKey } from '../encryption';

export { serverTimestamp, doc, getDoc };

/**
 * MESSAGE DELIVERY STATUS TYPES
 * sent: 📤 Single tick (message sent to server)
 * delivered: 📨 Double tick (message received by recipient)
 * read: 👀 Double blue tick (message read by recipient)
 */
export const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  QUEUED: 'queued',
} as const;

/**
 * Sanitize UIDs and other identifiers for use in Firebase RTDB paths
 * Firebase paths cannot contain: . # $ [ ]
 * Replace invalid characters with underscores
 */
export function sanitizePathComponent(component: string): string {
  if (!component) return 'unknown';
  return component.replace(/[.#$\[\]@]/g, '_');
}

/**
 * Normalize Firestore timestamps to ISO strings
 */
export function normalizeFirestoreTimestamp(value: any): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

/**
 * Get the custom username (document ID) by Firebase UID.
 * User documents are keyed by custom username, but we often have only the auth UID.
 */
export async function getCustomUsernameByFirebaseUid(firebaseUid: string): Promise<string | null> {
  try {
    const q = query(collection(db, 'users'), where('uid', '==', firebaseUid));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const userDoc = snapshot.docs[0];
      return userDoc.data().username || userDoc.id;
    }
    return null;
  } catch (err) {
    console.warn('⚠️ Failed to fetch custom username:', err);
    return null;
  }
}

/**
 * Generate a unique-looking user ID
 * Pattern: username_1234
 * Checks Firestore to ensure uniqueness
 */
export async function generateUniqueUserId(name: string): Promise<string> {
  const cleanName = name.toLowerCase().replace(/\s+/g, '');
  let isUnique = false;
  let generatedId = '';
  let attempts = 0;

  while (!isUnique && attempts < 15) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    generatedId = `${cleanName}_${randomSuffix}`;

    try {
      const q = query(collection(db, 'users'), where('username', '==', generatedId));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        isUnique = true;
      }
    } catch (err) {
      console.warn('⚠️ Uniqueness check failed, retrying...', err);
    }
    attempts++;
  }

  return generatedId;
}

// Keep sync version for legacy UI if needed, but mark as deprecated
export function generateUserIdSync(name: string): string {
  const cleanName = name.toLowerCase().replace(/\s+/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${cleanName}_${randomSuffix}`;
}

/**
 * Generate conversation ID (consistent for both directions)
 */
export function getConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

/**
 * Derive a per-group E2E encryption key.
 * Same key for all members so anyone in the group can encrypt/decrypt.
 */
let groupKeyCache = new Map<string, CryptoKey>();

export async function getGroupKey(groupId: string): Promise<CryptoKey> {
  if (groupKeyCache.has(groupId)) return groupKeyCache.get(groupId)!;

  const { deriveKey } = await import('../encryption');
  const key = await deriveKey(`group:${groupId}|e2e`);
  groupKeyCache.set(groupId, key);
  return key;
}

/**
 * Assert caller is an admin of the group. Throws on failure.
 */
export async function assertAdmin(groupId: string, callerId: string): Promise<void> {
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) throw new Error('Group not found');
  const admins = snap.data().admins || [];
  if (!admins.includes(callerId)) {
    throw new Error('Only group admins can perform this action');
  }
}

/**
 * Assert caller is a member of the group (or the group exists for invite join).
 */
export async function assertMember(groupId: string, userId: string): Promise<void> {
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) throw new Error('Group not found');
  const members = snap.data().members || [];
  if (!members.includes(userId)) {
    throw new Error('You are not a member of this group');
  }
}

/**
 * Generate a random alphanumeric invite code.
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}