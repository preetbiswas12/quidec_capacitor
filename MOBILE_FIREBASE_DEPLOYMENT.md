# Mobile Firebase Configuration & Deployment

## ✅ Embedded Firebase Configuration

Your Quidec app is now fully configured with Firebase for mobile deployment (iOS & Android).

---

## 📱 Android Configuration

### File: `android/app/google-services.json`
**Status:** ✅ Configured

```json
{
  "project_info": {
    "project_number": "1016231429284",
    "firebase_url": "https://octate-wee-default-rtdb.europe-west1.firebasedatabase.app",
    "project_id": "octate-wee",
    "storage_bucket": "octate-wee.firebasestorage.app"
  },
  "client": [{
    "client_info": {
      "mobilesdk_app_id": "1:1016231429284:android:2b5d161f56ac82fba9d231",
      "android_client_info": {
        "package_name": "com.quidec.chat"
      }
    }
  }]
}
```

**What this enables:**
- ✅ Firebase Authentication (Email/Password login)
- ✅ Firestore Database access
- ✅ Realtime Database for presence/typing
- ✅ Cloud Storage for media
- ✅ Push Notifications (Cloud Messaging)

### SHA-1 Fingerprint (Already Registered)
```
0E:7C:2B:E6:16:CA:F9:FA:62:CF:0C:89:D0:C7:50:60:67:DB:26:CC
```
Generated with: JDK 23 keystore at `~/.android/debug.keystore`

### Android Debug Keystore
```
Path: C:\Users\preet\.android\debug.keystore
Password: android
Key Alias: androiddebugkey
Valid: 10,000 days
```

---

## 🍎 iOS Configuration

### File: `ios/App/App/GoogleService-Info.plist`
**Status:** ✅ Configured

```xml
<key>API_KEY</key>
<string>AIzaSyCoe_Z5E4bCv-dtxJmxyBiKJtgKiG1C3LE</string>
<key>GCM_SENDER_ID</key>
<string>1016231429284</string>
<key>PROJECT_ID</key>
<string>octate-wee</string>
<key>BUNDLE_ID</key>
<string>com.quidec.chat</string>
<key>STORAGE_BUCKET</key>
<string>octate-wee.firebasestorage.app</string>
<key>DATABASE_URL</key>
<string>https://octate-wee-default-rtdb.europe-west1.firebasedatabase.app</string>
<key>GOOGLE_APP_ID</key>
<string>1:1016231429284:ios:9dbaa73c3a115f18a9d231</string>
<key>IS_GCM_ENABLED</key>
<true></true>
```

**What this enables:**
- ✅ Firebase Authentication
- ✅ Firestore Database
- ✅ Realtime Database
- ✅ Cloud Storage
- ✅ Push Notifications (GCM)

---

## 🌐 Web Configuration

### File: `.env`
**Status:** ✅ Configured

```env
VITE_FIREBASE_API_KEY=AIzaSyDRjYVeogF29znhNtSVNm9OvELFalusumc
VITE_FIREBASE_AUTH_DOMAIN=octate-wee.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=octate-wee
VITE_FIREBASE_STORAGE_BUCKET=octate-wee.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1016231429284
VITE_FIREBASE_APP_ID=1:1016231429284:web:4118fbe8207adfc8a9d231
VITE_FIREBASE_MEASUREMENT_ID=G-E2Q4HQ6288
VITE_FIREBASE_DATABASE_URL=https://octate-wee-default-rtdb.europe-west1.firebasedatabase.app
REACT_APP_VAPID_KEY=BFZ6KQgsors1kgcaywsjQeeDrq_OD4PHwnRbmk0VjYV_yTlVBnwKfk7fm0prh-9vaRNyiKqEZOh5O_5Yp7DH9bs
```

### Service Worker: `public/firebase-messaging-sw.js`
**Status:** ✅ Configured

Handles background push notifications for web and PWA.

---

## 📦 Capacitor Configuration

### File: `capacitor.config.ts`
**Status:** ✅ Configured

**Mobile App Details:**
- App ID: `com.quidec.chat`
- App Name: `Quidec`
- Build Directory: `dist`

**iOS Settings:**
- Domain binding enabled
- Mobile content mode
- App scheme: `App`

**Android Settings:**
- Mixed content disabled
- Release signing configured

**Plugins Enabled:**
- PushNotifications (badge, sound, alert)
- LocalNotifications
- Camera
- StatusBar (Quidec dark theme)
- SplashScreen

---

## 🚀 Build & Deploy Commands

### Web Deployment
```bash
# Development
pnpm run dev

# Production build
pnpm run build

# Preview built app
pnpm run preview
```

### Android Build & Deploy

#### 1. Sync with Android
```bash
pnpm run build
npx cap sync android
```

#### 2. Build APK for Testing
```bash
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

#### 3. Build AAB for Play Store
```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

#### 4. Deploy to Device (USB Connected)
```bash
cd android
./gradlew installDebug
```

#### 5. Configure Release Signing
Edit `android/app/build.gradle`:
```gradle
signingConfigs {
  release {
    storeFile file('my-release-key.keystore')
    storePassword System.getenv("KEYSTORE_PASSWORD")
    keyAlias System.getenv("KEY_ALIAS")
    keyPassword System.getenv("KEY_PASSWORD")
  }
}

buildTypes {
  release {
    signingConfig signingConfigs.release
  }
}
```

### iOS Build & Deploy

#### 1. Sync with iOS
```bash
pnpm run build
npx cap sync ios
```

#### 2. Open Xcode
```bash
cd ios/App
open App.xcworkspace
```

#### 3. Configure Bundle ID
- Set Bundle ID: `com.quidec.chat`
- Set Team ID: Your Apple Developer Team

#### 4. Configure Signing & Capabilities
- Development Team: Select your team
- Signing Certificate: Automatic or manual
- Capabilities:
  - ✅ Push Notifications
  - ✅ Sign In with Apple
  - ✅ iCloud (for media)

#### 5. Build for Testing
```bash
# Run on simulator
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator

# Run on device (USB connected)
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphoneos -destination 'platform=iOS,name=Device Name'
```

#### 6. Archive for App Store
```bash
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -archivePath ./App.xcarchive -derivedDataPath ./build archive
```

---

## ✅ Verification Checklist

### Before First Build:
- [x] Firebase credentials in `.env`
- [x] `google-services.json` in `android/app/`
- [x] `GoogleService-Info.plist` in `ios/App/App/`
- [x] Android SHA-1 fingerprint registered
- [x] Capacitor config updated with app ID

### Before Release Build:
- [ ] Test on Android device (USB)
- [ ] Test on iOS device (USB)
- [ ] Verify email verification flow works
- [ ] Verify push notifications work
- [ ] Check Firestore Rules are set
- [ ] Check Realtime DB Rules are set
- [ ] Firebase billing alerts configured
- [ ] App signing keys created and secured
- [ ] Release keystore backed up securely

### Firebase Console Checks:
- [ ] Project: `octate-wee`
- [ ] Authentication: Email/Password enabled
- [ ] Firestore: Data stored correctly
- [ ] Realtime DB: Presence data updating
- [ ] Cloud Messaging: FCM tokens received
- [ ] Cloud Storage: Media uploads working
- [ ] Spark Plan: Within free tier limits

---

## 🔐 Security Configuration

### Firebase Security Rules

**Firestore Rules** (`firestore.rules`):
```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - only accessible by owner
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    
    // Chats collection
    match /chats/{chatId} {
      allow read, write: if request.auth != null;
    }
    
    // Messages
    match /messages/{messageId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Realtime Database Rules** (`database.rules.json`):
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "presence": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

---

## 📊 Firebase Project Details

| Item | Value |
|------|-------|
| **Project Name** | octate-wee |
| **Project ID** | octate-wee |
| **Region** | Europe (eu) |
| **Realtime DB Region** | europe-west1 |
| **Plan** | Spark (Free) |
| **Daily Users (Est.)** | ~1,700 |
| **Firestore Quota** | 50K reads/day, 1GB storage |
| **Realtime DB Quota** | 1GB, 100 connections |
| **Storage** | 5GB free |
| **Push Notifications** | Unlimited |

---

## 📱 App Identifiers

| Platform | ID | Bundle/Package |
|----------|----|----|
| **Android** | `1:1016231429284:android:2b5d161f56ac82fba9d231` | `com.quidec.chat` |
| **iOS** | `1:1016231429284:ios:9dbaa73c3a115f18a9d231` | `com.quidec.chat` |
| **Web** | `1:1016231429284:web:4118fbe8207adfc8a9d231` | N/A |

---

## 🔗 Useful Links

- **Firebase Console:** https://console.firebase.google.com/project/octate-wee
- **Google Play Console:** https://play.google.com/console
- **Apple App Store Connect:** https://appstoreconnect.apple.com
- **Capacitor Docs:** https://capacitorjs.com/docs
- **Firebase Auth Docs:** https://firebase.google.com/docs/auth
- **FCM Documentation:** https://firebase.google.com/docs/cloud-messaging

---

## 📞 Troubleshooting

### "Firebase credentials not configured"
- Check `.env` has all `VITE_FIREBASE_*` variables
- Ensure `.env` is in project root
- Rebuild: `pnpm run build`

### Android: "google-services.json not found"
- Ensure file is at: `android/app/google-services.json`
- Run: `npx cap sync android`
- Rebuild: `./gradlew clean assembleDebug`

### iOS: "GoogleService-Info.plist not found"
- Ensure file is at: `ios/App/App/GoogleService-Info.plist`
- Check in Xcode: File Inspector → Target: `App`
- Run: `npx cap sync ios`
- Rebuild in Xcode

### Push Notifications Not Working
- Check FCM token saved in Firestore `users/{uid}/fcmToken`
- Verify VAPID key in `.env` matches Firebase Console
- Check service worker is registered: `navigator.serviceWorker.ready`

### "Module not found: firebase/database"
- Run: `pnpm install`
- Clear node_modules: `pnpm install --no-frozen-lockfile`

---

**Status:** ✅ **Fully Configured for Mobile Deployment**

Your app is ready to build and deploy! 🚀
