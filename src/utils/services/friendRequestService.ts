/**
 * Friend Request Service
 * Manages friend requests, friendships, and related notifications.
 */

import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  writeBatch,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref, set, remove } from 'firebase/database';
import { db, realtimeDb } from '../firebase';
import { sanitizePathComponent } from './shared';
import { friendRequestLimiter } from '../validators';

export const friendRequestService = {
  /**
   * Send friend request with error handling
   */
  async sendFriendRequest(fromUid: string, toUid: string) {
    const startTime = Date.now();

    try {
      if (!friendRequestLimiter.checkLimit(fromUid)) {
        throw new Error('Too many friend requests. Please try again later.');
      }

      console.log(`👥 Sending friend request from ${fromUid} to ${toUid}`);

      const requestId = `${Date.now()}_${Math.random()}`;

      // Get user info with timeout
      let fromUserInfo: any, toUserInfo: any;
      try {
        [fromUserInfo, toUserInfo] = await Promise.all([
          Promise.race([
            this.getUserInfo(fromUid),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]),
          Promise.race([
            this.getUserInfo(toUid),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ])
        ]);
      } catch (infoErr) {
        console.warn('sendFriendRequest', `Failed to get user info: ${infoErr}`);
      }

      // Create request document
      await setDoc(doc(db, 'friendRequests', requestId), {
        fromUid,
        toUid,
        fromUsername: (fromUserInfo as any)?.username || 'Unknown',
        toUsername: (toUserInfo as any)?.username || 'Unknown',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Send notification (non-critical)
      try {
        await this.sendNotificationToUser(toUid, {
          type: 'friend-request',
          from: fromUid,
          message: `${(fromUserInfo as any)?.username || 'Someone'} sent you a friend request`,
          timestamp: new Date(),
        });
      } catch (notifErr) {
        console.warn('sendFriendRequest', `Notification failed: ${notifErr}`);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Friend request sent in ${duration}ms`);
      return { success: true, requestId };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('sendFriendRequest', `Failed after ${duration}ms: ${error.message}`);
      throw new Error(`Failed to send friend request: ${error.message}`);
    }
  },

  /**
   * Accept friend request with error handling
   */
  async acceptFriendRequest(requestId: string, fromUid: string, toUid: string) {
    const startTime = Date.now();

    try {
      console.log(`👥 Accepting friend request ${requestId}`);

      const batch = writeBatch(db);

      // Update request status
      batch.update(doc(db, 'friendRequests', requestId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });

      // Add to both users' friend lists
      batch.update(doc(db, 'friendships', fromUid), {
        friends: arrayUnion(toUid),
      });

      batch.update(doc(db, 'friendships', toUid), {
        friends: arrayUnion(fromUid),
      });

      await batch.commit();

      // Send notification (non-critical)
      try {
        const toUserInfo = await this.getUserInfo(toUid);
        await this.sendNotificationToUser(fromUid, {
          type: 'friend-request-accepted',
          from: toUid,
          message: `${toUserInfo?.username || 'Someone'} accepted your friend request`,
          timestamp: new Date(),
        });
      } catch (notifErr) {
        console.warn('acceptFriendRequest', `Notification failed: ${notifErr}`);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Friend request accepted in ${duration}ms`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error accepting friend request:', error.message);
      throw error;
    }
  },

  /**
   * Reject friend request
   */
  async rejectFriendRequest(requestId: string, toUid: string) {
    try {
      await updateDoc(doc(db, 'friendRequests', requestId), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ Friend request rejected`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error rejecting friend request:', error.message);
      throw error;
    }
  },

  /**
   * Get pending friend requests
   */
  async getPendingRequests(uid: string) {
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('toUid', '==', uid),
        where('status', '==', 'pending')
      );

      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return requests;
    } catch (error: any) {
      console.error('❌ Error getting pending requests:', error.message);
      return [];
    }
  },

  /**
   * Listen to pending friend requests in real-time
   */
  listenToPendingRequests(uid: string, callback: (requests: any[]) => void) {
    const q = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(requests);
    });

    return unsubscribe;
  },

  /**
   * Remove friend
   */
  async removeFriend(uid1: string, uid2: string) {
    try {
      const batch = writeBatch(db);

      batch.update(doc(db, 'friendships', uid1), {
        friends: arrayRemove(uid2),
      });

      batch.update(doc(db, 'friendships', uid2), {
        friends: arrayRemove(uid1),
      });

      await batch.commit();
      console.log(`✅ Friend removed`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error removing friend:', error.message);
      throw error;
    }
  },

  /**
   * Get user's friend list
   */
  async getFriendsList(uid: string) {
    try {
      const friendshipDoc = await getDoc(doc(db, 'friendships', uid));
      const friends = friendshipDoc.data()?.friends || [];

      // Get friend details
      const friendsDetails = await Promise.all(
        friends.map(async (friendUid: string) => {
          const friendInfo = await this.getUserInfo(friendUid);
          return friendInfo;
        })
      );

      return friendsDetails.filter(Boolean);
    } catch (error: any) {
      console.error('❌ Error getting friends list:', error.message);
      return [];
    }
  },

  /**
   * Get user info by UID
   */
  async getUserInfo(uid: string) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.data();
    } catch (error: any) {
      console.error('❌ Error getting user info:', error.message);
      return null;
    }
  },

  /**
   * Send notification to user


   */
  async sendNotificationToUser(uid: string, notification: any) {
    try {
      const notificationsRef = collection(
        db,
        'users',
        uid,
        'notifications'
      );
      const notificationId = `${Date.now()}_${Math.random()}`;

      await setDoc(doc(notificationsRef, notificationId), {
        ...notification,
        read: false,
        createdAt: serverTimestamp(),
      });

      console.log(`✅ Notification sent to user ${uid}`);
    } catch (error: any) {
      console.error('❌ Error sending notification:', error.message);
    }
  },
};