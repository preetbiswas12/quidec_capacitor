# Android Build Configuration for Quidec

This document describes the Android-specific setup and build process.

## Prerequisites

- Node.js 16+
- Java Development Kit (JDK) 11+
- Android SDK (API level 29+)
- Android Studio (optional but recommended)

## Setup Steps

### 1. Install Capacitor CLI

```bash
npm install -g @capacitor/cli
```

### 2. Building the Web App

```bash
cd web
npm run build
```

### 3. Initializing Android Project

First time only:
```bash
npx cap add android
```

### 4. Syncing Web Code to Android

After building the web app:
```bash
npx cap sync android
```

### 5. Building APK/AAB

#### Development Build
```bash
cd android
./gradlew assembleDebug
```

#### Production Build
```bash
cd android
./gradlew bundleRelease
```

Output locations:
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`

### 6. Running on Device

Install debug build:
```bash
./gradlew installDebug
```

Or use Android Studio to run the project.

## Firebase Configuration

1. Create a Firebase project at https://console.firebase.google.com
2. Add Android app to the project
3. Download `google-services.json` and place in `android/app/`
4. The build will automatically include Firebase services

## Permissions

Required permissions (auto-added by Capacitor):
- `android.permission.CAMERA` - for video calls
- `android.permission.RECORD_AUDIO` - for voice calls
- `android.permission.INTERNET` - for WebSocket
- `android.permission.POST_NOTIFICATIONS` - for Firebase push notifications
- `android.permission.READ_EXTERNAL_STORAGE` - for media
- `android.permission.WRITE_EXTERNAL_STORAGE` - for saving media

## Environment Variables

Create `.env` in web folder:
```
VITE_SERVER_URL=wss://your-server.com
```

For development:
```
VITE_SERVER_URL=ws://YOUR_LOCAL_IP:3000
```

## Troubleshooting

### Gradle Build Fails
```bash
cd android
./gradlew clean
./gradlew build
```

### Changes Not Showing on Device
```bash
npx cap sync android
npx cap open android
# Rebuild in Android Studio
```

### WebSocket Connection Issues
- Ensure server is accessible from device
- Check firewall settings
- For localhost, use your actual IP (not 127.0.0.1)

## Development Workflow

1. Make changes to web code
2. Run `npm run build`
3. Run `npx cap sync android`
4. Rebuild in Android Studio or run `./gradlew assembleDebug`
5. Test on device

## Production Release Checklist

- [ ] Test all features on real device
- [ ] Enable ProGuard/R8 for release builds
- [ ] Update version in `android/app/build.gradle`
- [ ] Update version in `capacitor.config.ts`
- [ ] Sign APK with production keystore
- [ ] Test on multiple Android versions (API 29+)
- [ ] Verify push notifications working
- [ ] Test with poor network conditions

## Security Notes

- Never commit `google-services.json` if it contains sensitive keys
- Use `.gitignore` to exclude Android build artifacts
- Rotate signing keys regularly
- Store keystore password securely
- Don't hardcode server URLs in source code (use env variables)
