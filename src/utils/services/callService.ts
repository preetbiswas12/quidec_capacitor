/**
 * Call Service
 * Handles call history and incoming call listeners.
 */

import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
  where,
} from 'firebase/firestore';
import { db, realtimeDb } from '../firebase';

export const callService = {
  /**
   * Save a call record to Firestore call history.
   * Stores in users/{uid}/callHistory/{callId} so each user has their own history.
   */
  async saveCallRecord(uid: string, callData: {
    callId: string;
    contactId: string;
    contactName: string;
    contactAvatar?: string;
    type: 'voice' | 'video';
    direction: 'incoming' | 'outgoing' | 'missed';
    duration?: number;
    timestamp?: any;
  }) {
    try {
      const record: any = {
        uid: uid,
        callId: callData.callId,
        contactId: callData.contactId,
        contactName: callData.contactName,
        contactAvatar: callData.contactAvatar || null,
        type: callData.type,
        direction: callData.direction,
        duration: callData.duration || 0,
        // Always use serverTimestamp for consistent Firestore ordering
        timestamp: serverTimestamp(),
      };
      const ref = doc(db, 'users', uid, 'callHistory', callData.callId);
      await setDoc(ref, record);
      console.log(`✅ Call record saved: ${callData.callId} → users/${uid}/callHistory`);
    } catch (error: any) {
      console.error('❌ Error saving call record:', error.message, error.code);
      // Re-throw so callers know it failed (they can decide to silence)
      throw error;
    }
  },

  /**
   * Fetch call history for a user (most recent first).
   */
  async getCallHistory(uid: string, limitCount: number = 50) {
    try {
      const q = query(
        collection(db, 'users', uid, 'callHistory'),
        orderBy('timestamp', 'desc'),
        limit(limitCount),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error: any) {
      console.error('❌ Error fetching call history:', error.message);
      return [];
    }
  },

  /**
   * Listen to call history in real-time.
   */
  listenToCallHistory(uid: string, callback: (records: any[]) => void) {
    console.log(`📞 Setting up call history listener for ${uid}`);
    const q = query(
      collection(db, 'users', uid, 'callHistory'),
      orderBy('timestamp', 'desc'),
      limit(100),
    );

    return onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.log(`📞 Call history snapshot: ${records.length} records for ${uid}`);
      callback(records);
    }, (err) => {
      // Firestore often requires a composite index for subcollection queries — log a hint
      if (err.code === 'failed-precondition' || err.message?.includes('index')) {
        console.error('🔥 Firestore index required for call history! Create an index for collection "callHistory" with field "timestamp" DESC. See: https://console.firebase.google.com/_/firestore/index-composite');
      }
      console.error('❌ Error listening to call history:', err.code, err.message);
      callback([]);
    });
  },

  /**
   * Listen for incoming calls (ringing) directed at the current user.
   * Watches the top-level `calls` collection for documents where receiverId == uid and status == 'ringing'.
   */
  listenToIncomingCalls(uid: string, callback: (call: any | null) => void) {
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', uid),
      where('status', '==', 'ringing'),
    );

    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      // Return the most recent ringing call
      const calls: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      calls.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      callback(calls[0]);
    }, (err) => {
      console.error('❌ Error listening to incoming calls:', err);
      callback(null);
    });
  },

  /**
   * Delete a call record from history.
   */
  async deleteCallRecord(uid: string, callId: string) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'callHistory', callId));
    } catch (error: any) {
      console.error('❌ Error deleting call record:', error.message);
    }
  },

  /**
   * Clear all call history for a user.
   */
  async clearCallHistory(uid: string) {
    try {
      const q = query(collection(db, 'users', uid, 'callHistory'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`🧹 Cleared ${snapshot.size} call records for ${uid}`);
    } catch (error: any) {
      console.error('❌ Error clearing call history:', error.message);
    }
  },
};