/**
 * Capacitor configuration for Android mobile app
 * See https://capacitorjs.com/docs/config
 */

import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.quidec.app',
  appName: 'Quidec Chat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For development, use your local IP:
    // url: 'http://YOUR_IP:5173',
    // cleartext: true, // Allow http in development
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
}

export default config
