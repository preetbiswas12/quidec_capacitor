import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, set, onChildAdded, remove, get } from 'firebase/database';
import { db, realtimeDb } from './firebase';
import { sanitizePathComponent } from './services/shared';
import logger from './logger';

export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';

export interface CallSession {
  callId: string;
  callerId: string;
  receiverId: string;
  callerName?: string;
  callerAvatar?: string;
  status: CallStatus;
  callType: 'voice' | 'video';
  startTime?: number;
  endTime?: number;
  timestamp: number;
  duration?: number;
}

export class FirebaseCallManager {
  private firestore = db;
  private unsubscribers: Map<string, Unsubscribe> = new Map();
  private debug: boolean = false;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  private log(message: string, data?: any) {
    if (this.debug) {
      logger.debug('FirebaseCallManager', message, data);
    }
  }

  private error(message: string, err?: any) {
    logger.error('FirebaseCallManager', message, err);
  }

  /**
   * Initiate a call - create ringing document in Firestore
   * User B receives real-time notification via onSnapshot
   */
  async initiateCall(
    callId: string,
    callerId: string,
    receiverId: string,
    options?: {
      callerName?: string;
      callerAvatar?: string;
      callType?: 'voice' | 'video';
    }
  ): Promise<void> {
    try {
      this.log(`📞 Initiating call: ${callId}`);

      const callData: CallSession = {
        callId,
        callerId,
        receiverId,
        callerName: options?.callerName,
        callerAvatar: options?.callerAvatar,
        callType: options?.callType || 'video',
        status: 'ringing',
        timestamp: Date.now(),
      };

      await setDoc(doc(this.firestore, 'calls', callId), callData);

      // Also write to RTDB for fast delivery (transient pipe — receiver deletes on consume)
      const rtdbRef = ref(realtimeDb, `calls/${sanitizePathComponent(receiverId)}/${callId}`);
      await set(rtdbRef, {
        ...callData,
        timestamp: Date.now(),
      });

      this.log(`✅ Call initiated: ${callId}`);
    } catch (err) {
      this.error('Failed to initiate call', err);
      throw err;
    }
  }

  /**
   * Accept an incoming call - update call status to 'accepted'
   * Triggers PeerJS connection on BOTH devices
   */
  async acceptCall(callId: string): Promise<void> {
    try {
      this.log(`✅ Accepting call: ${callId}`);

      await updateDoc(doc(this.firestore, 'calls', callId), {
        status: 'accepted',
        startTime: Date.now(),
      });

      // Clean up RTDB signaling node if it exists
      // Note: receiverId not available here, so we clean up lazily via TTL or caller cleanup
      this.log(`✅ Call accepted: ${callId}`);
    } catch (err) {
      this.error('Failed to accept call', err);
      throw err;
    }
  }

  /**
   * Reject an incoming call
   */
  async rejectCall(callId: string): Promise<void> {
    try {
      this.log(`❌ Rejecting call: ${callId}`);

      await updateDoc(doc(this.firestore, 'calls', callId), {
        status: 'rejected',
        endTime: Date.now(),
      });

      this.log(`✅ Call rejected: ${callId}`);
    } catch (err) {
      this.error('Failed to reject call', err);
      throw err;
    }
  }

  /**
   * End an active call - clean up Firestore document
   */
  async endCall(callId: string): Promise<void> {
    try {
      this.log(`📵 Ending call: ${callId}`);

      const callRef = doc(this.firestore, 'calls', callId);
      const callSnap = await getDoc(callRef);

      if (callSnap.exists()) {
        const callData = callSnap.data() as CallSession;
        const duration = callData.startTime
          ? Date.now() - callData.startTime
          : 0;

        await updateDoc(callRef, {
          status: 'ended',
          endTime: Date.now(),
          duration: Math.floor(duration / 1000), // Convert to seconds
        });
      }

      // Clean up listener for this call
      if (this.unsubscribers.has(callId)) {
        this.unsubscribers.get(callId)?.();
        this.unsubscribers.delete(callId);
      }

      // Delete call document after 5 seconds to allow cleanup
      setTimeout(() => {
        deleteDoc(callRef).catch((err) =>
          this.error('Failed to delete call document', err)
        );
      }, 5000);

      this.log(`✅ Call ended: ${callId}`);
    } catch (err) {
      this.error('Failed to end call', err);
      throw err;
    }
  }

  /**
   * Mark call as missed (caller hung up before receiver answered)
   */
  async markCallAsMissed(callId: string): Promise<void> {
    try {
      this.log(`⏭️ Marking call as missed: ${callId}`);

      await updateDoc(doc(this.firestore, 'calls', callId), {
        status: 'missed',
        endTime: Date.now(),
      });

      this.log(`✅ Call marked as missed: ${callId}`);
    } catch (err) {
      this.error('Failed to mark call as missed', err);
      throw err;
    }
  }

  /**
   * Listen to call status changes in real-time
   * Returns unsubscriber function
   */
  listenToCall(
    callId: string,
    callback: (callData: CallSession | null) => void
  ): () => void {
    try {
      this.log(`👂 Listening to call: ${callId}`);

      const unsubscribe = onSnapshot(
        doc(this.firestore, 'calls', callId),
        (snapshot) => {
          if (snapshot.exists()) {
            const callData = snapshot.data() as CallSession;
            this.log(`📡 Call status update: ${callId} → ${callData.status}`);
            callback(callData);
          } else {
            this.log(`📄 Call document deleted: ${callId}`);
            callback(null);
          }
        },
        (err) => {
          this.error('Error listening to call', err);
          callback(null);
        }
      );

      // Store unsubscriber for cleanup
      this.unsubscribers.set(callId, unsubscribe);

      // Return unsubscribe function
      return () => {
        unsubscribe();
        this.unsubscribers.delete(callId);
      };
    } catch (err) {
      this.error('Failed to listen to call', err);
      return () => {};
    }
  }

  /**
   * Get a specific call document (one-time read)
   */
  async getCall(callId: string): Promise<CallSession | null> {
    try {
      const snapshot = await getDoc(doc(this.firestore, 'calls', callId));
      return snapshot.exists() ? (snapshot.data() as CallSession) : null;
    } catch (err) {
      this.error('Failed to get call', err);
      return null;
    }
  }

  /**
   * Get all active calls for a user (ringing or accepted)
   */
  async getActiveCalls(userId: string): Promise<CallSession[]> {
    try {
      const q = query(
        collection(this.firestore, 'calls'),
        where('receiverId', '==', userId),
        where('status', 'in', ['ringing', 'accepted'])
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => doc.data() as CallSession);
    } catch (err) {
      this.error('Failed to get active calls', err);
      return [];
    }
  }

  /**
   * Get call history for a user
   */
  async getCallHistory(userId: string, limit: number = 50): Promise<CallSession[]> {
    try {
      const q = query(
        collection(this.firestore, 'calls'),
        where('callerId', '==', userId),
        where('status', 'in', ['ended', 'missed', 'rejected'])
      );

      const snapshot = await getDocs(q);
      return snapshot.docs
        .map((doc) => doc.data() as CallSession)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (err) {
      this.error('Failed to get call history', err);
      return [];
    }
  }

  /**
   * Clean up all listeners
   */
  cleanup(): void {
    this.log('🧹 Cleaning up all Firestore listeners');
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
  }
}

// Export singleton instance
export const firebaseCallManager = new FirebaseCallManager(false);
export default firebaseCallManager;
