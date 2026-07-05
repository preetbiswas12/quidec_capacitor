/**
 * Data Retention Service
 * Client-side cleanup for Firestore collections.
 * Runs on app startup since Cloud Functions require Blaze plan.
 */

import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ref, get, remove } from 'firebase/database';
import { realtimeDb } from '../firebase';
import { sanitizePathComponent } from './shared';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

async function paginatedDelete(
  baseQuery: ReturnType<typeof query>,
): Promise<number> {
  let totalDeleted = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastDoc: any;

  let hasMore = true;
  while (hasMore) {
    const pagedQuery = lastDoc
      ? query(baseQuery, startAfter(lastDoc), limit(BATCH_SIZE))
      : query(baseQuery, limit(BATCH_SIZE));

    const snapshot = await getDocs(pagedQuery);
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < BATCH_SIZE) hasMore = false;
  }

  return totalDeleted;
}

export const dataRetention = {
  /**
   * Delete call logs older than 90 days.
   */
  async cleanupOldCallHistory(uid: string): Promise<number> {
    try {
      const threshold = Timestamp.fromMillis(Date.now() - NINETY_DAYS_MS);
      const q = query(
        collection(db, 'users', uid, 'callHistory'),
        where('timestamp', '<', threshold),
      );
      const deleted = await paginatedDelete(q);
      return deleted;
    } catch (error: any) {
      console.error('❌ Error cleaning up call history:', error.message);
      return 0;
    }
  },

  /**
   * Delete notifications older than 30 days.
   */
  async cleanupOldNotifications(uid: string): Promise<number> {
    try {
      const threshold = Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);
      const q = query(
        collection(db, 'users', uid, 'notifications'),
        where('createdAt', '<', threshold),
      );
      const deleted = await paginatedDelete(q);
      return deleted;
    } catch (error: any) {
      console.error('❌ Error cleaning up notifications:', error.message);
      return 0;
    }
  },

  /**
   * Delete device sessions with expired expiresAt or inactive >30 days.
   */
  async cleanupStaleSessions(uid: string): Promise<number> {
    try {
      const now = Timestamp.now();
      const threshold = Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);

      // Delete sessions that have expired
      const expiredQuery = query(
        collection(db, 'users', uid, 'deviceSessions'),
        where('expiresAt', '<=', now),
      );
      let deleted = await paginatedDelete(expiredQuery);

      // Also delete sessions inactive for >30 days (based on lastSeen)
      const staleQuery = query(
        collection(db, 'users', uid, 'deviceSessions'),
        where('lastSeen', '<', threshold),
      );
      deleted += await paginatedDelete(staleQuery);

      return deleted;
    } catch (error: any) {
      console.error('❌ Error cleaning up device sessions:', error.message);
      return 0;
    }
  },

  /**
   * Delete rejected/expired friend requests older than 30 days.
   */
  async cleanupStaleFriendRequests(uid: string): Promise<number> {
    try {
      const threshold = Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);

      // Delete rejected requests older than 30 days
      const rejectedQuery = query(
        collection(db, 'friendRequests'),
        where('status', 'in', ['rejected', 'expired']),
        where('updatedAt', '<', threshold),
      );
      let deleted = await paginatedDelete(rejectedQuery);

      // Also clean requests where user is sender or recipient
      const sentQuery = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', uid),
        where('status', 'in', ['rejected', 'expired']),
        where('updatedAt', '<', threshold),
      );
      deleted += await paginatedDelete(sentQuery);

      const receivedQuery = query(
        collection(db, 'friendRequests'),
        where('toUid', '==', uid),
        where('status', 'in', ['rejected', 'expired']),
        where('updatedAt', '<', threshold),
      );
      deleted += await paginatedDelete(receivedQuery);

      return deleted;
    } catch (error: any) {
      console.error('❌ Error cleaning up friend requests:', error.message);
      return 0;
    }
  },

  /**
   * Clean up stale RTDB delivery nodes older than 24 hours.
   * This is a server-side safety net — the client already cleans up on startup.
   */
  async cleanupDeliveryPipe(uid: string): Promise<number> {
    try {
      const deliveryRef = ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}`);
      const snapshot = await get(deliveryRef);
      if (!snapshot.exists()) return 0;

      const now = Date.now();
      const TTL_MS = 24 * 60 * 60 * 1000;
      let deleted = 0;

      const children = snapshot.val();
      const deletes: Promise<void>[] = [];
      for (const key of Object.keys(children)) {
        const node = children[key];
        const createdAt = node?._createdAt;
        const ts = typeof createdAt === 'number' ? createdAt : 0;
        if (ts > 0 && now - ts > TTL_MS) {
          deletes.push(remove(ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}/${key}`)));
          deleted++;
        }
      }

      if (deletes.length > 0) {
        await Promise.all(deletes);
      }
      return deleted;
    } catch (error: any) {
      console.error('❌ Error cleaning up delivery pipe:', error.message);
      return 0;
    }
  },

  /**
   * Run all data retention cleanup tasks.
   * Call this on app startup (non-blocking).
   */
  async runAllCleanup(uid: string): Promise<void> {
    const results = await Promise.allSettled([
      this.cleanupOldCallHistory(uid),
      this.cleanupOldNotifications(uid),
      this.cleanupStaleSessions(uid),
      this.cleanupStaleFriendRequests(uid),
      this.cleanupDeliveryPipe(uid),
    ]);

    results.forEach((r) => {
      if (r.status === 'rejected') {
        console.error('❌ Data retention task failed:', r.reason);
      }
    });
  },
};
