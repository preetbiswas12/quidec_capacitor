# Quick Reference Card - Quidec Setup (Spark Plan)

## ⚠️ FIREBASE SPARK PLAN (Free Tier)

**Your plan:** Spark Plan (Free)
**Limitations:**
- ❌ Cloud Functions (requires Blaze)
- ✅ Everything else works!
- ⚠️ Offline notifications limited

| Setting | Value |
|---------|-------|
| **Web App Name** | Quidec |
| **Android App Name** | Quidec Chat |
| **Android Package** | com.quidec.chat |
| **iOS App Name** | Quidec |
| **iOS Bundle ID** | com.quidec.app |
| **Firebase Region** | us-central1 |
| **Platform** | Capacitor.js |

---

## Firebase Project ID

Get from Firebase Console → Project Settings → Copy Project ID

```
YOUR_PROJECT_ID: ___________________________
```

---

## Firebase Credentials

Copy these from Firebase Console → Project Settings → Your apps → Config

```
VITE_FIREBASE_API_KEY = ___________________________
VITE_FIREBASE_AUTH_DOMAIN = ___________________________
VITE_FIREBASE_PROJECT_ID = ___________________________
VITE_FIREBASE_STORAGE_BUCKET = ___________________________
VITE_FIREBASE_MESSAGING_SENDER_ID = ___________________________
VITE_FIREBASE_APP_ID = ___________________________
VITE_FIREBASE_DATABASE_URL = https://____________________.firebaseio.com

REACT_APP_VAPID_KEY = ___________________________
```

---

## Essential File Paths

| File | Location | Status |
|------|----------|--------|
| google-services.json | `android/app/` | ✅ Download from Firebase |
| GoogleService-Info.plist | `ios/App/` | ✅ Download from Firebase |
| .env | Project root | ✅ Create with credentials |
| capacitor.config.ts | Project root | ✅ Already updated |
| firebaseServices.ts | `src/utils/` | ✅ Already created |
| cloudFunctions.ts | `functions/src/index.ts` | ✅ Copy here |
| firestore.rules | Firebase Console | ✅ Deploy |

---

## One-Liner Commands

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build web assets
pnpm build

# Sync to mobile
npx cap sync

# Android build
cd android && ./gradlew assembleDebug && cd ..

# iOS build in Xcode
npx cap open ios

# Deploy to Firebase
firebase deploy
```

---

## Firebase Console Navigation

| What | Path |
|------|------|
| **Authentication** | Build → Authentication |
| **Firestore DB** | Build → Firestore Database |
| **Realtime DB** | Build → Realtime Database |
| **Cloud Storage** | Build → Storage |
| **Cloud Functions** | Build → Functions |
| **Cloud Messaging** | Build → Cloud Messaging |
| **Project Settings** | ⚙️ (top right) |

---

## Enable These Services

**For Spark Plan (Free):**
- [ ] ✅ Authentication (Email/Password)
- [ ] ✅ Firestore Database (test mode → us-central1)
- [ ] ✅ Realtime Database (test mode → us-central1)
- [ ] ✅ Cloud Storage (test mode → us-central1)
- [ ] ✅ Cloud Messaging (for notifications)
- [ ] ❌ Cloud Functions (NOT available in Spark Plan)

**For Blaze Plan (Paid, if you upgrade):**
- [ ] ✅ All of the above
- [ ] ✅ Cloud Functions (enable for automation)

---

## Deploy These Files

### Spark Plan (Free) - DEPLOY THESE:

| What | Command |
|------|---------|
| Firestore Rules | `firebase deploy --only firestore:rules` |
| Realtime DB Rules | `firebase deploy --only database` |
| Web Hosting | `firebase deploy --only hosting` |
| Everything | `firebase deploy` |

**⚠️ NOTE:** Do NOT deploy Cloud Functions (not available in Spark Plan)

### Blaze Plan (Paid) - ADD THESE:

| What | Command |
|------|---------|
| Cloud Functions | `firebase deploy --only functions` |
| All services | `firebase deploy` |

---

## Test on Devices

**Android:**
```bash
# Connect device via USB
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**iOS:**
```bash
# Open in Xcode
npx cap open ios
# Then click Play button in Xcode
```

---

## App Files to Check

✅ **Confirm these exist:**
- `android/app/google-services.json` - Contains Android Firebase config
- `ios/App/GoogleService-Info.plist` - Contains iOS Firebase config
- `.env` - Contains web Firebase config
- `src/utils/firebaseServices.ts` - Firebase backend API
- `functions/src/index.ts` - Cloud Functions code
- `capacitor.config.ts` - Capacitor configuration

---

## Troubleshooting Quick Fixes

| Problem | Fix |
|---------|-----|
| APK won't build | `cd android && ./gradlew clean && cd ..` |
| Pods error | `cd ios/App && rm -rf Pods && pod install && cd ../..` |
| Firebase not found | Check `.env` file all values filled |
| App crashes on startup | Check `google-services.json` in `android/app/` |
| Notifications don't work | Check service worker and FCM token |
| "Cloud Functions error" | You're on Spark Plan (normal!) - Not available |
| Offline notifications fail | Spark Plan limitation - Upgrade to Blaze |
| "Quota exceeded" error | Hit 50K reads/day - Optimize queries or upgrade |

---

## Spark Plan Specific Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| No offline notifications | Spark Plan limitation | Users still see msgs when online. Upgrade to Blaze. |
| Cloud Functions won't deploy | Spark Plan (no Cloud Functions) | Upgrade to Blaze plan ($1-3/month) |
| Message delivery slow | May need optimization | Check Firestore indexes |
| 50K read limit hit | Using Spark Plan | Optimize queries or upgrade to Blaze |

---

## Important Notes

⚠️ **DO THIS FIRST:**
1. Create Firebase project
2. Enable services (Step E guide)
3. Download config files (google-services.json & GoogleService-Info.plist)
4. Create .env file with credentials

⚠️ **DEPLOY IN THIS ORDER (Spark Plan):**
1. Firestore rules: `firebase deploy --only firestore:rules`
2. Web hosting: `firebase deploy --only hosting`
3. Test on devices
4. (Optional) Upgrade to Blaze and deploy Cloud Functions later

⚠️ **Test before production:**
- Test web version first (`pnpm dev`)
- Test Android APK on device
- Test iOS on simulator/device
- Verify notifications (online - will work!)
- Note: Offline notifications require Blaze plan upgrade

---

## When to Upgrade to Blaze Plan

Upgrade if you need:
- ✅ Offline push notifications
- ✅ Cloud Functions (auto-cleanup, automation)
- ✅ More than 1,700 users/day
- ✅ Detailed analytics
- ✅ Better global performance

**Cost:** Typically $1-3/month (first $2.50/month FREE!)

---

## Store Submission

**Google Play Store:**
- Time: 24-48 hours
- Cost: $25 one-time
- URL: https://play.google.com/console

**Apple App Store:**
- Time: 24-48 hours
- Cost: $99/year
- URL: https://appstoreconnect.apple.com

---

## Progress Checklist

```
SETUP PHASE:
  [ ] Firebase project created
  [ ] Services enabled
  [ ] Config files downloaded (google-services.json & GoogleService-Info.plist)
  [ ] .env file created with all values
  [ ] Dependencies installed (pnpm install)

DEPLOYMENT PHASE:
  [ ] Firestore rules deployed
  [ ] Cloud Functions deployed
  [ ] Web app deployed

TESTING PHASE:
  [ ] Web version tested (localhost:5173)
  [ ] Android APK built and tested on device
  [ ] iOS app built and tested on simulator/device
  [ ] All features work (auth, messages, notifications)

PRODUCTION PHASE:
  [ ] Production security rules enabled
  [ ] App names and logos configured
  [ ] Submitted to Google Play Store
  [ ] Submitted to Apple App Store
```

---

## Support Resources

| Resource | Link |
|----------|------|
| Complete Setup | FIREBASE_COMPLETE_SETUP.md |
| Step E (Enable Services) | FIREBASE_STEP_E_GUIDE.md |
| Capacitor Setup | CAPACITOR_MOBILE_SETUP.md |
| Full Step-by-Step | COMPLETE_STEP_BY_STEP_GUIDE.md |
| API Reference | FIREBASE_QUICK_REFERENCE.md |
| Before/After | BEFORE_AFTER_COMPARISON.md |

---

## Time Estimates

| Task | Time |
|------|------|
| Firebase Setup | 15 min |
| Enable Services | 20 min |
| Download & Configure | 20 min |
| Install Dependencies | 5 min |
| Deploy Rules/Functions | 20 min |
| Test Web Version | 10 min |
| Build Android APK | 10 min |
| Build iOS App | 10 min |
| **TOTAL** | **~110 minutes** |

---

## Contact & Support

If you get stuck:
1. Check the relevant guide above
2. Check Firebase Console logs
3. Check `firebase functions:log` for function errors
4. Check browser console for client-side errors

---

## Remember

✅ All the hard work is done - files are created and ready
✅ You just need to follow the step-by-step guide
✅ Each phase takes only a few minutes
✅ You'll have a fully working app in ~2 hours

**Start with COMPLETE_STEP_BY_STEP_GUIDE.md and follow Phase by Phase! 🚀**
