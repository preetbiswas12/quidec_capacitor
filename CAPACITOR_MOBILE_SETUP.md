# Capacitor Mobile Setup Guide - Quidec Chat

## ⚠️ Spark Plan Notes

This guide covers Android and iOS setup for **Spark Plan (Free Tier)**.

**What works:**
- ✅ Android app build and deployment
- ✅ iOS app build and deployment
- ✅ Push notifications (when user is online)
- ✅ Real-time messaging and presence

**Spark Plan limitations:**
- ⚠️ Offline push notifications (only when online)
- ❌ Cloud Functions not available

See [SPARK_PLAN_GUIDE.md](./SPARK_PLAN_GUIDE.md) for details.

---

## For Quidec Chat (Android) and Quidec (iOS)

---

## Part 1: Download Firebase Config Files

### For Android (Quidec Chat)

**Step 1: Register Android App in Firebase Console**
1. Go to Firebase Console → Your Project
2. Click **"Add app"** → Select **Android icon**
3. Fill in:
   - **Package name**: `com.quidec.chat` (or your actual package name)
   - **App nickname**: `Quidec Chat`
   - **Debug signing certificate SHA-1**: (optional for now)
4. Click **"Register app"**

**Step 2: Download google-services.json**
1. Click **"Download google-services.json"**
2. Save it to: `android/app/google-services.json`
   - Path: `YOUR_PROJECT/android/app/google-services.json`
3. This file contains all Firebase config for Android

**Step 3: Skip remaining steps** (we already have Capacitor configured)
- Click **"Next"** through the remaining steps
- Click **"Continue to console"**

✅ **Android Firebase config file placed**

---

### For iOS (Quidec)

**Step 1: Register iOS App in Firebase Console**
1. Go to Firebase Console → Your Project
2. Click **"Add app"** → Select **iOS icon**
3. Fill in:
   - **iOS bundle ID**: `com.quidec.app` (or your actual bundle ID)
   - **App nickname**: `Quidec`
   - **App Store ID**: (leave empty for now)
4. Click **"Register app"**

**Step 2: Download GoogleService-Info.plist**
1. Click **"Download GoogleService-Info.plist"**
2. Save it to: `ios/App/GoogleService-Info.plist`
   - Path: `YOUR_PROJECT/ios/App/GoogleService-Info.plist`
3. This file contains all Firebase config for iOS

**Step 3: Skip remaining steps**
- Click **"Next"** through the remaining steps
- Click **"Continue to console"**

✅ **iOS Firebase config file placed**

---

## Part 2: Update App Names

### Android App Name

**File**: `android/app/build.gradle`

```gradle
android {
    ...
    defaultConfig {
        applicationId "com.quidec.chat"  // Your package name
        versionCode 1
        versionName "1.0.0"
    }
    ...
}
```

**File**: `android/app/src/main/AndroidManifest.xml`

```xml
<manifest ...>
    <application
        android:label="@string/app_name"
        ...
    >
    </application>
</manifest>
```

**File**: `android/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Quidec Chat</string>
</resources>
```

---

### iOS App Name

**File**: `ios/App/App/Info.plist`

Find and update:
```xml
<key>CFBundleName</key>
<string>Quidec</string>

<key>CFBundleDisplayName</key>
<string>Quidec</string>
```

Or use Xcode:
1. Open `ios/App/App.xcodeproj` in Xcode
2. Select **App** target
3. Go to **General** tab
4. Update **Display Name**: `Quidec`

---

## Part 3: Add Capacitor Firebase Plugins

Run these commands in your project root:

```bash
npm install @capacitor-firebase/authentication
npm install @capacitor-firebase/messaging
npx cap sync
```

Or with pnpm:
```bash
pnpm add @capacitor-firebase/authentication
pnpm add @capacitor-firebase/messaging
pnpm dlx cap sync
```

---

## Part 4: Configure Android

### Android Configuration File

**File**: `android/app/build.gradle`

Add Firebase plugins:
```gradle
apply plugin: 'com.android.application'
apply plugin: 'com.google.gms.google-services'  // Add this line

android {
    compileSdkVersion 33
    
    defaultConfig {
        applicationId "com.quidec.chat"
        minSdkVersion 22
        targetSdkVersion 33
    }
}

dependencies {
    implementation platform('com.google.firebase:firebase-bom:32.0.0')
    implementation 'com.google.firebase:firebase-auth'
    implementation 'com.google.firebase:firebase-firestore'
    implementation 'com.google.firebase:firebase-database'
    implementation 'com.google.firebase:firebase-messaging'
}
```

### Build Gradle (Project Level)

**File**: `android/build.gradle`

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:7.3.0'
        classpath 'com.google.gms:google-services:4.3.15'  // Add this line
    }
}
```

---

## Part 5: Configure iOS

### iOS Pods Configuration

Run in your project root:

```bash
cd ios/App
pod install
cd ../..
```

If you get pod errors, try:
```bash
cd ios/App
rm -rf Pods
rm Podfile.lock
pod install
cd ../..
```

### Xcode Configuration

1. Open `ios/App/App.xcodeproj` in Xcode
2. Select **App** target
3. Go to **Build Phases**
4. Verify **GoogleService-Info.plist** is in "Copy Bundle Resources"
   - If not, click **+** and add it

### iOS Info.plist

**File**: `ios/App/App/Info.plist`

Add Firebase initialization settings:
```xml
<dict>
    <key>FirebaseAppDelegateProxyEnabled</key>
    <false/>
    <key>GIDClientID</key>
    <string>YOUR_GOOGLE_CLIENT_ID</string>
</dict>
```

You can find the GIDClientID in your `GoogleService-Info.plist` file.

---

## Part 6: Update capacitor.config.ts

**File**: `capacitor.config.ts`

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quidec.chat',  // Android package name
  appName: 'Quidec Chat',     // Android app name
  webDir: 'dist',
  
  // For iOS
  ios: {
    hostname: 'localhost',
  },
  
  // Firebase plugins
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuthentication: false,
      providers: ['google', 'apple'],
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
```

---

## Part 7: Android Build & Testing

### Build APK for Testing (Debug)

```bash
# Build web assets
pnpm build

# Sync with Android
npx cap sync android

# Build APK
cd android
./gradlew assembleDebug
cd ..

# APK will be at: android/app/build/outputs/apk/debug/app-debug.apk
```

### Build APK for Production Release

```bash
# Build web assets
pnpm build

# Sync with Android
npx cap sync android

# Build signed APK (requires keystore)
cd android
./gradlew assembleRelease
cd ..

# Or build App Bundle for Play Store
cd android
./gradlew bundleRelease
cd ..
```

### Test on Android Device

```bash
# Connect Android device via USB (USB debugging enabled)

# Run on device
cd android
./gradlew installDebug
cd ..

# Or use Android Studio to run the project
```

---

## Part 8: iOS Build & Testing

### Build for Testing (Debug)

```bash
# Build web assets
pnpm build

# Sync with iOS
npx cap sync ios

# Open in Xcode
npx cap open ios
```

**In Xcode:**
1. Select your device/simulator at top
2. Click the **Play (▶)** button to build and run
3. App will launch on device/simulator

### Build for Production Release

```bash
# Build web assets
pnpm build

# Sync with iOS
npx cap sync ios

# Open in Xcode
npx cap open ios
```

**In Xcode:**
1. Select **Product** → **Scheme** → **Edit Scheme**
2. Select **Release** configuration
3. Click **Play (▶)** to build
4. Or go to **Product** → **Archive** for App Store submission

---

## Part 9: Configure Push Notifications

### Android Push Notifications

**File**: `android/app/src/main/AndroidManifest.xml`

Add permissions:
```xml
<manifest ...>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <application ...>
        <!-- FCM Service -->
        <service
            android:name=".services.PushNotificationService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>
</manifest>
```

### iOS Push Notifications

**In Xcode:**
1. Select **App** target
2. Go to **Signing & Capabilities**
3. Click **+ Capability**
4. Search for **Push Notifications**
5. Click to add it
6. Also add **Background Modes**
   - Enable **Remote notifications**

---

## Part 10: Test the App

### Quick Test Checklist

**Android:**
- [ ] APK installs on device
- [ ] App launches
- [ ] Can register/login
- [ ] Can send messages
- [ ] Notifications appear when app is open
- [ ] Notifications appear when app is closed

**iOS:**
- [ ] App installs on device
- [ ] App launches
- [ ] Can register/login
- [ ] Can send messages
- [ ] Notifications appear when app is open
- [ ] Notifications appear when app is closed

---

## Part 11: Deploy to Stores

### Google Play Store (Android)

1. **Create Google Play Account**
   - Go to: https://play.google.com/console
   - Pay $25 one-time fee
   - Create app entry

2. **Generate Signed APK/AAB**
   ```bash
   cd android
   ./gradlew bundleRelease
   cd ..
   ```

3. **Upload to Play Console**
   - Upload the `.aab` file (App Bundle)
   - Add screenshots, description, etc.
   - Set price and distribution
   - Submit for review (usually 24-48 hours)

### Apple App Store (iOS)

1. **Create Apple Developer Account**
   - Go to: https://developer.apple.com
   - Pay $99/year

2. **Archive App in Xcode**
   - In Xcode: **Product** → **Archive**
   - Click **Distribute App**
   - Select **App Store Connect**
   - Follow wizard

3. **Submit on App Store Connect**
   - https://appstoreconnect.apple.com
   - Add app information, screenshots, etc.
   - Submit for review (usually 24-48 hours)

---

## Troubleshooting

### APK Build Fails

```bash
# Clear build cache
cd android
./gradlew clean
./gradlew assembleDebug
cd ..
```

### Pods Installation Fails (iOS)

```bash
cd ios/App
rm -rf Pods
rm Podfile.lock
pod repo update
pod install
cd ../..
```

### App Crashes on Launch

Check logs:
```bash
# Android
adb logcat

# iOS
open ~/Library/Logs/iOS\ Simulator/*/system.log
```

### Notifications Not Working

1. Check FCM token is saved:
   ```bash
   firebase functions:log
   ```

2. Verify service worker (web):
   ```bash
   navigator.serviceWorker.getRegistrations()
   ```

3. Check Android manifest has permissions

4. Check iOS has Push Notifications capability

---

## File Structure

After setup, your project should have:

```
quidec_capacitor/
├── android/
│   ├── app/
│   │   ├── google-services.json          ✅ Downloaded from Firebase
│   │   ├── src/main/
│   │   │   └── AndroidManifest.xml
│   │   └── build.gradle
│   ├── build.gradle
│   └── ...
├── ios/
│   ├── App/
│   │   ├── GoogleService-Info.plist      ✅ Downloaded from Firebase
│   │   ├── Info.plist
│   │   ├── App.xcodeproj
│   │   └── Podfile
│   └── ...
├── src/
│   ├── utils/
│   │   ├── firebase.ts
│   │   ├── firebaseServices.ts
│   │   └── cloudFunctions.ts
│   ├── app/
│   │   └── App.tsx
│   └── ...
├── .env                                  ✅ With Firebase config
├── capacitor.config.ts                   ✅ Updated
├── package.json
└── ...
```

---

## Summary

✅ Downloaded Firebase config files (google-services.json & GoogleService-Info.plist)
✅ Updated app names (Quidec Chat for Android, Quidec for iOS)
✅ Configured Capacitor
✅ Added Firebase plugins
✅ Configured Android & iOS
✅ Ready to build and test

**Next Steps:**
1. Follow Part 7 to build Android APK
2. Follow Part 8 to build iOS app
3. Test on devices
4. Deploy to stores (Part 11)
