/**
 * Settings Persistence Layer
 * Manages app settings with multi-tier persistence:
 * 1. Capacitor Preferences (native Android shared preferences)
 * 2. Firebase backend (for cross-device sync)
 * 3. Local IndexedDB (fallback cache)
 */

import { Preferences } from '@capacitor/preferences';
import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import logger from './logger';

export interface AppSettings {
  // Notifications
  notifications: boolean;
  groupNotifications: boolean;
  callNotifications: boolean;
  notificationTone?: string;
  notificationVibrate?: boolean;
  
  // Privacy
  readReceipts: boolean;
  lastSeenVisibility?: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility?: 'everyone' | 'contacts' | 'nobody';
  
  // Chats
  enterSendsMessage: boolean;
  mediaAutoDownload: boolean;
  
  // Appearance
  theme: 'dark' | 'light';
  fontSize: 'small' | 'medium' | 'large';
  
  // Linked Devices
  linkedDevices?: LinkedDevice[];
  
  // Metadata
  lastSyncedAt?: Timestamp;
}

export interface LinkedDevice {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'desktop';
  platform?: string;
  lastActive: Timestamp;
  pushToken?: string;
}

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  groupNotifications: true,
  callNotifications: true,
  notificationTone: 'default',
  notificationVibrate: true,
  readReceipts: true,
  lastSeenVisibility: 'contacts',
  profilePhotoVisibility: 'contacts',
  enterSendsMessage: false,
  mediaAutoDownload: true,
  theme: 'dark',
  fontSize: 'medium',
  linkedDevices: [],
};

const SETTINGS_KEY = 'quidec_app_settings';
const DEVICE_ID_KEY = 'quidec_device_id';

/**
 * Initialize settings persistence layer
 * Call this on app startup to load and sync settings
 */
export async function initSettingsPersistence(uid: string): Promise<AppSettings> {
  try {
    // 1. Load from Capacitor Preferences (native storage)
    const { value: nativeSettings } = await Preferences.get({ key: SETTINGS_KEY });
    let settings = nativeSettings ? JSON.parse(nativeSettings) : { ...DEFAULT_SETTINGS };

    // 2. Sync with Firebase backend
    try {
      const settingsDoc = await getDoc(doc(db, 'users', uid, 'settings', 'config'));
      if (settingsDoc.exists()) {
        const remoteSettings = settingsDoc.data() as AppSettings;
        
        // Merge: remote settings override local if newer
        if (remoteSettings.lastSyncedAt && settings.lastSyncedAt) {
          if (remoteSettings.lastSyncedAt.toMillis() > settings.lastSyncedAt.toMillis()) {
            settings = { ...settings, ...remoteSettings };
          }
        } else if (remoteSettings.lastSyncedAt) {
          settings = { ...settings, ...remoteSettings };
        }
      }
    } catch (firebaseErr) {
      logger.warn('Settings', 'Failed to sync settings from Firebase', firebaseErr);
    }

    // 3. Save merged settings back to native storage
    await saveSettingsToNative(settings);

    return settings;
  } catch (error) {
    logger.error('Settings', 'Error initializing settings', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to Capacitor Preferences (native Android storage)
 */
export async function saveSettingsToNative(settings: AppSettings): Promise<void> {
  try {
    await Preferences.set({
      key: SETTINGS_KEY,
      value: JSON.stringify(settings),
    });
    logger.info('Settings', 'Settings saved to native storage');
  } catch (error) {
    logger.error('Settings', 'Failed to save settings to native storage', error);
  }
}

/**
 * Sync settings to Firebase backend
 */
export async function syncSettingsToFirebase(uid: string, settings: AppSettings): Promise<void> {
  try {
    const settingsRef = doc(db, 'users', uid, 'settings', 'config');
    const settingsToSync = {
      ...settings,
      lastSyncedAt: serverTimestamp(),
    };
    
    await setDoc(settingsRef, settingsToSync, { merge: true });
    logger.info('Settings', 'Settings synced to Firebase');
  } catch (error) {
    logger.error('Settings', 'Failed to sync settings to Firebase', error);
  }
}

/**
 * Update a single setting with multi-tier persistence
 */
export async function updateSetting<K extends keyof AppSettings>(
  uid: string,
  key: K,
  value: AppSettings[K]
): Promise<void> {
  try {
    // 1. Update in Preferences (local)
    const { value: currentValue } = await Preferences.get({ key: SETTINGS_KEY });
    const current = currentValue ? JSON.parse(currentValue) : { ...DEFAULT_SETTINGS };
    const updated = { ...current, [key]: value, lastSyncedAt: new Date() };
    
    await Preferences.set({
      key: SETTINGS_KEY,
      value: JSON.stringify(updated),
    });

    // 2. Sync to Firebase (async)
    syncSettingsToFirebase(uid, updated).catch(err => {
      logger.error('Settings', 'Failed to sync to Firebase', err);
    });
  } catch (error) {
    logger.error('Settings', `Failed to update setting ${String(key)}`, error);
  }
}

/**
 * Get a specific setting
 */
export async function getSetting<K extends keyof AppSettings>(
  key: K
): Promise<AppSettings[K] | undefined> {
  try {
    const { value } = await Preferences.get({ key: SETTINGS_KEY });
    if (!value) return DEFAULT_SETTINGS[key];
    
    const settings = JSON.parse(value) as AppSettings;
    return settings[key] ?? DEFAULT_SETTINGS[key];
  } catch (error) {
    logger.error('Settings', `Failed to get setting ${String(key)}`, error);
    return DEFAULT_SETTINGS[key];
  }
}

/**
 * Clear all settings (on logout)
 */
export async function clearSettings(): Promise<void> {
  try {
    await Preferences.remove({ key: SETTINGS_KEY });
    logger.info('Settings', 'Settings cleared');
  } catch (error) {
    logger.error('Settings', 'Failed to clear settings', error);
  }
}

/**
 * Get or create device ID for linked devices tracking
 */
export async function getOrCreateDeviceId(): Promise<string> {
  try {
    let { value: deviceId } = await Preferences.get({ key: DEVICE_ID_KEY });
    
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await Preferences.set({
        key: DEVICE_ID_KEY,
        value: deviceId,
      });
    }
    
    return deviceId;
  } catch (error) {
    logger.error('Settings', 'Failed to get/create device ID', error);
    return `device_${Date.now()}`;
  }
}

/**
 * Register current device as a linked device
 */
export async function registerLinkedDevice(
  uid: string,
  deviceName: string,
  deviceType: 'web' | 'mobile' | 'desktop' = 'mobile'
): Promise<LinkedDevice> {
  try {
    const deviceId = await getOrCreateDeviceId();
    
    const device: LinkedDevice = {
      id: deviceId,
      name: deviceName,
      type: deviceType,
      lastActive: serverTimestamp() as any,
    };

    // Add to Firebase
    const devicesRef = doc(db, 'users', uid, 'linkedDevices', deviceId);
    await setDoc(devicesRef, device);

    logger.info('Settings', `Device registered: ${deviceName}`);
    return device;
  } catch (error) {
    logger.error('Settings', 'Failed to register device', error);
    throw error;
  }
}

/**
 * Unregister/logout a linked device
 */
export async function unregisterLinkedDevice(uid: string, deviceId: string): Promise<void> {
  try {
    const devicesRef = doc(db, 'users', uid, 'linkedDevices', deviceId);
    await setDoc(devicesRef, { active: false }, { merge: true });
    logger.info('Settings', `Device unregistered: ${deviceId}`);
  } catch (error) {
    logger.error('Settings', 'Failed to unregister device', error);
  }
}
