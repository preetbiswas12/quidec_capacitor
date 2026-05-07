# Complete Step-by-Step Firebase + Capacitor Setup (Spark Plan)

## Your Setup: Quidec Chat (Android) + Quidec (Web/iOS)

### ⚠️ SPARK PLAN (Free Tier)

This guide is optimized for **Firebase Spark Plan** with these limitations:

| Feature | Spark Plan | Limit |
|---------|-----------|-------|
| ✅ Firestore Database | Yes | 1GB storage, 50K reads/day |
| ✅ Realtime Database | Yes | 1GB storage, 100 connections |
| ✅ Authentication | Yes | Unlimited |
| ✅ Cloud Storage | Yes | 5GB free |
| ✅ Cloud Messaging (FCM) | Yes | Unlimited |
| ❌ Cloud Functions | NO | Background triggers not available |
| ⚠️ Firebase Hosting | Limited | May have restrictions |

**Setup Time: ~1.5-2 hours** (shorter because no Cloud Functions)

**What This Means:**
- ✅ You CAN: Build full chat app, send messages, manage friends, authenticate users
- ❌ You CANNOT: Use server-side automation (auto-notifications, auto-cleanup)
- ✅ Workaround: Client sends notifications on-demand (when user is online)

---

## Phase 1: Firebase Project Setup (15 minutes)

### Step 1.1: Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Create a project"** (or **"Add project"** if you have existing projects)
3. Fill in:
   - **Project name**: `free-cluely` (or your project name)
   - **Analytics**: Can skip for now
4. Click **"Create project"**
5. Wait for project to be created (1-2 minutes)
6. Click **"Continue"** when ready

✅ **Firebase project created**

---

### Step 1.2: Get Your Project Credentials

1. In Firebase Console, click the **⚙️ gear icon** (Project Settings) - top right
2. Go to **"Your apps"** tab
3. You should see your Web app listed
4. Click on it to expand
5. You'll see your Firebase config:
   ```
   apiKey: "..."
   authDomain: "..."
   projectId: "..."
   storageBucket: "..."
   messagingSenderId: "..."
   appId: "..."
   ```
6. **Copy all these values** - you'll need them soon

✅ **Credentials ready**

---

## Phase 2: Enable Firebase Services (15 minutes - Spark Plan)

### Services to Enable in Spark Plan:
✅ Authentication (Email/Password)
✅ Firestore Database
✅ Realtime Database
✅ Cloud Storage
✅ Cloud Messaging (FCM)
❌ Cloud Functions (not available - would require Blaze plan)

---

### Step 2.1: Enable Authentication

1. Left sidebar → **Build** → **Authentication**
2. Click **"Get started"**
3. Click **"Email/Password"** (the first option)
4. Toggle **"Enable"** to **ON**
5. Scroll down and click **"Save"**

✅ **Email/Password authentication enabled**

---

### Step 2.2: Create Firestore Database

1. Left sidebar → **Build** → **Firestore Database**
2. Click **"Create database"**
3. **Location**: Select `us-central1` (or closest to you)
4. **Security rules**: Select **"Start in test mode"** (we'll fix security later)
5. Click **"Create"**
6. Wait 1-2 minutes for database to be created

✅ **Firestore Database created**

---

### Step 2.3: Create Realtime Database

1. Left sidebar → **Build** → **Realtime Database**
2. Click **"Create Database"** (if you don't see this, click **"Create"**)
3. **Location**: Select `us-central1` (same as Firestore)
4. **Security rules**: Select **"Start in test mode"**
5. Click **"Create"**
6. Wait 1-2 minutes for database to be created

✅ **Realtime Database created**

---

### Step 2.4: Enable Cloud Storage

1. Left sidebar → **Build** → **Storage**
2. Click **"Get started"**
3. **Location**: Select `us-central1`
4. **Security rules**: Select **"Start in test mode"**
5. Click **"Create"**

✅ **Cloud Storage enabled**

---

### Step 2.5: Enable Cloud Messaging (FCM) - For Notifications

1. Left sidebar → **Build** → **Cloud Messaging**
2. You should see your **Server API Key** and **Web Configuration**
3. Keep this tab open (you'll need the VAPID key later)

✅ **Cloud Messaging ready**

**Note:** Cloud Functions are NOT available in Spark Plan. Notifications will be sent from client-side when users are online.

---

## Phase 3: Download Mobile Config Files (10 minutes)

### Step 3.1: Download Android Config

1. In Firebase Console, click **"Add app"** → **Android icon** (if not already added)
2. **Package name**: Enter your Android package name
   - Example: `com.quidec.chat`
3. **App nickname**: `Quidec Chat`
4. Click **"Register app"**
5. Click **"Download google-services.json"**
6. Save the file

**Place the file:**
- Create folder: `android/app/` (if doesn't exist)
- Place file: `android/app/google-services.json`

✅ **Android config downloaded**

---

### Step 3.2: Download iOS Config

1. In Firebase Console, click **"Add app"** → **iOS icon** (if not already added)
2. **iOS bundle ID**: Enter your iOS bundle ID
   - Example: `com.quidec.app`
3. **App nickname**: `Quidec`
4. Click **"Register app"**
5. Click **"Download GoogleService-Info.plist"**
6. Save the file

**Place the file:**
- Create folder: `ios/App/` (if doesn't exist)
- Place file: `ios/App/GoogleService-Info.plist`

✅ **iOS config downloaded**

---

## Phase 4: Update Your Project Files (20 minutes)

### Step 4.1: Create .env File

1. In your project root directory, create a new file: `.env`

2. Add all Firebase credentials:

```bash
# Firebase Web Configuration
VITE_FIREBASE_API_KEY=YOUR_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN_HERE
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID_HERE
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET_HERE
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID_HERE
VITE_FIREBASE_APP_ID=YOUR_APP_ID_HERE
VITE_FIREBASE_DATABASE_URL=https://YOUR_PROJECT_ID.firebaseio.com

# Push Notifications VAPID Key
REACT_APP_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

3. Replace each `YOUR_...` with actual values from Firebase Console

4. Save the file

✅ **.env file created and configured**

---

### Step 4.2: Update capacitor.config.ts

**File**: `capacitor.config.ts`

Replace the entire content with:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quidec.chat',
  appName: 'Quidec Chat',
  webDir: 'dist',
  
  server: {
    androidScheme: 'https',
  },
  
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuthentication: false,
      providers: ['google.web', 'apple.web'],
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
```

Save the file.

✅ **Capacitor configured**

---

### Step 4.3: Update App.tsx

**File**: `src/app/App.tsx` (already updated in previous migration)

Verify it has Firebase initialization:
- Should import `authService`, `presenceService`, `notificationService`
- Should have auth state listener setup
- Should have presence tracking setup

If not, copy the updated version from the previous migration.

✅ **App.tsx ready**

---

### Step 4.4: Update Android App Name

**File**: `android/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Quidec Chat</string>
</resources>
```

If the file doesn't exist, create it.

✅ **Android app name set**

---

### Step 4.5: Update iOS App Name

**Using Xcode:**
1. Open `ios/App/App.xcodeproj` in Xcode
2. Click on **App** (in left panel under TARGETS)
3. Go to **General** tab
4. Find **Display Name** field
5. Change it to: `Quidec`
6. Save (Cmd+S)

Or **manually edit Info.plist:**
1. Open `ios/App/App/Info.plist`
2. Find `<key>CFBundleDisplayName</key>`
3. Change the value to: `Quidec`
4. Save

✅ **iOS app name set**

---

## Phase 5: Install Dependencies (10 minutes)

### Step 5.1: Install Firebase SDK

```bash
pnpm install firebase
```

Or if using npm:
```bash
npm install firebase
```

### Step 5.2: Install Capacitor Firebase Plugins

```bash
pnpm add @capacitor-firebase/authentication
pnpm add @capacitor-firebase/messaging
```

Or if using npm:
```bash
npm install @capacitor-firebase/authentication
npm install @capacitor-firebase/messaging
```

### Step 5.3: Sync Capacitor

```bash
npx cap sync
```

This syncs your web code to native platforms.

✅ **All dependencies installed**

---

## Phase 6: Deploy Firebase Security Rules (5 minutes)

### ⚠️ SPARK PLAN NOTE:
**Cloud Functions are NOT available in Spark Plan.** This phase only deploys security rules. Notifications will be handled by the client-side app when users are online.

### Step 6.1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 6.2: Login to Firebase

```bash
firebase login
```

Browser will open for authentication. Login with your Google account.

### Step 6.3: Create .firebaserc File

In your project root, create file: `.firebaserc`

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID"
  }
}
```

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID (from Firebase Console).

### Step 6.4: Deploy Firestore Security Rules

```bash
firebase deploy --only firestore:rules
```

Wait for deployment to complete (usually 1-2 minutes).

✅ **Firestore rules deployed**

### Step 6.5: Deploy Realtime Database Rules

```bash
firebase deploy --only database
```

Wait for deployment to complete (usually 1-2 minutes).

✅ **Realtime Database rules deployed**

**What's NOT deployed (Spark Plan limitation):**
- ❌ Cloud Functions (requires Blaze plan)
- Solution: App sends notifications directly when recipient is online

---

## Phase 7: Test Web Version (10 minutes)

### Step 7.1: Start Development Server

```bash
pnpm dev
```

App should start on `http://localhost:5173`

### Step 7.2: Test Registration

1. Click **"Sign Up"** or **"Register"**
2. Enter email, username, password
3. Click **"Register"**
4. Should see success message

✅ **Registration works**

### Step 7.3: Test Login

1. Click **"Logout"** if already logged in
2. Click **"Login"**
3. Enter email and password
4. Click **"Login"**
5. Should be logged in

✅ **Login works**

### Step 7.4: Test Messages

1. Create a second account (in incognito tab)
2. Send message between accounts
3. Check message status: should show 📤 → 📨 → 👀

✅ **Messages work**

### Step 7.5: Test Notifications

⚠️ **SPARK PLAN LIMITATION:**
- Notifications only work when **recipient is online**
- Offline notifications require Cloud Functions (Blaze plan)
- Workaround: App checks for new messages when user comes online

**To test:**
1. Have both users logged in on different browsers/devices
2. User A sends message to User B
3. User B should see notification appear (if online)
4. If User B goes offline, message is stored in Firestore (but no push notification)

✅ **Notifications work (when recipient is online)**

---

## Phase 8: Build Android APK (15 minutes)

### Step 8.1: Build Web Assets

```bash
pnpm build
```

This creates optimized web build in `dist/` folder.

### Step 8.2: Sync Android Files

```bash
npx cap sync android
```

This copies web assets to Android project.

### Step 8.3: Build APK

```bash
cd android
./gradlew assembleDebug
cd ..
```

APK will be created at: `android/app/build/outputs/apk/debug/app-debug.apk`

This is your test APK.

✅ **Android APK built**

---

### Step 8.4: Test on Device

**Connect Android device:**
- Enable USB debugging on device
- Connect via USB cable

**Install APK:**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or open `android/app/build/outputs/apk/debug/` and double-click `app-debug.apk`

**Test the app:**
- App should launch on device
- Test registration, login, messages
- Check if notifications appear

✅ **Android app tested**

---

## Phase 9: Build iOS App (15 minutes)

### Step 9.1: Build Web Assets

```bash
pnpm build
```

### Step 9.2: Sync iOS Files

```bash
npx cap sync ios
```

### Step 9.3: Install Pod Dependencies

```bash
cd ios/App
pod install
cd ../..
```

### Step 9.4: Open in Xcode

```bash
npx cap open ios
```

Or manually:
1. Open `ios/App/App.xcodeproj` in Xcode

### Step 9.5: Configure Signing

**In Xcode:**
1. Select **App** target
2. Go to **General** tab
3. Scroll to **Team**
4. Select your team (if using personal team, it's free)

### Step 9.6: Build and Run

**In Xcode:**
1. Select device/simulator at top
2. Click the **Play (▶)** button
3. App will build and launch

**Test the app:**
- App should launch on simulator/device
- Test registration, login, messages
- Check if notifications appear

✅ **iOS app tested**

---

## Phase 10: Production Security Rules (5 minutes)

### Step 10.1: Update Firestore Rules

1. Go to Firebase Console → **Firestore Database** → **Rules**
2. Replace content with code from `src/utils/firestore.rules`
3. Click **"Publish"**

### Step 10.2: Update Realtime Database Rules

1. Go to Firebase Console → **Realtime Database** → **Rules**
2. Replace with:
```json
{
  "rules": {
    "presence": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    },
    "typing": {
      "$conversationId": {
        "$uid": {
          ".read": "auth != null",
          ".write": "$uid === auth.uid"
        }
      }
    },
    ".read": false,
    ".write": false
  }
}
```
3. Click **"Publish"**

✅ **Production security enabled**

---

## Phase 11: Deploy Web App (5 minutes) - Optional for Spark Plan

### ⚠️ SPARK PLAN NOTE:
Firebase Hosting is available but may have limitations. For production use, consider:
- Alternative: GitHub Pages (free)
- Alternative: Vercel (free tier available)
- Paid upgrade: Blaze plan for full hosting features

### Step 11.1: Initialize Firebase Hosting (Optional)

```bash
firebase init hosting
```

Follow prompts:
- Public directory: `dist`
- Configure as SPA: **Yes**
- File: `dist/index.html`

### Step 11.2: Build and Deploy (Optional)

```bash
pnpm build
firebase deploy --only hosting
```

Your web app will be deployed to:
`https://YOUR_PROJECT_ID.web.app`

**Or skip this and use GitHub Pages/Vercel for free hosting.**

✅ **Web app deployed (optional)**

---

## Phase 12: Submit to Stores (30 minutes per store)

### ⚠️ SPARK PLAN CONSIDERATION:
Before submitting to stores, consider upgrading to **Blaze plan** ($1-2/month typical cost for startup) to get:
- ✅ Cloud Functions (auto-notifications, cleanup, etc.)
- ✅ Full Firebase Hosting capabilities
- ✅ Better performance and scalability

**For now, you can still submit with Spark Plan**, but features will be limited.

### For Google Play Store (Android)

1. Create Google Play Developer Account
   - https://play.google.com/console
   - Pay $25 one-time

2. Build production APK:
   ```bash
   cd android
   ./gradlew bundleRelease
   cd ..
   ```

3. Upload to Play Console
4. Add screenshots, description, etc.
5. Submit for review (24-48 hours)

### For Apple App Store (iOS)

1. Create Apple Developer Account
   - https://developer.apple.com
   - Pay $99/year

2. In Xcode:
   - **Product** → **Archive**
   - Click **Distribute App**
   - Select **App Store Connect**

3. On App Store Connect:
   - Add screenshots, description, etc.
   - Submit for review (24-48 hours)

---

## Checklist Summary (Spark Plan)

- [ ] **Phase 1**: Firebase project created
- [ ] **Phase 2**: Services enabled (Auth, Firestore, Realtime DB, Storage, Cloud Messaging)
- [ ] **Phase 3**: Config files downloaded (google-services.json & GoogleService-Info.plist)
- [ ] **Phase 4**: Project files updated (.env, capacitor.config.ts, app names)
- [ ] **Phase 5**: Dependencies installed
- [ ] **Phase 6**: Security rules deployed (NO Cloud Functions in Spark Plan)
- [ ] **Phase 7**: Web version tested
- [ ] **Phase 8**: Android APK built & tested
- [ ] **Phase 9**: iOS app built & tested
- [ ] **Phase 10**: Production security enabled
- [ ] **Phase 11**: Web app deployed (optional)
- [ ] **Phase 12**: (Optional) Submitted to stores

---

## Total Time Required (Spark Plan)

| Phase | Time | Note |
|-------|------|------|
| 1. Firebase Setup | 15 min | |
| 2. Enable Services | 15 min | Cloud Functions skipped |
| 3. Download Configs | 10 min | |
| 4. Update Files | 20 min | |
| 5. Install Dependencies | 10 min | |
| 6. Deploy Security Rules | 5 min | No Cloud Functions |
| 7. Test Web | 10 min | Limited notifications |
| 8. Build Android | 15 min | |
| 9. Build iOS | 15 min | |
| 10. Production Security | 5 min | |
| 11. Deploy Web | 5 min | Optional |
| **TOTAL** | **~125 minutes** | **≈ 2 hours** |

**Savings with Spark Plan:** No Cloud Functions deployment = 20 minutes faster! ⚡

---

## 📊 Spark Plan Limitations & Solutions

### What Works ✅
| Feature | Spark Plan | Works |
|---------|-----------|-------|
| User Authentication | Firestore + Auth | ✅ Full |
| Send/Receive Messages | Firestore | ✅ Full |
| Message Status Tracking | Firestore | ✅ Full (📤 📨 👀) |
| Online/Offline Presence | Realtime DB | ✅ Full |
| Typing Indicators | Realtime DB | ✅ Full |
| Friend Management | Firestore | ✅ Full |
| File Upload | Cloud Storage | ✅ Full (5GB free) |
| Web App | Hosting | ✅ Basic |

### What Doesn't Work ❌
| Feature | Limitation | Solution |
|---------|-----------|----------|
| Push Notifications (Offline) | No Cloud Functions | Upgrade to Blaze |
| Auto Message Cleanup | No Cloud Functions | Manual cleanup |
| Automatic Presence Broadcast | No Cloud Functions | Client-side sync |
| Firebase Hosting (Full) | Limited | Use GitHub Pages or Vercel |

### When to Upgrade to Blaze Plan

**Upgrade if you want:**
- ✅ Offline push notifications
- ✅ Automatic cleanup functions
- ✅ Better hosting performance
- ✅ Production-ready scalability

**Cost:** ~$1-3/month for typical startup usage
- First $2.50/month FREE
- Pay only for what you use

**How to upgrade:**
1. Go to Firebase Console → Project Settings → Billing
2. Click "Upgrade to Blaze Plan"
3. Add payment method
4. Deploy Cloud Functions: `firebase deploy --only functions`

---

## Spark Plan vs Blaze Plan Comparison

| Feature | Spark (Free) | Blaze (Pay-as-you-go) |
|---------|-------------|----------------------|
| Firestore | 1GB + 50K reads/day | Unlimited (pay per use) |
| Realtime DB | 1GB + 100 connections | Unlimited |
| Cloud Functions | ❌ NO | ✅ YES (auto-triggers) |
| Notifications | ❌ Offline | ✅ Full push notifications |
| Cloud Hosting | ⚠️ Limited | ✅ Full |
| Cost | FREE | $1-10/month (typical) |

---

## Troubleshooting for Spark Plan

| Issue | Spark Plan Cause | Solution |
|-------|-----------------|----------|
| Offline notifications don't work | No Cloud Functions | Upgrade to Blaze or use manual sync |
| Firestore rate limit exceeded | 50K reads/day limit | Optimize queries or upgrade |
| Realtime DB disconnects | 100 connection limit | Upgrade to Blaze |
| App slow | Firestore/Realtime DB load | Optimize indexes or upgrade |

---

| Issue | Solution |
|-------|----------|
| APK won't build | Clear cache: `cd android && ./gradlew clean && cd ..` |
| Pods fail on iOS | `cd ios/App && rm -rf Pods && pod install && cd ../..` |
| Firebase config not found | Check `.env` file has all values |
| Notifications not working | Check FCM token saved in Firestore |
| App crashes on launch | Check `google-services.json` in `android/app/` |
| Can't connect to Firebase | Check internet connection and firewall |

---

## Next Steps After Setup

1. **Customize your app**
   - Update colors, fonts, branding
   - Add your logo to both Android and iOS

2. **Test thoroughly**
   - Test all features on real devices
   - Test offline functionality
   - Test notifications

3. **Gather feedback**
   - Beta test with small group
   - Fix any issues

4. **Deploy to stores**
   - Google Play Store for Android
   - Apple App Store for iOS

---

## Questions?

Refer to:
- 📖 **Firebase Setup**: FIREBASE_COMPLETE_SETUP.md
- 📱 **Capacitor Setup**: CAPACITOR_MOBILE_SETUP.md
- 📋 **Quick Reference**: FIREBASE_QUICK_REFERENCE.md
- 📝 **Step E Guide**: FIREBASE_STEP_E_GUIDE.md

**You're all set! 🚀**
