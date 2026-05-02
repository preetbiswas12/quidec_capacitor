/**
 * Capacitor configuration for Quidec mobile app (iOS & Android)
 * See https://capacitorjs.com/docs/config
 * Build commands:
 *   pnpm build:web          - Build web app
 *   pnpm sync:ios           - Sync to iOS
 *   pnpm sync:android       - Sync to Android
 *   pnpm build:android      - Build Android APK/AAB
 *   pnpm build:android:apk  - Build APK
 *   pnpm build:android:aab  - Build AAB (for Play Store)
 */

import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.quidec.chat',
  appName: 'Quidec',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosDeriveAddress: true,
    // For local development: uncomment and set your IP
    // url: 'http://192.168.1.100:5173',
    // cleartext: true,
  },
  
  ios: {
    limitsNavigationsToAppBoundDomains: true,
    preferredContentMode: 'mobile',
    scheme: 'App',
  },
  
  android: {
    allowMixedContent: false,
    buildOptions: {
      releaseSigningKeyPath: 'my-release-key.keystore',
      releaseSigningKeyAlias: 'my-release-alias',
    },
  },
  
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#00A884',
      sound: 'beep.wav',
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#111B21',
      overlaysWebView: false,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 3000,
      androidScaleType: 'center',
      splashImmersive: true,
      layoutName: 'launch_screen',
      showSpinner: true,
      spinnerStyle: 'large',
    },
  },
  
  // Enable or disable the splash screen
  cordova: {
    preferences: {
      'webviewbounce': 'false',
      'UiWebViewBounce': 'false',
      'DisallowOverscroll': 'true',
      'HideKeyboardFormAccessoryBar': 'true',
      'EnableViewportScale': 'true',
      'AllowInlineMediaPlayback': 'true',
      'MediaPlaybackRequiresUserAction': 'false',
    },
  },
}

export default config
