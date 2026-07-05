/**
 * Typing Indicator Service
 * Handles 1:1 and group typing indicators via RTDB.
 * Ephemeral - indicators are removed when user stops typing or after timeout.
 */

import { realtimeDb } from '../firebase';
import { ref, set, remove, onValue, onDisconnect } from 'firebase/database';
import { sanitizePathComponent } from './shared';

/**
 * Send typing indicator for a 1:1 conversation (alias for setTyping)
 */
export async function setTyping(
  fromUid: string,
  toUid: string,
  isTyping: boolean
): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const conversationId = [fromUid, toUid].sort().join('_');
    const typingRef = ref(realtimeDb, `typing/${conversationId}/${sanitizePathComponent(fromUid)}`);

    if (isTyping) {
      await set(typingRef, {
        uid: fromUid,
        timestamp: Date.now(),
      });
      // Auto-remove after 3 seconds if not updated
      setTimeout(() => {
        remove(typingRef).catch(() => {});
      }, 3000);
    } else {
      await remove(typingRef);
    }
  } catch (err) {
    console.warn('⚠️ Failed to send typing indicator:', err);
  }
}

/**
 * Send typing indicator for a group conversation (alias for setGroupTyping)
 */
export async function setGroupTyping(
  groupId: string,
  fromUid: string,
  isTyping: boolean
): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const typingRef = ref(realtimeDb, `groupTyping/${groupId}/${sanitizePathComponent(fromUid)}`);

    if (isTyping) {
      await set(typingRef, {
        uid: fromUid,
        timestamp: Date.now(),
      });
      // Auto-remove after 3 seconds if not updated
      setTimeout(() => {
        remove(typingRef).catch(() => {});
      }, 3000);
    } else {
      await remove(typingRef);
    }
  } catch (err) {
    console.warn('⚠️ Failed to send group typing indicator:', err);
  }
}

/**
 * Listen to typing indicators for a 1:1 conversation
 * Returns unsubscribe function
 */
export function listenToTyping(
  fromUid: string,
  toUid: string,
  callback: (typingUsers: string[]) => void
): () => void {
  const conversationId = [fromUid, toUid].sort().join('_');
  const typingRef = ref(realtimeDb, `typing/${conversationId}`);

  const unsubscribe = onValue(typingRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const data = snapshot.val();
    const typingUsers = Object.values(data)
      .filter((user: any) => user.uid !== fromUid)
      .map((user: any) => user.uid);

    callback(typingUsers);
  });

  return () => unsubscribe();
}

/**
 * Listen to typing indicators for a group conversation
 * Returns unsubscribe function
 */
export function listenToGroupTyping(
  groupId: string,
  currentUid: string,
  callback: (typingUsers: string[]) => void
): () => void {
  const typingRef = ref(realtimeDb, `groupTyping/${groupId}`);

  const unsubscribe = onValue(typingRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }

    const data = snapshot.val();
    const typingUsers = Object.values(data)
      .filter((user: any) => user.uid !== currentUid)
      .map((user: any) => user.uid);

    callback(typingUsers);
  });

  return () => unsubscribe();
}

// Aliases for backward compatibility
export const sendTypingIndicator = setTyping;
export const sendGroupTypingIndicator = setGroupTyping;
export const listenToTypingIndicators = listenToTyping;
export const listenToGroupTypingIndicators = listenToGroupTyping;

export const typingService = {
  setTyping,
  setGroupTyping,
  listenToTyping,
  listenToGroupTyping,
  sendTypingIndicator,
  sendGroupTypingIndicator,
  listenToTypingIndicators,
  listenToGroupTypingIndicators,
};

export default typingService;