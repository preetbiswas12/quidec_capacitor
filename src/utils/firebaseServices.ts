/**
 * Firebase Services - Complete Backend Replacement
 * Handles all server-side logic using Firebase:
 * - Authentication
 * - Real-time presence (online/offline)
 * - Message delivery with receipts (single tick, double tick, double blue tick)
 * - Friend requests
 * - Typing indicators
 * - Message read status
 * - User status synchronization
 */

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
  writeBatch,
  collectionGroup,
  orderBy,
  limit,
} from 'firebase/firestore';
import {
  getDatabase,
  ref,
  set,
  onValue,
  off,
  serverValue,
  get,
  remove,
  update,
} from 'firebase/realtime-database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { db, auth, realtimeDb } from './firebase';

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
} as const;

// ============ AUTHENTICATION SERVICES ============

export const authService = {
  /**
   * Register a new user with email and password
   */
  async registerUser(email: string, username: string, password: string) {
    try {
      await setPersistence(auth, browserLocalPersistence);

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Update profile with username
      await updateProfile(user, { displayName: username });

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        username,
        email,
        displayName: username,
        photoURL: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        publicKey: null, // Optional: for encryption
        isOnline: false,
        lastSeen: serverTimestamp(),
      });

      // Initialize user presence in Realtime Database
      await set(ref(realtimeDb, `presence/${user.uid}`), {
        online: true,
        lastSeen: serverValue.TIMESTAMP,
        username,
      });

      // Initialize friend list
      await setDoc(doc(db, 'friendships', user.uid), {
        uid: user.uid,
        friends: [],
        blockedUsers: [],
        createdAt: serverTimestamp(),
      });

      console.log(`✅ User registered: ${username}`);
      return { success: true, user, uid: user.uid };
    } catch (error: any) {
      console.error('❌ Registration error:', error.message);
      throw error;
    }
  },

  /**
   * Login user with email and password
   */
  async loginUser(email: string, password: string) {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Update online status in Realtime Database
      await set(ref(realtimeDb, `presence/${user.uid}`), {
        online: true,
        lastSeen: serverValue.TIMESTAMP,
        username: user.displayName || user.email,
      });

      // Update Firestore user document
      await updateDoc(doc(db, 'users', user.uid), {
        isOnline: true,
        lastSeen: serverTimestamp(),
      });

      console.log(`✅ User logged in: ${user.email}`);
      return { success: true, user, uid: user.uid };
    } catch (error: any) {
      console.error('❌ Login error:', error.message);
      throw error;
    }
  },

  /**
   * Logout user and update presence
   */
  async logoutUser() {
    try {
      const user = auth.currentUser;
      if (user) {
        // Set offline in Realtime Database
        await set(ref(realtimeDb, `presence/${user.uid}`), {
          online: false,
          lastSeen: serverValue.TIMESTAMP,
          username: user.displayName || user.email,
        });

        // Update Firestore
        await updateDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      }

      await signOut(auth);
      console.log('✅ User logged out');
      return { success: true };
    } catch (error: any) {
      console.error('❌ Logout error:', error.message);
      throw error;
    }
  },

  /**
   * Get current authenticated user
   */
  getCurrentUser(): Promise<User | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        resolve(user);
        unsubscribe();
      });
    });
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },
};

// ============ PRESENCE & ONLINE STATUS SERVICES ============

export const presenceService = {
  /**
   * Set user online status
   */
  async setUserOnline(uid: string, username: string) {
    try {
      await set(ref(realtimeDb, `presence/${uid}`), {
        online: true,
        lastSeen: serverValue.TIMESTAMP,
        username,
      });

      await updateDoc(doc(db, 'users', uid), {
        isOnline: true,
        lastSeen: serverTimestamp(),
      });

      console.log(`✅ User ${username} is online`);
    } catch (error: any) {
      console.error('❌ Error setting online:', error.message);
    }
  },

  /**
   * Set user offline status
   */
  async setUserOffline(uid: string) {
    try {
      await set(ref(realtimeDb, `presence/${uid}`), {
        online: false,
        lastSeen: serverValue.TIMESTAMP,
      });

      await updateDoc(doc(db, 'users', uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
      });

      console.log(`✅ User ${uid} is offline`);
    } catch (error: any) {
      console.error('❌ Error setting offline:', error.message);
    }
  },

  /**
   * Listen to user's online/offline status
   */
  listenToUserPresence(
    uid: string,
    callback: (isOnline: boolean, lastSeen: any) => void
  ) {
    const presenceRef = ref(realtimeDb, `presence/${uid}`);
    const unsubscribe = onValue(presenceRef, (snapshot) => {
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
    const unsubscribers: (() => void)[] = [];

    // First get the user's friend list
    const friendshipRef = doc(db, 'friendships', currentUserUid);
    const unsubFriendship = onSnapshot(friendshipRef, async (snapshot) => {
      const friendsList = snapshot.data()?.friends || [];

      const friendsStatus: Record<string, any> = {};

      // Listen to each friend's presence
      friendsList.forEach((friendUid: string) => {
        const presenceRef = ref(realtimeDb, `presence/${friendUid}`);
        const unsubPresence = onValue(presenceRef, (snapshot) => {
          const presenceData = snapshot.val();
          friendsStatus[friendUid] = {
            online: presenceData?.online || false,
            lastSeen: presenceData?.lastSeen,
            username: presenceData?.username,
          };
          callback(friendsStatus);
        });
        unsubscribers.push(unsubPresence);
      });
    });

    unsubscribers.push(unsubFriendship);

    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsub) => unsub());
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
      snapshot.forEach((child) => {
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
};

// ============ MESSAGE SERVICES ============

export const messageService = {
  /**
   * Send a message with delivery tracking
   */
  async sendMessage(
    fromUid: string,
    toUid: string,
    content: string,
    mediaUrl?: string
  ) {
    try {
      const conversationId = this.getConversationId(fromUid, toUid);
      const messageId = `${Date.now()}_${Math.random()}`;

      const messageData = {
        messageId,
        fromUid,
        toUid,
        content,
        mediaUrl: mediaUrl || null,
        timestamp: serverTimestamp(),
        status: MESSAGE_STATUS.SENT, // 📤 Single tick
        deliveredAt: null,
        readAt: null,
        typing: false,
      };

      // Save message to Firestore
      const messageRef = doc(
        db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );
      await setDoc(messageRef, messageData);

      // Update conversation metadata
      await this.updateConversationMetadata(
        fromUid,
        toUid,
        conversationId,
        content
      );

      // Check if recipient is online, if so mark as delivered
      const recipientPresence = await presenceService.listenToUserPresence(
        toUid,
        async (isOnline) => {
          if (isOnline) {
            // Mark as delivered after 500ms if online
            setTimeout(() => {
              this.markMessageDelivered(conversationId, messageId, toUid);
            }, 500);
          }
        }
      );

      console.log(`✅ Message sent: ${fromUid} → ${toUid} (📤 Single tick)`);
      return { success: true, messageId, status: MESSAGE_STATUS.SENT };
    } catch (error: any) {
      console.error('❌ Error sending message:', error.message);
      throw error;
    }
  },

  /**
   * Mark message as delivered (double tick)
   */
  async markMessageDelivered(
    conversationId: string,
    messageId: string,
    recipientUid: string
  ) {
    try {
      const messageRef = doc(
        db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );

      await updateDoc(messageRef, {
        status: MESSAGE_STATUS.DELIVERED, // 📨 Double tick
        deliveredAt: serverTimestamp(),
      });

      console.log(`✅ Message delivered (📨 Double tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error marking message delivered:', error.message);
    }
  },

  /**
   * Mark message as read (double blue tick)
   */
  async markMessageRead(
    conversationId: string,
    messageId: string,
    readerUid: string
  ) {
    try {
      const messageRef = doc(
        db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );

      await updateDoc(messageRef, {
        status: MESSAGE_STATUS.READ, // 👀 Double blue tick
        readAt: serverTimestamp(),
      });

      console.log(`✅ Message read (👀 Double blue tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error marking message read:', error.message);
    }
  },

  /**
   * Mark all messages as read in a conversation
   */
  async markAllMessagesAsRead(
    conversationId: string,
    readerUid: string,
    senderUid: string
  ) {
    try {
      const messagesRef = collection(
        db,
        'conversations',
        conversationId,
        'messages'
      );
      const q = query(
        messagesRef,
        where('fromUid', '==', senderUid),
        where('status', '!=', MESSAGE_STATUS.READ)
      );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.forEach((doc) => {
        batch.update(doc.ref, {
          status: MESSAGE_STATUS.READ,
          readAt: serverTimestamp(),
        });
      });

      await batch.commit();
      console.log(
        `✅ Marked all messages as read in conversation ${conversationId}`
      );
    } catch (error: any) {
      console.error('❌ Error marking all messages read:', error.message);
    }
  },

  /**
   * Listen to messages in a conversation in real-time
   */
  listenToMessages(
    fromUid: string,
    toUid: string,
    callback: (messages: any[]) => void
  ) {
    const conversationId = this.getConversationId(fromUid, toUid);
    const messagesRef = collection(
      db,
      'conversations',
      conversationId,
      'messages'
    );
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(messages);
    });

    return unsubscribe;
  },

  /**
   * Get conversation history with pagination
   */
  async getConversationHistory(
    fromUid: string,
    toUid: string,
    pageSize: number = 50
  ) {
    try {
      const conversationId = this.getConversationId(fromUid, toUid);
      const messagesRef = collection(
        db,
        'conversations',
        conversationId,
        'messages'
      );
      const q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        limit(pageSize)
      );

      const snapshot = await getDocs(q);
      const messages = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .reverse();

      return messages;
    } catch (error: any) {
      console.error('❌ Error getting conversation history:', error.message);
      return [];
    }
  },

  /**
   * Update conversation metadata (last message, timestamp)
   */
  private async updateConversationMetadata(
    fromUid: string,
    toUid: string,
    conversationId: string,
    lastMessage: string
  ) {
    try {
      const convRef = doc(db, 'conversations', conversationId);

      await updateDoc(convRef, {
        lastMessage,
        lastMessageTime: serverTimestamp(),
        participants: [fromUid, toUid],
        updatedAt: serverTimestamp(),
      }).catch(async () => {
        // If document doesn't exist, create it
        await setDoc(convRef, {
          conversationId,
          participants: [fromUid, toUid],
          lastMessage,
          lastMessageTime: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });
    } catch (error: any) {
      console.error('❌ Error updating conversation metadata:', error.message);
    }
  },

  /**
   * Generate conversation ID (consistent for both directions)
   */
  private getConversationId(uid1: string, uid2: string): string {
    return [uid1, uid2].sort().join('_');
  },

  /**
   * Delete a message
   */
  async deleteMessage(conversationId: string, messageId: string) {
    try {
      const messageRef = doc(
        db,
        'conversations',
        conversationId,
        'messages',
        messageId
      );
      await deleteDoc(messageRef);
      console.log(`✅ Message deleted: ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error deleting message:', error.message);
    }
  },
};

// ============ TYPING INDICATOR SERVICES ============

export const typingService = {
  /**
   * Set typing status
   */
  async setTyping(
    fromUid: string,
    toUid: string,
    isTyping: boolean
  ) {
    try {
      const conversationId = messageService['getConversationId'](
        fromUid,
        toUid
      );
      const typingRef = ref(realtimeDb, `typing/${conversationId}/${fromUid}`);

      if (isTyping) {
        await set(typingRef, {
          isTyping: true,
          timestamp: serverValue.TIMESTAMP,
        });
        console.log(`✅ User ${fromUid} is typing`);
      } else {
        await remove(typingRef);
        console.log(`✅ User ${fromUid} stopped typing`);
      }
    } catch (error: any) {
      console.error('❌ Error setting typing status:', error.message);
    }
  },

  /**
   * Listen to typing status
   */
  listenToTyping(
    fromUid: string,
    toUid: string,
    callback: (isTyping: Record<string, boolean>) => void
  ) {
    const conversationId = messageService['getConversationId'](
      fromUid,
      toUid
    );
    const typingRef = ref(realtimeDb, `typing/${conversationId}`);

    const unsubscribe = onValue(typingRef, (snapshot) => {
      const typingData = snapshot.val() || {};
      const isTyping: Record<string, boolean> = {};

      Object.keys(typingData).forEach((uid) => {
        isTyping[uid] = typingData[uid].isTyping === true;
      });

      callback(isTyping);
    });

    return unsubscribe;
  },
};

// ============ FRIEND REQUEST SERVICES ============

export const friendRequestService = {
  /**
   * Send friend request
   */
  async sendFriendRequest(fromUid: string, toUid: string) {
    try {
      const requestId = `${Date.now()}_${Math.random()}`;

      // Create request document
      await setDoc(doc(db, 'friendRequests', requestId), {
        fromUid,
        toUid,
        fromUsername: (await this.getUserInfo(fromUid))?.username,
        toUsername: (await this.getUserInfo(toUid))?.username,
        status: 'pending', // pending, accepted, rejected
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Send notification to recipient
      await this.sendNotificationToUser(toUid, {
        type: 'friend-request',
        from: fromUid,
        message: `${(await this.getUserInfo(fromUid))?.username} sent you a friend request`,
        timestamp: new Date(),
      });

      console.log(`✅ Friend request sent: ${fromUid} → ${toUid}`);
      return { success: true, requestId };
    } catch (error: any) {
      console.error('❌ Error sending friend request:', error.message);
      throw error;
    }
  },

  /**
   * Accept friend request
   */
  async acceptFriendRequest(requestId: string, fromUid: string, toUid: string) {
    try {
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

      // Send notification
      await this.sendNotificationToUser(fromUid, {
        type: 'friend-request-accepted',
        from: toUid,
        message: `${(await this.getUserInfo(toUid))?.username} accepted your friend request`,
        timestamp: new Date(),
      });

      console.log(`✅ Friend request accepted`);
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
  private async getUserInfo(uid: string) {
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
  private async sendNotificationToUser(uid: string, notification: any) {
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

// ============ NOTIFICATION SERVICES ============

export const notificationService = {
  /**
   * Request FCM permission and get token
   */
  async requestFCMPermission(uid: string) {
    try {
      const messaging = getMessaging();
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: process.env.REACT_APP_VAPID_KEY,
        });

        // Save FCM token to Firestore
        await updateDoc(doc(db, 'users', uid), {
          fcmToken: token,
          notificationsEnabled: true,
        });

        console.log(`✅ FCM token obtained and saved`);
        return token;
      } else {
        console.log('⚠️ Notification permission denied');
        return null;
      }
    } catch (error: any) {
      console.error('❌ Error requesting FCM permission:', error.message);
      return null;
    }
  },

  /**
   * Listen to incoming notifications
   */
  listenToNotifications(
    callback: (notification: Record<string, any>) => void
  ) {
    try {
      const messaging = getMessaging();

      // Listen to messages received in foreground
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('📬 Foreground notification received:', payload);

        callback({
          title: payload.notification?.title,
          body: payload.notification?.body,
          data: payload.data,
        });
      });

      return unsubscribe;
    } catch (error: any) {
      console.error('❌ Error listening to notifications:', error.message);
      return () => {};
    }
  },

  /**
   * Send local notification
   */
  async sendLocalNotification(
    title: string,
    options?: NotificationOptions
  ) {
    if ('Notification' in window && Notification.permission === 'granted') {
      return new Notification(title, options);
    }
  },

  /**
   * Listen to user notifications from Firestore
   */
  listenToUserNotifications(
    uid: string,
    callback: (notifications: any[]) => void
  ) {
    const notificationsRef = collection(
      db,
      'users',
      uid,
      'notifications'
    );
    const q = query(notificationsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(notifications);
    });

    return unsubscribe;
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

// ============ USER PROFILE SERVICES ============

export const userService = {
  /**
   * Get user profile by UID
   */
  async getUserProfile(uid: string) {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.data();
    } catch (error: any) {
      console.error('❌ Error getting user profile:', error.message);
      return null;
    }
  },

  /**
   * Update user profile
   */
  async updateUserProfile(uid: string, updates: Record<string, any>) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ User profile updated`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating user profile:', error.message);
      throw error;
    }
  },

  /**
   * Search users by username
   */
  async searchUsers(searchTerm: string, currentUid: string) {
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);

      const results = snapshot.docs
        .filter((doc) => {
          const username = doc.data().username || '';
          return (
            username.toLowerCase().includes(searchTerm.toLowerCase()) &&
            doc.id !== currentUid
          );
        })
        .map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        }))
        .slice(0, 10); // Limit to 10 results

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

      const doc = snapshot.docs[0];
      return {
        uid: doc.id,
        ...doc.data(),
      };
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
      await remove(ref(realtimeDb, `presence/${uid}`));

      console.log(`✅ User account deleted`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting user account:', error.message);
      throw error;
    }
  },
};

// ============ CONVERSATION SERVICES ============

export const conversationService = {
  /**
   * Get all conversations for a user
   */
  async getUserConversations(uid: string) {
    try {
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', uid),
        orderBy('lastMessageTime', 'desc')
      );

      const snapshot = await getDocs(q);
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return conversations;
    } catch (error: any) {
      console.error('❌ Error getting user conversations:', error.message);
      return [];
    }
  },

  /**
   * Listen to conversations in real-time
   */
  listenToUserConversations(uid: string, callback: (conversations: any[]) => void) {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', uid),
      orderBy('lastMessageTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(conversations);
    });

    return unsubscribe;
  },

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string) {
    try {
      // Get all messages in the conversation
      const messagesRef = collection(
        db,
        'conversations',
        conversationId,
        'messages'
      );
      const messagesSnapshot = await getDocs(messagesRef);

      // Delete all messages
      const batch = writeBatch(db);
      messagesSnapshot.forEach((doc) => batch.delete(doc.ref));

      // Delete conversation document
      batch.delete(doc(db, 'conversations', conversationId));

      await batch.commit();
      console.log(`✅ Conversation deleted`);
    } catch (error: any) {
      console.error('❌ Error deleting conversation:', error.message);
    }
  },
};

// ============ STATISTICS & ANALYTICS ============

export const analyticsService = {
  /**
   * Get chat statistics
   */
  async getChatStats(uid: string) {
    try {
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', uid)
      );

      const conversationsSnapshot = await getDocs(q);
      let totalMessages = 0;
      let unreadMessages = 0;

      for (const conversation of conversationsSnapshot.docs) {
        const messagesRef = collection(
          db,
          'conversations',
          conversation.id,
          'messages'
        );
        const allMessages = await getDocs(messagesRef);
        const unreadMsgs = allMessages.docs.filter(
          (msg) => msg.data().toUid === uid && msg.data().status !== MESSAGE_STATUS.READ
        );

        totalMessages += allMessages.size;
        unreadMessages += unreadMsgs.length;
      }

      return {
        totalConversations: conversationsSnapshot.size,
        totalMessages,
        unreadMessages,
      };
    } catch (error: any) {
      console.error('❌ Error getting chat stats:', error.message);
      return { totalConversations: 0, totalMessages: 0, unreadMessages: 0 };
    }
  },
};

export default {
  authService,
  presenceService,
  messageService,
  typingService,
  friendRequestService,
  notificationService,
  userService,
  conversationService,
  analyticsService,
};
