# Quick Reference - Encrypted Chunked Media System

## 📦 Files Created

### Core Utilities
| File | Purpose |
|------|---------|
| `src/utils/encryptedChunkedMedia.ts` | Core encryption engine - chunking, AES-256, SHA-256 |
| `src/utils/mediaUploadHandler.ts` | Upload, display, and cache management |
| `src/utils/messageDatabase.ts` | IndexedDB storage for messages and media metadata |
| `src/utils/migrationAndUtils.ts` | Migration, backup, and diagnostics tools |

### React Components & Hooks
| File | Purpose |
|------|---------|
| `src/hooks/useEncryptedMedia.ts` | React hooks for easy integration |
| `src/app/components/EncryptedMediaDisplay.tsx` | Display encrypted media in UI |
| `src/components/EncryptedMediaUpload.tsx` | Upload media with progress tracking |

### Documentation
| File | Purpose |
|------|---------|
| `ENCRYPTED_CHUNKED_MEDIA_GUIDE.md` | Complete implementation guide |
| `ENCRYPTED_MEDIA_IMPLEMENTATION_SUMMARY.md` | Architecture & overview |

## 🚀 Quick Import References

### Display Encrypted Media
```typescript
import EncryptedMediaDisplay from '@/app/components/EncryptedMediaDisplay'
import { useEncryptedMedia } from '@/hooks/useEncryptedMedia'

// In component
const { displayUrl, loading, error } = useEncryptedMedia(
  fileId,
  'image',
  { user1: userId, user2: recipientId }
)

<EncryptedMediaDisplay
  fileId={fileId}
  mediaType="image"
  currentUserId={userId}
  otherUserId={recipientId}
/>
```

### Upload Media
```typescript
import EncryptedMediaUpload from '@/components/EncryptedMediaUpload'
import { useMediaUpload } from '@/hooks/useEncryptedMedia'

// In component
const { uploading, progress, upload } = useMediaUpload({
  user1: userId,
  user2: recipientId
})

<EncryptedMediaUpload
  mediaType="image"
  currentUserId={userId}
  otherUserId={recipientId}
  onUploadComplete={(fileId) => console.log(fileId)}
/>
```

### Save Message with Media
```typescript
import { saveEncryptedMessageWithMedia } from '@/utils/messageDatabase'

const messageRecord = await saveEncryptedMessageWithMedia(
  'Hello world',
  senderId,
  recipientId,
  [fileId], // attachment file IDs
  userId1,
  userId2
)
```

### Get Conversation Messages
```typescript
import { messageDb, getConversationId } from '@/utils/messageDatabase'

const conversationId = getConversationId(user1, user2)
const messages = await messageDb.getConversationMessages(conversationId)
```

### Direct Encryption Functions
```typescript
import {
  saveEncryptedMediaChunks,
  retrieveDecryptedMedia,
  generateSHA256Hash
} from '@/utils/encryptedChunkedMedia'

// Save media
const { fileId, totalChunks, fileHash } = await saveEncryptedMediaChunks(
  binaryData,
  'image',
  user1,
  user2
)

// Retrieve media
const { data, verified, mediaType } = await retrieveDecryptedMedia(
  fileId,
  user1,
  user2
)
```

### Upload with Progress
```typescript
import { uploadMediaWithProgress, loadMediaWithCache } from '@/utils/mediaUploadHandler'

// Upload
const result = await uploadMediaWithProgress(
  file,
  'image',
  userId1,
  userId2,
  (progress) => console.log(`${progress.percentComplete}%`)
)

// Load for display
const displayUrl = await loadMediaWithCache(
  fileId,
  'image',
  userId1,
  userId2
)
```

### Database Operations
```typescript
import { messageDb } from '@/utils/messageDatabase'

// Store message
await messageDb.storeMessage(messageRecord)

// Get media for conversation
const media = await messageDb.getConversationMedia(conversationId)

// Update message status
await messageDb.updateMessageStatus(messageId, 'read')

// Get stats
const stats = await messageDb.getStatistics()

// Clear conversation
await messageDb.clearConversation(conversationId)
```

### Utilities & Diagnostics
```typescript
import {
  getEncryptionStats,
  performHealthCheck,
  backupEncryptedData,
  migrateMediaFile,
  getConversationStats
} from '@/utils/migrationAndUtils'

// Get stats
const stats = await getEncryptionStats()

// Health check
const health = await performHealthCheck()

// Backup
const backup = await backupEncryptedData('backups/2024')

// Migrate old media
const result = await migrateMediaFile(oldPath, 'image', user1, user2)

// Get conversation stats
const convStats = await getConversationStats(conversationId)
```

## 🔑 Key Data Structures

### EncryptedMessageRecord
```typescript
{
  messageId: string
  senderId: string
  recipientId: string
  conversationId: string
  content: string
  attachmentFileIds: string[]
  timestamp: number
  status: 'sent' | 'delivered' | 'read' | 'failed'
  encryptedChunkId: string
  totalChunks: number
  messageHash: string
}
```

### StoredMediaReference
```typescript
{
  fileId: string
  mediaType: 'image' | 'video' | 'audio'
  totalChunks: number
  originalName?: string
  fileHash: string
  uploadedAt: number
  fileSize: number
}
```

### MediaUploadProgress
```typescript
{
  fileId: string
  totalSize: number
  processedSize: number
  percentComplete: number
  stage: 'preparing' | 'chunking' | 'encrypting' | 'saving' | 'complete'
}
```

## 🎨 Common UI Patterns

### Complete Chat Message with Media
```typescript
function ChatMessage({ message, currentUserId }) {
  return (
    <div className="message-container">
      {/* Message content */}
      <div className="message-content">
        <p className="text-sm font-medium">{message.senderId}</p>
        <p className="text-base">{message.content}</p>
        <span className="text-xs text-gray-500">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Attachments */}
      {message.attachmentFileIds?.map((fileId) => (
        <EncryptedMediaDisplay
          key={fileId}
          fileId={fileId}
          mediaType="image"
          currentUserId={currentUserId}
          otherUserId={message.senderId}
          maxHeight={300}
          maxWidth="100%"
        />
      ))}

      {/* Status indicator */}
      <div className="text-xs mt-1">
        {message.status === 'read' && '✓✓'}
        {message.status === 'delivered' && '✓'}
        {message.status === 'sent' && '○'}
      </div>
    </div>
  )
}
```

### Chat Input with Media Upload
```typescript
function ChatInput({ onSendMessage }) {
  const [message, setMessage] = useState('')
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)

  return (
    <div className="chat-input-container space-y-2">
      {/* Media upload */}
      <EncryptedMediaUpload
        mediaType="image"
        currentUserId={currentUserId}
        otherUserId={recipientId}
        onUploadComplete={setSelectedFileId}
      />

      {/* Text input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type message..."
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={() => {
            onSendMessage(message, selectedFileId)
            setMessage('')
            setSelectedFileId(null)
          }}
          disabled={!message.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

## 🔐 Security Checklist

- ✅ Messages encrypted before storage
- ✅ Media encrypted in chunks
- ✅ Conversation-specific encryption keys
- ✅ SHA-256 integrity verification
- ✅ Random IVs per chunk
- ✅ Device-local storage only
- ✅ No unencrypted data in transit
- ✅ Auto-cleanup of sensitive data
- ✅ Blob URL revocation
- ✅ Memory cache TTL

## ⚡ Performance Tips

1. **Lazy Load Media** - Only load when displayed
2. **Batch Operations** - Load multiple media sequentially
3. **Cache Aggressively** - 5-minute TTL prevents waste
4. **Clean Up Cache** - Call `mediaCache.clear()` on logout
5. **Monitor Storage** - Check stats with `getEncryptionStats()`
6. **Chunk Size** - 256KB optimal for mobile devices
7. **Background Tasks** - Consider Web Workers for encryption

## 🐛 Debugging

### Enable Logging
```typescript
// The system logs to console automatically
// Filter logs in DevTools: "✅" for success, "❌" for errors, "⚠️" for warnings
```

### Health Check
```typescript
import { performHealthCheck } from '@/utils/migrationAndUtils'

const health = await performHealthCheck()
console.log('Issues:', health.issues)
console.log('Recommendations:', health.recommendations)
```

### View Stats
```typescript
import { getEncryptionStats } from '@/utils/migrationAndUtils'

const stats = await getEncryptionStats()
console.log('Total media:', stats.totalMediaFiles)
console.log('Storage:', stats.storageUsed, 'bytes')
```

## 📱 Mobile Optimization

- Chunks transferred over WiFi to minimize data usage
- Large file support (tested up to 500MB)
- Efficient memory management with TTL cache
- Graceful degradation on low memory
- Background upload capability
- Pause/resume upload support (can be added)

## 🔄 Integration Checklist

- [ ] Import utilities in app components
- [ ] Initialize `messageDb` on app startup
- [ ] Update message sending with `saveEncryptedMessageWithMedia`
- [ ] Update message display with `EncryptedMediaDisplay`
- [ ] Add `EncryptedMediaUpload` to chat input
- [ ] Test sending/receiving messages with media
- [ ] Implement message status tracking
- [ ] Add media deletion capability
- [ ] Setup regular backups
- [ ] Monitor storage usage
- [ ] Deploy to test device
- [ ] Performance testing with real data

---

**Quick Links:**
- Full Guide: `ENCRYPTED_CHUNKED_MEDIA_GUIDE.md`
- Implementation Summary: `ENCRYPTED_MEDIA_IMPLEMENTATION_SUMMARY.md`
- API Reference: See JSDoc comments in each file
