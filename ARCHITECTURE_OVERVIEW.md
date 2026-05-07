# Architecture Overview - Quidec Chat

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         QUIDEC CHAT - FULL STACK                        │
└─────────────────────────────────────────────────────────────────────────┘

                              USERS' DEVICES

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   ANDROID APP    │    │     iOS APP      │    │    WEB APP       │
│  (Quidec Chat)   │    │    (Quidec)      │    │    (Browser)     │
│                  │    │                  │    │                  │
│ • Capacitor JS   │    │ • Capacitor JS   │    │ • React + Vite   │
│ • React Frontend │    │ • React Frontend │    │ • Tailwind CSS   │
│ • Push Notifs    │    │ • Push Notifs    │    │ • Service Worker │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                        │
         │                       │    HTTPS/WSS          │
         └───────────────────────┼─────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  FIREBASE BACKEND      │
                    │  (100% Serverless)     │
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        │                        │                        │
   ┌────▼────┐        ┌─────────▼────────┐    ┌──────────▼──────┐
   │ Firebase│        │  Firestore DB    │    │  Realtime DB   │
   │   Auth  │        │                  │    │                │
   │         │        │ • Users          │    │ • Presence     │
   │ Users:  │        │ • Friendships    │    │ • Typing Status│
   │ • Email │        │ • Messages       │    │                │
   │ • Google│        │ • Conversations  │    │ LIVE DATA      │
   │ • Apple │        │ • Media          │    │ SYNC (WebSocket│
   └─────────┘        │ • Notifications  │    │ like)          │
                      │                  │    └────────────────┘
                      │ PERSISTENT DATA  │
                      └──────────────────┘

        ┌──────────────────────┬──────────────────────┐
        │                      │                      │
    ┌───▼───────┐      ┌──────▼──────┐      ┌───────▼────┐
    │   Cloud   │      │   Cloud     │      │   Storage  │
    │ Functions │      │  Messaging  │      │            │
    │           │      │   (FCM)     │      │ • Avatars  │
    │ • Message │      │             │      │ • Media    │
    │ • Notifs  │      │ • Android   │      │ • Files    │
    │ • Presence│      │ • iOS       │      │            │
    │ • Cleanup │      │ • Web       │      └────────────┘
    │           │      │             │
    │ SERVERLESS│      │ Push Notif. │
    │ TypeScript│      │ Engine      │
    └───────────┘      └─────────────┘

                   COMPLETELY MANAGED BY GOOGLE
              (No servers to maintain or scale)
```

---

## Data Flow Diagram

### Sending a Message

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER A: Sends Message                                               │
└─────────────────────────────────────────────────────────────────────┘

    USER A (Android/iOS/Web)
           │
           │ messageService.sendMessage(message)
           │
           ▼
    ┌──────────────────┐
    │ Create message   │
    │ with status:     │
    │ SENT (📤)        │
    └────────┬─────────┘
             │
             │ Save to Firestore
             │
             ▼
    ┌──────────────────────────────────────┐
    │ Firestore Database                   │
    │ conversations/{convId}/messages/{id} │
    │ {                                    │
    │   text: "Hello",                     │
    │   sender: userA_id,                  │
    │   status: "SENT",                    │
    │   timestamp: 1234567890              │
    │ }                                    │
    └────────┬─────────────────────────────┘
             │
             │ Trigger: onMessageCreated()
             │
             ▼
    ┌──────────────────────────────────────┐
    │ Cloud Function: onMessageCreated     │
    │                                      │
    │ 1. Get recipient FCM token          │
    │ 2. Update message status → DELIVERED│
    │ 3. Send push notification            │
    └────────┬─────────────────────────────┘
             │
             │ IF recipient online:
             │ - Show notification (in-app)
             │
             │ IF recipient offline:
             │ - Send FCM push notification
             │
             ▼
    ┌──────────────────────────────────────┐
    │ USER B (Receives notification)       │
    │                                      │
    │ Notification Shows:                  │
    │ "User A: Hello" with sound/vibration│
    │                                      │
    │ Click → Opens chat                   │
    └────────┬─────────────────────────────┘
             │
             │ Tap to read
             │
             ▼
    ┌──────────────────────────────────────┐
    │ messageService.markAsRead()          │
    │                                      │
    │ Update Firestore:                    │
    │ status: "READ" (👀)                  │
    └────────┬─────────────────────────────┘
             │
             │ Real-time listener on USER A's device
             │
             ▼
    ┌──────────────────────────────────────┐
    │ USER A Sees Ticks Update:           │
    │ 📤 → 📨 → 👀 (Read)                  │
    └──────────────────────────────────────┘
```

### Real-Time Presence Update

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER A: Goes Online                                                 │
└─────────────────────────────────────────────────────────────────────┘

    USER A App Launches
           │
           │ authService.onAuthStateChange()
           │
           ▼
    ┌──────────────────┐
    │ User Authenticated
    └────────┬─────────┘
             │
             │ presenceService.setUserOnline()
             │
             ▼
    ┌──────────────────────────────────────┐
    │ Realtime Database                    │
    │ presence/{userA_id}                  │
    │ { status: "online", timestamp: now } │
    └────────┬─────────────────────────────┘
             │
             │ Trigger: onUserPresenceChanged()
             │
             ▼
    ┌──────────────────────────────────────┐
    │ Cloud Function: onUserPresenceChanged│
    │                                      │
    │ Get USER A's friends list            │
    │ Notify each friend:                  │
    │ "User A is now online"               │
    └────────┬─────────────────────────────┘
             │
             │ Realtime updates to all friends
             │
             ▼
    ┌──────────────────────────────────────┐
    │ USER B, C, D... see                  │
    │ USER A status change to 🟢 Online    │
    │                                      │
    │ Real-time listener updates UI        │
    └──────────────────────────────────────┘
```

### Push Notification Delivery

```
┌─────────────────────────────────────────────────────────────────────┐
│ Message Arrives While User Offline                                  │
└─────────────────────────────────────────────────────────────────────┘

    Message Created in Firestore
           │
           ▼
    ┌──────────────────────────────────────┐
    │ Cloud Function: onMessageCreated     │
    │                                      │
    │ Check: Is recipient online?          │
    │        (Check Realtime DB presence)  │
    └────────┬─────────────────────────────┘
             │
             │ Recipient is OFFLINE
             │
             ▼
    ┌──────────────────────────────────────┐
    │ Fetch Recipient FCM Token from:      │
    │ Firestore: users/{userId}/fcmToken   │
    └────────┬─────────────────────────────┘
             │
             │ Call Firebase Cloud Messaging
             │
             ▼
    ┌──────────────────────────────────────┐
    │ FCM Server (Google Infrastructure)   │
    │                                      │
    │ Send Push Notification to:           │
    │ • Android device                     │
    │ • iOS device                         │
    │ • Browser (if using PWA)             │
    └────────┬─────────────────────────────┘
             │
             │ Google's Global CDN
             │ Reaches device within 1-2 seconds
             │
             ▼
    ┌──────────────────────────────────────┐
    │ Device Receives Notification         │
    │                                      │
    │ Shows in notification drawer:        │
    │ "User A: Hello"                      │
    │ [Sound] [Vibration]                  │
    └────────┬─────────────────────────────┘
             │
             │ User taps notification
             │
             ▼
    ┌──────────────────────────────────────┐
    │ App Opens                            │
    │ Shows message from User A            │
    │ User can read and reply              │
    └──────────────────────────────────────┘
```

---

## Database Schema

### Firestore Collections

```
firestore-root/
│
├── users/
│   ├── {userId}/
│   │   ├── email: "user@example.com"
│   │   ├── username: "john_doe"
│   │   ├── avatar: "url..."
│   │   ├── bio: "Hey there!"
│   │   ├── fcmToken: "device-token..."
│   │   ├── createdAt: timestamp
│   │   └── notifications/
│   │       ├── {notifId1}
│   │       │   ├── type: "friend_request"
│   │       │   ├── from: "userId2"
│   │       │   ├── message: "User 2 sent you a friend request"
│   │       │   ├── read: false
│   │       │   └── createdAt: timestamp
│   │       └── {notifId2}
│   │           └── ...
│   │
│   └── {userId2}
│       └── ...
│
├── friendships/
│   ├── {userId1}/
│   │   ├── friend1_id: true
│   │   ├── friend2_id: true
│   │   └── friend3_id: true
│   │
│   └── {userId2}
│       └── ...
│
├── friendRequests/
│   ├── {requestId1}/
│   │   ├── from: userId1
│   │   ├── to: userId2
│   │   ├── status: "pending"  // or "accepted", "rejected"
│   │   └── createdAt: timestamp
│   │
│   └── {requestId2}
│       └── ...
│
└── conversations/
    ├── {conversationId1}/
    │   ├── participants: [userId1, userId2]
    │   ├── lastMessage: "Hello!"
    │   ├── lastMessageTime: timestamp
    │   ├── createdAt: timestamp
    │   │
    │   └── messages/
    │       ├── {messageId1}/
    │       │   ├── sender: userId1
    │       │   ├── text: "Hey, how are you?"
    │       │   ├── status: "READ"  // or "SENT", "DELIVERED"
    │       │   ├── createdAt: timestamp
    │       │   └── type: "text"
    │       │
    │       └── {messageId2}
    │           ├── sender: userId2
    │           ├── text: "I'm good!"
    │           ├── status: "DELIVERED"
    │           └── ...
    │
    └── {conversationId2}
        └── ...
```

### Realtime Database Paths

```
realtime-database-root/
│
├── presence/
│   ├── {userId1}/
│   │   ├── status: "online"  // or "offline"
│   │   ├── lastSeen: timestamp
│   │   └── deviceType: "android"  // or "ios", "web"
│   │
│   ├── {userId2}
│   │   └── ...
│   │
│   └── {userId3}
│       └── ...
│
└── typing/
    ├── {conversationId1}/
    │   ├── {userId1}:
    │   │   ├── isTyping: true
    │   │   └── timestamp: now
    │   │
    │   └── {userId2}
    │       └── ...
    │
    └── {conversationId2}
        └── ...
```

---

## Cloud Functions

### Deployed Functions

```
Cloud Functions Runtime: Node.js 20 (TypeScript)

1. onMessageCreated
   ├── Trigger: When document created in /conversations/{id}/messages
   ├── Actions:
   │  ├─ Update message status to DELIVERED
   │  ├─ Get recipient FCM token
   │  ├─ Send push notification via FCM
   │  └─ Log analytics event
   └─ Runs: <100ms

2. onFriendRequestCreated
   ├── Trigger: When document created in /friendRequests
   ├── Actions:
   │  ├─ Send notification to recipient
   │  ├─ Save notification in Firestore
   │  └─ Send FCM push if offline
   └─ Runs: <100ms

3. onUserPresenceChanged
   ├── Trigger: When presence/{userId} updated in Realtime DB
   ├── Actions:
   │  ├─ Get user's friends list
   │  ├─ Notify each friend in real-time
   │  └─ Broadcast via Realtime DB
   └─ Runs: <50ms

4. cleanupOldMessages
   ├── Trigger: Scheduled daily at 2 AM UTC
   ├── Actions:
   │  ├─ Find messages >90 days old
   │  ├─ Delete old messages
   │  └─ Log deleted count
   └─ Runs: Once per day

5. onFriendRequestAccepted
   ├── Trigger: When friendRequest status changes to "accepted"
   ├── Actions:
   │  ├─ Create friendship records
   │  ├─ Send notification to sender
   │  └─ Update UI on both devices
   └─ Runs: <100ms

6. onUserDeleted
   ├── Trigger: When user auth account is deleted
   ├── Actions:
   │  ├─ Delete Firestore user document
   │  ├─ Delete all messages from user
   │  ├─ Remove from friends lists
   │  └─ Clean up presence
   └─ Runs: <200ms
```

---

## Service Integration Map

```
┌────────────────────────────────────────────────────────┐
│              React Components                          │
│                                                        │
│ • LoginScreen.jsx                                      │
│ • ChatScreen.jsx                                       │
│ • FriendRequestsModal.jsx                              │
│ • ChatPanel.jsx                                        │
│ • Toast.jsx (Notifications)                            │
└──────────────────┬─────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
     ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ authService  │ │messageService│ │ presenceService │
│              │ │              │ │                  │
│• Register    │ │• Send        │ │• setOnline       │
│• Login       │ │• Receive     │ │• setOffline      │
│• Logout      │ │• Track ticks │ │• getStatus       │
│• Profile     │ │• Pagination  │ │• Listen         │
│• Delete Acct │ │• Delete      │ │                  │
└──────┬───────┘ └───────┬──────┘ └────────┬─────────┘
       │                 │                 │
       │                 │        ┌────────┼────────┐
       │                 │        │        │        │
       ▼                 ▼        ▼        ▼        ▼
    ┌────────────────────────────────────────────────┐
    │         firebaseServices.ts                    │
    │  (600+ lines - Main Backend API)               │
    │                                                │
    │ • Firebase Authentication                      │
    │ • Firestore Database Operations                │
    │ • Realtime Database Sync                       │
    │ • Cloud Functions Triggers                     │
    │ • Error Handling & Logging                     │
    └─────────────────┬────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
   ┌────────────┐ ┌──────────┐ ┌──────────┐
   │ Firebase   │ │ Firestore│ │ Realtime │
   │ Auth       │ │Database  │ │Database  │
   │            │ │          │ │          │
   │ Users +    │ │ Messages │ │ Presence │
   │ Tokens     │ │ Friends  │ │ Typing   │
   └────────────┘ └──────────┘ └──────────┘
        │             │             │
        └─────────────┼─────────────┘
                      │
        ┌─────────────┼──────────────┐
        │             │              │
        ▼             ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌────────────┐
   │ Cloud   │  │ Cloud    │  │Cloud       │
   │Functions│  │Messaging │  │Storage     │
   │         │  │ (FCM)    │  │            │
   │• Notif. │  │          │  │• Media     │
   │• Pres.  │  │Push→SMS/ │  │• Avatars   │
   │• Clean. │  │ Browser  │  │• Files     │
   └─────────┘  └──────────┘  └────────────┘
```

---

## Deployment Architecture

```
                    YOUR CAPACITOR APP

        ┌───────────────────────────────────┐
        │         Source Code               │
        │                                   │
        │ • src/                            │
        │ • android/                        │
        │ • ios/                            │
        │ • functions/                      │
        └──────────────┬────────────────────┘
                       │
                       │ npm run build
                       │ npx cap sync
                       │ firebase deploy
                       │
        ┌──────────────┴────────────────────┐
        │                                   │
        ▼                                   ▼
    ┌─────────────┐              ┌──────────────────┐
    │ Web App     │              │ Native Apps      │
    │             │              │                  │
    │ Deployed to │              │ Android APK      │
    │ Firebase    │              │ iOS App          │
    │ Hosting:    │              │                  │
    │ https://    │              │ Distributed via: │
    │ free-      │              │ • Google Play    │
    │ cluely.    │              │ • App Store      │
    │ web.app    │              │ • Direct APK     │
    └─────────────┘              └──────────────────┘
        │                              │
        │                              │
        └──────────────┬───────────────┘
                       │
                ┌──────▼──────┐
                │   USERS     │
                │             │
                │ • Android   │
                │ • iOS       │
                │ • Web       │
                │             │
                │ Real-time   │
                │ Sync All    │
                └─────────────┘
```

---

## Summary

✅ **Backend**: Firebase (Firestore + Realtime DB + Functions)
✅ **Frontend**: React + Capacitor.js (Android + iOS + Web)
✅ **Notifications**: Firebase Cloud Messaging (FCM)
✅ **Authentication**: Firebase Auth
✅ **Real-time**: WebSocket-like sync via Realtime DB + Firestore listeners
✅ **Serverless**: Cloud Functions handle automation
✅ **Hosted**: Firebase Hosting for web, Play Store/App Store for mobile

**No servers to maintain. Everything auto-scales. 100% Firebase!**
