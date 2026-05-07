# 💾 Database & Connectivity Architecture

## 🎯 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUIDEC CHAT APPLICATION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           React Web App (Capacitor WebView)              │  │
│  │  - UI Components                                         │  │
│  │  - User Interactions                                     │  │
│  │  - Local State Management                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            IndexedDB (Local Storage - Client)            │  │
│  │  - auth          (encryption keys, user data)           │  │
│  │  - messages      (chat history)                         │  │
│  │  - friends       (contacts)                             │  │
│  │  - friend-requests (request tracking)                   │  │
│  │  - media-metadata (file references)                     │  │
│  │  - sync-queue    (offline queue)                        │  │
│  │  - Filesystem    (media files)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         WebSocket Connection (WSS/TLS Encrypted)         │  │
│  │  Protocol: WebSocket (ws:// or wss://)                  │  │
│  │  Server: wss://quidec-server.onrender.com              │  │
│  │  Fallback: ws://localhost:3000 (development)            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Server (Node.js + Express + WS)              │  │
│  │  - WebSocket Server (Real-time communication)           │  │
│  │  - User Management (auth, validation)                   │  │
│  │  - Message Broadcasting                                 │  │
│  │  - Session Management                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │      In-Memory Data Store (Stateless/Ephemeral)        │  │
│  │  - userConnections (active WebSocket connections)       │  │
│  │  - userPublicKeys (cryptographic keys)                 │  │
│  │  - sessionUsernames (session tracking)                 │  │
│  │  - usernameStore (ephemeral - lost on server restart)  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ IndexedDB Database Schema

### Database Details:
```
Name:    quidec-app
Version: 1
Vendor:  Quide Technologies
Type:    NoSQL (Key-Value Store)
```

### Object Stores:

#### 1. **auth** - Authentication & Encryption Keys
```javascript
keyPath: 'key' (unique identifier)
Records:
  {
    key: 'currentUser',
    value: { username, email, userId, avatar }
  }
  {
    key: 'userId',
    value: 'unique-user-id'
  }
  {
    key: 'privateKey',
    value: 'hex-encoded-ed25519-private-key'
  }
  {
    key: 'publicKey',
    value: 'hex-encoded-ed25519-public-key'
  }
```

#### 2. **messages** - Chat History
```javascript
keyPath: 'id' (unique message ID)
Indexes:
  - 'conversation' (for querying messages by chat)
  - 'timestamp' (for sorting by time)
  - 'unread' (for filtering unread messages)

Records:
  {
    id: 'msg-12345',
    conversationKey: 'chat-user-123',
    timestamp: 1630703200000,
    senderUserId: 'user-123',
    content: 'Hello!',
    encrypted: true,
    status: 'delivered',
    unread: false,
    type: 'text' | 'media' | 'system'
  }
```

#### 3. **friends** - Contacts List
```javascript
keyPath: 'username' (unique)
Indexes:
  - 'online' (for filtering online contacts)

Records:
  {
    username: 'sarah_smith',
    id: 'user-456',
    name: 'Sarah Smith',
    avatar: 'data:image/jpeg;base64,...',
    online: true,
    lastSeen: '2024-01-15T10:30:00Z',
    publicKey: 'hex-encoded-key',
    status: 'Hey there!'
  }
```

#### 4. **friend-requests** - Request Management
```javascript
keyPath: 'id' (unique request ID)
Indexes:
  - 'type' (incoming/outgoing)
  - 'user' (related user ID)

Records:
  {
    id: 'req-789',
    type: 'incoming' | 'outgoing',
    relatedUser: 'user-789',
    relatedUsername: 'john_doe',
    timestamp: 1630703200000,
    status: 'pending' | 'accepted' | 'declined'
  }
```

#### 5. **media-metadata** - File References
```javascript
keyPath: 'id' (unique media ID)
Indexes:
  - 'messageId' (for querying media by message)
  - 'uri' (for finding media by path)

Records:
  {
    id: 'media-234',
    messageId: 'msg-12345',
    uri: 'file:///data/data/com.quidec.chat/files/images/photo-123.jpg',
    type: 'image' | 'video' | 'audio' | 'document',
    size: 2048000,
    uploadedAt: 1630703200000,
    downloadedAt: 1630703205000,
    mimeType: 'image/jpeg'
  }
```

#### 6. **sync-queue** - Offline Synchronization
```javascript
keyPath: 'id' (auto-increment)
Indexes:
  - 'timestamp' (for FIFO queue)
  - 'status' (pending/processing/failed)

Records:
  {
    id: 1,
    type: 'message' | 'request' | 'update',
    payload: { /* message data */ },
    timestamp: 1630703200000,
    status: 'pending' | 'processing' | 'failed',
    retries: 0,
    lastError: 'Network timeout'
  }
```

---

## 🔌 WebSocket Connection Protocol

### Connection Details:

**Initialization:**
```typescript
// Server URL from environment
const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com';

// Create WebSocket connection
const ws = new WebSocket(serverUrl);

ws.onopen = () => {
  console.log('✅ Connected to server');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleServerMessage(data);
};

ws.onerror = (error) => {
  console.error('❌ WebSocket error:', error);
};

ws.onclose = () => {
  console.log('⚠️ Disconnected from server');
  // Attempt reconnection
  reconnectWithBackoff();
};
```

### Message Format:

**Client → Server:**
```json
{
  "type": "message" | "call" | "status" | "request" | "auth",
  "from": "username",
  "to": "recipient-username",
  "data": { /* message content */ },
  "timestamp": 1630703200000
}
```

**Server → Client:**
```json
{
  "type": "message" | "notification" | "ack" | "error",
  "data": { /* response data */ },
  "from": "system" | "username",
  "timestamp": 1630703200000,
  "status": "success" | "error"
}
```

### Reconnection Strategy:

```typescript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1 second

function reconnectWithBackoff() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('❌ Max reconnection attempts reached');
    return;
  }

  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
  reconnectAttempts++;

  console.log(`⏳ Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  setTimeout(() => {
    connect();
  }, delay);
}
```

---

## 🔐 End-to-End Encryption (E2EE)

### Key Management:

**Key Pair Generation (Ed25519):**
```typescript
import * as ed from '@noble/ed25519';

// Generate keypair
const privateKey = ed.utils.randomPrivateKey();
const publicKey = ed.getPublicKey(privateKey);

// Store in IndexedDB
await saveAuth(currentUser, userId, privateKey, publicKey);
```

**Message Encryption:**
```typescript
// Sender encrypts message with recipient's public key
const encrypted = await encryptMessage(content, recipientPublicKey);

// Send encrypted message
ws.send(JSON.stringify({
  type: 'message',
  from: currentUser.username,
  to: recipientUsername,
  data: encrypted,
  timestamp: Date.now()
}));
```

**Message Decryption:**
```typescript
// Recipient decrypts with own private key
const decrypted = await decryptMessage(encryptedData, privateKey);
```

---

## 🌐 Network Connection Detection

### Using Capacitor Network Plugin:

```typescript
import { Network } from '@capacitor/network';

// Check current status
async function checkNetworkStatus() {
  const status = await Network.getStatus();
  console.log('Connected:', status.connected);
  console.log('ConnectionType:', status.connectionType);

  if (!status.connected) {
    console.warn('⚠️ No network connection');
    activateOfflineMode();
  }
}

// Listen for changes
Network.addListener('networkStatusChange', (status) => {
  console.log('Network status changed:', status);
  
  if (status.connected && isOfflineMode) {
    console.log('✅ Back online, syncing queue');
    syncOfflineQueue();
  } else if (!status.connected && !isOfflineMode) {
    console.log('⚠️ Offline, queuing messages');
    activateOfflineMode();
  }
});
```

### Offline Mode:

When network is unavailable:
1. UI switches to offline state
2. Messages queued in sync-queue store
3. User notified of offline status
4. When online, sync-queue automatically processes

---

## 🔄 Data Synchronization

### Sync Flow:

```
User Action (send message)
    ↓
Validate & Encrypt
    ↓
Network Connected?
    ├─ YES → Send via WebSocket → Server processes → Update local DB
    └─ NO → Queue in sync-queue → Wait for connection
    ↓
On Connection Restored
    ↓
Process sync-queue (FIFO)
    ↓
Send queued messages
    ↓
Remove from sync-queue on success
    ↓
Mark as 'sent' in messages store
```

### Sync API:

```typescript
// Add to sync queue
export async function addToSyncQueue(type, payload) {
  const database = await initializeDB();
  const tx = database.transaction(STORES.SYNC_QUEUE, 'readwrite');
  await tx.objectStore(STORES.SYNC_QUEUE).add({
    type,
    payload,
    timestamp: Date.now(),
    status: 'pending',
    retries: 0
  });
  await tx.done;
}

// Process sync queue
export async function processSyncQueue() {
  const database = await initializeDB();
  const records = await database.getAllFromIndex(
    STORES.SYNC_QUEUE,
    'status',
    'pending'
  );

  for (const record of records) {
    try {
      // Process each item
      await sendMessage(record.payload);
      
      // Mark as processed
      await database.put(STORES.SYNC_QUEUE, {
        ...record,
        status: 'processed'
      });
    } catch (error) {
      // Mark as failed
      await database.put(STORES.SYNC_QUEUE, {
        ...record,
        status: 'failed',
        retries: record.retries + 1,
        lastError: error.message
      });
    }
  }
}
```

---

## 🎯 Connection Monitoring

### Status Indicators:

```
Connected ✅ (green)
  - WebSocket open
  - Messages sending/receiving
  - Sync queue processing

Connecting ⏳ (yellow)
  - Attempting connection
  - Retrying with backoff
  - UI shows loading state

Offline ❌ (red)
  - Network unavailable
  - WebSocket disconnected
  - Queuing messages locally
  - UI shows offline banner
```

### Monitoring Code:

```typescript
export function useConnectionStatus() {
  const [status, setStatus] = useState('connected');
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(serverUrl);

    ws.onopen = () => setStatus('connected');
    ws.onerror = () => setStatus('error');
    ws.onclose = () => setStatus('offline');

    wsRef.current = ws;

    return () => ws.close();
  }, []);

  return status;
}

// Usage in component
function ChatWindow() {
  const status = useConnectionStatus();

  return (
    <div>
      <ConnectionBadge status={status} />
      {status === 'offline' && (
        <OfflineBanner message="Messages will sync when you're online" />
      )}
    </div>
  );
}
```

---

## 📊 Performance Considerations

### Database Performance:

| Operation | Time | Notes |
|-----------|------|-------|
| Save message | ~10ms | Single write |
| Load chat history | ~50ms | ~100 messages |
| Search contacts | ~20ms | Index lookup |
| Sync 50 messages | ~500ms | Batch write |

### Memory Usage:

- IndexedDB: ~20MB per 10,000 messages
- WebSocket: ~1-2MB (connection overhead)
- Media cache: Depends on file sizes
- React state: ~5-10MB

### Optimization Tips:

1. **Pagination:** Load messages in chunks of 20-50
2. **Indexing:** Always use indexed properties in queries
3. **Cleanup:** Archive old messages periodically
4. **Lazy Loading:** Load media on demand
5. **Compression:** Gzip messages over network

---

## ⚠️ Troubleshooting

### Issue: "IndexedDB quota exceeded"
```typescript
// Check quota
const estimate = await navigator.storage.estimate();
console.log('Usage:', estimate.usage);
console.log('Quota:', estimate.quota);

// Solution: Clear old messages
await cleanupOldMessages(daysToKeep = 30);
```

### Issue: "WebSocket connection refused"
```typescript
// Check server is running
curl https://quidec-server.onrender.com/

// Check firewall
# Ensure port 3000 or 443 is open
```

### Issue: "Message not syncing"
```typescript
// Check sync queue
const queue = await getAllFromIndex(STORES.SYNC_QUEUE, 'status', 'pending');
console.log('Pending messages:', queue);

// Manually trigger sync
await processSyncQueue();
```

---

## 🚀 Next Steps

1. **Configure Server URL:** Set VITE_SERVER_URL environment variable
2. **Generate Keys:** Run key generation on first login
3. **Test Connectivity:** Use network status listener
4. **Monitor Performance:** Use DevTools Performance tab
5. **Scale Database:** Archive messages to cloud storage

---

*Database & Connectivity Specification v1.0*  
*Last Updated: May 6, 2026*
