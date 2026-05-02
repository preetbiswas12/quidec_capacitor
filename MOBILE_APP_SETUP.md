# Quidec Mobile App - Development & Deployment Guide

## Overview

This guide covers building the Quidec chat application as a native mobile app for iOS and Android using Capacitor, React, and TypeScript.

**App Details:**
- **Package Name:** `com.quidec.chat`
- **App Name:** Quidec
- **Current Version:** 1.0.0
- **Backend:** WebSocket (wss://quidec-server.onrender.com)
- **UI Framework:** React 18 + TypeScript
- **Build Tool:** Vite + Capacitor
- **Supported Platforms:** Android 5.0+ (API 24), iOS 15.0+

## Quick Setup (30 minutes)

### For macOS (iOS & Android)
```bash
# Run one-time setup
cd web
bash setup-mobile.sh

# Then follow the printed next steps
```

### For Windows (Android only)
```cmd
cd web
setup-mobile.bat

# Then follow the printed next steps
```

### For Linux (Android only)
```bash
cd web
bash setup-mobile.sh
```

## Architecture

```
web/
├── src/
│   ├── app/
│   │   ├── App.tsx              # Root component with error boundary
│   │   ├── routes.tsx           # React Router with auth protection
│   │   ├── context/
│   │   │   └── AppContext.tsx   # Global state + WebSocket
│   │   └── components/          # 15+ feature components
│   ├── styles/                  # CSS (mobile, accessibility, theme)
│   ├── utils/                   # Utilities (encryption, storage, etc.)
│   └── index.html               # Entry point
├── android/                     # Android native project
├── ios/                         # iOS native project
├── capacitor.config.ts          # Capacitor configuration
├── vite.config.js               # Vite build config
├── .env                         # Production environment
├── .env.development             # Development environment
├── package.json                 # Dependencies & build scripts
└── MOBILE_BUILD_GUIDE.md        # Detailed build documentation
```

## Build Scripts

All commands run from the `web/` directory:

```bash
# Development
pnpm dev                    # Start Vite dev server (hot reload)

# Web Build
pnpm build:web             # Build web app (creates dist/)
pnpm build                 # Alias for build:web

# Capacitor Sync
pnpm sync:ios              # Sync web to iOS Xcode project
pnpm sync:android          # Sync web to Android Studio project

# Open IDE
pnpm open:ios              # Open Xcode for iOS development
pnpm open:android          # Open Android Studio

# Android Builds
pnpm build:android:apk     # Debug APK (for testing)
pnpm build:android         # Release builds (includes signing)
pnpm build:android:aab     # App Bundle for Play Store

# Testing
pnpm preview               # Preview production build
pnpm type-check            # TypeScript type checking
```

## Development Workflow

### 1. Local Development with Hot Reload

**Terminal 1 - Start dev server:**
```bash
cd web
pnpm dev
# Opens http://localhost:5173
```

**Terminal 2 - Sync to device (choose one):**

For Android with local server:
```bash
# Update .env.development with your machine IP:
VITE_SERVER_URL=ws://192.168.1.100:3000

pnpm sync:android
# Launch app from Android Studio
```

For iOS:
```bash
pnpm sync:ios
# Build and run from Xcode
```

### 2. Testing on Physical Device

**Android:**
```bash
# Build debug APK
pnpm build:android:apk

# Install on device via USB
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Or from Android Studio: Run > Run 'app'
```

**iOS:**
```bash
# Open Xcode
pnpm open:ios

# In Xcode:
# 1. Select your team
# 2. Select physical device
# 3. Press Cmd+R to run
```

## Production Builds

### Android Release (App Bundle for Play Store)

**Step 1: Create signing certificate**
```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-release-alias

# Answer prompts to create certificate
# Store in web/ directory
```

**Step 2: Configure signing in build.gradle**
```gradle
// android/app/build.gradle
signingConfigs {
    release {
        storeFile file("../my-release-key.keystore")
        storePassword "your_keystore_password"
        keyAlias "my-release-alias"
        keyPassword "your_key_password"
    }
}
```

**Step 3: Build**
```bash
# Build App Bundle (recommended for Play Store)
pnpm build:android:aab
# Output: android/app/build/outputs/bundle/release/app-release.aab

# Or build APK for direct install
pnpm build:android
# Output: android/app/build/outputs/apk/release/app-release.apk
```

### iOS Release (IPA for App Store)

**Step 1: Open Xcode**
```bash
pnpm open:ios
```

**Step 2: Configure signing**
- Select your team in Xcode
- Verify bundle identifier: `com.quidec.chat`
- Check provisioning profile

**Step 3: Build archive**
```
Xcode: Product > Archive
# Creates .xcarchive file
```

**Step 4: Upload to App Store Connect**
```
Xcode: Organizer > Your Archive > Distribute App
# Select "App Store Connect"
# Follow upload prompts
```

## Environment Configuration

### Production (.env)
```bash
VITE_SERVER_URL=wss://quidec-server.onrender.com
VITE_API_URL=https://quidec-server.onrender.com
VITE_PACKAGE_NAME=com.quidec.chat
VITE_APP_NAME=Quidec
VITE_APP_VERSION=1.0.0
VITE_BUILD_NUMBER=1
VITE_DEBUG=false
VITE_ALLOW_CLEARTEXT=false
VITE_MINIFY=true
VITE_SOURCE_MAPS=false
```

### Development (.env.development)
```bash
VITE_SERVER_URL=ws://192.168.1.100:3000  # Use your machine IP
VITE_API_URL=http://192.168.1.100:3000
VITE_DEBUG=true
VITE_ALLOW_CLEARTEXT=true
VITE_MINIFY=false
VITE_SOURCE_MAPS=true
```

## Version Management

When releasing a new version:

**1. Update version in .env:**
```bash
VITE_APP_VERSION=1.0.1
VITE_BUILD_NUMBER=2
```

**2. Update Android version in android/app/build.gradle:**
```gradle
versionCode 2
versionName "1.0.1"
```

**3. Update iOS version in Xcode:**
- Bundle version: 2
- Bundle version (short): 1.0.1

**4. Commit and tag:**
```bash
git tag -a v1.0.1 -m "Release version 1.0.1"
git push origin v1.0.1
```

## Key Features

✅ **Real-time Messaging** - WebSocket communication
✅ **Friend Management** - Friend requests & contacts
✅ **Online Status** - Real-time online/offline
✅ **User Authentication** - Login/Register/Logout
✅ **Notifications** - Push & local notifications
✅ **Mobile Responsive** - Optimized for all devices
✅ **Offline Support** - Service worker caching
✅ **Progressive Web App** - Install as app
✅ **Secure** - HTTPS/WSS, certificate pinning ready
✅ **Voice/Video Ready** - UI ready, backend integration pending

## Capacitor Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| PushNotifications | 8.0.3 | FCM push notifications |
| LocalNotifications | 8.0.2 | Local notifications |
| Camera | 8.2.0 | Photo/video capture |
| Device | 8.0.2 | Device info & capabilities |
| Filesystem | 8.1.2 | File access |
| Preferences | 8.0.1 | Local storage |
| Network | 8.0.1 | Network status |
| App | 8.1.0 | App lifecycle |

## Firebase Setup (For Push Notifications)

### Create Firebase Project
1. Go to https://console.firebase.google.com
2. Create new project: "Quidec"
3. Enable Firestore Database
4. Enable Realtime Database

### Configure FCM for Android
1. In Firebase Console → Project Settings
2. Download `google-services.json`
3. Place in `android/app/`

### Configure FCM for iOS
1. In Firebase Console → Project Settings
2. Download GoogleService-Info.plist
3. Place in iOS Xcode project

## Deployment Checklist

### Before Building
- [ ] Update version numbers
- [ ] Test all features locally
- [ ] Run type check: `pnpm type-check`
- [ ] Update .env with production server
- [ ] Test WebSocket connection to production

### Android Release
- [ ] Create/update signing certificate
- [ ] Update versionCode and versionName
- [ ] Build App Bundle: `pnpm build:android:aab`
- [ ] Test on physical device
- [ ] Upload to Google Play Console
- [ ] Fill app details & screenshots
- [ ] Submit for review

### iOS Release
- [ ] Update bundle version
- [ ] Build archive in Xcode
- [ ] Test on physical device
- [ ] Upload to App Store Connect
- [ ] Fill app details & screenshots
- [ ] Submit for review

## Troubleshooting

### WebSocket Connection Issues

**Development (localhost doesn't work on device):**
```bash
# Find your machine's IP address
ifconfig | grep inet    # Mac
ipconfig                 # Windows

# Update .env.development
VITE_SERVER_URL=ws://192.168.1.100:3000

# Sync and rebuild
pnpm sync:android
```

**Production:**
- Ensure WebSocket server is using WSS (secure)
- Check certificate validity
- Verify server is accessible from device

### Android Build Issues

**Gradle sync fails:**
```bash
cd android
./gradlew clean
./gradlew --refresh-dependencies
```

**Java version error:**
```bash
# Ensure Java 17
java -version

# If needed, set JAVA_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

**Signing issues:**
```bash
# Verify keystore
keytool -list -v -keystore my-release-key.keystore
```

### iOS Build Issues

**CocoaPods error:**
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
```

**Code signing error:**
- Check team is selected in Xcode
- Verify bundle identifier
- Update provisioning profile

## Performance Optimization

**Current Bundle Size:** ~2-3 MB (compressed)

**Optimizations Enabled:**
- ✅ Terser 2-pass minification
- ✅ Tree-shaking enabled
- ✅ Code splitting by route
- ✅ CSS bundled into single file
- ✅ No source maps in production
- ✅ Aggressive compression

**Runtime Performance:**
- ✅ Lazy loading routes
- ✅ WebSocket connection pooling
- ✅ IndexedDB caching ready
- ✅ Service worker offline support

## Testing

### Automated Tests
```bash
# Type checking
pnpm type-check

# Linting
pnpm lint

# Format code
pnpm format
```

### Manual Testing Checklist
- [ ] Login/Register flow works
- [ ] WebSocket connects to server
- [ ] Messages send and receive
- [ ] Friend requests work
- [ ] Online status updates
- [ ] Push notifications received
- [ ] Offline mode works
- [ ] All features on 5+ devices

## Monitoring & Analytics

After deployment:

1. **Monitor Server Logs**
   - Check WebSocket connection logs
   - Monitor authentication endpoints
   - Track error rates

2. **Firebase Console**
   - Monitor push notification delivery
   - Check Crashlytics for crashes
   - Review performance metrics

3. **Device Logs**
   ```bash
   # Android
   adb logcat | grep quidec
   
   # iOS
   Xcode Console
   ```

## Security Considerations

✅ **In Place:**
- HTTPS/WSS enforced in production
- No debug logging in production
- Code minified and obfuscated
- No sensitive data in source
- Certificate pinning ready

**Recommended:**
- Implement certificate pinning
- Add analytics token encryption
- Enable Crash reporting
- Setup security scanning

## Support & Resources

- **Capacitor Docs:** https://capacitorjs.com/docs
- **React Router:** https://reactrouter.com
- **Vite Guide:** https://vitejs.dev
- **Android Dev:** https://developer.android.com
- **Apple Dev:** https://developer.apple.com

## File Structure Overview

```
web/
├── src/app/
│   ├── App.tsx                   # Root component
│   ├── context/AppContext.tsx    # Global state & WebSocket
│   ├── routes.tsx                # Route definitions
│   └── components/               # UI components
├── src/styles/                   # CSS styles
├── src/utils/                    # Helper functions
├── android/                      # Android project (Gradle)
├── ios/                          # iOS project (Xcode)
├── .env                          # Production config
├── .env.development              # Dev config
├── capacitor.config.ts           # Capacitor config
├── vite.config.js                # Vite config
├── package.json                  # Dependencies
└── MOBILE_BUILD_GUIDE.md         # Detailed guide
```

## Next Steps

1. **Build for Testing:**
   ```bash
   pnpm build:android:apk
   ```

2. **Test on Device:**
   - Install APK on Android device
   - Or open in Xcode for iOS
   - Test all features

3. **Prepare Release:**
   - Update version numbers
   - Create signing certificates
   - Build for distribution

4. **Submit to App Stores:**
   - Google Play Console
   - Apple App Store

## Notes

- Currently using 258+ npm packages for complete UI framework
- WebSocket server at wss://quidec-server.onrender.com
- All API endpoints behind authentication
- Real-time sync for messages and friend requests
- No mock data - all production-grade

---

Last Updated: 2024
For questions or issues, refer to MOBILE_BUILD_GUIDE.md
