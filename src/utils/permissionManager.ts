import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';

export type PermissionType = 'camera' | 'photos' | 'microphone' | 'location' | 'storage';

export interface PermissionStatus {
  camera: boolean;
  microphone: boolean;
  storage: boolean;
  notifications: boolean;
}

// Storage key for tracking first-launch permission request
const PERMISSIONS_ASKED_KEY = 'quidec_permissions_asked';
const PERMISSIONS_GRANTED_KEY = 'quidec_permissions_granted';

export const permissionManager = {
  /**
   * Save permission status to local storage
   */
  async savePermissionStatus(status: PermissionStatus): Promise<void> {
    await Preferences.set({
      key: PERMISSIONS_GRANTED_KEY,
      value: JSON.stringify(status),
    });
  },

  /**
   * Load saved permission status
   */
  async loadPermissionStatus(): Promise<PermissionStatus | null> {
    const { value } = await Preferences.get({ key: PERMISSIONS_GRANTED_KEY });
    if (value) {
      return JSON.parse(value);
    }
    return null;
  },

  /**
   * Check if we've already asked for permissions (first launch done)
   */
  async hasAskedPermissions(): Promise<boolean> {
    const { value } = await Preferences.get({ key: PERMISSIONS_ASKED_KEY });
    return value === 'true';
  },

  /**
   * Mark that we've asked for permissions
   */
  async markAskedPermissions(): Promise<void> {
    await Preferences.set({ key: PERMISSIONS_ASKED_KEY, value: 'true' });
  },

  /**
   * Request a specific permission with native Android dialog
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    try {
      const info = await Device.getInfo();
      const isNative = info.platform !== 'web';

      if (!isNative) {
        console.log(`🌐 Web platform: Permission ${type} handled by browser`);
        return true;
      }

      switch (type) {
        case 'camera': {
          const status = await Camera.requestPermissions({ permissions: ['camera'] });
          return status.camera === 'granted';
        }
        case 'photos': {
          const status = await Camera.requestPermissions({ permissions: ['photos'] });
          return status.photos === 'granted';
        }
        case 'storage': {
          const status = await Filesystem.requestPermissions();
          return status.publicStorage === 'granted';
        }
        case 'microphone': {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
          } catch {
            return false;
          }
        }
        case 'location': {
          try {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject);
            });
            return !!position;
          } catch (e) {
            return false;
          }
        }
        default:
          return false;
      }
    } catch (err) {
      console.error(`❌ Permission request failed for ${type}:`, err);
      return false;
    }
  },

  /**
   * Check if a permission is already granted
   */
  async checkPermission(type: PermissionType): Promise<boolean> {
    try {
      const info = await Device.getInfo();
      if (info.platform === 'web') return true;

      switch (type) {
        case 'camera':
          return (await Camera.checkPermissions()).camera === 'granted';
        case 'photos':
          return (await Camera.checkPermissions()).photos === 'granted';
        case 'storage':
          return (await Filesystem.checkPermissions()).publicStorage === 'granted';
        case 'microphone':
          return true;
        default:
          return true;
      }
    } catch {
      return false;
    }
  },

  /**
   * Check all required permissions at once
   */
  async checkAllPermissions(): Promise<PermissionStatus> {
    const [camera, microphone, storage] = await Promise.all([
      this.checkPermission('camera'),
      this.checkPermission('microphone'),
      this.checkPermission('storage'),
    ]);

    return {
      camera,
      microphone,
      storage,
      notifications: true,
    };
  },

  /**
   * Request only missing/denied permissions
   * Call this on every app open to re-prompt for denied permissions
   */
  async requestMissingPermissions(): Promise<PermissionStatus> {
    // First, check current actual permission status from Android
    const currentStatus = await this.checkAllPermissions();

    // If never asked before, request all
    const hasAsked = await this.hasAskedPermissions();
    if (!hasAsked) {
      const result = await this.requestAllPermissions();
      await this.markAskedPermissions();
      await this.savePermissionStatus(result);
      return result;
    }

    // If asked before, check which permissions are denied
    // and only prompt for those
    const missing: PermissionStatus = {
      camera: false,
      microphone: false,
      storage: false,
      notifications: true,
    };

    // Request each denied permission individually
    if (!currentStatus.camera) {
      missing.camera = await this.requestPermission('camera');
    }
    if (!currentStatus.microphone) {
      missing.microphone = await this.requestPermission('microphone');
    }
    if (!currentStatus.storage) {
      missing.storage = await this.requestPermission('storage');
    }

    // Save updated status
    const updatedStatus: PermissionStatus = {
      camera: currentStatus.camera || missing.camera,
      microphone: currentStatus.microphone || missing.microphone,
      storage: currentStatus.storage || missing.storage,
      notifications: true,
    };
    await this.savePermissionStatus(updatedStatus);

    return updatedStatus;
  },

  /**
   * Request all required permissions with user interaction
   * (for first-time login/registration)
   */
  async requestAllPermissions(): Promise<PermissionStatus> {
    const [camera, microphone, storage] = await Promise.all([
      this.requestPermission('camera'),
      this.requestPermission('microphone'),
      this.requestPermission('storage'),
    ]);

    const status: PermissionStatus = {
      camera,
      microphone,
      storage,
      notifications: true,
    };

    // Save status and mark as asked
    await this.savePermissionStatus(status);
    await this.markAskedPermissions();

    return status;
  },

  /**
   * Check if app has minimum required permissions (camera + storage)
   */
  async hasMinimumPermissions(): Promise<boolean> {
    const status = await this.checkAllPermissions();
    return status.camera || status.storage;
  },

  /**
   * Get permission status for UI display
   * Shows granted/denied/unknown for each permission
   */
  async getPermissionDisplayStatus(): Promise<{
    camera: 'granted' | 'denied' | 'unknown';
    microphone: 'granted' | 'denied' | 'unknown';
    storage: 'granted' | 'denied' | 'unknown';
  }> {
    const status = await this.checkAllPermissions();

    return {
      camera: status.camera ? 'granted' : 'denied',
      microphone: status.microphone ? 'granted' : 'denied',
      storage: status.storage ? 'granted' : 'denied',
    };
  },
};
