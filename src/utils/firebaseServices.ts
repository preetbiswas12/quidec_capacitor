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
  sendEmailVerification,
  sendPasswordResetEmail,
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
  serverTimestamp as rtdbServerTimestamp,
  get,
  remove,
  update,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
} from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { db, auth, realtimeDb, getFCMToken, EMBEDDED_VAPID_KEY } from './firebase';
import { encryptMessage, decryptMessage, getConversationKey } from './encryption';
import { appendMessage, loadMessages as loadLocalMessages, listLocalChatIds, StoredMessage } from './localMessageStore';
import { uploadMediaWithProgress, loadMediaWithCache, StoredMediaReference } from './mediaUploadHandler';

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
   * Sends verification email automatically
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

      // Send verification email
      await sendEmailVerification(user);
      console.log(`📧 Verification email sent to ${email}`);

      // Create user document in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        username,
        email,
        displayName: username,
        photoURL: null,
        emailVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        publicKey: null,
        isOnline: false,
        lastSeen: serverTimestamp(),
        fcmToken: null, // Will be set after email verification
      });

      // Initialize user presence in Realtime Database
      await set(ref(realtimeDb, `presence/${user.uid}`), {
        online: false, // Set to false until email is verified
        lastSeen: rtdbServerTimestamp(),
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
      return { 
        success: true, 
        user, 
        uid: user.uid,
        message: 'Please check your email to verify your account',
      };
    } catch (error: any) {
      console.error('❌ Registration error:', error.message);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already in use');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Use at least 6 characters');
      }
      throw error;
    }
  },

  /**
   * Login user with email and password
   * Checks if email is verified before allowing login
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

      // Check if email is verified
      if (!user.emailVerified) {
        console.warn('⚠️ User email not verified');
        // Don't set online status if email not verified
        return {
          success: false,
          emailVerified: false,
          message: 'Please verify your email before logging in',
          user,
        };
      }

      // Update online status in Realtime Database
      await set(ref(realtimeDb, `presence/${user.uid}`), {
        online: true,
        lastSeen: rtdbServerTimestamp(),
        username: user.displayName || user.email,
      });

      // Update Firestore user document
      await setDoc(doc(db, 'users', user.uid), {
        isOnline: true,
        lastSeen: serverTimestamp(),
        emailVerified: true,
      }, { merge: true });

      // Get and save FCM token if not already saved
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.data()?.fcmToken) {
          const fcmToken = await getFCMToken();
          if (fcmToken) {
            await setDoc(doc(db, 'users', user.uid), {
              fcmToken: fcmToken,
            }, { merge: true });
            console.log('✅ FCM token saved');
          }
        }
      } catch (fcmErr) {
        console.warn('⚠️ FCM token setup skipped:', fcmErr);
      }

      console.log(`✅ User logged in: ${user.email}`);
      return { success: true, user, uid: user.uid, emailVerified: true };
    } catch (error: any) {
      console.error('❌ Login error:', error.message);
      if (error.code === 'auth/user-not-found') {
        throw new Error('User not found');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password');
      }
      throw error;
    }
  },

  /**
   * Resend email verification
   */
  async resendEmailVerification() {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      if (user.emailVerified) {
        throw new Error('Email is already verified');
      }

      await sendEmailVerification(user);
      console.log(`📧 Verification email resent to ${user.email}`);
      return { success: true, message: 'Verification email sent' };
    } catch (error: any) {
      console.error('❌ Error resending verification email:', error.message);
      throw error;
    }
  },

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string) {
    try {
      await sendPasswordResetEmail(auth, email);
      console.log(`📧 Password reset email sent to ${email}`);
      return { success: true, message: 'Password reset email sent' };
    } catch (error: any) {
      console.error('❌ Error sending password reset:', error.message);
      if (error.code === 'auth/user-not-found') {
        throw new Error('User not found');
      }
      throw error;
    }
  },

  /**
   * Reload user auth state to get fresh data
   */
  async reloadUser() {
    try {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        console.log('✅ User state reloaded');
        return user;
      }
      return null;
    } catch (error: any) {
      console.error('❌ Error reloading user:', error.message);
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
          lastSeen: rtdbServerTimestamp(),
          username: user.displayName || user.email,
        });

        // Update Firestore
        await setDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        }, { merge: true });
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

  getCurrentUserSync(): User | null {
    return auth.currentUser;
  },

  /**
   * Update user profile information in Auth and Firestore
   */
  async updateUserProfile(uid: string, updates: { name?: string; avatar?: string | null; about?: string }) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user');

      // 1. Update Firebase Auth Profile (limited to display name and photoURL)
      const authUpdates: any = {};
      if (updates.name) authUpdates.displayName = updates.name;
      if (updates.avatar !== undefined) authUpdates.photoURL = updates.avatar;
      
      if (Object.keys(authUpdates).length > 0) {
        await updateProfile(user, authUpdates);
      }

      // 2. Update Firestore User Document
      const firestoreUpdates: any = {
        updatedAt: serverTimestamp(),
      };
      if (updates.name) {
        firestoreUpdates.displayName = updates.name;
        firestoreUpdates.username = updates.name.toLowerCase().replace(/\s+/g, '.');
      }
      if (updates.avatar !== undefined) firestoreUpdates.photoURL = updates.avatar;
      if (updates.about !== undefined) firestoreUpdates.about = updates.about;

      await setDoc(doc(db, 'users', uid), firestoreUpdates, { merge: true });
      
      console.log(`✅ User profile updated for ${uid}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating user profile:', error.message);
      throw error;
    }
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
        lastSeen: rtdbServerTimestamp(),
        username,
      });

      await setDoc(doc(db, 'users', uid), {
        isOnline: true,
        lastSeen: serverTimestamp(),
      }, { merge: true });

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
        lastSeen: rtdbServerTimestamp(),
      });

      await setDoc(doc(db, 'users', uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
      }, { merge: true });

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
    const unsubscribers: (() => void)[] = [];

    // First get the user's friend list
    const friendshipRef = doc(db, 'friendships', currentUserUid);
    const unsubFriendship = onSnapshot(friendshipRef, async (snapshot) => {
      const friendsList = snapshot.data()?.friends || [];

      const friendsStatus: Record<string, any> = {};

      // Listen to each friend's presence
      friendsList.forEach((friendUid: string) => {
        const presenceRef = ref(realtimeDb, `presence/${friendUid}`);
        const unsubPresence = onValue(presenceRef, (snapshot: any) => {
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
      const friendUids = snapshot.data()?.friends || [];
      if (friendUids.length === 0) {
        callback([]);
        return;
      }

      // Fetch user details for each friend in batches
      const usersRef = collection(db, 'users');
      const chunks = [];
      for (let i = 0; i < friendUids.length; i += 30) {
        chunks.push(friendUids.slice(i, i + 30));
      }

      const allFriends: any[] = [];
      for (const chunk of chunks) {
        const q = query(usersRef, where('uid', 'in', chunk));
        const userSnapshots = await getDocs(q);
        userSnapshots.forEach(doc => allFriends.push(doc.data()));
      }
      callback(allFriends);
    });
  },

  /**
   * Send WebRTC signaling (Ephemeral)
   */
  async sendSignaling(fromUid: string, toUid: string, signal: any) {
    const signalId = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const signalRef = ref(realtimeDb, `signaling/${toUid}/${signalId}`);
    await set(signalRef, {
      ...signal,
      fromUid,
      timestamp: rtdbServerTimestamp()
    });
    return signalId;
  },

  /**
   * Listen to incoming WebRTC signaling (Pipe Model)
   */
  listenToSignaling(uid: string, callback: (signal: any) => void) {
    const signalingRef = ref(realtimeDb, `signaling/${uid}`);
    
    const unsubscribe = onChildAdded(signalingRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // 1. Trigger the callback
      callback({
        id: snapshot.key,
        ...data
      });

      // 2. IMMEDIATELY DELETE from server
      await remove(ref(realtimeDb, `signaling/${uid}/${snapshot.key}`));
      console.log(`🗑️ Signal ${snapshot.key} wiped from server after delivery`);
    });

    return unsubscribe;
  },
};

// ============ MESSAGE SERVICES ============

export const messageService = {
  /**
   * Persist a message record in Firestore without transport side-effects.
   * Used by both outgoing sends and any legacy inbound message bridges.
   */
  async recordMessage(
    fromUid: string,
    toUid: string,
    content: string,
    options: {
      mediaUrl?: string | null;
      messageType?: string;
      messageId?: string;
      timestamp?: any;
      status?: string;
    } = {}
  ) {
    const conversationId = this.getConversationId(fromUid, toUid);
    const messageId = options.messageId || `${Date.now()}_${Math.random()}`;

    // E2E Encryption: Encrypt content if it's a text message
    let encryptedContent = content;
    try {
      const convKey = await getConversationKey(fromUid, toUid);
      encryptedContent = await encryptMessage(content, convKey);
    } catch (encErr) {
      console.warn('⚠️ Encryption failed, sending plaintext:', encErr);
    }

    const messageData = {
      messageId,
      fromUid,
      toUid,
      content: encryptedContent, // Store encrypted
      mediaUrl: options.mediaUrl || null,
      messageType: options.messageType || 'text',
      timestamp: options.timestamp || serverTimestamp(),
      status: options.status || MESSAGE_STATUS.SENT,
      deliveredAt: null,
      readAt: null,
      typing: false,
      isEncrypted: true,
    };

    // CLOUD STORAGE: TRANSPORT ONLY (ZERO PERSISTENCE)
    // We use RTDB as a "pipe". Recipient will delete this record immediately upon receipt.
    const deliveryRef = ref(realtimeDb, `delivery/${toUid}/${messageId}`);
    await set(deliveryRef, {
      ...messageData,
      fromUid,
      conversationId
    });

    // Save to local persistence - This remains our ONLY permanent store
    try {
      await appendMessage(fromUid, {
        id: messageId,
        chatId: conversationId,
        senderId: fromUid,
        content: content,
        type: (options.messageType as any) || 'text',
        timestamp: new Date().toISOString(),
        status: (options.status as any) || 'sent',
      });
    } catch (localErr) {
      console.warn('⚠️ Local persistence failed:', localErr);
    }

    // We don't even update Firestore metadata anymore to keep the server 100% clean
    // Metadata will be managed locally on the device.

    return { success: true, messageId, conversationId, status: messageData.status };
  },

  /**
   * Send a message with delivery tracking
   */
  async sendMessage(
    fromUid: string,
    toUid: string,
    content: string,
    mediaFile?: File,
    messageType: 'text' | 'image' | 'video' | 'audio' = 'text'
  ) {
    try {
      let mediaUrl = null;
      let mediaRef: StoredMediaReference | null = null;

      // Handle Production-Grade Media Upload
      if (mediaFile) {
        console.log(`📤 Uploading encrypted ${messageType}...`);
        mediaRef = await uploadMediaWithProgress(
          mediaFile,
          messageType === 'text' ? 'image' : messageType, // fallback
          fromUid,
          toUid
        );
        mediaUrl = mediaRef.fileId; // Use fileId as the reference
      }

      const result = await this.recordMessage(fromUid, toUid, content, {
        mediaUrl: mediaUrl,
        messageType: mediaRef ? messageType : 'text',
        status: MESSAGE_STATUS.SENT,
      });

      const { messageId, conversationId } = result;

      // Check if recipient is online, if so mark as delivered
      await presenceService.listenToUserPresence(
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
      return { ...result, status: MESSAGE_STATUS.SENT };
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
   * Listen to incoming messages (Pipe Model)
   * Recipient receives the message and IMMEDIATELY deletes it from RTDB
   */
  listenToIncomingMessages(uid: string, callback: (message: any) => void) {
    const deliveryRef = ref(realtimeDb, `delivery/${uid}`);
    
    // Use onChildAdded so we get each message one by one
    const unsubscribe = onChildAdded(deliveryRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // 1. Trigger the callback for the UI/Store
      callback({
        id: snapshot.key,
        ...data
      });

      // 2. IMMEDIATELY DELETE from server
      await remove(ref(realtimeDb, `delivery/${uid}/${snapshot.key}`));
      console.log(`🗑️ Message ${snapshot.key} wiped from server after delivery`);
    });

    return unsubscribe;
  },

  /**
   * Listen to messages in a conversation (LEGACY - now relies on local store + incoming listener)
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

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const convKey = await getConversationKey(fromUid, toUid);
      const messages = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        let decryptedContent = data.content;
        
        if (data.isEncrypted) {
          try {
            decryptedContent = await decryptMessage(data.content, convKey);
          } catch (decErr) {
            console.warn('⚠️ Decryption failed for message:', doc.id);
          }
        }

        return {
          id: doc.id,
          ...data,
          content: decryptedContent
        };
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
      const convKey = await getConversationKey(fromUid, toUid);
      
      const messages = (await Promise.all(snapshot.docs
        .map(async (doc) => {
          const data = doc.data();
          let decryptedContent = data.content;

          if (data.isEncrypted) {
            try {
              decryptedContent = await decryptMessage(data.content, convKey);
            } catch (decErr) {
              console.warn('⚠️ Decryption failed for message:', doc.id);
            }
          }

          return {
            id: doc.id,
            ...data,
            content: decryptedContent,
          };
        })))
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
  async updateConversationMetadata(
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
  getConversationId(uid1: string, uid2: string): string {
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

  /**
   * List all chat IDs that have local data on this device
   */
  async getChatsForUser(userId: string): Promise<string[]> {
    return listLocalChatIds();
  },

  /**
   * Add a reaction to a message
   */
  async reactToMessage(conversationId: string, messageId: string, reactions: any[]) {
    try {
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
      await updateDoc(messageRef, {
        reactions
      });
    } catch (error: any) {
      console.error('❌ Error reacting to message:', error.message);
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
          timestamp: rtdbServerTimestamp(),
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

    const unsubscribe = onValue(typingRef, (snapshot: any) => {
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
          vapidKey: EMBEDDED_VAPID_KEY,
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
  /**
   * Search users by username (Production optimized)
   */
  async searchUsers(searchTerm: string, currentUid: string) {
    try {
      const q = query(
        collection(db, 'users'),
        where('username', '>=', searchTerm.toLowerCase()),
        where('username', '<=', searchTerm.toLowerCase() + '\uf8ff'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() }))
        .filter(u => u.uid !== currentUid);
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
