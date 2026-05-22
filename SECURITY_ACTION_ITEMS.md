# Security Action Items - Quick Reference

## 🔴 CRITICAL (Before Public Release)

### 1. WebSocket Token Security
**File**: `src/utils/websocketManager.ts`

**Current (INSECURE)**:
```javascript
const wsUrl = token ? `${WS_URL}?token=${token}` : WS_URL
```

**Fix**:
```javascript
this.ws = new WebSocket(WS_URL)
this.ws.addEventListener('open', () => {
  this.ws.send(JSON.stringify({ 
    type: 'auth', 
    token: token,
    timestamp: Date.now()
  }))
})
```

---

### 2. Input Validation Layer
**Create**: `src/utils/validators.ts`

```typescript
export function validateMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') throw new Error('Invalid message')
  if (msg.length > 10000) throw new Error('Message too long (max 10000 chars)')
  if (msg.length === 0) throw new Error('Empty message')
  
  // Sanitize HTML
  const div = document.createElement('div')
  div.textContent = msg
  return div.innerHTML
}

export function validateUsername(username: string): string {
  if (!/^[a-zA-Z0-9._-]{3,20}$/.test(username)) {
    throw new Error('Username must be 3-20 chars, alphanumeric + ._-')
  }
  return username
}

export function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) throw new Error('Invalid email')
  return email
}
```

**Usage**:
```javascript
// In ChatWindow.tsx or message send handler
import { validateMessage } from './validators'

const sendMessage = async (text: string) => {
  try {
    const validated = validateMessage(text)
    // ... encrypt and send
  } catch (err) {
    showToast('Invalid message: ' + err.message)
  }
}
```

---

### 3. Rate Limiting
**Create**: `src/utils/rateLimiter.ts`

```typescript
export class RateLimiter {
  private attempts = new Map<string, number[]>()
  
  constructor(
    private maxAttempts = 5,
    private windowMs = 60000 // 1 minute
  ) {}

  async checkLimit(userId: string): Promise<void> {
    const now = Date.now()
    const userAttempts = this.attempts.get(userId) || []
    
    // Remove old attempts outside window
    const recentAttempts = userAttempts.filter(t => now - t < this.windowMs)
    
    if (recentAttempts.length >= this.maxAttempts) {
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(this.windowMs/1000)}s`)
    }
    
    recentAttempts.push(now)
    this.attempts.set(userId, recentAttempts)
  }
}

// Usage:
const messageLimiter = new RateLimiter(5, 60000) // 5 msgs/min
const loginLimiter = new RateLimiter(3, 300000)  // 3 attempts/5min

// Before sending message:
await messageLimiter.checkLimit(currentUser.uid)

// Before login:
await loginLimiter.checkLimit(email)
```

---

## 🟠 HIGH (First Month Post-Launch)

### 4. Fix Salt in Web Encryption
**File**: `src/utils/encryption.js`

**Current (WEAK)**:
```javascript
const derivedBits = await window.crypto.subtle.deriveBits({
  salt: new Uint8Array(16), // ⚠️ FIXED SALT
})
```

**Fix**:
```javascript
// Get device-specific salt
async function getOrCreateSalt() {
  const key = 'encryption_salt_v1'
  const stored = localStorage.getItem(key)
  
  if (stored) {
    return new Uint8Array(JSON.parse(stored))
  }
  
  // Create new salt for this device
  const newSalt = window.crypto.getRandomValues(new Uint8Array(32))
  localStorage.setItem(key, JSON.stringify(Array.from(newSalt)))
  
  return newSalt
}

// Use in derivation:
const salt = await getOrCreateSalt()
const derivedBits = await window.crypto.subtle.deriveBits({
  salt: salt, // ✅ RANDOM PER-DEVICE
  iterations: 100000,
  hash: 'SHA-256',
})
```

---

### 5. Message Deletion Protocol
**File**: `src/utils/firebaseServices.ts`

```typescript
export const messageService = {
  async deleteMessage(messageId: string, conversationId: string) {
    try {
      // Mark as deleted locally
      const localStore = await initializeDB()
      const tx = localStore.transaction(STORES.MESSAGES, 'readwrite')
      const msg = await tx.objectStore(STORES.MESSAGES).get(messageId)
      
      if (msg) {
        msg.content = '[Deleted]'
        msg.status = 'deleted'
        msg.deletedAt = serverTimestamp()
        await tx.objectStore(STORES.MESSAGES).put(msg)
      }
      
      // Update Firestore
      await updateDoc(
        doc(db, 'conversations', conversationId, 'messages', messageId),
        {
          content: '[Deleted]',
          status: 'deleted',
          deletedAt: serverTimestamp(),
        }
      )
      
      // Notify recipient via WebSocket
      await wsManager.send('message-delete', {
        messageId,
        conversationId,
        timestamp: Date.now()
      })
      
      return { success: true }
    } catch (err) {
      console.error('Failed to delete message:', err)
      throw err
    }
  }
}
```

---

### 6. Conversation Key Rotation (Daily)
**File**: `src/utils/encryption.js`

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

// Call daily (on app startup)
setInterval(() => {
  // Rotate keys for active conversations
  activeConversations.forEach(([user1, user2]) => {
    rotateConversationKey(user1, user2)
  })
}, 24 * 60 * 60 * 1000)
```

---

### 7. HMAC Message Authentication
**File**: `src/utils/encryption.js`

```typescript
async function generateAuthKey(conversationKey: CryptoKey) {
  // Derive auth key from conversation key
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

async function authenticateMessage(
  encryptedData: string,
  authKey: CryptoKey
): Promise<string> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    authKey,
    new TextEncoder().encode(encryptedData)
  )
  
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
}

async function verifyMessage(
  encryptedData: string,
  providedMac: string,
  authKey: CryptoKey
): Promise<boolean> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    authKey,
    new TextEncoder().encode(encryptedData)
  )
  
  const computedMac = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return computedMac === providedMac
}

// Use when sending:
const authKey = await generateAuthKey(conversationKey)
const mac = await authenticateMessage(encryptedContent, authKey)
await wsManager.send('message', {
  encrypted: encryptedContent,
  mac: mac, // Include MAC
  ...metadata
})

// Use when receiving:
const valid = await verifyMessage(encrypted, mac, authKey)
if (!valid) throw new Error('Message authentication failed')
```

---

## 🟡 MEDIUM (Next Quarter)

### 8. Device Keychain Integration
**Install dependency**:
```bash
pnpm add @react-native-async-storage/async-storage
# or for web:
pnpm add idb
```

**File**: `src/utils/secureStorage.ts`

```typescript
export class SecureStorage {
  private db: any
  
  async init() {
    this.db = await openDB('secure-storage', 1, {
      upgrade(db) {
        db.createObjectStore('keys')
      }
    })
  }

  async saveKey(key: string, value: CryptoKey) {
    // Extract key material for storage
    const exported = await crypto.subtle.wrapKey(
      'raw',
      value,
      await this.getWrapperKey(),
      'AES-GCM',
      ['encrypt', 'decrypt']
    )
    
    await this.db.put('keys', exported, key)
  }

  async getKey(key: string, algorithm: any) {
    const wrapped = await this.db.get('keys', key)
    if (!wrapped) return null
    
    return await crypto.subtle.unwrapKey(
      'raw',
      wrapped,
      await this.getWrapperKey(),
      'AES-GCM',
      algorithm,
      false,
      ['encrypt', 'decrypt']
    )
  }

  private async getWrapperKey() {
    // Derive wrapper key from device
    const deviceId = await Device.getId()
    const enc = new TextEncoder()
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(deviceId),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    )
    
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(32),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }
}
```

---

## 📊 Implementation Priority Matrix

| Item | Effort | Impact | Timeline |
|------|--------|--------|----------|
| WebSocket Token Fix | 2hrs | Critical | Day 1 |
| Input Validation | 4hrs | High | Day 2 |
| Rate Limiting | 3hrs | High | Day 3 |
| Fixed Salt Fix | 1hr | Medium | Day 4 |
| Message Deletion | 8hrs | High | Week 1 |
| Key Rotation | 4hrs | Medium | Week 1 |
| HMAC Auth | 3hrs | Medium | Week 2 |
| Secure Storage | 6hrs | Medium | Week 2 |

---

## 🧪 Testing Checklist

- [ ] Test message encryption/decryption
- [ ] Verify local storage is encrypted
- [ ] Test rate limiting works
- [ ] Verify WebSocket token security
- [ ] Test message deletion propagation
- [ ] Verify input validation prevents XSS
- [ ] Test key rotation daily
- [ ] Verify HMAC authentication

---

## 📞 Questions?

Refer to `SECURITY_ARCHITECTURE_REVIEW.md` for detailed threat model and implementation notes.
