# Data Flow & Code Location Reference

## 📍 Key Files by Component

### Authentication & User Management
```
src/utils/firebaseServices.ts
├── registerUser()           ← New user registration
├── loginUser()              ← Email/password login
├── logoutUser()             ← Clear session
└── getCustomUsernameByFirebaseUid()  ← Fetch user profile

src/utils/firebase.ts
├── initializeFirebase()     ← Firebase setup
├── getAuthInstance()        ← Get Auth service
└── getFirestoreInstance()   ← Get Firestore DB

src/app/components/EmailVerification.tsx
├── Auto-refresh verification check  ← Poll until verified
└── Resend verification email       ← Request new link
```

### Encryption & Key Management
```
src/utils/encryption.js
├── deriveKey(seed)          ← Derive key from seed (PBKDF2)
├── getEncryptionKey(userId) ← User-specific key
├── getConversationKey(user1, user2)  ← E2EE conversation key
├── encryptMessage()         ← Encrypt with AES-256-GCM
└── decryptMessage()         ← Decrypt message

src/utils/encryptedChunkedMedia.ts
├── saveEncryptedMediaChunks()  ← Split & encrypt media
├── retrieveDecryptedMessage()  ← Fetch & decrypt
└── generateSHA256Hash()        ← Verify integrity
```

### Storage (Local & Cloud)
```
src/utils/storage.js
├── initializeDB()           ← IndexedDB setup
├── saveAuth()               ← Store auth tokens
├── saveMessage()            ← Store encrypted messages
└── getAuth()                ← Retrieve session data

src/utils/localMessageStore.ts
├── deriveKeys()             ← Double encryption keys
├── appendMessage()          ← Add to local binary file
├── loadMessages()           ← Read from local file
└── listLocalChatIds()       ← Get all chats

src/utils/messageDatabase.ts
├── storeMessage()           ← Store in IndexedDB
├── retrieveMessages()       ← Fetch by conversation
└── updateMessageStatus()    ← Track delivery/read status
```

### Real-Time Communication
```
src/utils/websocketManager.ts
├── connect(token)           ← Establish WSS connection
├── send(type, payload)      ← Send message
├── sendEncryptedMessage()   ← Send encrypted content
└── on(type, callback)       ← Register event listener

src/utils/firebaseServices.ts
├── subscribeToMessages()    ← Listen for incoming
├── sendMessageReceipt()     ← Send delivery ACK
└── markAsRead()             ← Send read ACK

src/utils/media.js
├── uploadMediaWithProgress()   ← Upload chunks
└── loadMediaWithCache()        ← Fetch media
```

### Firebase Cloud Services
```
firestore.rules
├── /users/{userId}          ← User profiles (visible to authenticated)
├── /friendships/{userId}    ← Friend lists (private)
├── /friendRequests/{requestId}  ← Requests (participants only)
├── /conversations/{conversationId}  ← Messages (participants only)
└── /mediaChunks/{chunkId}   ← Encrypted media (ephemeral)

database.rules (Realtime DB)
├── /presence/{userId}       ← Online status
├── /typing/{conversationId} ← Typing indicator
└── /call-signals/{conversationId}  ← WebRTC signaling
```

---

## 🔄 Complete Data Flow Diagram

### 1. USER REGISTRATION

```
┌─ User clicks "Sign Up"
│
├─ Input: Email, Username, Password
│
├─ Validate inputs
│  ├─ Email format
│  ├─ Username uniqueness (Firestore query)
│  └─ Password strength (6+ chars, mixed case, numbers)
│
├─ Firebase: createUserWithEmailAndPassword()
│  ├─ Hash password (server-side bcrypt)
│  ├─ Generate Firebase UID
│  └─ Return Auth token
│
├─ Send verification email
│  └─ Firebase: sendEmailVerification()
│
├─ Store user profile (Firestore)
│  └─ Collection: /users/{customUsername}
│      ├─ uid: Firebase UID
│      ├─ email: User email
│      ├─ displayName: Display name
│      ├─ emailVerified: false
│      ├─ createdAt: server timestamp
│      └─ fcmToken: null (set after verification)
│
├─ Initialize user data (Realtime DB)
│  └─ /presence/{sanitizedUID}
│      ├─ online: false
│      ├─ lastSeen: server timestamp
│      └─ username: custom username
│
└─ Initialize friend list
   └─ /friendships/{Firebase_UID}
       ├─ uid: Firebase UID
       ├─ friends: []
       ├─ blockedUsers: []
       └─ createdAt: server timestamp
```

**Files Involved**:
- `firebaseServices.ts` - registerUser()
- `firebase.ts` - createUserWithEmailAndPassword()
- `firestore.rules` - allow write to /users/{userId}

---

### 2. USER LOGIN

```
┌─ User clicks "Login"
│
├─ Input: Email, Password
│
├─ Firebase: signInWithEmailAndPassword()
│  ├─ Hash password (server-side)
│  ├─ Compare with stored hash
│  └─ Return Auth token if match
│
├─ Check email verification
│  ├─ If NOT verified → redirect to verification screen
│  └─ If verified → continue
│
├─ Fetch user profile
│  └─ Query /users collection where uid == firebaseUid
│      ├─ Get customUsername
│      ├─ Get fcmToken
│      └─ Get friend list
│
├─ Update online status (Realtime DB)
│  └─ /presence/{sanitizedUID}
│      ├─ online: true
│      ├─ lastSeen: current timestamp
│      └─ username: customUsername
│
├─ Store session (IndexedDB)
│  └─ Store: /auth
│      ├─ currentUser: user object
│      ├─ userId: Firebase UID
│      ├─ token: Auth token
│      └─ timestamp: login time
│
├─ Connect WebSocket
│  └─ WSS connection with token in message
│      Send: { type: 'auth', token: authToken }
│
└─ Load message history
   ├─ Fetch from localMessageStore (binary files)
   └─ Display latest messages
```

**Files Involved**:
- `firebaseServices.ts` - loginUser()
- `storage.js` - saveAuth()
- `websocketManager.ts` - connect()

---

### 3. SEND MESSAGE

```
┌─ User types message + clicks send
│
├─ Input: Message text, recipient ID
│
├─ Validation (NEW - add this)
│  ├─ Message not empty
│  ├─ Message length < 10000 chars
│  ├─ No HTML/script injection
│  └─ Rate limit check (5 msgs/min)
│
├─ Generate message metadata
│  ├─ messageId: UUID
│  ├─ timestamp: current time
│  ├─ senderId: current user UID
│  ├─ recipientId: target user UID
│  ├─ status: 'sent'
│  └─ type: 'text'
│
├─ Get conversation encryption key
│  └─ getConversationKey(senderId, recipientId)
│      └─ Derive from: [senderId, recipientId].sort() + 'e2e-chat'
│          └─ PBKDF2: 100k iterations, SHA-256
│
├─ Encrypt message
│  ├─ Generate random IV (12 bytes)
│  ├─ AES-256-GCM encrypt: { content, messageId, timestamp }
│  ├─ Combine: [IV] + [ciphertext]
│  └─ Encode as base64
│
├─ Store locally (IndexedDB)
│  ├─ Store: /messages
│  ├─ Key: messageId
│  └─ Value: encrypted message + metadata
│
├─ Store locally (Binary file)
│  ├─ File: Documents/qchat_{conversationId}.bin
│  ├─ Format: [length:4][IV1:12][IV2:12][ciphertext]
│  └─ Double encryption (2 AES-GCM layers)
│
├─ Send via WebSocket
│  ├─ Connection: WSS to server
│  └─ Message: {
│      ├─ type: 'message',
│      ├─ to: recipientId,
│      ├─ encrypted: ciphertext,
│      ├─ messageId: messageId,
│      ├─ timestamp: timestamp,
│      └─ mac: (future) HMAC for verification
│      }
│
├─ Server receives
│  ├─ Validate sender token
│  ├─ Store in Firestore
│  └─ /conversations/{conversationId}/messages/{messageId}
│      └─ { encrypted, metadata, timestamp }
│
├─ Server routes to recipient
│  ├─ If online: send via WebSocket
│  └─ If offline: queue for next connection
│
├─ Recipient receives
│  ├─ Validate sender is friend/contact
│  ├─ Get conversation key (same derivation)
│  ├─ Decrypt message
│  ├─ Verify integrity (SHA-256)
│  └─ Store locally (both IndexedDB + binary file)
│
├─ Recipient sends 'delivered' ACK
│  └─ Message: { type: 'receipt', messageId, status: 'delivered' }
│
├─ Sender receives ACK
│  ├─ Update local message status: 'delivered' (double tick)
│  └─ Update Firestore
│
├─ Recipient opens chat & reads message
│  ├─ UI shows decrypted content
│  └─ Send 'read' receipt
│
└─ Sender receives 'read' ACK
   ├─ Update status: 'read' (blue double tick)
   └─ Update Firestore
```

**Files Involved**:
- `validators.ts` (NEW) - validateMessage()
- `rateLimiter.ts` (NEW) - checkLimit()
- `encryption.js` - getConversationKey(), encryptMessage()
- `storage.js` - saveMessage()
- `localMessageStore.ts` - appendMessage()
- `websocketManager.ts` - sendEncryptedMessage()
- `firebaseServices.ts` - sendMessageReceipt(), markAsRead()

---

### 4. RECEIVE MESSAGE

```
┌─ WebSocket server routes message to recipient
│
├─ Recipient's WebSocket connection receives message
│  └─ Data: { from, encrypted, messageId, timestamp }
│
├─ Handler: websocketManager.onmessage()
│  └─ Parse JSON
│
├─ Get conversation encryption key
│  └─ getConversationKey(senderId, recipientId)
│      └─ Same derivation as sender (deterministic)
│
├─ Decrypt message
│  ├─ Extract IV from ciphertext
│  ├─ AES-256-GCM decrypt
│  └─ Parse JSON { content, messageId, timestamp }
│
├─ Verify integrity
│  └─ SHA-256 hash matches (if implemented)
│
├─ Create message object
│  ├─ messageId: from sender
│  ├─ conversationId: derive from user IDs
│  ├─ content: decrypted
│  ├─ timestamp: from sender
│  ├─ status: 'delivered'
│  └─ senderName: lookup in friends list
│
├─ Store locally (IndexedDB)
│  ├─ Store: /messages
│  ├─ Mark: unread: true
│  └─ Store in /conversations too
│
├─ Store locally (Binary file)
│  └─ File: Documents/qchat_{conversationId}.bin
│
├─ Update UI
│  ├─ Add to chat list (if first message)
│  ├─ Show message in chat window (if open)
│  └─ Show notification if minimized
│
├─ Send 'delivered' receipt
│  └─ WebSocket: { type: 'receipt', messageId, status: 'delivered' }
│
├─ Send FCM push notification (if offline later)
│  └─ Triggered by server if recipient disconnects
│
└─ When recipient reads
   ├─ Mark as read locally
   └─ Send 'read' receipt
      └─ WebSocket: { type: 'receipt', messageId, status: 'read' }
```

**Files Involved**:
- `websocketManager.ts` - onmessage handler
- `encryption.js` - getConversationKey(), decryptMessage()
- `storage.js` - saveMessage()
- `localMessageStore.ts` - appendMessage()
- `messageDatabase.ts` - storeMessage()
- `firebaseServices.ts` - sendMessageReceipt()

---

## 🔐 Encryption Key Derivation Path

```
SENDER                          RECIPIENT
═══════════════════════════════════════════════════════════════

User Registration               User Registration
  ↓                              ↓
Firebase creates               Firebase creates
Auth account                    Auth account
  ↓                              ↓
userId₁ generated              userId₂ generated
(Firebase UID)                 (Firebase UID)

  [Later: Users become friends]

Send Message:                   
  ↓
getConversationKey(userId₁, userId₂)
  ↓
Sort: [userId₁, userId₂]
  ↓
seed = "userId₁|userId₂|e2e-chat"
  ↓
PBKDF2(seed, salt, 100k iterations, SHA-256)
  ↓
AES-256 key derived
  ↓
Generate random IV             Receive Message:
  ↓                              ↓
Encrypt message with IV          getConversationKey(userId₁, userId₂)
  ↓                              ↓
Send: [ciphertext]               Sort: [userId₁, userId₂]
                                 ↓
                                 seed = "userId₁|userId₂|e2e-chat"
                                 ↓
                                 PBKDF2(seed, salt, 100k iterations, SHA-256)
                                 ↓
                                 AES-256 key derived (SAME KEY)
                                 ↓
                                 Decrypt [ciphertext]
                                 ↓
                                 Read message
```

---

## 🔑 Key Management

| Key Type | How Generated | Stored | Usage | Rotation |
|----------|---|---|---|---|
| Firebase Auth UID | Firebase backend | User profile | User identification | Never |
| Conversation Key | PBKDF2 from usernames | RAM (cached) | E2EE encryption | Daily (NEW) |
| User Encryption Key | PBKDF2 from userId | RAM (cached) | Local storage | Session |
| Device Salt | Random (CSPRNG) | Device Keychain | Key derivation salt | Never |
| WebSocket Token | Firebase Auth | RAM | WebSocket auth | Session (15-30 min) |
| FCM Token | Firebase Cloud Messaging | Firestore | Push notifications | Session |

---

## 📡 Network Endpoints

### WebSocket
```
Endpoint: wss://quidec-server.onrender.com/ws
Protocol: Secure WebSocket (WSS = HTTPS for WebSocket)
Auth: Bearer token sent as first message
Messages:
  ├─ { type: 'auth', token }
  ├─ { type: 'message', to, encrypted, messageId }
  ├─ { type: 'receipt', messageId, status }
  ├─ { type: 'typing', conversationId, typing }
  ├─ { type: 'message-delete', messageId }
  └─ { type: 'call-signal', to, signal }
```

### Firebase Firestore
```
Collections:
  ├─ /users/{username}
  │  └─ Profile data (email, avatar, etc.)
  ├─ /friendships/{userId}
  │  └─ Friend lists & blocked users
  ├─ /friendRequests/{requestId}
  │  └─ Pending friend requests
  ├─ /conversations/{conversationId}
  │  └─ /messages/{messageId}
  │     └─ Encrypted messages + metadata
  └─ /mediaChunks/{chunkId}
     └─ Encrypted media files (fallback)
```

### Firebase Realtime Database
```
Paths:
  ├─ /presence/{userId}
  │  ├─ online: boolean
  │  ├─ lastSeen: timestamp
  │  └─ username: string
  ├─ /typing/{conversationId}
  │  ├─ users: array
  │  └─ timestamp: timestamp
  └─ /call-signals/{conversationId}
     ├─ offer: WebRTC offer
     ├─ answer: WebRTC answer
     └─ candidates: ICE candidates
```

---

## 🧪 Testing Data Flows

### Test 1: Verify Encryption/Decryption
```javascript
// src/utils/__tests__/encryption.test.js

import { encryptMessage, decryptMessage, getConversationKey } from '../encryption'

async function testE2EE() {
  const user1 = 'alice@example.com'
  const user2 = 'bob@example.com'
  
  // Get same key (deterministic)
  const keyA = await getConversationKey(user1, user2)
  const keyB = await getConversationKey(user1, user2)
  assert(keyA === keyB, 'Keys should be identical')
  
  // Encrypt & decrypt
  const message = { content: 'Hello Bob', timestamp: Date.now() }
  const encrypted = await encryptMessage(message, keyA)
  const decrypted = await decryptMessage(encrypted, keyB)
  
  assert(decrypted.content === 'Hello Bob', 'Content should match')
  assert(decrypted.timestamp === message.timestamp, 'Timestamp should match')
}
```

### Test 2: Verify Local Storage Encryption
```javascript
// Verify IndexedDB messages are encrypted

async function testLocalStorage() {
  const msg = { content: 'Secret', id: 'msg1' }
  
  // Store
  await storage.saveMessage(msg)
  
  // Check database directly
  const raw = await indexedDB.open('quidec-app')
  const stored = await raw.transaction('messages').objectStore('messages').get('msg1')
  
  // Verify content is encrypted (not plain text)
  assert(!stored.content.includes('Secret'), 'Content should be encrypted')
  assert(stored.content.includes('===') || stored.content.includes('+'), 'Should be base64')
}
```

---

## 📋 Data Retention & Cleanup

| Data | Retention | Cleanup |
|------|-----------|---------|
| Messages | Indefinite locally, 30 days in Firestore | Manual delete (NEW) |
| User profile | Until account deletion | Account delete |
| Friend list | Indefinite | Remove friend |
| Chat history | Indefinite locally | Manual clear (NEW) |
| WebSocket logs | 7 days | Auto-expire |
| FCM tokens | Valid 60 days | Auto-refresh |

---

**Last Updated**: 2026-05-18
**Scope**: Complete data flow reference with code locations
