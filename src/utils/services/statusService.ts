/**
 * Status / Stories Service
 * Handles user statuses (stories) with 24-hour expiry.
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
  getDocs,
  orderBy,
  writeBatch,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeFirestoreTimestamp } from './shared';
import { validateStatusContent, statusLimiter } from '../validators';

export const statusService = {
  /**
   * Post a new status for the current user.
   * Stores in a top-level `statuses` sub-collection on the user doc:
   *   users/{uid}/statuses/{statusId}
   */
  async createStatus(
    uid: string,
    content: string,
    type: 'text' | 'image' = 'text',
    backgroundColor: string = '#4D91FB',
    mediaUrl: string | null = null,
  ) {
    try {
      if (!statusLimiter.checkLimit(uid)) {
        throw new Error('Too many statuses posted. Please try again later.');
      }

      const validatedContent = type === 'text' ? validateStatusContent(content) : content;

      const statusId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const now = serverTimestamp();

      const statusData: any = {
        statusId,
        uid,
        content: validatedContent,
        type,
        backgroundColor,
        createdAt: now,
        expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000), // 24 h
        viewedBy: [],
      };

      if (type === 'image' && mediaUrl) {
        statusData.mediaUrl = mediaUrl;
      }

      await setDoc(doc(db, 'users', uid, 'statuses', statusId), statusData);
      console.log(`✅ Status created: ${statusId}`);
      return { success: true, statusId };
    } catch (error: any) {
      console.error('❌ Error creating status:', error.message);
      throw error;
    }
  },

  /**
   * Fetch active (non-expired) statuses for a specific user.
   */
  async getUserStatuses(uid: string) {
    try {
      const now = Timestamp.now();
      const q = query(
        collection(db, 'users', uid, 'statuses'),
        where('expiresAt', '>', now),
        orderBy('createdAt', 'desc'),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error: any) {
      console.error('❌ Error fetching user statuses:', error.message);
      return [];
    }
  },

  /**
   * Listen to a user's active statuses in real-time.
   */
  listenToUserStatuses(uid: string, callback: (statuses: any[]) => void) {
    const now = Timestamp.now();
    const q = query(
      collection(db, 'users', uid, 'statuses'),
      where('expiresAt', '>', now),
      orderBy('createdAt', 'desc'),
    );

    return onSnapshot(q, (snapshot) => {
      const statuses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(statuses);
    }, (err) => {
      console.error('❌ Error listening to user statuses:', err);
      callback([]);
    });
  },

  /**
   * Mark a status as viewed by the current user.
   */
  async markStatusViewed(statusOwnerUid: string, statusId: string, viewerUid: string) {
    try {
      const statusRef = doc(db, 'users', statusOwnerUid, 'statuses', statusId);
      await updateDoc(statusRef, {
        viewedBy: arrayUnion(viewerUid),
      });
    } catch (error: any) {
      console.error('❌ Error marking status viewed:', error.message);
    }
  },

  /**
   * Delete a status (owner only).
   */
  async deleteStatus(uid: string, statusId: string) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'statuses', statusId));
      console.log(`✅ Status deleted: ${statusId}`);
    } catch (error: any) {
      console.error('❌ Error deleting status:', error.message);
    }
  },

  /**
   * Delete all expired statuses for a user (cleanup).
   */
  async deleteExpiredStatuses(uid: string) {
    try {
      const now = Timestamp.now();
      const q = query(
        collection(db, 'users', uid, 'statuses'),
        where('expiresAt', '<=', now),
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`🧹 Deleted ${snapshot.size} expired statuses for ${uid}`);
    } catch (error: any) {
      console.error('❌ Error deleting expired statuses:', error.message);
    }
  },
};