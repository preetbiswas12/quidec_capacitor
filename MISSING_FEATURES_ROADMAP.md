# MISSING FEATURES & IMPROVEMENTS ROADMAP

**Current Status**: 75% complete with security fixes applied

---

## 🔴 CRITICAL (Blocking Production Release)

### 1. Mobile Permissions Configuration
**Status**: ⏳ Pending  
**Files**: `ANDROID_PERMISSIONS_TO_ADD.txt`, `IOS_PERMISSIONS_TO_ADD.txt`

**What's needed**:
- [ ] Add Android permissions to `android/app/src/AndroidManifest.xml`
  - CAMERA
  - RECORD_AUDIO
  - INTERNET
  - MODIFY_AUDIO_SETTINGS
  - ACCESS_NETWORK_STATE

- [ ] Add iOS permissions to `ios/App/App/Info.plist`
  - NSCameraUsageDescription
  - NSMicrophoneUsageDescription
  - NSLocalNetworkUsageDescription
  - NSBonjourServiceTypes

**Why**: Without these, app crashes when trying to access camera/microphone

**Effort**: 30 minutes
**Impact**: Critical - app cannot function without

---

### 2. Route & Navigation Setup
**Status**: ⏳ Partially done  
**Files**: `src/app/routes.tsx`, `src/app/components/CallsTab.tsx`

**What's needed**:
- [ ] Uncomment/add video call route in `routes.tsx`
  ```typescript
  {
    path: '/call/video/:conversationId',
    component: <VideoCallScreen />
  }
  ```

- [ ] Enable `startCall()` in CallsTab.tsx
  ```typescript
  const startCall = (conversationId: string) => {
    navigate(`/call/video/${conversationId}`)
  }
  ```

- [ ] Add call button to conversation list
- [ ] Add call button to chat header (active chat)

**Effort**: 2 hours
**Impact**: High - users cannot initiate calls

---

### 3. Input Validation Integration
**Status**: ✅ File created, needs integration  
**Files**: `src/utils/validators.ts` (NEW)

**What's needed**:
- [ ] Integrate in message sending
  ```typescript
  // src/app/components/ChatWindow.tsx
  import { validateMessage, messageLimiter } from '../utils/validators'
  
  const sendMessage = async (text: string) => {
    try {
      await messageLimiter.checkLimit(currentUser.uid)
      const validated = validateMessage(text)
      // ... encrypt and send
    } catch (err) {
      showToast('Error: ' + err.message)
    }
  }
  ```

- [ ] Validate login/registration inputs
  ```typescript
  // src/utils/firebaseServices.ts
  import { validateEmail, validatePassword, validateUsername } from './validators'
  
  export async function registerUser(email, username, password) {
    validateEmail(email)
    validateUsername(username)
    validatePassword(password)
    // ... proceed
  }
  ```

- [ ] Validate media uploads (file size, type)
- [ ] Sanitize all user inputs before display

**Effort**: 4 hours
**Impact**: High - prevents XSS, injection attacks, DoS via large inputs

---

### 4. Rate Limiting Integration
**Status**: ✅ File created, needs integration  
**Files**: `src/utils/validators.ts` (RateLimiter class)

**What's needed**:
- [ ] Message rate limiting (5 msgs/min per user)
  ```typescript
  // Before sending message
  await messageLimiter.checkLimit(currentUser.uid)
  ```

- [ ] Login rate limiting (3 attempts/5 min per email)
  ```typescript
  // In loginUser()
  await loginLimiter.checkLimit(email)
  ```

- [ ] Registration rate limiting (2 attempts/hour per IP)
- [ ] Friend request rate limiting (5 requests/5 min)
- [ ] Display "Try again in X seconds" message to users

**Effort**: 3 hours
**Impact**: High - prevents spam, brute force, bot attacks

---

## 🟠 HIGH PRIORITY (Next 2 Weeks)

### 5. Message Deletion Protocol
**Status**: ⏳ Pending  
**Files**: `src/utils/firebaseServices.ts`

**What's needed**:
```typescript
export async function deleteMessage(messageId: string, conversationId: string) {
  try {
    // 1. Mark as deleted locally (IndexedDB)
    const localStore = await initializeDB()
    const msg = await localStore.getFromIndex(STORES.MESSAGES, 'byId', messageId)
    if (msg) {
      msg.content = '[Deleted]'
      msg.status = 'deleted'
      msg.deletedAt = Date.now()
      await localStore.put(STORES.MESSAGES, msg)
    }

    // 2. Update Firestore
    await updateDoc(
      doc(db, 'conversations', conversationId, 'messages', messageId),
      {
        content: '[Deleted]',
        status: 'deleted',
        deletedAt: serverTimestamp()
      }
    )

    // 3. Notify recipient via WebSocket
    await wsManager.send('message-delete', {
      messageId,
      conversationId,
      timestamp: Date.now()
    })

    return { success: true }
  } catch (err) {
    console.error('Delete failed:', err)
    throw err
  }
}
```

**UI Changes**:
- [ ] Add "Delete" option to message context menu
- [ ] Show delete confirmation
- [ ] Update message display to "[Deleted]"
- [ ] Handle delete for recipient in real-time

**Effort**: 8 hours
**Impact**: High - important privacy/mistake recovery feature

---

### 6. Daily Key Rotation
**Status**: ⏳ Pending  
**Files**: `src/utils/encryption.js`

**What's needed**:
```typescript
export async function rotateConversationKey(user1: string, user2: string) {
  const [userA, userB] = [user1, user2].sort()
  const cacheKey = `${userA}:${userB}`
  
  // Add session ID with current date
  const sessionId = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const sharedSeed = `${userA}|${userB}|${sessionId}|e2e-chat`
  
  const key = await deriveKey(sharedSeed)
  conversationKeyCache.set(cacheKey, key)
  
  // Store session ID in Firestore for recovery
  await setDoc(
    doc(db, 'keyRotations', cacheKey),
    {
      sessionId,
      timestamp: serverTimestamp(),
      users: [user1, user2]
    },
    { merge: true }
  )
  
  return key
}

// Call daily on app startup
setInterval(() => {
  activeConversations.forEach(([user1, user2]) => {
    rotateConversationKey(user1, user2)
  })
}, 24 * 60 * 60 * 1000)
```

**Effort**: 4 hours
**Impact**: Medium - forward secrecy improvement

---

### 7. HMAC Message Authentication
**Status**: ⏳ Pending  
**Files**: `src/utils/encryption.js`

**What's needed**:
```typescript
async function generateAuthKey(conversationKey: CryptoKey) {
  return await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('auth')
    },
    conversationKey,
    256
  )
}

async function authenticateMessage(encrypted: string, authKey: CryptoKey): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    authKey,
    new TextEncoder().encode(encrypted)
  )
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
}

// Use when sending:
const authKey = await generateAuthKey(conversationKey)
const mac = await authenticateMessage(encryptedContent, authKey)
await wsManager.send('message', {
  encrypted: encryptedContent,
  mac: mac,
  ...metadata
})
```

**Effort**: 3 hours
**Impact**: Medium - prevents message tampering

---

## 🟡 MEDIUM PRIORITY (Weeks 3-4)

### 8. Read Receipts / Message Status
**Status**: ⏳ Partially done  
**Files**: `src/utils/firebaseServices.ts`, WebSocket handlers

**Current State**: 
- Basic `sent/delivered/read` tracking in Firestore
- WebSocket handlers exist for receipts
- UI updates via listeners

**What's needed**:
- [ ] Verify receipt listeners working in all message components
- [ ] Show delivery/read status in UI (single tick / double tick / blue double tick)
- [ ] Handle offline messages (queue receipts for when online)
- [ ] Test with slow networks
- [ ] Firestore rule: only sender can read receipt field

**Effort**: 3 hours
**Impact**: Medium - improves UX with message status visibility

---

### 9. Typing Indicators
**Status**: ⏳ Not implemented  
**Files**: Realtime DB, WebSocket

**What's needed**:
```typescript
// src/utils/websocketManager.ts
sendTypingIndicator(conversationId: string) {
  this.send('typing', {
    conversationId,
    username: currentUser.username,
    timestamp: Date.now()
  })
}

// src/utils/firebaseServices.ts (Realtime DB)
export const typingService = {
  setTyping(conversationId: string, isTyping: boolean) {
    if (isTyping) {
      set(ref(realtimeDB, `typing/${conversationId}/${currentUser.uid}`), {
        username: currentUser.username,
        timestamp: serverTimestamp()
      })
    } else {
      remove(ref(realtimeDB, `typing/${conversationId}/${currentUser.uid}`))
    }
  }
}
```

**UI Changes**:
- [ ] Show "User is typing..." in chat
- [ ] Debounce typing events (send every 500ms max)
- [ ] Clear typing indicator after 3 seconds of inactivity

**Effort**: 3 hours
**Impact**: Medium - improves real-time UX

---

### 10. Presence / Online Status
**Status**: ⏳ Partially done  
**Files**: Realtime DB

**Current State**: 
- Presence listeners set up in useEffect
- Updates lastSeen on login/logout

**What's needed**:
- [ ] Show online/offline indicator in chat
- [ ] Show last seen time for offline contacts
- [ ] Format time nicely ("2 minutes ago", "Yesterday", etc.)
- [ ] Update presence on window focus/blur
- [ ] Handle disconnection gracefully
- [ ] Test presence with multiple tabs

**Effort**: 2 hours
**Impact**: Medium - improves UX with contact status

---

### 11. Search Messages
**Status**: ❌ Not implemented  
**Files**: New file needed

**What's needed**:
```typescript
// src/utils/messageSearch.ts
export async function searchMessages(
  conversationId: string,
  query: string,
  limit: number = 50
) {
  const db = await initializeDB()
  const allMessages = await db.getAll(STORES.MESSAGES)
  
  // Filter by conversation and search query
  return allMessages.filter(msg =>
    msg.conversationId === conversationId &&
    msg.content.toLowerCase().includes(query.toLowerCase())
  ).slice(0, limit)
}
```

**UI Changes**:
- [ ] Add search input in chat header
- [ ] Display search results with context (1-2 lines)
- [ ] Highlight matching text
- [ ] Jump to result in conversation

**Effort**: 4 hours
**Impact**: Medium - improves discoverability

---

### 12. Media Gallery
**Status**: ⏳ Partially done  
**Files**: `src/app/components/MediaGallery.tsx` (need to verify)

**What's needed**:
- [ ] Display all media in conversation
- [ ] Thumbnail grid layout
- [ ] Full-screen viewer with swipe navigation
- [ ] Download/share media
- [ ] Media info (sender, timestamp, size)
- [ ] Filter by type (images, videos, audio)

**Effort**: 5 hours
**Impact**: Medium - improves media browsing UX

---

### 13. Group Chat Support
**Status**: ❌ Not implemented (🚫 MVP scope: skip for now)

**Scope Notes**: 
- Requires conversation redesign (not just 2-person)
- Firestore schema updates needed
- Encryption needs group key management
- Post-MVP feature

---

## 🟢 NICE TO HAVE (Post-MVP)

### 14. Audio/Video Calls
**Status**: ✅ Implemented (WebRTC with PeerJS)

**What works**:
- Voice calls with TURN relay
- Video calls with HD quality
- Call history & duration tracking
- Media controls (mute, video toggle)

**What needs improvement**:
- [ ] Call reconnection on network loss
- [ ] Call quality indicators
- [ ] Audio device selection (speaker, earpiece)
- [ ] Video source selection (front/back camera)
- [ ] Screen sharing (optional)

**Effort**: 6-8 hours (for advanced features)
**Impact**: High - core feature

---

### 15. Theme Support
**Status**: ⏳ CSS variables in place, needs UI toggle

**What's needed**:
- [ ] Dark mode toggle button
- [ ] Save theme preference to localStorage
- [ ] System preference detection (prefers-color-scheme)
- [ ] Smooth transitions between themes

**Effort**: 2 hours
**Impact**: Low - nice to have

---

### 16. Notification Sound / Vibration
**Status**: ⏳ Partially done

**What's needed**:
- [ ] Play sound on message (allow mute)
- [ ] Vibration on mobile (Capacitor Haptics)
- [ ] Settings page for notification preferences
- [ ] Do not disturb mode

**Effort**: 2 hours
**Impact**: Low - improves UX

---

### 17. Profile Customization
**Status**: ⏳ Partial

**What's needed**:
- [ ] Avatar/profile picture upload
- [ ] Status message ("In a meeting", "Available", etc.)
- [ ] Nickname for contacts
- [ ] Block/unblock users
- [ ] Privacy settings (who can see online status)

**Effort**: 6 hours
**Impact**: Low - improves personalization

---

### 18. Backup & Restore
**Status**: ❌ Not implemented

**What's needed**:
- [ ] Export chat history as JSON/PDF
- [ ] Export encryption keys securely
- [ ] Restore from backup
- [ ] Cloud backup option (Firebase or custom)

**Effort**: 8 hours
**Impact**: Medium - important for data protection

---

## 📋 TESTING & QA

### Missing Test Coverage
**Status**: ⏳ Partial testing only

**What's needed**:
- [ ] Unit tests for encryption/decryption
- [ ] Unit tests for validators
- [ ] Integration tests for message flow
- [ ] End-to-end tests for calls
- [ ] Performance tests (message throughput, latency)
- [ ] Security tests (XSS, injection, rate limiting)

**Files to create**:
- `src/utils/__tests__/encryption.test.ts`
- `src/utils/__tests__/validators.test.ts`
- `src/utils/__tests__/websocketManager.test.ts`

**Effort**: 20+ hours
**Impact**: High - prevents regressions

---

### Device Testing
**What's needed**:
- [ ] Test on Android 5.0+ devices
- [ ] Test on iOS 11+ devices
- [ ] Test WiFi + cellular connections
- [ ] Test with poor network (3G)
- [ ] Test with interrupted network
- [ ] Test with multiple browsers/tabs

**Effort**: 10 hours (manual testing)
**Impact**: High - ensures mobile compatibility

---

## 🚀 IMPLEMENTATION PRIORITY MATRIX

| Feature | Effort | Impact | Timeline |
|---------|--------|--------|----------|
| Mobile Permissions | 0.5h | Critical | Day 1 |
| Routes & Navigation | 2h | Critical | Day 1 |
| Input Validation Integration | 4h | High | Day 2 |
| Rate Limiting Integration | 3h | High | Day 3 |
| Message Deletion | 8h | High | Week 1 |
| Key Rotation | 4h | Medium | Week 1 |
| HMAC Authentication | 3h | Medium | Week 2 |
| Message Status UI | 3h | Medium | Week 2 |
| Typing Indicators | 3h | Medium | Week 2 |
| Presence Status | 2h | Medium | Week 3 |
| Message Search | 4h | Medium | Week 3 |
| Media Gallery | 5h | Medium | Week 3 |
| Test Coverage | 20h | High | Week 4-5 |
| Device Testing | 10h | High | Week 4-5 |

---

## 📊 Post-Security-Fixes Status

### Implemented This Session
- ✅ WebSocket token security (moved from URL to message)
- ✅ Input validation layer (validators.ts)
- ✅ Encryption salt (fixed → per-device random)
- ✅ Rate limiting framework (in validators.ts)

### Estimated Completion Timeline
**With 40 hours/week effort**:
- Weeks 1-2: Critical items + high priority (20 hours)
- Weeks 3-4: Medium priority items (25 hours)
- Weeks 5-6: Testing & QA (20 hours)
- **Total for MVP: ~6 weeks with all features**

### Recommended MVP Scope
For initial launch, prioritize:
1. ✅ Security fixes (done)
2. Mobile permissions + routes (2 days)
3. Input validation integration (1 day)
4. Rate limiting integration (1 day)
5. Message status UI (1 day)
6. Manual testing on 2-3 devices (2 days)

**MVP Timeline: 10 days**

---

**Last Updated**: 2026-05-18  
**Status**: Ready for implementation
