# Quidec Mobile App Build Guide

## Quick Start

```bash
# Install dependencies
cd web
pnpm install

# Build web app
pnpm build:web

# Sync to Android
pnpm sync:android

# Sync to iOS
pnpm sync:ios

# Build Android APK
pnpm build:android:apk

# Build Android App Bundle (for Play Store)
pnpm build:android:aab

# Build iOS app
pnpm open:ios  # Opens Xcode for further configuration
```

## Prerequisites

### System Requirements
- Node.js 18+ and pnpm
- For Android: Java 17+, Android SDK, Gradle
- For iOS: Xcode 14+, iOS 15+

### Installation

**macOS (iOS & Android):**
```bash
# Install Android Studio
brew install android-studio

# Install Xcode (from App Store)

# Set up Android SDK
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

**Windows (Android only):**
```bash
# Install Android Studio
# Set ANDROID_HOME environment variable to your SDK path
# Usually: C:\Users\YourName\AppData\Local\Android\sdk
```

**Linux (Android only):**
```bash
# Install Android Studio or standalone Android SDK
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

## Build Configurations

### 1. Development Build

**For Testing on Device:**
```bash
# Terminal 1: Start dev server (hot reload)
cd web
pnpm dev

# Terminal 2: Sync to device (use your local IP)
# Update .env.development with your IP:
# VITE_SERVER_URL=ws://192.168.1.100:3000

pnpm sync:android
# or
pnpm sync:ios
```

### 2. Production Build

**For Release:**
```bash
# Build optimized web app
pnpm build:web

# Android - Debug APK (testing)
pnpm build:android:apk

# Android - Release Bundle (Play Store)
pnpm build:android:aab

# iOS - Archive (App Store)
pnpm open:ios  # Then use Xcode to create archive
```

## Environment Configuration

### Development (.env.development)
- Hot reload enabled
- Debug logging on
- Cleartext WebSocket allowed
- Source maps enabled
- Local server (localhost:3000)

### Production (.env)
- Optimized build
- Debug logging off
- HTTPS/WSS only
- No source maps
- Remote server

## Android Build Details

### Prerequisites
1. Android SDK API 28+ installed
2. Gradle configured
3. Keystore file created (for release builds)

### Create Release Keystore
```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-release-alias
```

### Build Commands

**Debug APK (for testing):**
```bash
cd android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

**Release APK (deprecated, use AAB instead):**
```bash
cd android
./gradlew assembleRelease
# Requires signing configuration
```

**App Bundle (Play Store recommended):**
```bash
cd android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### Install APK on Device
```bash
# Connect Android device via USB
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Or run directly
cd android && ./gradlew installDebug
```

## iOS Build Details

### Prerequisites
1. Mac with Xcode 14+
2. Apple Developer Account
3. iOS 15+ device/simulator

### Build Steps

```bash
# Open Xcode project
pnpm open:ios

# In Xcode:
# 1. Select your team in signing settings
# 2. Build for device: Product > Build
# 3. Archive for App Store: Product > Archive
```

### Deploy to App Store
1. In Xcode, validate archive
2. Upload to App Store Connect
3. Submit for review

## Version Management

### Update App Version

**For Web:**
In `.env` or `.env.development`:
```
VITE_APP_VERSION=1.0.1
VITE_BUILD_NUMBER=2
```

**For Android:**
In `android/app/build.gradle`:
```gradle
versionCode 2
versionName "1.0.1"
```

**For iOS:**
In Xcode:
- Product > Scheme > Edit Scheme
- Build number in general tab

## Troubleshooting

### Android Build Issues

**Gradle sync fails:**
```bash
cd android
./gradlew clean
./gradlew --refresh-dependencies
```

**Java version error:**
```bash
# Ensure Java 17 is set
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

**WebSocket connection fails:**
- Check .env VITE_SERVER_URL is correct
- Ensure server is running
- On Android: cleartext must be enabled for http://

### iOS Build Issues

**CocoaPods dependency error:**
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
```

**Code signing error:**
- Verify team is selected in Xcode
- Check provisioning profile
- Update bundle identifier if needed

### WebSocket Connection

**Development (localhost doesn't work on device):**
```bash
# Find your machine IP
ifconfig | grep inet

# Update .env.development
VITE_SERVER_URL=ws://YOUR_IP:3000

# And sync again
pnpm sync:android
```

**Production:**
- Use deployed server with WSS (secure WebSocket)
- Ensure HTTPS certificate is valid

## Capacitor Plugins Used

- **PushNotifications**: FCM push notifications
- **LocalNotifications**: Local notifications
- **Camera**: Photo/video capture
- **Device**: Device information
- **Network**: Network status monitoring
- **Preferences**: Local persistent storage
- **App**: App lifecycle management
- **StatusBar**: Status bar styling
- **SplashScreen**: Splash screen on launch

## Upload to App Stores

### Google Play Store (Android)
1. Create App Bundle (.aab file)
2. Go to Google Play Console
3. Create new app > Upload bundle
4. Configure store listing
5. Submit for review

### Apple App Store (iOS)
1. Create archive in Xcode
2. Go to App Store Connect
3. Create new app version
4. Upload build using Xcode Organizer
5. Fill app details and submit

## Security Checklist

- ✅ HTTPS/WSS enforced in production
- ✅ No debug logging in production
- ✅ Source maps disabled in production
- ✅ Code minified and optimized
- ✅ Secrets not committed to git
- ✅ App permissions properly configured
- ✅ Certificate pinning configured (if needed)
- ✅ Keystore file not in git

## Performance Optimization

### Bundle Size
- Current: ~2-3 MB (compressed)
- Optimized tree-shaking enabled
- Code splitting configured

### Runtime Performance
- Lazy loading routes
- Code splitting by page
- Service worker caching
- Offline support

### Testing

```bash
# Build production locally to test
pnpm build
pnpm preview

# Test on actual device
pnpm sync:android
# Launch app and test all features
```

## Monitoring

Once deployed:
1. Monitor server logs
2. Check app analytics
3. Review crash reports
4. Monitor WebSocket connections
5. Test on various devices

## Support

For issues:
1. Check logs: `adb logcat` (Android)
2. Check console in dev tools
3. Review Capacitor documentation
4. Check Firebase console (if using)

## Next Steps

1. Build APK: `pnpm build:android:apk`
2. Test on Android device
3. Build App Bundle: `pnpm build:android:aab`
4. Upload to Play Store
5. Build iOS: `pnpm open:ios` → Build in Xcode
6. Upload to App Store
