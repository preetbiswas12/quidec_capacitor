/**
 * Authentication Service
 * Handles user registration, login, logout, email verification, and profile updates.
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
} from 'firebase/auth';
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { ref, set, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { db, auth, realtimeDb, getFCMToken } from '../firebase';
import { validateEmail, validatePassword, validateUsername, loginLimiter, registerLimiter } from '../validators';
import logger from '../logger';
import { sanitizePathComponent, getCustomUsernameByFirebaseUid, generateUniqueUserId } from './shared';
import { setUserContext, clearUserContext } from '../errorMonitoring';

// Re-export from shared for barrel
export { sanitizePathComponent, getCustomUsernameByFirebaseUid, generateUniqueUserId, generateUserIdSync } from './shared';

export const authService = {
  async registerUser(email: string, username: string, password: string) {
    const errors: Record<string, string> = {};

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

    if (Object.keys(errors).length > 0) {
      return { success: false, errors, message: 'Please fix the errors above' };
    }

    try {
      await registerLimiter.checkLimit(email);
    } catch (err: any) {
      return { success: false, errors: { submit: err.message }, message: 'Too many registration attempts' };
    }

    try {
      if (auth.currentUser) {
        try { await signOut(auth); } catch (_) {}
      }
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const generatedUserId = await generateUniqueUserId(username);

      await updateProfile(user, { displayName: generatedUserId });
      await sendEmailVerification(user);

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
        fcmToken: null,
      });

      await set(ref(realtimeDb, `presence/${sanitizePathComponent(user.uid)}`), {
        online: false,
        lastSeen: rtdbServerTimestamp(),
        username,
      });

      await setDoc(doc(db, 'friendships', generatedUserId), {
        uid: user.uid,
        friends: [],
        blockedUsers: [],
        createdAt: serverTimestamp(),
      });

      setUserContext(user.uid, generatedUserId, email);

      console.log(`✅ User registered: ${username}`);
      return { success: true, user, uid: user.uid, username: generatedUserId, message: 'Please check your email to verify your account' };
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

      return { success: false, errors: registerErrors, message: 'Registration failed' };
    }
  },

  async loginUser(email: string, password: string) {
    const errors: Record<string, string> = {};

    try {
      validateEmail(email);
    } catch (err: any) {
      errors.email = err.message;
      return { success: false, emailVerified: null, errors, message: 'Invalid email' };
    }

    try {
      await loginLimiter.checkLimit(email);
    } catch (err: any) {
      return { success: false, emailVerified: null, errors: { submit: err.message }, message: 'Too many login attempts' };
    }

    try {
      await setPersistence(auth, browserLocalPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        console.warn('⚠️ User email not verified');
        return { success: false, emailVerified: false, message: 'Please verify your email before logging in', user };
      }

      const customUsername = await getCustomUsernameByFirebaseUid(user.uid);

      if (!customUsername) {
        console.error('❌ Custom username not found for Firebase UID:', user.uid);
        return { success: false, message: 'User profile not found. Please re-register.', user };
      }

      await set(ref(realtimeDb, `presence/${sanitizePathComponent(user.uid)}`), {
        online: true,
        lastSeen: rtdbServerTimestamp(),
        username: customUsername,
      });

      await setDoc(doc(db, 'users', customUsername), {
        isOnline: true,
        lastSeen: serverTimestamp(),
        emailVerified: true,
      }, { merge: true });

      try {
        const fcmToken = await getFCMToken();
        if (fcmToken) {
          await setDoc(doc(db, 'users', customUsername), { fcmToken }, { merge: true });
          console.log('✅ FCM token saved');
        }
      } catch (fcmErr) {
        console.warn('⚠️ FCM token setup skipped:', fcmErr);
      }

      setUserContext(user.uid, customUsername, user.email || undefined);

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

      return { success: false, emailVerified: null, errors: loginErrors, message: 'Login failed' };
    }
  },

  async resendEmailVerification() {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');
    if (user.emailVerified) throw new Error('Email is already verified');
    await sendEmailVerification(user);
    return { success: true, message: 'Verification email sent' };
  },

  async sendPasswordReset(email: string) {
    await sendPasswordResetEmail(auth, email);
    return { success: true, message: 'Password reset email sent' };
  },

  async sendEmailChangeVerification(newEmail: string) {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');
    await verifyBeforeUpdateEmail(user, newEmail);
    return { success: true, message: `Verification email sent to ${newEmail}` };
  },

  async reloadUser() {
    const user = auth.currentUser;
    if (user) {
      try {
        await user.reload();
        return user;
      } catch (err: any) {
        if (err.code === 'auth/user-token-expired' || err.code === 'auth/user-disabled') {
          logger.warn('authService', `Token expired or user disabled, signing out: ${err.code}`);
          await signOut(auth);
          return null;
        }
        throw err;
      }
    }
    return null;
  },

  async updateUserEmailVerified(uid: string) {
    const customUsername = await getCustomUsernameByFirebaseUid(uid);
    if (customUsername) {
      await setDoc(doc(db, 'users', customUsername), { emailVerified: true, updatedAt: serverTimestamp() }, { merge: true });
    }
  },

  async logoutUser() {
    const user = auth.currentUser;
    if (user) {
      try {
        const customUsername = await getCustomUsernameByFirebaseUid(user.uid);
        await set(ref(realtimeDb, `presence/${sanitizePathComponent(user.uid)}`), {
          online: false,
          lastSeen: rtdbServerTimestamp(),
          username: customUsername || user.displayName || user.email,
        });
        if (customUsername) {
          await setDoc(doc(db, 'users', customUsername), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true });
        }
      } catch (presenceErr) {
        logger.warn('logoutUser', `Failed to update presence: ${presenceErr}`);
      }
    }
    await signOut(auth);
    clearUserContext();
    return { success: true };
  },

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

  async updateUserProfile(updates: { name?: string; avatar?: string | null; about?: string; userId: string }) {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user');

    const firestoreUpdates: any = { 
      updatedAt: serverTimestamp(),
      uid: user.uid,  // Always include uid for create/update rule compliance
    };
    if (updates.name) {
      firestoreUpdates.displayName = updates.name;
      await updateProfile(user, { displayName: updates.name });
    }
    if (updates.avatar !== undefined) firestoreUpdates.photoURL = updates.avatar;
    if (updates.about !== undefined) firestoreUpdates.about = updates.about;

    await setDoc(doc(db, 'users', updates.userId), firestoreUpdates, { merge: true });
    return { success: true };
  },

  async migrateToHandleIds() {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    let migratedCount = 0;

    for (const userDoc of snapshot.docs) {
      const id = userDoc.id;
      const data = userDoc.data();
      if (id.length > 20 && !id.includes('.') && data.username) {
        await setDoc(doc(db, 'users', data.username), data);
        await deleteDoc(doc(db, 'users', id));
        migratedCount++;
      }
    }
    return { success: true, migratedCount };
  },

  async migrateDotToUnderscoreUserIds() {
    const migratedUsers: string[] = [];
    const migratedFriendships: string[] = [];

    // Migrate users collection
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    for (const userDoc of usersSnapshot.docs) {
      const oldId = userDoc.id;
      if (!oldId.includes('.') || oldId === 'system_config') continue;

      const newId = oldId.replace(/\./g, '_');
      const data = { ...userDoc.data(), username: newId };

      await setDoc(doc(db, 'users', newId), data);
      await deleteDoc(doc(db, 'users', oldId));
      migratedUsers.push(`${oldId} → ${newId}`);
    }

    // Migrate friendships collection
    const friendshipsRef = collection(db, 'friendships');
    const friendshipsSnapshot = await getDocs(friendshipsRef);
    for (const fsDoc of friendshipsSnapshot.docs) {
      const oldId = fsDoc.id;
      if (!oldId.includes('.')) continue;

      const newId = oldId.replace(/\./g, '_');
      await setDoc(doc(db, 'friendships', newId), fsDoc.data());
      await deleteDoc(doc(db, 'friendships', oldId));
      migratedFriendships.push(`${oldId} → ${newId}`);
    }

    return {
      success: true,
      migratedUsers: migratedUsers.length,
      migratedFriendships: migratedFriendships.length,
      details: { users: migratedUsers, friendships: migratedFriendships },
    };
  },

  async cleanupDuplicateUsers() {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    const deletePromises = [];
    let deletedCount = 0;

    for (const userDoc of snapshot.docs) {
      const id = userDoc.id;
      if (id.startsWith('@') || (id.length < 20 && !id.includes('_') && id !== 'system_config')) {
        deletePromises.push(deleteDoc(doc(db, 'users', id)));
        deletedCount++;
      }
    }
    await Promise.all(deletePromises);
    return { success: true, deletedCount };
  },

  async wipeDatabase() {
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
    }
    return { success: true, totalDeleted };
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },
};