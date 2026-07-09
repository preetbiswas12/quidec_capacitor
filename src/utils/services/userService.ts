/**
 * User Service
 * Handles user profile operations, search, and account management.
 *
 * Importers/Callers: SettingsPage, Profile component, Search functionality, Auth flows
 * Affected APIs: getUserProfile, updateUserProfile, searchUsers, getUserByUsername, deleteUserAccount
 * Data schemas: User profile document with fields: uid, username, email, displayName, photoURL, emailVerified, createdAt, updatedAt, publicKey, isOnline, lastSeen, fcmToken, notificationsEnabled
 */

import { getDoc, getDocs, doc, setDoc, updateDoc, collection, query, where, writeBatch, deleteDoc, limit } from 'firebase/firestore';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { ref, remove } from 'firebase/database';
import logger from '../logger';
import { db, realtimeDb } from '../firebase';
import { sanitizePathComponent } from './shared';
import { validateEmail, validatePassword, validateUsername, loginLimiter, registerLimiter, validateDisplayName, validateAbout, profileUpdateLimiter } from '../validators';
import { auth } from '../firebase';
import { decryptUserData, encryptUserData } from '../e2ee';

export const userService = {
  /**
   * Get user profile by UID with error handling and timeout
   */
  async getUserProfile(uid: string) {
    const startTime = Date.now();

    try {
      logger.info('getUserProfile', `Fetching profile for uid: ${uid}`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout (10s)')), 10000)
      );

      const profilePromise = getDoc(doc(db, 'users', uid));
      const userDoc = await Promise.race([profilePromise, timeoutPromise]) as any;

      if (!userDoc.exists()) {
        logger.warn('getUserProfile', `Profile not found for uid: ${uid}`);
        return null;
      }

      const duration = Date.now() - startTime;
      logger.info('getUserProfile', `Profile fetched in ${duration}ms`);

      const raw = userDoc.data();
      try {
        return await decryptUserData(uid, raw);
      } catch {
        return raw;
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('getUserProfile', `Failed after ${duration}ms: ${error.message}`);

      // Return null for not found, throw for actual errors
      if (error.code === 'permission-denied') {
        throw new Error('Permission denied to access user profile');
      } else if (error.code === 'unavailable') {
        throw new Error('Firebase service temporarily unavailable');
      }

      return null;
    }
  },

  /**
   * Update user profile
   */
  async updateUserProfile(uid: string, updates: Record<string, any>) {
    const startTime = Date.now();

    try {
      if (!profileUpdateLimiter.checkLimit(uid)) {
        throw new Error('Too many profile updates. Please try again later.');
      }

      // Validate specific fields if present
      const sanitized: Record<string, any> = {};
      if (updates.displayName !== undefined) sanitized.displayName = validateDisplayName(updates.displayName);
      if (updates.about !== undefined) sanitized.about = validateAbout(updates.about);
      if (updates.photoURL !== undefined) sanitized.photoURL = updates.photoURL;
      if (updates.notificationsEnabled !== undefined) sanitized.notificationsEnabled = updates.notificationsEnabled;

      // Encrypt sensitive fields before writing
      const encrypted = await encryptUserData(uid, sanitized);

      logger.info('updateUserProfile', `Updating profile for ${uid}`);

      await updateDoc(doc(db, 'users', uid), {
        ...encrypted,
        updatedAt: serverTimestamp(),
      });

      const duration = Date.now() - startTime;
      logger.info('updateUserProfile', `Profile updated in ${duration}ms`);
      return { success: true };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('updateUserProfile', `Failed after ${duration}ms: ${error.message}`);

      if (error.code === 'not-found') {
        throw new Error('User profile not found');
      } else if (error.code === 'permission-denied') {
        throw new Error('Permission denied to update profile');
      }

      throw new Error(`Failed to update profile: ${error.message}`);
    }
  },

  /**
   * Search users by exact Veill ID (name_XXXX format)
   * Only matches the full ID — no partial/prefix matching for privacy.
   */
  async searchUsers(searchTerm: string, currentUid: string) {
    try {
      const clean = searchTerm.toLowerCase().trim().replace(/^@/, '');
      if (!clean) return [];

      const q = query(
        collection(db, 'users'),
        where('username', '==', clean),
        limit(1)
      );
      const snapshot = await getDocs(q);

      const results = await Promise.all(
        snapshot.docs
          .filter(doc => doc.id !== currentUid)
          .map(async doc => {
            const raw = { handle: doc.id, ...doc.data() };
            try {
              const decrypted = await decryptUserData(doc.id, raw);
              return { ...raw, ...decrypted };
            } catch {
              return raw;
            }
          })
      );
      return results;
    } catch (error: any) {
      console.error('❌ Error searching users:', error.message);
      return [];
    }
  },

  /**
   * Get user by username
   */
  async getUserByUsername(username: string) {
    try {
      const q = query(
        collection(db, 'users'),
        where('username', '==', username)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const d = snapshot.docs[0];
      const raw = { handle: d.id, ...d.data() };
      try {
        const decrypted = await decryptUserData(d.id, raw);
        return { ...raw, ...decrypted };
      } catch {
        return raw;
      }
    } catch (error: any) {
      console.error('❌ Error getting user by username:', error.message);
      return null;
    }
  },

  /**
   * Delete user account and all data
   */
  async deleteUserAccount(uid: string) {
    try {
      const batch = writeBatch(db);

      // Delete user document
      batch.delete(doc(db, 'users', uid));

      // Delete friendships
      batch.delete(doc(db, 'friendships', uid));

      // Delete friend requests sent by user
      const sentRequestsQ = query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', uid)
      );
      const sentRequests = await getDocs(sentRequestsQ);
      sentRequests.forEach((doc) => batch.delete(doc.ref));

      // Delete friend requests sent to user
      const receivedRequestsQ = query(
        collection(db, 'friendRequests'),
        where('toUid', '==', uid)
      );
      const receivedRequests = await getDocs(receivedRequestsQ);
      receivedRequests.forEach((doc) => batch.delete(doc.ref));

      await batch.commit();

      // Delete from Realtime Database
      await remove(ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`));

      console.log(`✅ User account deleted`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting user account:', error.message);
      throw error;
    }
  },

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(uid: string, notificationId: string) {
    try {
      await updateDoc(
        doc(db, 'users', uid, 'notifications', notificationId),
        {
          read: true,
        }
      );
    } catch (error: any) {
      console.error('❌ Error marking notification as read:', error.message);
    }
  },
};