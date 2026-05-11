import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';

export type PermissionType = 'camera' | 'photos' | 'microphone' | 'location' | 'storage';

export const permissionManager = {
  /**
   * Request a specific permission with native dialog
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    try {
      const info = await Device.getInfo();
      const isNative = info.platform !== 'web';

      if (!isNative) {
        console.log(`🌐 Web platform: Permission ${type} granted by default (browser handles)`);
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
          // On Android 13+, READ_EXTERNAL_STORAGE is deprecated in favor of media-specific permissions
          // but for general Filesystem access, we check the status
          const status = await Filesystem.requestPermissions();
          return status.publicStorage === 'granted';
        }
        case 'microphone': {
          // Microphone is usually handled via MediaDevices in webview or specialized plugins
          // We'll check if the browser/webview supports it
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
          return true;
        }
        case 'location': {
          // Geolocation requires the plugin, if not present we use web API
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
        default:
          return true;
      }
    } catch {
      return false;
    }
  }
};
