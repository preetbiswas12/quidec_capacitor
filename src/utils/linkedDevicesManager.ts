/**
 * Linked Devices Manager
 * Manages cross-device sessions, web logins, and device synchronization
 */

import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { Preferences } from '@capacitor/preferences';

export interface DeviceSession {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'web' | 'mobile' | 'desktop';
  platform?: string; // iOS, Android, Chrome, Firefox, Safari
  pushToken?: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivity: Timestamp;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  isActive: boolean;
  isTrusted: boolean;
}

export interface DeviceSyncRequest {
  fromDeviceId: string;
  toDeviceId: string;
  type: 'chat-sync' | 'settings-sync' | 'call-log-sync' | 'media-sync';
  payload?: any;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Timestamp;
}

const DEVICE_ID_KEY = 'quidec_device_id';
const DEVICE_NAME_KEY = 'quidec_device_name';

/**
 * Get or create current device ID and name
 */
export async function getCurrentDevice(): Promise<{ id: string; name: string }> {
  try {
    let { value: deviceId } = await Preferences.get({ key: DEVICE_ID_KEY });
    let { value: deviceName } = await Preferences.get({ key: DEVICE_NAME_KEY });

    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await Preferences.set({ key: DEVICE_ID_KEY, value: deviceId });
    }

    if (!deviceName) {
      deviceName = await generateDeviceName();
      await Preferences.set({ key: DEVICE_NAME_KEY, value: deviceName });
    }

    return { id: deviceId, name: deviceName };
  } catch (error) {
    console.error('❌ Failed to get current device:', error);
    return {
      id: `device_${Date.now()}`,
      name: 'Unknown Device',
    };
  }
}

/**
 * Generate a friendly device name
 */
async function generateDeviceName(): Promise<string> {
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();

    if (info.platform === 'web') {
      const browserName = detectBrowser();
      return `${browserName} on ${navigator.platform}`;
    }

    return `${info.model} (${info.osVersion})`;
  } catch (error) {
    return `Device ${Date.now()}`;
  }
}

/**
 * Detect browser name from user agent
 */
function detectBrowser(): string {
  const ua = navigator.userAgent;

  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('Opera')) return 'Opera';

  return 'Browser';
}

/**
 * Register/create a new device session
 */
export async function createDeviceSession(
  uid: string,
  deviceType: 'web' | 'mobile' | 'desktop' = 'mobile',
  pushToken?: string
): Promise<DeviceSession> {
  try {
    const { id: deviceId, name: deviceName } = await getCurrentDevice();

    const session: DeviceSession = {
      id: deviceId,
      userId: uid,
      deviceId,
      deviceName,
      deviceType,
      lastActivity: serverTimestamp() as any,
      createdAt: serverTimestamp() as any,
      isActive: true,
      isTrusted: false,
    };

    if (pushToken) {
      session.pushToken = pushToken;
    }

    const sessionRef = doc(db, 'users', uid, 'deviceSessions', deviceId);
    await setDoc(sessionRef, session);

    console.log(`✅ Device session created: ${deviceName}`);
    return session;
  } catch (error) {
    console.error('❌ Failed to create device session:', error);
    throw error;
  }
}

/**
 * Update device last activity timestamp
 */
export async function updateDeviceActivity(uid: string, deviceId: string): Promise<void> {
  try {
    const sessionRef = doc(db, 'users', uid, 'deviceSessions', deviceId);
    await updateDoc(sessionRef, {
      lastActivity: serverTimestamp(),
    });
  } catch (error) {
    console.warn('⚠️ Failed to update device activity:', error);
  }
}

/**
 * Get all active device sessions for user
 */
export async function getDeviceSessions(uid: string): Promise<DeviceSession[]> {
  try {
    const sessionsRef = collection(db, 'users', uid, 'deviceSessions');
    const q = query(sessionsRef, where('isActive', '==', true));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => doc.data() as DeviceSession);
  } catch (error) {
    console.error('❌ Failed to get device sessions:', error);
    return [];
  }
}

/**
 * Mark device as trusted
 */
export async function trustDevice(uid: string, deviceId: string): Promise<void> {
  try {
    const sessionRef = doc(db, 'users', uid, 'deviceSessions', deviceId);
    await updateDoc(sessionRef, {
      isTrusted: true,
      lastActivity: serverTimestamp(),
    });

    console.log(`✅ Device marked as trusted: ${deviceId}`);
  } catch (error) {
    console.error('❌ Failed to trust device:', error);
  }
}

/**
 * Logout/revoke device session
 */
export async function logoutDevice(uid: string, deviceId: string): Promise<void> {
  try {
    const sessionRef = doc(db, 'users', uid, 'deviceSessions', deviceId);
    await updateDoc(sessionRef, {
      isActive: false,
      lastActivity: serverTimestamp(),
    });

    console.log(`✅ Device logged out: ${deviceId}`);
  } catch (error) {
    console.error('❌ Failed to logout device:', error);
  }
}

/**
 * Delete a device session permanently
 */
export async function deleteDeviceSession(uid: string, deviceId: string): Promise<void> {
  try {
    const sessionRef = doc(db, 'users', uid, 'deviceSessions', deviceId);
    await deleteDoc(sessionRef);

    console.log(`✅ Device session deleted: ${deviceId}`);
  } catch (error) {
    console.error('❌ Failed to delete device session:', error);
  }
}

/**
 * Logout all other devices
 */
export async function logoutAllOtherDevices(uid: string, currentDeviceId: string): Promise<void> {
  try {
    const sessions = await getDeviceSessions(uid);

    const promises = sessions
      .filter(session => session.deviceId !== currentDeviceId)
      .map(session => logoutDevice(uid, session.deviceId));

    await Promise.all(promises);
    console.log(`✅ Logged out all other devices`);
  } catch (error) {
    console.error('❌ Failed to logout all other devices:', error);
  }
}

/**
 * Listen to device sessions in real-time
 */
export function listenToDeviceSessions(
  uid: string,
  callback: (sessions: DeviceSession[]) => void
): (() => void) {
  try {
    const sessionsRef = collection(db, 'users', uid, 'deviceSessions');
    const q = query(sessionsRef, where('isActive', '==', true));

    const unsubscribe = onSnapshot(q, snapshot => {
      const sessions = snapshot.docs.map(doc => doc.data() as DeviceSession);
      callback(sessions);
    });

    return unsubscribe;
  } catch (error) {
    console.error('❌ Failed to listen to device sessions:', error);
    return () => {};
  }
}

/**
 * Send data sync request to other device
 */
export async function sendDeviceSyncRequest(
  uid: string,
  toDeviceId: string,
  syncType: DeviceSyncRequest['type'],
  payload?: any
): Promise<void> {
  try {
    const { id: fromDeviceId } = await getCurrentDevice();

    const syncRequest: DeviceSyncRequest = {
      fromDeviceId,
      toDeviceId,
      type: syncType,
      payload,
      status: 'pending',
      timestamp: serverTimestamp() as any,
    };

    const requestRef = doc(
      db,
      'users',
      uid,
      'syncRequests',
      `${fromDeviceId}_${toDeviceId}_${Date.now()}`
    );

    await setDoc(requestRef, syncRequest);
    console.log(`✅ Sync request sent to device: ${toDeviceId}`);
  } catch (error) {
    console.error('❌ Failed to send sync request:', error);
  }
}

/**
 * Listen to incoming sync requests
 */
export function listenToSyncRequests(
  uid: string,
  callback: (requests: DeviceSyncRequest[]) => void
): (() => void) {
  let unsubscribeInner: (() => void) | null = null;
  let cancelled = false;

  try {
    getCurrentDevice().then(({ id: currentDeviceId }) => {
      if (cancelled) return;
      const requestsRef = collection(db, 'users', uid, 'syncRequests');
      const q = query(
        requestsRef,
        where('toDeviceId', '==', currentDeviceId),
        where('status', '==', 'pending')
      );

      unsubscribeInner = onSnapshot(q, snapshot => {
        const requests = snapshot.docs.map(doc => doc.data() as DeviceSyncRequest);
        callback(requests);
      });
    }).catch(err => {
      if (!cancelled) {
        console.error('❌ Failed to setup sync request listener:', err);
      }
    });
  } catch (error) {
    console.error('❌ Failed to listen to sync requests:', error);
  }

  return () => {
    cancelled = true;
    if (unsubscribeInner) {
      unsubscribeInner();
    }
  };
}

/**
 * Mark sync request as completed
 */
export async function completeSyncRequest(
  uid: string,
  requestId: string,
  payload?: any
): Promise<void> {
  try {
    const requestRef = doc(db, 'users', uid, 'syncRequests', requestId);
    await updateDoc(requestRef, {
      status: 'completed',
      payload,
      timestamp: serverTimestamp(),
    });

    console.log(`✅ Sync request completed: ${requestId}`);
  } catch (error) {
    console.error('❌ Failed to complete sync request:', error);
  }
}

/**
 * Get device by ID
 */
export async function getDevice(uid: string, deviceId: string): Promise<DeviceSession | null> {
  try {
    const sessionRef = doc(db, 'users', uid, 'deviceSessions', deviceId);
    const snapshot = await getDocs(query(collection(db, 'users', uid, 'deviceSessions')));

    const session = snapshot.docs.find(doc => doc.id === deviceId)?.data();
    return session ? (session as DeviceSession) : null;
  } catch (error) {
    console.error('❌ Failed to get device:', error);
    return null;
  }
}

/**
 * Check if current device is trusted
 */
export async function isCurrentDeviceTrusted(uid: string): Promise<boolean> {
  try {
    const { id: deviceId } = await getCurrentDevice();
    const device = await getDevice(uid, deviceId);

    return device?.isTrusted ?? false;
  } catch (error) {
    console.error('❌ Failed to check device trust status:', error);
    return false;
  }
}

/**
 * Request remote session termination from another device
 */
export async function requestRemoteLogout(
  uid: string,
  targetDeviceId: string,
  reason?: string
): Promise<void> {
  try {
    await sendDeviceSyncRequest(uid, targetDeviceId, 'chat-sync', {
      action: 'logout',
      reason,
    });

    console.log(`✅ Remote logout request sent to device: ${targetDeviceId}`);
  } catch (error) {
    console.error('❌ Failed to request remote logout:', error);
  }
}
