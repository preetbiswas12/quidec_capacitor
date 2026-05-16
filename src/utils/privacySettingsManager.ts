/**
 * Privacy & Account Settings Manager
 * Manages privacy settings, security, and account preferences
 * Syncs with Firebase backend for cross-device consistency
 */

import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import logger from './logger';

export interface PrivacySettings {
  lastSeenVisibility: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility: 'everyone' | 'contacts' | 'nobody';
  statusVisibility: 'everyone' | 'contacts' | 'nobody';
  readReceipts: boolean;
  typingIndicator: boolean;
  disappearingMessages: boolean;
  defaultDisappearingTime: number; // in seconds (0 = off)
  allowCallsFrom: 'everyone' | 'contacts' | 'nobody';
  groupsAutoDownloadMedia: boolean;
  encryptionEnabled: boolean;
}

export interface AccountSecuritySettings {
  twoFactorEnabled: boolean;
  passwordHash?: string;
  biometricEnabled: boolean;
  sessionTimeout: number; // in seconds
  lastPasswordChangeDate?: Date;
  recoveryEmail?: string;
  trustedDevices: string[];
  twoFactorPin?: string; // 6-digit PIN
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  lastSeenVisibility: 'contacts',
  profilePhotoVisibility: 'contacts',
  statusVisibility: 'contacts',
  readReceipts: true,
  typingIndicator: true,
  disappearingMessages: false,
  defaultDisappearingTime: 0,
  allowCallsFrom: 'contacts',
  groupsAutoDownloadMedia: true,
  encryptionEnabled: true,
};

export const DEFAULT_ACCOUNT_SECURITY_SETTINGS: AccountSecuritySettings = {
  twoFactorEnabled: false,
  biometricEnabled: false,
  sessionTimeout: 15 * 60 * 1000, // 15 minutes
  trustedDevices: [],
};

/**
 * Get privacy settings for user
 */
export async function getPrivacySettings(uid: string): Promise<PrivacySettings> {
  try {
    const privacyRef = doc(db, 'users', uid, 'settings', 'privacy');
    const privacyDoc = await getDoc(privacyRef);

    if (privacyDoc.exists()) {
      return { ...DEFAULT_PRIVACY_SETTINGS, ...privacyDoc.data() } as PrivacySettings;
    }

    // Initialize with defaults
    await setDoc(privacyRef, {
      ...DEFAULT_PRIVACY_SETTINGS,
      createdAt: serverTimestamp(),
    });

    return DEFAULT_PRIVACY_SETTINGS;
  } catch (error) {
    logger.error('Privacy', 'Failed to get privacy settings', error);
    return DEFAULT_PRIVACY_SETTINGS;
  }
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(
  uid: string,
  updates: Partial<PrivacySettings>
): Promise<void> {
  try {
    const privacyRef = doc(db, 'users', uid, 'settings', 'privacy');

    await updateDoc(privacyRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    logger.info('Privacy', 'Privacy settings updated');
  } catch (error) {
    logger.error('Privacy', 'Failed to update privacy settings', error);
    throw error;
  }
}

/**
 * Get account security settings
 */
export async function getAccountSecuritySettings(uid: string): Promise<AccountSecuritySettings> {
  try {
    const securityRef = doc(db, 'users', uid, 'settings', 'security');
    const securityDoc = await getDoc(securityRef);

    if (securityDoc.exists()) {
      return { ...DEFAULT_ACCOUNT_SECURITY_SETTINGS, ...securityDoc.data() } as AccountSecuritySettings;
    }

    // Initialize with defaults
    await setDoc(securityRef, {
      ...DEFAULT_ACCOUNT_SECURITY_SETTINGS,
      createdAt: serverTimestamp(),
    });

    return DEFAULT_ACCOUNT_SECURITY_SETTINGS;
  } catch (error) {
    logger.error('Privacy', 'Failed to get account security settings', error);
    return DEFAULT_ACCOUNT_SECURITY_SETTINGS;
  }
}

/**
 * Update account security settings
 */
export async function updateAccountSecuritySettings(
  uid: string,
  updates: Partial<AccountSecuritySettings>
): Promise<void> {
  try {
    const securityRef = doc(db, 'users', uid, 'settings', 'security');

    await updateDoc(securityRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    logger.info('Privacy', 'Account security settings updated');
  } catch (error) {
    logger.error('Privacy', 'Failed to update account security settings', error);
    throw error;
  }
}

/**
 * Enable/disable two-factor authentication
 */
export async function setTwoFactorAuth(uid: string, enabled: boolean): Promise<void> {
  try {
    await updateAccountSecuritySettings(uid, {
      twoFactorEnabled: enabled,
    });

    logger.info('Privacy', `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    logger.error('Privacy', 'Failed to update 2FA', error);
    throw error;
  }
}

/**
 * Set two-factor authentication PIN
 */
export async function setTwoFactorPin(uid: string, pin: string): Promise<void> {
  try {
    // In a real app, we should hash this PIN. For this demo, we'll store it as is (or with simple obfuscation)
    await updateAccountSecuritySettings(uid, {
      twoFactorPin: pin,
      twoFactorEnabled: true,
    });

    logger.info('Privacy', 'Two-factor PIN updated');
  } catch (error) {
    logger.error('Privacy', 'Failed to set 2FA PIN', error);
    throw error;
  }
}

/**
 * Verify two-factor authentication PIN
 */
export async function verifyTwoFactorPin(uid: string, pin: string): Promise<boolean> {
  try {
    const settings = await getAccountSecuritySettings(uid);
    return settings.twoFactorPin === pin;
  } catch (error) {
    logger.error('Privacy', 'Failed to verify 2FA PIN', error);
    return false;
  }
}

/**
 * Enable/disable biometric authentication
 */
export async function setBiometricAuth(uid: string, enabled: boolean): Promise<void> {
  try {
    await updateAccountSecuritySettings(uid, {
      biometricEnabled: enabled,
    });

    logger.info('Privacy', `Biometric authentication ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    logger.error('Privacy', 'Failed to update biometric auth', error);
    throw error;
  }
}

/**
 * Add device to trusted devices list
 */
export async function addTrustedDevice(uid: string, deviceId: string, deviceName: string): Promise<void> {
  try {
    const settings = await getAccountSecuritySettings(uid);
    const trustedDevices = settings.trustedDevices || [];

    if (!trustedDevices.includes(deviceId)) {
      trustedDevices.push(deviceId);

      await updateAccountSecuritySettings(uid, {
        trustedDevices,
      });

      logger.info('Privacy', `Device trusted: ${deviceName}`);
    }
  } catch (error) {
    logger.error('Privacy', 'Failed to add trusted device', error);
  }
}

/**
 * Remove device from trusted devices
 */
export async function removeTrustedDevice(uid: string, deviceId: string): Promise<void> {
  try {
    const settings = await getAccountSecuritySettings(uid);
    const trustedDevices = settings.trustedDevices?.filter(id => id !== deviceId) || [];

    await updateAccountSecuritySettings(uid, {
      trustedDevices,
    });

    logger.info('Privacy', 'Device removed from trusted list');
  } catch (error) {
    logger.error('Privacy', 'Failed to remove trusted device', error);
  }
}

/**
 * Create a block list for users
 */
export async function blockUser(uid: string, blockedUid: string): Promise<void> {
  try {
    const blockListRef = doc(db, 'users', uid, 'settings', 'blocklist');
    const blockListDoc = await getDoc(blockListRef);

    const blockedUsers = blockListDoc.exists() ? blockListDoc.data().users || [] : [];

    if (!blockedUsers.includes(blockedUid)) {
      blockedUsers.push(blockedUid);

      await setDoc(blockListRef, {
        users: blockedUsers,
        updatedAt: serverTimestamp(),
      });

      logger.info('Privacy', `User blocked: ${blockedUid}`);
    }
  } catch (error) {
    logger.error('Privacy', 'Failed to block user', error);
    throw error;
  }
}

/**
 * Unblock user
 */
export async function unblockUser(uid: string, blockedUid: string): Promise<void> {
  try {
    const blockListRef = doc(db, 'users', uid, 'settings', 'blocklist');
    const blockListDoc = await getDoc(blockListRef);

    if (blockListDoc.exists()) {
      const blockedUsers = blockListDoc.data().users?.filter((id: string) => id !== blockedUid) || [];

      await setDoc(blockListRef, {
        users: blockedUsers,
        updatedAt: serverTimestamp(),
      });

      logger.info('Privacy', `User unblocked: ${blockedUid}`);
    }
  } catch (error) {
    logger.error('Privacy', 'Failed to unblock user', error);
  }
}

/**
 * Get block list for user
 */
export async function getBlockList(uid: string): Promise<string[]> {
  try {
    const blockListRef = doc(db, 'users', uid, 'settings', 'blocklist');
    const blockListDoc = await getDoc(blockListRef);

    if (blockListDoc.exists()) {
      return blockListDoc.data().users || [];
    }

    return [];
  } catch (error) {
    logger.error('Privacy', 'Failed to get block list', error);
    return [];
  }
}

/**
 * Check if user is blocked
 */
export async function isUserBlocked(uid: string, targetUid: string): Promise<boolean> {
  try {
    const blockList = await getBlockList(uid);
    return blockList.includes(targetUid);
  } catch (error) {
    logger.error('Privacy', 'Failed to check if user is blocked', error);
    return false;
  }
}

/**
 * Enable disappearing messages
 */
export async function setDisappearingMessages(
  uid: string,
  enabled: boolean,
  timeoutSeconds: number = 24 * 60 * 60 // 24 hours default
): Promise<void> {
  try {
    await updatePrivacySettings(uid, {
      disappearingMessages: enabled,
      defaultDisappearingTime: enabled ? timeoutSeconds : 0,
    });

    logger.info('Privacy', `Disappearing messages ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    logger.error('Privacy', 'Failed to set disappearing messages', error);
    throw error;
  }
}

/**
 * Update typing indicator visibility
 */
export async function setTypingIndicator(uid: string, visible: boolean): Promise<void> {
  try {
    await updatePrivacySettings(uid, { typingIndicator: visible });
    logger.info('Privacy', `Typing indicator ${visible ? 'visible' : 'hidden'}`);
  } catch (error) {
    logger.error('Privacy', 'Failed to update typing indicator', error);
  }
}

/**
 * Export all user settings (for backup or migration)
 */
export async function exportUserSettings(uid: string): Promise<any> {
  try {
    const privacy = await getPrivacySettings(uid);
    const security = await getAccountSecuritySettings(uid);
    const blocklist = await getBlockList(uid);

    return {
      privacy,
      security,
      blocklist,
      exportedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Privacy', 'Failed to export settings', error);
    throw error;
  }
}

/**
 * Import user settings from backup
 */
export async function importUserSettings(uid: string, settingsBackup: any): Promise<void> {
  try {
    if (settingsBackup.privacy) {
      await updatePrivacySettings(uid, settingsBackup.privacy);
    }

    if (settingsBackup.security) {
      await updateAccountSecuritySettings(uid, settingsBackup.security);
    }

    // Note: blocklist would need special handling for imports

    logger.info('Privacy', 'Settings imported successfully');
  } catch (error) {
    logger.error('Privacy', 'Failed to import settings', error);
    throw error;
  }
}
