# Command Copy-Paste Guide (Copy & Paste These Commands)

## ⚠️ SPARK PLAN IMPORTANT NOTE

This guide is for **Spark Plan (Free Tier)**. Section 7 (Cloud Functions) is **SKIPPED** for Spark Plan.

**Cloud Functions** require **Blaze Plan** ($1-3/month). Skip sections 7-8 below.

See [SPARK_PLAN_GUIDE.md](./SPARK_PLAN_GUIDE.md) for why and when to upgrade.

---

## Your Exact Setup Commands

Just copy and paste these commands in order. Follow the sections.

---

## Section 1: Firebase Console Setup (Do This First)

### ⚠️ MANUAL STEPS (Can't automate - must do in console)

1. Go to: https://console.firebase.google.com
2. Create a new Firebase project named "free-cluely"
3. In left sidebar, go to "Build" section and enable:
   - ✅ Authentication (Email/Password)
   - ✅ Firestore Database
   - ✅ Realtime Database
   - ✅ Cloud Storage
   - ✅ Cloud Messaging
   - ❌ Cloud Functions (NOT available in Spark Plan)

4. Download config files from Firebase Console:
   - `google-services.json` → Place in: `android/app/google-services.json`
   - `GoogleService-Info.plist` → Place in: `ios/App/GoogleService-Info.plist`

5. Copy your Firebase credentials from Console → Project Settings

---

## Section 2: Install Firebase CLI

Run this once:

```bash
npm install -g firebase-tools
```

---

## Section 3: Login to Firebase

```bash
firebase login
```

This will open your browser. Log in with your Google account.

---

## Section 4: Create .env File

Create a new file named `.env` in your project root with:

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN_HERE
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID_HERE
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET_HERE
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID_HERE
VITE_FIREBASE_APP_ID=YOUR_APP_ID_HERE
VITE_FIREBASE_DATABASE_URL=https://YOUR_PROJECT_ID.firebaseio.com
REACT_APP_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

Replace each `YOUR_...` with actual values from Firebase Console.

---

## Section 5: Create .firebaserc File

Create a new file named `.firebaserc` in your project root:

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID_HERE"
  }
}
```

Replace `YOUR_PROJECT_ID_HERE` with your actual Firebase project ID.

---

## Section 6: Install Dependencies

```bash
cd c:\Users\preet\Downloads\quide_dev\quidec_capacitor

pnpm install
```

Or with npm:
```bash
npm install
```

---

## Section 7: Setup Cloud Functions (BLAZE PLAN ONLY - SKIP FOR SPARK PLAN) ❌

⚠️ **SPARK PLAN USERS: SKIP THIS SECTION AND GO TO SECTION 9**

If you want to use Cloud Functions, upgrade to Blaze Plan first. Then run:

```bash
firebase init functions
```

When asked:
- Language: TypeScript
- ESLint: Yes
- Dependencies: Yes
- npm install: Yes

Then replace the contents of `functions/src/index.ts` with the code from `src/utils/cloudFunctions.ts`.

---

## Section 8: Install Function Dependencies (BLAZE PLAN ONLY - SKIP FOR SPARK PLAN) ❌

⚠️ **SPARK PLAN USERS: SKIP THIS SECTION AND GO TO SECTION 9**

```bash
cd functions
npm install
cd ..
```

---

## Section 9: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

Wait for completion (1-2 minutes).

---

## Section 10: Deploy Realtime Database Rules

```bash
firebase deploy --only database
```

Wait for completion (1-2 minutes).

---

## Section 11: Deploy Cloud Functions (BLAZE PLAN ONLY - SKIP FOR SPARK PLAN) ❌

⚠️ **SPARK PLAN USERS: SKIP THIS SECTION**

If you have Blaze Plan and completed Section 7:

```bash
firebase deploy --only functions
```

Wait for completion (3-5 minutes). This is slower as it's compiling TypeScript.

**For Spark Plan:** Your app works perfectly without Cloud Functions!

---

## Section 12: Test Web Version

```bash
pnpm dev
```

Open browser at: `http://localhost:5173`

Test:
- Register new account
- Login
- Send messages
- Check message ticks (📤 📨 👀)

Press Ctrl+C to stop.

---

## Section 13: Build Web Assets

```bash
pnpm build
```

This creates `dist/` folder with optimized web app.

---

## Section 14: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

Your web app will be live at: `https://YOUR_PROJECT_ID.web.app`

---

## Section 15: Sync to Android

```bash
npx cap sync android
```

---

## Section 16: Build Android APK

```bash
cd android
./gradlew assembleDebug
cd ..
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Section 17: Install APK on Android Device

Connect your Android device via USB and run:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or double-click the APK file from the location above.

---

## Section 18: Sync to iOS

```bash
npx cap sync ios
```

---

## Section 19: Install iOS Pod Dependencies

```bash
cd ios/App
pod install
cd ../..
```

---

## Section 20: Open iOS in Xcode

```bash
npx cap open ios
```

Then in Xcode:
1. Select device/simulator at top
2. Click Play button (▶)
3. App will build and launch

---

## Section 21: Deploy Everything at Once (Shortcut)

To deploy all Firebase services together:

```bash
firebase deploy
```

This deploys rules + functions + hosting all in one command.

---

## All Commands in One Place (Quick Copy-Paste)

If you've already done the manual steps and file creation, here are all commands:

```bash
# Step 1: Install CLI
npm install -g firebase-tools

# Step 2: Login
firebase login

# Step 3: Install dependencies
pnpm install

# Step 4: Setup functions
firebase init functions

# Step 5: Install function dependencies
cd functions && npm install && cd ..

# Step 6: Deploy everything
firebase deploy

# Step 7: Test web
pnpm dev

# Step 8: Build web
pnpm build

# Step 9: Build Android
pnpm build && npx cap sync android && cd android && ./gradlew assembleDebug && cd ..

# Step 10: Open iOS in Xcode
pnpm build && npx cap sync ios && npx cap open ios
```

---

## Step-by-Step for Android (From Scratch)

```bash
# 1. Go to project directory
cd c:\Users\preet\Downloads\quide_dev\quidec_capacitor

# 2. Install everything
pnpm install

# 3. Setup Firebase
npm install -g firebase-tools
firebase login
firebase init functions

# 4. Copy Cloud Functions code
# (Manual: Copy src/utils/cloudFunctions.ts to functions/src/index.ts)

# 5. Install function dependencies
cd functions && npm install && cd ..

# 6. Deploy
firebase deploy

# 7. Build web
pnpm build

# 8. Sync to Android
npx cap sync android

# 9. Build APK
cd android && ./gradlew assembleDebug && cd ..

# 10. Install on device
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Step-by-Step for iOS (From Scratch)

```bash
# 1. Go to project directory
cd c:\Users\preet\Downloads\quide_dev\quidec_capacitor

# 2. Install everything
pnpm install

# 3. Setup Firebase
npm install -g firebase-tools
firebase login
firebase init functions

# 4. Copy Cloud Functions code
# (Manual: Copy src/utils/cloudFunctions.ts to functions/src/index.ts)

# 5. Install function dependencies
cd functions && npm install && cd ..

# 6. Deploy
firebase deploy

# 7. Build web
pnpm build

# 8. Sync to iOS
npx cap sync ios

# 9. Install pods
cd ios/App && pod install && cd ../..

# 10. Open in Xcode
npx cap open ios

# (Then click Play button in Xcode)
```

---

## Manual Steps Checklist

Before running these commands, do these manually:

- [ ] Create Firebase project
- [ ] Enable services in Firebase Console (Auth, Firestore, Realtime DB, Storage, Functions, Messaging)
- [ ] Download `google-services.json` from Firebase → Place in `android/app/`
- [ ] Download `GoogleService-Info.plist` from Firebase → Place in `ios/App/`
- [ ] Create `.env` file with Firebase credentials
- [ ] Create `.firebaserc` file with project ID
- [ ] Copy `src/utils/cloudFunctions.ts` code to `functions/src/index.ts`

---

## Troubleshooting Commands

If something goes wrong:

```bash
# Clear Android build cache
cd android && ./gradlew clean && cd ..

# Rebuild Android
cd android && ./gradlew assembleDebug && cd ..

# Clear pod cache (iOS)
cd ios/App && rm -rf Pods && pod install && cd ../..

# View Firebase function logs
firebase functions:log

# Reinstall node modules
rm -rf node_modules && pnpm install

# Full rebuild
pnpm build && npx cap sync && firebase deploy
```

---

## Real-Time Logs

To see what's happening in Cloud Functions:

```bash
firebase functions:log --lines 50
```

---

## Final Deployment Commands

When app is ready for production:

```bash
# Deploy everything
firebase deploy

# Or just specific parts:
firebase deploy --only functions           # Deploy functions only
firebase deploy --only firestore:rules     # Deploy Firestore rules only
firebase deploy --only database            # Deploy Realtime DB rules
firebase deploy --only hosting             # Deploy web app only
```

---

## Expected Output

When everything works, you should see:

```
✔ functions[...] Deployed successfully
✔ firestore: Rules have been successfully published
✔ database: Rules have been successfully published
✔ Hosting URL: https://YOUR_PROJECT.web.app
```

---

## Success Indicators

✅ All commands complete without errors
✅ Web app opens at localhost:5173
✅ Can register and login
✅ Can send messages
✅ Firebase Console shows data being written
✅ APK installs on Android device
✅ App launches on iOS simulator

---

**Copy and paste these commands to get your Quidec Chat app deployed!**
