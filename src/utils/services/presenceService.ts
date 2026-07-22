/**
 * Presence Service
 * Handles user online/offline status and friend presence tracking.
 *
 * Importers/Callers: AppContext for presence initialization, ChatWindow for online status
 * Affected APIs: setUserOnline, setUserOffline, listenToUserPresence, listenToFriendsPresence, getOnlineUsers, listenToFriends
 * Data schemas: Presence data in RTDB, friendship document with friends array
 */

import { doc, setDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp, documentId, getDoc } from 'firebase/firestore';
import { ref, set, onValue, serverTimestamp as rtdbServerTimestamp, get, remove, onChildAdded, onDisconnect } from 'firebase/database';
import { db, realtimeDb } from '../firebase';
import logger from '../logger';
import { sanitizePathComponent } from './shared';
import { decryptUserData } from '../e2ee';
import { withRetry } from '../networkRetry';

export const presenceService = {
  /**
   * Set user online status
   */
  async setUserOnline(uid: string, username: string) {
    try {
      logger.info('setUserOnline', `Setting user ${username} online`);

      // Update RTDB presence (real-time) — use uid (custom handle) as key
      // to match listenToFriendsPresence which reads presence/{customHandle}
      const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`);
      await set(presenceRef, {
        online: true,
        lastSeen: rtdbServerTimestamp(),
        username,
      });

      // Set onDisconnect — automatically marks offline when client disconnects
      // (browser close, network drop, app kill without explicit logout)
      onDisconnect(presenceRef).set({
        online: false,
        lastSeen: rtdbServerTimestamp(),
        username,
      });

      // Update Firestore metadata (backup) — users collection is keyed by custom handle
      try {
        await setDoc(doc(db, 'users', uid), {
          isOnline: true,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      } catch (firestoreErr) {
        logger.warn('setUserOnline', `Firestore update failed: ${firestoreErr}`);
        // Continue - RTDB update succeeded, this is backup only
      }

      logger.info('setUserOnline', `User ${username} marked online`);
    } catch (error: any) {
      logger.error('setUserOnline', `Failed to set online status: ${error.message}`);
      // Non-critical, don't throw
    }
  },

  /**
   * Set user offline status
   */
  async setUserOffline(uid: string) {
    try {
      logger.info('setUserOffline', `Setting user ${uid} offline`);

      // Update RTDB presence — use uid (which should be custom handle) as key
      const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`);
      await set(presenceRef, {
        online: false,
        lastSeen: rtdbServerTimestamp(),
      });

      // Update Firestore metadata (backup) — users collection is keyed by custom handle
      try {
        await setDoc(doc(db, 'users', uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      } catch (firestoreErr) {
        logger.warn('setUserOffline', `Firestore update failed: ${firestoreErr}`);
        // Continue - RTDB update succeeded, this is backup only
      }

      logger.info('setUserOffline', `User ${uid} marked offline`);
    } catch (error: any) {
      logger.error('setUserOffline', `Failed to set offline status: ${error.message}`);
      // Non-critical, don't throw
    }
  },

  /**
   * Listen to user's online/offline status
   */
  listenToUserPresence(
    uid: string,
    callback: (isOnline: boolean, lastSeen: any) => void
  ) {
    const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`);
    const unsubscribe = onValue(presenceRef, (snapshot: any) => {
      const data = snapshot.val();
      if (data) {
        callback(data.online || false, data.lastSeen);
      }
    });
    return unsubscribe;
  },

  /**
   * Listen to all friends' online status
   */
  listenToFriendsPresence(
    currentUserUid: string,
    callback: (friendsStatus: Record<string, any>) => void
  ) {
    const friendsUnsubs = new Map<string, () => void>();
    let friendshipUnsub: (() => void) | null = null;
    const friendsStatus: Record<string, any> = {};

    const friendshipRef = doc(db, 'friendships', currentUserUid);
    friendshipUnsub = onSnapshot(friendshipRef, async (snapshot) => {
      const friendsList: string[] = snapshot.data()?.friends || [];
      const newFriendSet = new Set(friendsList);

      // Remove listeners for friends no longer in the list
      for (const [uid, unsub] of friendsUnsubs) {
        if (!newFriendSet.has(uid)) {
          unsub();
          friendsUnsubs.delete(uid);
          delete friendsStatus[uid];
        }
      }

      // Add listeners only for new friends
      for (const friendUid of friendsList) {
        if (!friendsUnsubs.has(friendUid)) {
          const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(friendUid)}`);
          const unsubPresence = onValue(presenceRef, (snap: any) => {
            const presenceData = snap.val();
            friendsStatus[friendUid] = {
              online: presenceData?.online || false,
              lastSeen: presenceData?.lastSeen,
              username: presenceData?.username,
            };
            callback({ ...friendsStatus });
          }, (error) => {
            console.error(`❌ Error listening to presence for ${friendUid}:`, error.message);
            friendsStatus[friendUid] = { online: false, lastSeen: null };
            callback({ ...friendsStatus });
          });
          friendsUnsubs.set(friendUid, unsubPresence);
        }
      }
    }, (error) => {
      console.error('❌ Error listening to friendships:', error.message);
      callback({});
    });

    return () => {
      if (friendshipUnsub) friendshipUnsub();
      for (const unsub of friendsUnsubs.values()) {
        unsub();
      }
      friendsUnsubs.clear();
    };
  },

  /**
   * Get online users list
   */
  async getOnlineUsers() {
    try {
      const presenceRef = ref(realtimeDb, 'presence');
      const snapshot = await get(presenceRef);

      const onlineUsers: Record<string, any> = {};
      snapshot.forEach((child: any) => {
        const data = child.val();
        if (data.online) {
          onlineUsers[child.key!] = data;
        }
      });

      return onlineUsers;
    } catch (error: any) {
      console.error('❌ Error getting online users:', error.message);
      return {};
    }
  },

  /**
   * Listen to current user's friend list
   */
  listenToFriends(uid: string, callback: (friends: any[]) => void) {
    const friendshipRef = doc(db, 'friendships', uid);
    return onSnapshot(friendshipRef, async (snapshot) => {
      const friendHandles = snapshot.data()?.friends || [];
      if (friendHandles.length === 0) {
        callback([]);
        return;
      }

      // Fetch user details for each friend in batches.
      // friendHandles = custom handles (e.g. "preet.5815") — stored in friendships doc
      // and also stored as the `username` field and doc ID in the users collection.
      const usersRef = collection(db, 'users');
      const chunks = [];
      for (let i = 0; i < friendHandles.length; i += 30) {
        chunks.push(friendHandles.slice(i, i + 30));
      }

      const allFriends: any[] = [];
      for (const chunk of chunks) {
        const q = query(usersRef, where(documentId(), 'in', chunk));
        const userSnapshots = await getDocs(q);
        for (const d of userSnapshots.docs) {
          const raw = { id: d.id, ...d.data() };
          try {
            const decrypted = await decryptUserData(d.id, raw);
            allFriends.push({ ...raw, ...decrypted });
          } catch {
            allFriends.push(raw);
          }
        }
      }
      callback(allFriends);
    }, (error) => {
      console.error('❌ Error listening to friends list:', error.message);
      callback([]);
    });
  },

  /**
   * Send WebRTC signaling (Ephemeral)
   */
  async sendSignaling(fromUid: string, toUid: string, signal: any) {
    return withRetry(async () => {
      const signalId = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const signalRef = ref(realtimeDb, `signaling/${sanitizePathComponent(toUid)}/${signalId}`);
      await set(signalRef, {
        ...signal,
        fromUid,
        timestamp: rtdbServerTimestamp()
      });
      return signalId;
    }, { operation: 'sendSignaling', maxRetries: 3, baseDelayMs: 500 });
  },

  /**
   * Listen to incoming WebRTC signaling (Pipe Model)
   */
  listenToSignaling(uid: string, callback: (signal: any) => void) {
    const signalingRef = ref(realtimeDb, `signaling/${sanitizePathComponent(uid)}`);

    const unsubscribe = onChildAdded(signalingRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // 1. Trigger the callback
      callback({
        id: snapshot.key,
        ...data
      });

      // 2. IMMEDIATELY DELETE from server
      await remove(ref(realtimeDb, `signaling/${sanitizePathComponent(uid)}/${snapshot.key}`));
      console.log(`🗑️ Signal ${snapshot.key} wiped from server after delivery`);
    });

    return unsubscribe;
  },
};