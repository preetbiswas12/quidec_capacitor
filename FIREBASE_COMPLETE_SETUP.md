# Firebase Complete Setup & Deployment Guide

## Overview

The entire backend has been migrated from Node.js/Express/WebSocket server to **Firebase**. This guide covers:
- ✅ Firebase Authentication
- ✅ Real-time Presence (Online/Offline Status)
- ✅ Message Delivery Status (Single Tick, Double Tick, Double Blue Tick)
- ✅ Push Notifications
- ✅ Friend Requests
- ✅ Typing Indicators
- ✅ Read Receipts
- ✅ Firestore Database
- ✅ Cloud Functions

---

## 1. Firebase Project Setup

### Prerequisites
- Firebase Project created at https://console.firebase.google.com
- Node.js 18+ installed
- Firebase CLI installed: `npm install -g firebase-tools`

### Step 1.1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add Project"
3. Enter project name: `free-cluely` (or your project name)
4. Select your region
5. Enable Google Analytics (optional)
6. Create project

### Step 1.2: Add Web App to Firebase Project

1. In Firebase Console, click the web icon `</>`
2. Register app name: `Free Cluely Web`
3. Copy the Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

4. Update your `.env` file:

```bash
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
VITE_FIREBASE_DATABASE_URL=https://YOUR_PROJECT.firebaseio.com
REACT_APP_VAPID_KEY=YOUR_VAPID_KEY
```

### Step 1.3: Enable Firebase Services

In Firebase Console:

#### Enable Authentication
1. Navigate to **Authentication**
2. Click **Sign-in method**
3. Enable **Email/Password**
4. (Optional) Enable **Google**, **GitHub** for social login

#### Enable Firestore Database
1. Navigate to **Firestore Database**
2. Click **Create database**
3. Start in **Test mode** (we'll secure it with rules later)
4. Select region: **us-central1** (or closest to you)
5. Click **Create**

#### Enable Realtime Database
1. Navigate to **Realtime Database**
2. Click **Create Database**
3. Start in **Test mode**
4. Select region: **us-central1**
5. Click **Create**

#### Enable Storage
1. Navigate to **Storage**
2. Click **Get Started**
3. Start in **Test mode**
4. Select region: **us-central1**
5. Click **Done**

#### Enable Cloud Functions
1. Navigate to **Cloud Functions**
2. Click **Get Started**
3. This will enable the required APIs

#### Enable Cloud Messaging
1. Navigate to **Cloud Messaging**
2. Copy your **Server API Key** for backend use

---

## 2. Firestore Security Rules

Navigate to **Firestore Database** → **Rules** and replace with [firestore.rules](./src/utils/firestore.rules):

The rules ensure:
- ✅ Users can only access their own data
- ✅ Friends can read conversations
- ✅ Messages are properly protected
- ✅ Friend requests are visible to both parties
- ✅ Notifications are user-specific

---

## 3. Realtime Database Rules

Navigate to **Realtime Database** → **Rules** and replace with:

```json
{
  "rules": {
    "presence": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid",
        ".validate": "newData.hasChildren(['online', 'lastSeen'])"
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

---

## 4. Deploy Cloud Functions

Cloud Functions handle:
- 📬 Push notifications when messages arrive
- 👥 Friend request notifications
- 👤 Online/offline status updates
- 🗑️ Scheduled cleanup of old messages
- ✅ Friend request accepted notifications

### Step 4.1: Initialize Cloud Functions

```bash
firebase init functions
```

Select:
- Language: **TypeScript** (recommended)
- Use ESLint: **Yes**

### Step 4.2: Replace Cloud Functions Code

Replace `functions/src/index.ts` with [cloudFunctions.ts](./src/utils/cloudFunctions.ts):

```bash
cp src/utils/cloudFunctions.ts functions/src/index.ts
```

### Step 4.3: Install Dependencies

```bash
cd functions
npm install firebase-admin firebase-functions
cd ..
```

### Step 4.4: Deploy Functions

```bash
firebase deploy --only functions
```

This will deploy:
- ✅ `onMessageCreated` - Send notification when message arrives
- ✅ `onFriendRequestCreated` - Notify about friend requests
- ✅ `onUserPresenceChanged` - Broadcast online status
- ✅ `cleanupOldMessages` - Daily cleanup of old messages
- ✅ `onFriendRequestAccepted` - Notify when friend request accepted
- ✅ `onUserDeleted` - Cleanup user data when account deleted

---

## 5. Setup Push Notifications (FCM)

### Step 5.1: Generate VAPID Key

```bash
firebase init hosting
# During setup, copy the VAPID key shown, or get it from:
# Firebase Console → Cloud Messaging → Web Configuration
```

Or use Firebase CLI:

```bash
firebase setup:web
```

### Step 5.2: Create Service Worker

The app includes a service worker at `public/firebase-messaging-sw.js` which handles:
- Background push notifications
- Message handling when app is closed
- Notification click handling

### Step 5.3: Update .env

```bash
REACT_APP_VAPID_KEY=your_vapid_key_here
```

### Step 5.4: Handle Notifications in App

The Firebase services automatically:
- ✅ Request notification permission
- ✅ Get FCM token
- ✅ Listen to foreground messages
- ✅ Send local notifications
- ✅ Store notifications in Firestore

---

## 6. Environment Setup

Create `.env` file in project root:

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com

# FCM VAPID Key
REACT_APP_VAPID_KEY=your_vapid_key
```

---

## 7. Application Integration

### Firebase Services API

All backend functionality is in `src/utils/firebaseServices.ts`:

```typescript
// Authentication
authService.registerUser(email, username, password)
authService.loginUser(email, password)
authService.logoutUser()

// Presence (Online/Offline)
presenceService.setUserOnline(uid, username)
presenceService.setUserOffline(uid)
presenceService.listenToUserPresence(uid, callback)
presenceService.listenToFriendsPresence(uid, callback)

// Messages with Delivery Status
messageService.sendMessage(fromUid, toUid, content, mediaUrl)
messageService.markMessageDelivered(conversationId, messageId, toUid)
messageService.markMessageRead(conversationId, messageId, readerUid)
messageService.listenToMessages(fromUid, toUid, callback)
messageService.getConversationHistory(fromUid, toUid)

// Typing Indicators
typingService.setTyping(fromUid, toUid, isTyping)
typingService.listenToTyping(fromUid, toUid, callback)

// Friend Requests
friendRequestService.sendFriendRequest(fromUid, toUid)
friendRequestService.acceptFriendRequest(requestId, fromUid, toUid)
friendRequestService.rejectFriendRequest(requestId, toUid)
friendRequestService.getPendingRequests(uid)
friendRequestService.listenToPendingRequests(uid, callback)

// Notifications
notificationService.requestFCMPermission(uid)
notificationService.listenToNotifications(callback)
notificationService.listenToUserNotifications(uid, callback)
```

### Message Delivery Status Types

```typescript
MESSAGE_STATUS = {
  SENT: 'sent',       // 📤 Single tick - message sent to Firebase
  DELIVERED: 'delivered',  // 📨 Double tick - received by recipient
  READ: 'read'        // 👀 Double blue tick - read by recipient
}
```

### Usage Example in Components

```typescript
import {
  messageService,
  presenceService,
  friendRequestService,
  notificationService,
} from '../utils/firebaseServices';

export function ChatComponent({ fromUid, toUid }) {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  // Listen to messages
  useEffect(() => {
    const unsubscribe = messageService.listenToMessages(
      fromUid,
      toUid,
      (msgs) => setMessages(msgs)
    );
    return unsubscribe;
  }, [fromUid, toUid]);

  // Send message with delivery tracking
  const handleSendMessage = async (content) => {
    const result = await messageService.sendMessage(fromUid, toUid, content);
    console.log(`Message status: ${result.status}`); // 'sent', then will auto-update to 'delivered', 'read'
  };

  // Mark messages as read when viewing
  useEffect(() => {
    messageService.markAllMessagesAsRead('conversation_id', fromUid, toUid);
  }, [messages]);

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.messageId}>
          {msg.content}
          <span>
            {msg.status === 'sent' && '📤'}
            {msg.status === 'delivered' && '📨'}
            {msg.status === 'read' && '👀'}
          </span>
        </div>
      ))}
    </div>
  );
}
```

---

## 8. Firestore Database Structure

```
users/
├── {uid}/
│   ├── username: string
│   ├── email: string
│   ├── displayName: string
│   ├── photoURL: string
│   ├── isOnline: boolean
│   ├── lastSeen: timestamp
│   ├── fcmToken: string
│   ├── notificationsEnabled: boolean
│   ├── createdAt: timestamp
│   └── notifications/ (subcollection)
│       └── {notificationId}/
│           ├── type: string
│           ├── message: string
│           ├── read: boolean
│           └── createdAt: timestamp

friendships/
├── {uid}/
│   ├── friends: array<uid>
│   ├── blockedUsers: array<uid>
│   └── createdAt: timestamp

friendRequests/
├── {requestId}/
│   ├── fromUid: string
│   ├── toUid: string
│   ├── fromUsername: string
│   ├── toUsername: string
│   ├── status: 'pending' | 'accepted' | 'rejected'
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp

conversations/
├── {conversationId}/ (uid1_uid2, sorted)
│   ├── participants: array<uid>
│   ├── lastMessage: string
│   ├── lastMessageTime: timestamp
│   ├── createdAt: timestamp
│   ├── updatedAt: timestamp
│   └── messages/ (subcollection)
│       └── {messageId}/
│           ├── fromUid: string
│           ├── toUid: string
│           ├── content: string
│           ├── mediaUrl: string (optional)
│           ├── status: 'sent' | 'delivered' | 'read'
│           ├── timestamp: timestamp
│           ├── deliveredAt: timestamp (optional)
│           ├── readAt: timestamp (optional)
│           └── typing: boolean

media/
├── {mediaId}/
│   ├── uploadedBy: string
│   ├── url: string
│   ├── type: 'image' | 'audio' | 'video'
│   ├── size: number
│   ├── encrypted: boolean
│   ├── createdAt: timestamp
│   └── expiresAt: timestamp
```

---

## 9. Realtime Database Structure

```
presence/
├── {uid}/
│   ├── online: boolean
│   ├── lastSeen: timestamp
│   └── username: string

typing/
├── {conversationId}/
│   └── {uid}/
│       ├── isTyping: boolean
│       └── timestamp: timestamp
```

---

## 10. Deployment Checklist

### Before Production Deployment

- [ ] Update Firebase security rules (production mode)
- [ ] Test authentication flows
- [ ] Verify push notifications work
- [ ] Test message delivery status indicators
- [ ] Verify presence/online status updates
- [ ] Test friend request flow
- [ ] Enable CORS in Firebase if needed
- [ ] Setup email verification
- [ ] Enable reCAPTCHA for registration
- [ ] Setup email templates in Firebase
- [ ] Configure password reset
- [ ] Test on actual mobile devices
- [ ] Verify app opens notification
- [ ] Test offline message queuing
- [ ] Setup analytics
- [ ] Enable backup in Firestore

### Security Configuration

1. **Enable Production Security Rules** (not test mode)
2. **Enable Email Verification**
3. **Setup reCAPTCHA v3**
4. **Enable Strong Password Policy**
5. **Setup Account Deletion** via Cloud Function
6. **Monitor Cloud Functions Errors**

### Monitoring

- Cloud Functions logs: `firebase functions:log`
- Firestore usage: Firebase Console → Usage tab
- Auth issues: Firebase Console → Authentication → Issues
- Performance: Firebase Console → Performance Monitoring

---

## 11. Testing Firebase Services

```bash
# Run tests
pnpm test

# Test Firebase locally
firebase emulators:start

# Deploy to staging
firebase deploy --only firestore

# Deploy to production
firebase deploy
```

---

## 12. Troubleshooting

### Push Notifications Not Working

```bash
# Check FCM token
console.log(await notificationService.requestFCMPermission(uid));

# Verify VAPID key
firebase functions:log

# Check Service Worker
navigator.serviceWorker.getRegistrations()
```

### Messages Not Delivered

```bash
# Check Firestore rules
firebase deploy --only firestore:rules

# Verify participants array
db.collection('conversations').doc(conversationId).get()
```

### Presence Updates Delayed

```bash
# Check Realtime Database connection
firebase.database().ref('.info/connected').on('value', console.log)

# Verify listeners
db.collection('users').doc(uid).onSnapshot(console.log)
```

---

## 13. Useful Firebase CLI Commands

```bash
# Initialize Firebase in project
firebase init

# Start local emulator
firebase emulators:start

# Deploy everything
firebase deploy

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Deploy only Cloud Functions
firebase deploy --only functions

# View function logs
firebase functions:log

# Delete a specific function
firebase functions:delete functionName

# Generate missing dependencies
firebase init --project=YOUR_PROJECT_ID

# List all deployed resources
firebase list

# Backup Firestore
firebase firestore:backups:list
```

---

## 14. Migration from Old Server

### What Changed

- ❌ Removed: Node.js Express server in `/server` folder
- ❌ Removed: MongoDB dependency
- ❌ Removed: WebSocket signaling server
- ✅ Added: Firebase Firestore (database)
- ✅ Added: Firebase Realtime Database (presence, typing)
- ✅ Added: Firebase Cloud Functions (backend logic)
- ✅ Added: Firebase Cloud Messaging (push notifications)
- ✅ Added: Firebase Authentication (user management)

### Direct API Replacement

| Old API | New API |
|---------|---------|
| `POST /api/register` | `authService.registerUser()` |
| `POST /api/login` | `authService.loginUser()` |
| `GET /api/online-users` | `presenceService.getOnlineUsers()` |
| `POST /api/messages/send` | `messageService.sendMessage()` |
| `GET /api/messages/:user/:withUser` | `messageService.listenToMessages()` |
| `WS: auth` | `authService.onAuthStateChange()` |
| `WS: message` | `messageService.sendMessage()` |
| `WS: friend-request` | `friendRequestService.sendFriendRequest()` |

---

## 15. Additional Resources

- 📚 [Firebase Documentation](https://firebase.google.com/docs)
- 🔐 [Security Rules](https://firebase.google.com/docs/firestore/security/start)
- ⚡ [Cloud Functions](https://firebase.google.com/docs/functions)
- 🔔 [Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- 🗄️ [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)

---

## Questions?

Contact Firebase support or refer to the [Firebase Community Forums](https://github.com/firebase/firebase-js-sdk).
