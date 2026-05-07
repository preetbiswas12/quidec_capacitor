# 🚀 Quidec Chat - Firebase + Capacitor

A complete, production-ready mobile chat application built with **React**, **Capacitor.js**, and **Firebase** (Spark Plan).

**Status:** ✅ **Ready to Deploy** | 📱 Android & iOS | 🌐 Web | 💬 Real-time Messaging

---

## ⚡ Quick Start

### If You're Using **Spark Plan (Free):**

1. **First, read this:** [🎯 SPARK_PLAN_GUIDE.md](./SPARK_PLAN_GUIDE.md) - Understand your setup
2. **Then, follow this:** [📖 COMPLETE_STEP_BY_STEP_GUIDE.md](./COMPLETE_STEP_BY_STEP_GUIDE.md) - ~2 hours to deploy
3. **Reference:** [📋 QUICK_REFERENCE_CARD.md](./QUICK_REFERENCE_CARD.md) - Commands & troubleshooting

### If You're Using **Blaze Plan (Paid):**

- Start with: [📖 COMPLETE_STEP_BY_STEP_GUIDE.md](./COMPLETE_STEP_BY_STEP_GUIDE.md)
- All features including Cloud Functions available
- Same ~2 hour setup time

---

## 📱 What You Get

### Core Features - All Work in Spark Plan ✅

```
✅ Real-time Messaging
✅ Online/Offline Status  
✅ Typing Indicators
✅ Friend Requests & Management
✅ User Profiles & Search
✅ Message Status Tracking (📤 📨 👀)
✅ File/Image Uploads
✅ Cross-platform (Android, iOS, Web)
```

### Spark Plan Limitations ⚠️

```
⚠️  Offline push notifications (users won't wake up)
    → Users see messages when they come online
    → Upgrade to Blaze for offline notifications

❌ Cloud Functions (not available)
   → Auto-cleanup, auto-notifications require upgrade
```

**[Learn More →](./SPARK_PLAN_GUIDE.md)**

---

## 🏗️ Architecture

```
┌─────────────────┐
│   React + Vite  │  Frontend
└────────┬────────┘
         │
    ┌────▼─────────────────────┐
    │  Capacitor.js            │  Native Bridge
    ├────┬─────────────┬────────┤
    │    │             │        │
┌───▼──┐ │ ┌────────┐ │ ┌─────▼──┐
│Android│ │ │  Web   │ │ │  iOS   │
└───────┘ │ └────────┘ │ └────────┘
          │             │
          └─────┬───────┘
                │
         ┌──────▼──────────────┐
         │   Firebase (Spark)  │
         ├──────────────────────┤
         │ • Authentication    │
         │ • Firestore DB      │
         │ • Realtime DB       │
         │ • Cloud Storage     │
         │ • Cloud Messaging   │
         └─────────────────────┘
```

---

## 📋 Documentation

### Setup & Getting Started
- 🎯 [Spark Plan Guide](./SPARK_PLAN_GUIDE.md) - **START HERE**
- 📖 [Complete Step-by-Step Guide](./COMPLETE_STEP_BY_STEP_GUIDE.md) - Full setup (2 hours)
- 📋 [Quick Reference Card](./QUICK_REFERENCE_CARD.md) - Commands & troubleshooting
- 🚀 [Getting Started](./GETTING_STARTED.md) - Overview of what's included

### Firebase Setup
- 🔧 [Firebase Step E: Enable Services](./FIREBASE_STEP_E_GUIDE.md) - Service setup
- 🔐 [Firebase Complete Setup](./FIREBASE_COMPLETE_SETUP.md) - Configuration
- 🔑 [Firebase Quick Reference](./FIREBASE_QUICK_REFERENCE.md) - API reference

### Mobile Development
- 📱 [Mobile App Setup](./MOBILE_APP_SETUP.md) - Capacitor configuration
- 🏗️ [Android Build Guide](./ANDROID_BUILD.md) - Build for Android
- 📦 [Mobile Build Guide](./MOBILE_BUILD_GUIDE.md) - General build info
- 🛠️ [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) - Before shipping

### Advanced Topics
- 🏛️ [Architecture Overview](./ARCHITECTURE_OVERVIEW.md) - System design
- 🔒 [Security Rules](./src/utils/firestore.rules) - Database security
- 💬 [Encrypted Media Guide](./ENCRYPTED_MEDIA_CODE_EXAMPLES.md) - File handling
- 📡 [Communication Flow](./CODE_EXAMPLES.md) - API examples

---

## 🎯 Setup Timeline

### Spark Plan Users (~2 hours)

| Time | Phase | Task |
|------|-------|------|
| 15 min | Read | Understand Spark Plan limits |
| 30 min | Setup | Create Firebase project & enable services |
| 20 min | Config | Download credentials & configure app |
| 30 min | Install | Install dependencies |
| 15 min | Test | Test web version |
| 10 min | Build | Build Android APK |
| 10 min | Build | Build iOS app |

**Total: ~2 hours** from zero to deployable app

---

## ⚙️ Tech Stack

```
Frontend:
├── React 18
├── Vite (build)
├── TypeScript
├── Tailwind CSS
└── Capacitor.js 8

Backend (Firebase):
├── Authentication
├── Firestore (NoSQL database)
├── Realtime Database (presence/typing)
├── Cloud Storage (file uploads)
├── Cloud Messaging (push notifications)
└── Cloud Functions (Blaze only)

Native:
├── Android (Capacitor)
├── iOS (Capacitor)
└── Web (PWA ready)
```

---

## 📦 Project Structure

```
quidec_capacitor/
├── src/
│   ├── app/
│   │   ├── App.tsx           # Main component
│   │   ├── routes.tsx        # Navigation
│   │   └── components/       # UI components
│   ├── utils/
│   │   ├── firebaseServices.ts    # 600+ lines - ALL backend APIs
│   │   ├── cloudFunctions.ts      # 500+ lines - Blaze only
│   │   ├── firestore.rules        # Security rules
│   │   └── ...
│   └── styles/               # CSS
├── android/                  # Native Android
├── ios/                      # Native iOS
├── capacitor.config.ts       # Capacitor config
└── package.json              # Dependencies
```

---

## 🚀 Getting Started

### 1. Read the Spark Plan Guide First
```bash
Open: SPARK_PLAN_GUIDE.md
Time: 5 minutes
Why:  Understand free tier limits & features
```

### 2. Follow the Setup Guide
```bash
Open: COMPLETE_STEP_BY_STEP_GUIDE.md
Time: 2 hours
Why:  Complete step-by-step walk-through
```

### 3. Build & Deploy
```bash
# Android
npm run android

# iOS  
npm run ios

# Web
npm run web
```

### 4. Submit to App Stores
```bash
# Android Play Store
# iOS App Store
See: DEPLOYMENT_CHECKLIST.md
```

---

## 💡 Key Features Explained

### Real-time Messaging
```
✅ Works Offline (messages saved)
✅ Auto-sync when online
✅ Message status: SENT → DELIVERED → READ
✅ Instant delivery when online
```

### Online Status
```
✅ See who's online/offline in real-time
✅ Updates every 30 seconds
✅ Presence based on Firestore + Realtime DB
```

### Typing Indicators
```
✅ "User is typing..." in real-time
✅ Auto-clears after 3 seconds of inactivity
✅ No database writes (Realtime DB only)
```

### Push Notifications
```
Spark Plan: ⚠️  Online only
Blaze Plan: ✅  Offline + Online
(Both work great when user is online!)
```

---

## 🔧 Common Tasks

### Start Development
```bash
npm install
npm run dev
```

### Build Android APK
```bash
npm run build
npx cap copy android
# Build in Android Studio or:
cd android && ./gradlew assembleRelease
```

### Build iOS App
```bash
npm run build
npx cap copy ios
# Build in Xcode or:
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release
```

### Deploy Web Version
```bash
npm run build
firebase deploy --only hosting
```

### Run Tests
```bash
npm run test
```

### Check Errors
```bash
npm run lint
npm run type-check
```

---

## 📊 Performance

### Firestore Optimization
- Indexed queries: <100ms
- Typical page load: 2-3 seconds
- Message delivery: <500ms (online)

### Spark Plan Limits (Generous!)
- 50,000 Firestore reads/day (1,700 users/day)
- 1GB storage
- 100 simultaneous Realtime DB connections

### Blaze Plan (When Ready)
- Unlimited Firestore reads (pay per use)
- Better performance globally
- Cloud Functions for automation

---

## 🐛 Troubleshooting

### "Cloud Functions not available"
→ You're using Spark Plan (normal!)
→ Continue without them, or upgrade to Blaze

### "Offline notifications not working"
→ Spark Plan limitation (normal!)
→ Users still see messages when they come online
→ Upgrade to Blaze for offline notifications

### "Quota exceeded"
→ Hit Spark Plan limit? (50K reads/day)
→ Optimize queries or upgrade to Blaze

**[Full Troubleshooting →](./QUICK_REFERENCE_CARD.md)**

---

## 📚 Full Documentation Index

- [Spark Plan Guide](./SPARK_PLAN_GUIDE.md) - Understand free tier
- [Complete Setup Guide](./COMPLETE_STEP_BY_STEP_GUIDE.md) - Full walk-through
- [Quick Reference](./QUICK_REFERENCE_CARD.md) - Commands lookup
- [Architecture Overview](./ARCHITECTURE_OVERVIEW.md) - System design
- [Firebase Setup](./FIREBASE_STEP_E_GUIDE.md) - Service setup
- [Mobile Setup](./CAPACITOR_MOBILE_SETUP.md) - Capacitor config
- [Android Build](./ANDROID_BUILD.md) - Android specifics
- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) - Pre-launch
- [Testing Guide](./TESTING_GUIDE.md) - Test procedures

---

## 📄 License

Proprietary - Quidec Chat

---

## 🤝 Support

For setup issues, see:
- 📋 [QUICK_REFERENCE_CARD.md](./QUICK_REFERENCE_CARD.md) - Common problems
- 📖 [COMPLETE_STEP_BY_STEP_GUIDE.md](./COMPLETE_STEP_BY_STEP_GUIDE.md) - Detailed steps
- 🎯 [SPARK_PLAN_GUIDE.md](./SPARK_PLAN_GUIDE.md) - Firebase limitations

---

**Ready to build?** Start with [SPARK_PLAN_GUIDE.md](./SPARK_PLAN_GUIDE.md) 🚀

---

*Firebase Spark Plan • Capacitor.js • React 18 • TypeScript • Production Ready*
