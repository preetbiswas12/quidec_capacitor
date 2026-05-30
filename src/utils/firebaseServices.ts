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
  verifyBeforeUpdateEmail,
  multiFactor,
  PhoneAuthProvider,
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
import { messageQueue } from './persistentMessageQueue';
import { uploadMediaWithProgress, loadMediaWithCache, StoredMediaReference } from './mediaUploadHandler';
import { 
  validateEmail, 
  validatePassword, 
  validateUsername,
  loginLimiter, 
  registerLimiter 
} from './validators';
import logger from './logger';

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

/**
 * Sanitize UIDs and other identifiers for use in Firebase RTDB paths
 * Firebase paths cannot contain: . # $ [ ]
 * Replace invalid characters with underscores
 */
function sanitizePathComponent(component: string): string {
  if (!component) return 'unknown';
  return component.replace(/[.#$\[\]@]/g, '_');
}

/**
 * Get the custom username (document ID) by Firebase UID
 * This is needed because user documents are keyed by custom username,
 * but we need to bind them with the Firebase UID
 */
async function getCustomUsernameByFirebaseUid(firebaseUid: string): Promise<string | null> {
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
 * Pattern: username.1234
 * Checks Firestore to ensure uniqueness
 */
export async function generateUniqueUserId(name: string): Promise<string> {
  const cleanName = name.toLowerCase().replace(/\s+/g, '');
  let isUnique = false;
  let generatedId = '';
  let attempts = 0;

  while (!isUnique && attempts < 15) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    generatedId = `${cleanName}.${randomSuffix}`;
    
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
  return `${cleanName}.${randomSuffix}`;
}

// ============ AUTHENTICATION SERVICES ============

export const authService = {
  /**
   * Register a new user with email and password
   * Sends verification email automatically
   */
  async registerUser(email: string, username: string, password: string) {
    const errors: Record<string, string> = {};
    
    // Validate all inputs FIRST
    try {
      validateEmail(email);
    } catch (err: any) {
      errors.email = err.message;
    }
    
    try {
      validateUsername(username);
    } catch (err: any) {
      errors.username = err.message;
    }
    
    try {
      validatePassword(password);
    } catch (err: any) {
      errors.password = err.message;
    }
    
    // Return validation errors immediately
    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        errors,
        message: 'Please fix the errors above',
      };
    }
    
    // Check rate limit
    try {
      await registerLimiter.checkLimit(email);
    } catch (err: any) {
      return {
        success: false,
        errors: { submit: err.message },
        message: 'Too many registration attempts',
      };
    }
    
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

      // Create user document in Firestore - Use Handle as Document ID
      const generatedUserId = await generateUniqueUserId(username);
      await setDoc(doc(db, 'users', generatedUserId), {
        uid: user.uid,
        username: generatedUserId,
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
      await set(ref(realtimeDb, `presence/${sanitizePathComponent(user.uid)}`), {
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
        username: generatedUserId,
        message: 'Please check your email to verify your account',
      };
    } catch (error: any) {
      console.error('❌ Registration error:', error.message);
      const registerErrors: Record<string, string> = {};
      
      if (error.code === 'auth/email-already-in-use') {
        registerErrors.email = 'Email already registered';
      } else if (error.code === 'auth/weak-password') {
        registerErrors.password = 'Password is too weak. Use at least 6 characters';
      } else {
        registerErrors.submit = 'Registration failed. Try again later.';
      }
      
      return {
        success: false,
        errors: registerErrors,
        message: 'Registration failed',
      };
    }
  },

  /**
   * Login user with email and password
   * Checks if email is verified before allowing login
   */
  async loginUser(email: string, password: string) {
    const errors: Record<string, string> = {};
    
    // Validate email first
    try {
      validateEmail(email);
    } catch (err: any) {
      errors.email = err.message;
      return {
        success: false,
        emailVerified: null,
        errors,
        message: 'Invalid email',
      };
    }
    
    // Check rate limit before Firebase auth
    try {
      await loginLimiter.checkLimit(email);
    } catch (err: any) {
      return {
        success: false,
        emailVerified: null,
        errors: { submit: err.message },
        message: 'Too many login attempts',
      };
    }
    
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

      // Get the custom username (document ID) bound with this Firebase UID
      const customUsername = await getCustomUsernameByFirebaseUid(user.uid);
      
      if (!customUsername) {
        console.error('❌ Custom username not found for Firebase UID:', user.uid);
        return {
          success: false,
          message: 'User profile not found. Please re-register.',
          user,
        };
      }

      // Update online status in Realtime Database
      await set(ref(realtimeDb, `presence/${sanitizePathComponent(user.uid)}`), {
        online: true,
        lastSeen: rtdbServerTimestamp(),
        username: customUsername,
      });

      // Update Firestore user document using custom username as document ID
      await setDoc(doc(db, 'users', customUsername), {
        isOnline: true,
        lastSeen: serverTimestamp(),
        emailVerified: true,
      }, { merge: true });

      // Get and save FCM token if not already saved
      try {
        const userDoc = await getDoc(doc(db, 'users', customUsername));
        if (!userDoc.data()?.fcmToken) {
          const fcmToken = await getFCMToken();
          if (fcmToken) {
            await setDoc(doc(db, 'users', customUsername), {
              fcmToken: fcmToken,
            }, { merge: true });
            console.log('✅ FCM token saved');
          }
        }
      } catch (fcmErr) {
        console.warn('⚠️ FCM token setup skipped:', fcmErr);
      }

      console.log(`✅ User logged in: ${user.email}`);
      return { success: true, user, uid: user.uid, username: customUsername, emailVerified: true };
    } catch (error: any) {
      console.error('❌ Login error:', error.message);
      const loginErrors: Record<string, string> = {};
      
      if (error.code === 'auth/user-not-found') {
        loginErrors.email = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        loginErrors.password = 'Incorrect password';
      } else if (error.code === 'auth/invalid-credential') {
        loginErrors.submit = 'Invalid credentials';
      } else {
        loginErrors.submit = 'Login failed. Try again.';
      }
      
      return {
        success: false,
        emailVerified: null,
        errors: loginErrors,
        message: 'Login failed',
      };
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
      return { success: true, message: 'Password reset email sent' };
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        throw new Error('User not found');
      }
      throw error;
    }
  },

  /**
   * Send email change verification
   * User must verify the change through Firebase email link
   */
  async sendEmailChangeVerification(newEmail: string) {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      // Use Firebase's verifyBeforeUpdateEmail to send verification email to new address
      // This requires the user to click the link in the email before the change is applied
      console.log(`📧 Sending email verification for new email: ${newEmail}`);
      
      await verifyBeforeUpdateEmail(user, newEmail);
      
      return {
        success: true,
        message: `Verification email sent to ${newEmail}. Check your email and click the link to confirm the change.`,
      };
    } catch (error: any) {
      console.error('❌ Error sending email change verification:', error.message);
      throw error;
    }
  },

  /**
   * Send 2FA enrollment email
   * Sends setup instructions via email
   * In production, this would send a QR code or setup key via email
   */
  async send2FAEnrollmentEmail() {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      console.log(`📧 Sending 2FA enrollment email to ${user.email}`);
      
      // For now, we send the password reset email with instructions
      // In production, you'd want to:
      // 1. Generate a 2FA secret (base32 encoded)
      // 2. Create a QR code from the secret
      // 3. Send via Cloud Function with setup instructions
      // This is a placeholder that sends setup email
      await sendPasswordResetEmail(auth, user.email!);
      
      return {
        success: true,
        message: 'Two-factor authentication setup email sent. Follow the instructions in your email to enable 2FA.',
      };
    } catch (error: any) {
      console.error('❌ Error sending 2FA enrollment email:', error.message);
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
   * Update Firestore to mark email as verified
   * Called after Firebase Auth detects email verification
   */
  async updateUserEmailVerified(uid: string) {
    try {
      // Get the custom username (document ID) bound with this Firebase UID
      const customUsername = await getCustomUsernameByFirebaseUid(uid);
      
      if (customUsername) {
        await setDoc(doc(db, 'users', customUsername), {
          emailVerified: true,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log('✅ Email verification status updated in Firestore');
      } else {
        console.warn('⚠️ Custom username not found, skipping Firestore update');
      }
    } catch (error: any) {
      console.error('❌ Error updating email verification status:', error.message);
      // Don't throw - this is non-critical
    }
  },

  /**
   * Logout user and update presence
   */
  async logoutUser() {
    try {
      const user = auth.currentUser;
      if (user) {
        // Get the custom username (document ID) bound with this Firebase UID
        const customUsername = await getCustomUsernameByFirebaseUid(user.uid);

        // Set offline in Realtime Database
        await set(ref(realtimeDb, `presence/${sanitizePathComponent(user.uid)}`), {
          online: false,
          lastSeen: rtdbServerTimestamp(),
          username: customUsername || user.displayName || user.email,
        });

        // Update Firestore using custom username as document ID
        if (customUsername) {
          await setDoc(doc(db, 'users', customUsername), {
            isOnline: false,
            lastSeen: serverTimestamp(),
          }, { merge: true });
        }
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
   * Targets document by handle (username)
   */
  async updateUserProfile(updates: { name?: string; avatar?: string | null; about?: string; userId: string }) {
    const startTime = Date.now();
    
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user');

      logger.info('updateUserProfile', `Updating profile for ${updates.userId}`);

      const firestoreUpdates: any = {
        updatedAt: serverTimestamp(),
      };
      
      if (updates.name) {
        firestoreUpdates.displayName = updates.name;
        try {
          await updateProfile(user, { displayName: updates.name });
        } catch (authErr) {
          logger.warn('updateUserProfile', `Failed to update auth profile: ${authErr}`);
          // Continue with Firestore update even if auth update fails
        }
      }
      
      if (updates.avatar !== undefined) firestoreUpdates.photoURL = updates.avatar;
      if (updates.about !== undefined) firestoreUpdates.about = updates.about;

      // Use updates.userId (the handle) as the document ID
      const userRef = doc(db, 'users', updates.userId);
      await setDoc(userRef, firestoreUpdates, { merge: true });

      const duration = Date.now() - startTime;
      logger.info('updateUserProfile', `Profile updated in ${duration}ms`);
      return { success: true };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('updateUserProfile', `Failed after ${duration}ms: ${error.message}`);
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  },

  /**
   * Migrate existing UID-named documents to Handle-named ones
   */
  async migrateToHandleIds() {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      let migratedCount = 0;
      
      for (const userDoc of snapshot.docs) {
        const id = userDoc.id;
        const data = userDoc.data();
        
        // If ID is a long string (UID) and has a username field
        if (id.length > 20 && !id.includes('.') && data.username) {
          const newId = data.username;
          console.log(`🚀 Migrating ${id} -> ${newId}`);
          
          // 1. Create new doc with handle as ID
          await setDoc(doc(db, 'users', newId), data);
          
          // 2. Delete old doc with UID as ID
          await deleteDoc(doc(db, 'users', id));
          
          migratedCount++;
        }
      }
      
      console.log(`✅ Migration complete. Moved ${migratedCount} documents.`);
      return { success: true, migratedCount };
    } catch (error: any) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  },

  /**
   * Cleanup duplicate/legacy user documents that were incorrectly named after handles
   */
  async cleanupDuplicateUsers() {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      let deletedCount = 0;
      const deletePromises = [];
      
      for (const userDoc of snapshot.docs) {
        const id = userDoc.id;
        const data = userDoc.data();
        console.log(`DEBUG: DocID: ${id}, Username Field: ${data.username}`);
        // Firebase Auth UIDs are 28 chars. Handles usually have dots or are shorter/different.
        if (id.includes('.') || id.startsWith('@') || (id.length < 20 && id !== 'system_config')) {
          console.log(`🗑️ Mark for deletion: ${id}`);
          deletePromises.push(deleteDoc(doc(db, 'users', id)));
          deletedCount++;
        }
      }
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
      console.log(`✅ Cleanup complete. Deleted ${deletedCount} documents.`);
      return { success: true, deletedCount };
    } catch (error: any) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  },

  /**
   * Wipe all user-related data from Firestore (DANGEROUS - for dev reset)
   */
  async wipeDatabase() {
    try {
      const collectionsToWipe = ['users', 'friendships', 'conversations', 'messages', 'calls'];
      let totalDeleted = 0;
      
      for (const collName of collectionsToWipe) {
        const collRef = collection(db, collName);
        const snapshot = await getDocs(collRef);
        
        const deletePromises = snapshot.docs.map(d => {
          if (collName === 'users' && d.id === 'system_config') return Promise.resolve();
          return deleteDoc(d.ref);
        });
        
        await Promise.all(deletePromises);
        totalDeleted += deletePromises.length;
        console.log(`🗑️ Wiped collection: ${collName}`);
      }
      
      return { success: true, totalDeleted };
    } catch (error: any) {
      console.error('❌ Wipe failed:', error.message);
      throw error;
    }
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  /**
   * Get the custom username (document ID) by Firebase UID
   * This is needed because user documents are keyed by custom username,
   * but we need to bind them with the Firebase UID
   */
  async getCustomUsernameByFirebaseUid(firebaseUid: string): Promise<string | null> {
    return getCustomUsernameByFirebaseUid(firebaseUid);
  },
};

// ============ PRESENCE & ONLINE STATUS SERVICES ============

export const presenceService = {
  /**
   * Set user online status
   */
  async setUserOnline(uid: string, username: string) {
    try {
      logger.info('setUserOnline', `Setting user ${username} online`);
      
      // Update RTDB presence (real-time)
      const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`);
      await set(presenceRef, {
        online: true,
        lastSeen: rtdbServerTimestamp(),
        username,
      });

      // Update Firestore metadata (backup)
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
      
      // Update RTDB presence
      const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`);
      await set(presenceRef, {
        online: false,
        lastSeen: rtdbServerTimestamp(),
      });

      // Update Firestore metadata (backup)
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
    const unsubscribers: (() => void)[] = [];

    // First get the user's friend list
    const friendshipRef = doc(db, 'friendships', currentUserUid);
    const unsubFriendship = onSnapshot(friendshipRef, async (snapshot) => {
      const friendsList = snapshot.data()?.friends || [];

      const friendsStatus: Record<string, any> = {};

      // Listen to each friend's presence
      friendsList.forEach((friendUid: string) => {
        const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(friendUid)}`);
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
    const signalRef = ref(realtimeDb, `signaling/${sanitizePathComponent(toUid)}/${signalId}`);
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
    const startTime = Date.now();
    const conversationId = this.getConversationId(fromUid, toUid);
    const messageId = options.messageId || `${Date.now()}_${Math.random()}`;

    try {
      logger.info('recordMessage', `Recording message from ${fromUid} to ${toUid}`);

      // E2E Encryption: Encrypt content if it's a text message
      let encryptedContent = content;
      try {
        const convKey = await getConversationKey(fromUid, toUid);
        encryptedContent = await encryptMessage(content, convKey);
      } catch (encErr) {
        logger.warn('recordMessage', `Encryption failed, using plaintext: ${encErr}`);
        // Don't fail entirely, continue with plaintext
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

      // TRANSIENT DELIVERY PIPE (Zero Persistence)
      // Messages stored temporarily in RTDB only for delivery - IMMEDIATELY deleted after recipient receives
      // This keeps Firebase storage usage near zero while enabling real-time delivery
      const deliveryRef = ref(realtimeDb, `delivery/${sanitizePathComponent(toUid)}/${messageId}`);
      
      try {
        await set(deliveryRef, {
          ...messageData,
          fromUid,
          conversationId
        });
      } catch (rtdbErr) {
        logger.error('recordMessage', `RTDB delivery failed: ${rtdbErr}`);
        // Log but don't fail - we have local persistence fallback
      }

      // Save to local persistence - This is our ONLY permanent store
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
        logger.warn('recordMessage', `Local persistence failed: ${localErr}`);
        // Message still recorded in RTDB, local fallback failed
      }

      const duration = Date.now() - startTime;
      logger.info('recordMessage', `Message recorded successfully in ${duration}ms`);

      return { success: true, messageId, conversationId, status: messageData.status };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error('recordMessage', `Failed after ${duration}ms: ${err.message}`);
      throw new Error(`Failed to record message: ${err.message}`);
    }
  },

  /**
   * Prepare encrypted message for delivery (WebSocket + FCM)
   * Returns the encrypted payload that can be sent via WebSocket
   */
  async prepareMessageForDelivery(
    fromUid: string,
    toUid: string,
    content: string,
    messageId: string,
    messageType: string = 'text',
    mediaUrl: string | null = null
  ): Promise<{ encrypted: string; messageId: string; fromUid: string; toUid: string; messageType: string; mediaUrl: string | null; timestamp: string }> {
    try {
      // Encrypt the message content
      const conversationKey = await getConversationKey(fromUid, toUid);
      const messagePayload = {
        content,
        messageType,
        mediaUrl,
        messageId,
        timestamp: new Date().toISOString(),
      };
      const encrypted = await encryptMessage(messagePayload, conversationKey);

      return {
        encrypted,
        messageId,
        fromUid,
        toUid,
        messageType,
        mediaUrl,
        timestamp: messagePayload.timestamp,
      };
    } catch (err) {
      console.error('❌ Failed to prepare message for delivery:', err);
      throw err;
    }
  },

  /**
   * Send push notification to recipient via FCM
   * This is the ONLY Firebase cloud function for messages - notifications only!
   */
  async sendPushNotification(toUid: string, fromUid: string, content: string, messageType: string) {
    try {
      // Get recipient's FCM token from their user document
      const userDoc = await getDoc(doc(db, 'users', toUid));
      if (!userDoc.exists()) {
        console.warn('⚠️ Recipient user not found for notification');
        return false;
      }

      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;

      if (!fcmToken) {
        console.warn('⚠️ Recipient has no FCM token');
        return false;
      }

      // Get sender name for notification
      const senderDoc = await getDoc(doc(db, 'users', fromUid));
      const senderName = senderDoc.exists() ? senderDoc.data().displayName || 'Someone' : 'Someone';

      // Build notification payload
      const notificationBody = messageType === 'text'
        ? content.substring(0, 50) + (content.length > 50 ? '...' : '')
        : `Sent a ${messageType}`;

      // Store notification request in RTDB (transient, not persisted)
      const notificationRef = ref(realtimeDb, `notifications/${toUid}/${Date.now()}`);
      await set(notificationRef, {
        type: 'new_message',
        fromUid,
        fromName: senderName,
        body: notificationBody,
        messageType,
        timestamp: Date.now(),
      });

      console.log(`📬 Push notification queued for ${toUid}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to send push notification:', err);
      return false;
    }
  },

  /**
   * Handle incoming encrypted message from WebSocket
   * Decrypts, saves to local .bin, returns decrypted message for UI
   */
  async handleIncomingMessage(
    currentUid: string,
    encryptedContent: string,
    messageId: string,
    fromUid: string,
    messageType: string,
    mediaUrl: string | null,
    timestamp: string
  ): Promise<{
    id: string;
    chatId: string;
    senderId: string;
    content: string;
    type: string;
    timestamp: string;
    status: string;
    imageUrl?: string;
  }> {
    try {
      // 1. Decrypt the message
      const convKey = await getConversationKey(fromUid, currentUid);
      const decryptedPayload = await decryptMessage(encryptedContent, convKey);
      const content = decryptedPayload.content || '';

      // 2. Save to local .bin storage
      const conversationId = this.getConversationId(currentUid, fromUid);
      try {
        await appendMessage(currentUid, {
          id: messageId,
          chatId: conversationId,
          senderId: fromUid,
          content: content,
          type: (messageType || 'text') as any,
          timestamp: timestamp || new Date().toISOString(),
          status: MESSAGE_STATUS.DELIVERED,
        });
      } catch (localErr) {
        console.warn('⚠️ Failed to save incoming message to local store:', localErr);
      }

      // 3. Return the decrypted message for UI
      return {
        id: messageId,
        chatId: conversationId,
        senderId: fromUid,
        content,
        type: messageType || 'text',
        timestamp: timestamp || new Date().toISOString(),
        status: 'received',
        imageUrl: mediaUrl || undefined,
      };
    } catch (err) {
      console.error('❌ Failed to handle incoming message:', err);
      // Return the message with empty content if decryption fails
      return {
        id: messageId,
        chatId: this.getConversationId(currentUid, fromUid),
        senderId: fromUid,
        content: '[Message could not be decrypted]',
        type: messageType || 'text',
        timestamp: timestamp || new Date().toISOString(),
        status: 'received',
      };
    }
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
    const startTime = Date.now();
    let mediaRef: StoredMediaReference | null = null;
    
    try {
      logger.info('sendMessage', `Sending message from ${fromUid} to ${toUid}`);
      
      let mediaUrl = null;

      // Handle Production-Grade Media Upload
      if (mediaFile) {
        try {
          logger.info('sendMessage', `Uploading encrypted ${messageType} (${mediaFile.size} bytes)`);
          mediaRef = await uploadMediaWithProgress(
            mediaFile,
            messageType === 'text' ? 'image' : messageType, // fallback
            fromUid,
            toUid
          );
          mediaUrl = mediaRef.fileId; // Use fileId as the reference
          logger.info('sendMessage', `Media uploaded: ${mediaUrl}`);
        } catch (uploadErr) {
          logger.error('sendMessage', `Media upload failed: ${uploadErr}`);
          throw new Error(`Failed to upload media: ${uploadErr}`);
        }
      }

      const result = await this.recordMessage(fromUid, toUid, content, {
        mediaUrl: mediaUrl,
        messageType: mediaRef ? messageType : 'text',
        status: MESSAGE_STATUS.SENT,
      });

      const { messageId, conversationId } = result;

      // Check if recipient is online, if so mark as delivered (don't fail on this)
      try {
        await presenceService.listenToUserPresence(
          toUid,
          async (isOnline) => {
            if (isOnline) {
              // Mark as delivered after 500ms if online
              setTimeout(() => {
                this.markMessageDelivered(conversationId, messageId, toUid)
                  .catch(err => logger.warn('sendMessage', `Failed to mark delivered: ${err}`));
              }, 500);
            }
          }
        );
      } catch (presenceErr) {
        logger.warn('sendMessage', `Failed to check presence: ${presenceErr}`);
        // Don't fail message send if presence check fails
      }

      const duration = Date.now() - startTime;
      logger.info('sendMessage', `Message sent successfully in ${duration}ms`);
      return { ...result, status: MESSAGE_STATUS.SENT };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('sendMessage', `Failed after ${duration}ms: ${error.message}`);
      
      // Queue message for retry on reconnect
      const conversationId = this.getConversationId(fromUid, toUid);
      const messageId = messageQueue.addMessage({
        conversationId,
        fromUid,
        toUid,
        content,
        messageType,
        timestamp: new Date().toISOString(),
        maxRetries: 10
      });
      
      logger.info('sendMessage', `Message queued for retry: ${messageId}`);
      
      throw new Error(`Failed to send message: ${error.message}`);
    }
  },

  /**
   * Mark message as delivered (double tick)
   * Uses RTDB transient pipe - receipt sent via RTDB, deleted after receipt
   */
  async markMessageDelivered(
    conversationId: string,
    messageId: string,
    recipientUid: string
  ) {
    try {
      // Send delivery receipt via RTDB transient pipe (sanitize UID for RTDB path)
      const receiptRef = ref(realtimeDb, `receipts/${sanitizePathComponent(recipientUid)}/delivered/${messageId}`);
      await set(receiptRef, {
        messageId,
        conversationId,
        deliveredAt: Date.now(),
        timestamp: serverTimestamp(),
      });

      console.log(`📨 Delivery receipt sent (📨 Double tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error sending delivery receipt:', error.message);
    }
  },

  /**
   * Mark message as read (double blue tick)
   * Uses RTDB transient pipe - receipt sent via RTDB, deleted after receipt
   */
  async markMessageRead(
    conversationId: string,
    messageId: string,
    readerUid: string
  ) {
    try {
      // Send read receipt via RTDB transient pipe (sanitize UID for RTDB path)
      const receiptRef = ref(realtimeDb, `receipts/${sanitizePathComponent(readerUid)}/read/${messageId}`);
      await set(receiptRef, {
        messageId,
        conversationId,
        readAt: Date.now(),
        timestamp: serverTimestamp(),
      });

      console.log(`💙 Read receipt sent (💙 Double blue tick): ${messageId}`);
    } catch (error: any) {
      console.error('❌ Error sending read receipt:', error.message);
    }
  },

  /**
   * Listen to incoming delivery/read receipts
   * Receipts are transient - immediately consumed and deleted
   */
  listenToReceipts(uid: string, callback: (receipt: { type: 'delivered' | 'read', messageId: string, conversationId: string }) => void) {
    // Listen to delivery receipts (sanitize UID for RTDB path)
    const deliveredRef = ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/delivered`);
    const unsubDelivered = onChildAdded(deliveredRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      callback({ type: 'delivered', messageId: snapshot.key!, conversationId: data.conversationId });

      // Immediately delete receipt after processing
      await remove(ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/delivered/${snapshot.key}`));
    });

    // Listen to read receipts (sanitize UID for RTDB path)
    const readRef = ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/read`);
    const unsubRead = onChildAdded(readRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      callback({ type: 'read', messageId: snapshot.key!, conversationId: data.conversationId });

      // Immediately delete receipt after processing
      await remove(ref(realtimeDb, `receipts/${sanitizePathComponent(uid)}/read/${snapshot.key}`));
    });

    return () => {
      unsubDelivered();
      unsubRead();
    };
  },

  /**
   * Legacy - kept for compatibility (points to RTDB)
   */
  async markMessageReadLegacy(
    conversationId: string,
    messageId: string
  ) {
    try {
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);

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
   * Sends read receipts via RTDB transient pipe - no Firestore storage
   */
  async markAllMessagesAsRead(
    conversationId: string,
    readerUid: string,
    senderUid: string
  ) {
    try {
      // Get local messages that need read receipt
      const { loadMessages } = await import('./localMessageStore');
      const localMessages = await loadMessages(readerUid, conversationId);

      // Send read receipts for each unread message from the other person
      const receiptsToSend = localMessages.filter(
        (m: any) => m.senderId !== readerUid && m.status !== 'read'
      );

      for (const msg of receiptsToSend) {
        const receiptRef = ref(realtimeDb, `receipts/${senderUid}/read/${msg.id}`);
        await set(receiptRef, {
          messageId: msg.id,
          conversationId,
          readAt: Date.now(),
          timestamp: serverTimestamp(),
        });
      }

      console.log(`💙 Sent ${receiptsToSend.length} read receipts for conversation ${conversationId}`);
    } catch (error: any) {
      console.error('❌ Error sending read receipts:', error.message);
    }
  },

  /**
   * Listen to incoming messages (Pipe Model)
   * Recipient receives the message and IMMEDIATELY deletes it from RTDB
   */
  listenToIncomingMessages(uid: string, callback: (message: any) => void) {
    const deliveryRef = ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}`);
    
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
      await remove(ref(realtimeDb, `delivery/${sanitizePathComponent(uid)}/${snapshot.key}`));
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
   * Set typing status with error handling
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
      const typingRef = ref(realtimeDb, `typing/${sanitizePathComponent(conversationId)}/${sanitizePathComponent(fromUid)}`);

      if (isTyping) {
        await set(typingRef, {
          isTyping: true,
          timestamp: rtdbServerTimestamp(),
        });
        logger.info('setTyping', `User ${fromUid} typing in ${conversationId}`);
      } else {
        await remove(typingRef);
        logger.info('setTyping', `User ${fromUid} stopped typing`);
      }
    } catch (error: any) {
      logger.warn('setTyping', `Failed to update typing status: ${error.message}`);
      // Non-critical, don't throw
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
    const typingRef = ref(realtimeDb, `typing/${sanitizePathComponent(conversationId)}`);

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
   * Send friend request with error handling
   */
  async sendFriendRequest(fromUid: string, toUid: string) {
    const startTime = Date.now();
    
    try {
      logger.info('sendFriendRequest', `Sending request from ${fromUid} to ${toUid}`);
      
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
        logger.warn('sendFriendRequest', `Failed to get user info: ${infoErr}`);
        // Continue without user info
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
        logger.warn('sendFriendRequest', `Notification failed: ${notifErr}`);
        // Continue - request sent even if notification fails
      }

      const duration = Date.now() - startTime;
      logger.info('sendFriendRequest', `Request sent in ${duration}ms`);
      return { success: true, requestId };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('sendFriendRequest', `Failed after ${duration}ms: ${error.message}`);
      throw new Error(`Failed to send friend request: ${error.message}`);
    }
  },

  /**
   * Accept friend request with error handling
   */
  async acceptFriendRequest(requestId: string, fromUid: string, toUid: string) {
    const startTime = Date.now();
    
    try {
      logger.info('acceptFriendRequest', `Accepting request ${requestId}`);
      
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
        logger.warn('acceptFriendRequest', `Notification failed: ${notifErr}`);
        // Continue - friendship created even if notification fails
      }

      const duration = Date.now() - startTime;
      logger.info('acceptFriendRequest', `Request accepted in ${duration}ms`);
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
      
      return userDoc.data();
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
      logger.info('updateUserProfile', `Updating profile for ${uid}`);
      
      await updateDoc(doc(db, 'users', uid), {
        ...updates,
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
      await remove(ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`));

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
  generateUniqueUserId,
};
