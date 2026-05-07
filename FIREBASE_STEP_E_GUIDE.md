# Firebase Setup for Capacitor - Quidec Chat App

## Your App Details
- **Web App Name**: Quidec
- **Android App Name**: Quidec Chat
- **iOS App Name**: Quidec
- **Platform**: Capacitor.js (React + Capacitor)

---

## Step E: Enable Firebase Services (Complete Guide)

### ⚠️ SPARK PLAN (Free Tier) SERVICES

This guide covers enabling services for **Spark Plan**. The following are available:

| Service | Spark Plan | Notes |
|---------|-----------|-------|
| Authentication | ✅ YES | Unlimited users |
| Firestore DB | ✅ YES | 1GB + 50K reads/day |
| Realtime DB | ✅ YES | 1GB + 100 connections |
| Cloud Storage | ✅ YES | 5GB free |
| Cloud Messaging (FCM) | ✅ YES | Unlimited |
| Cloud Functions | ❌ NO | Requires Blaze plan |

---

### STEP E.1: Go to Firebase Console

1. Open **https://console.firebase.google.com**
2. Click on your project: `free-cluely` (or your project name)
3. You should see the project dashboard

---

### STEP E.2: Enable Authentication

**Navigation:**
1. Left sidebar → **Build** → **Authentication**
2. Click **"Get started"** button (if not already started)
3. You'll see different sign-in methods

**Enable Email/Password:**
1. Click on **"Email/Password"** option
2. Toggle **"Enable"** to ON
3. Click **"Save"**
4. ✅ Email/Password authentication is enabled

**Optional - Enable Google Sign-In (recommended):**
1. Click **"Google"** in the list
2. Toggle **"Enable"** to ON
3. Enter your project email (it will autofill)
4. Add your support email
5. Click **"Save"**
6. ✅ Google sign-in is enabled

**Optional - Enable Apple Sign-In (for iOS):**
1. Click **"Apple"** in the list
2. Toggle **"Enable"** to ON
3. Click **"Save"**
4. ✅ Apple sign-in is enabled

---

### STEP E.3: Create Firestore Database

**Navigation:**
1. Left sidebar → **Build** → **Firestore Database**
2. Click **"Create database"** button

**Create Database Dialog:**
1. Choose location: **us-central1** (or closest region to you)
2. Select security rules: **"Start in test mode"** (we'll fix this later)
3. Click **"Create"**

**Wait for creation** (usually 30 seconds to 1 minute)

✅ **Firestore Database is now created**

---

### STEP E.4: Create Realtime Database

**Navigation:**
1. Left sidebar → **Build** → **Realtime Database**
2. Click **"Create Database"** button (or "Create database" link if no databases exist)

**Create Database Dialog:**
1. Choose location: **us-central1** (or same region as Firestore)
2. Select security rules: **"Start in test mode"**
3. Click **"Create"**

**Wait for creation** (30 seconds to 1 minute)

✅ **Realtime Database is now created**

---

### STEP E.5: Enable Cloud Storage

**Navigation:**
1. Left sidebar → **Build** → **Storage**
2. Click **"Get started"** button

**Setup Storage Dialog:**
1. Choose location: **us-central1**
2. Select security rules: **"Start in test mode"**
3. Click **"Create"**

**Wait for creation** (30 seconds to 1 minute)

✅ **Cloud Storage is now enabled**

---

### STEP E.6: Cloud Functions - NOT Available in Spark Plan ❌

**Spark Plan Limitation:**
Cloud Functions are **NOT available** in Spark Plan. To use Cloud Functions, you need to upgrade to **Blaze plan** (pay-as-you-go).

**What you can do:**
- ✅ Use the app without Cloud Functions (Spark Plan)
- ✅ Upgrade to Blaze plan later if needed ($1-3/month typical cost)
- ✅ App still works great with Firestore + Realtime DB

**Skip this step for now.** Continue to Step E.7 below.

---

### STEP E.7: Get Cloud Messaging Setup

**Navigation:**
1. Left sidebar → **Build** → **Cloud Messaging**
2. You should see your **Server API Key** and **Web Push certificates**

**For Web:**
- You'll see a section "Web configuration"
- Keep this page open (you'll need the VAPID key later)

**For Android:**
- You don't need to do anything here yet
- Firebase will auto-configure with `google-services.json`

---

## After Completing Step E

You should see these in your Firebase Console:

| Service | Status | ✅ |
|---------|--------|-----|
| Authentication | Enabled (Email/Password) | ✅ |
| Firestore Database | Created | ✅ |
| Realtime Database | Created | ✅ |
| Cloud Storage | Created | ✅ |
| Cloud Functions | ❌ NOT in Spark Plan | - |
| Cloud Messaging | Ready | ✅ |

---

## Next: Get Your Firebase Configuration

**Still in Firebase Console:**

1. Go to **Project Settings** (gear icon, top right)
2. Select **"Your apps"** tab
3. You should see your web app registered
4. Click on it to view config

**Copy all values:**
```
apiKey: "copy_this"
authDomain: "copy_this"
projectId: "copy_this"
storageBucket: "copy_this"
messagingSenderId: "copy_this"
appId: "copy_this"
```

**Also needed for Realtime DB:**
- Go back to **Realtime Database**
- Copy the URL (looks like: `https://your-project.firebaseio.com`)

**And for Push Notifications:**
- Go to **Cloud Messaging**
- Copy the **Web Push Certificate** VAPID key

---

## Update Your .env File

Create or update `.env` in your project root:

```bash
# Firebase Web Configuration
VITE_FIREBASE_API_KEY=YOUR_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN_HERE
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID_HERE
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET_HERE
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID_HERE
VITE_FIREBASE_APP_ID=YOUR_APP_ID_HERE
VITE_FIREBASE_DATABASE_URL=https://YOUR_PROJECT_ID.firebaseio.com

# Push Notifications
REACT_APP_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

Save this file in your project root directory.

---

## Next Step: Deploy Rules & Functions

After completing Step E and updating `.env`, proceed to:
1. **Step F**: Deploy Firestore Rules
2. **Step G**: Deploy Cloud Functions

See FIREBASE_COMPLETE_SETUP.md for these steps.
