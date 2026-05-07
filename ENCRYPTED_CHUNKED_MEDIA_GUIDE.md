# Encrypted Chunked Media Storage Implementation Guide

## Overview
This document explains how to integrate the new encrypted chunked media storage system into your chat application. All media is:
- **Chunked** into 256KB pieces for efficient storage and transmission
- **Encrypted** with AES-256-GCM using conversation-specific keys
- **Hashed** with SHA-256 for integrity verification
- **Stored locally** on the user's device using Capacitor Filesystem

## Architecture

### Storage Structure
```
device_storage/
├── media/
│   ├── chunks/          # Encrypted media chunks
│   │   ├── image_123456_abc_chunk_0
│   │   ├── image_123456_abc_chunk_1
│   │   └── ...
│   └── metadata/        # Chunk metadata and verification
│       ├── image_123456_abc_chunk_0.json
│       ├── image_123456_abc_chunk_1.json
│       └── ...
└── temp/               # Temporary files during processing
```

### Key Features

1. **Chunked Processing**
   - Media is split into 256KB chunks
   - Each chunk is independently encrypted
   - Allows large files to be handled efficiently

2. **Dual Encryption**
   - Each chunk encrypted with conversation-specific AES-256 key
   - Conversation key derived from both users' IDs
   - Only conversation participants can decrypt

3. **Integrity Verification**
   - Each chunk hashed with SHA-256 before encryption
   - Overall file hash stored for complete verification
   - Corrupted chunks detected on retrieval

4. **Smart Caching**
   - Decrypted media cached in memory with 5-minute TTL
   - Blob URLs managed automatically
   - Prevents redundant decryption operations

## Implementation Steps

### Step 1: Update Chat Message Sending

In your chat component where you send messages:

```typescript
import { saveEncryptedMessageWithMedia } from '../utils/messageDatabase'
import { uploadMediaWithProgress } from '../utils/mediaUploadHandler'

async function handleSendMessage(
  messageText: string,
  selectedFile: File | null,
  currentUserId: string,
  recipientId: string
) {
  let attachmentFileIds: string[] = []

  // Upload media if provided
  if (selectedFile) {
    const mediaType = selectedFile.type.startsWith('image/') ? 'image' 
                    : selectedFile.type.startsWith('video/') ? 'video' 
                    : 'audio'

    const uploadResult = await uploadMediaWithProgress(
      selectedFile,
      mediaType,
      currentUserId,
      recipientId,
      (progress) => {
        console.log(`Upload progress: ${progress.percentComplete}%`)
        // Update UI with progress
      }
    )

    attachmentFileIds = [uploadResult.fileId]
  }

  // Save encrypted message with media references
  const messageRecord = await saveEncryptedMessageWithMedia(
    messageText,
    currentUserId,
    recipientId,
    attachmentFileIds,
    currentUserId,
    recipientId
  )

  // Send message metadata to recipient (WebSocket/Firebase)
  sendMessageToRecipient({
    messageId: messageRecord.messageId,
    senderId: currentUserId,
    recipientId: recipientId,
    timestamp: messageRecord.timestamp,
    attachmentFileIds: attachmentFileIds,
    // Don't send actual content - only references
  })
}
```

### Step 2: Display Encrypted Media in Chat

In your message display component:

```typescript
import EncryptedMediaDisplay from './EncryptedMediaDisplay'

function ChatMessage({ message, currentUserId }) {
  return (
    <div className="message">
      <p className="text-sm">{message.content}</p>

      {/* Display attachments */}
      {message.attachmentFileIds?.map((fileId) => (
        <EncryptedMediaDisplay
          key={fileId}
          fileId={fileId}
          mediaType={detectMediaType(fileId)} // Determine from metadata
          currentUserId={currentUserId}
          otherUserId={message.senderId}
          maxHeight={300}
          maxWidth="100%"
        />
      ))}
    </div>
  )
}
```

### Step 3: Store Media References in Database

When receiving a message with attachments:

```typescript
import { messageDb, getConversationId } from '../utils/messageDatabase'
import type { MediaMetadataRecord } from '../utils/messageDatabase'

async function storeReceivedMessage(
  messageData: any,
  currentUserId: string,
  senderId: string
) {
  // Store message metadata
  const conversationId = getConversationId(currentUserId, senderId)
  
  // Store media metadata if attachments exist
  for (const fileId of (messageData.attachmentFileIds || [])) {
    const mediaMetadata: MediaMetadataRecord = {
      fileId,
      conversationId,
      mediaType: 'image', // Or detect from message
      uploadedBy: senderId,
      uploadedAt: Date.now(),
      fileSize: 0, // Will be determined on first load
      totalChunks: 0,
      status: 'complete',
    }

    await messageDb.storeMediaMetadata(mediaMetadata)
  }

  // Store message
  const messageRecord = {
    messageId: messageData.messageId,
    senderId,
    recipientId: currentUserId,
    conversationId,
    content: messageData.content,
    attachmentFileIds: messageData.attachmentFileIds || [],
    timestamp: messageData.timestamp,
    status: 'delivered' as const,
    encryptedChunkId: '', // Set if full content is stored
    totalChunks: 0,
    messageHash: '',
  }

  await messageDb.storeMessage(messageRecord)
}
```

### Step 4: Integrate Upload Component

In your chat input area:

```typescript
import EncryptedMediaUpload from './EncryptedMediaUpload'
import { useState } from 'react'

function ChatInput({ currentUserId, recipientId, onSendMessage }) {
  const [messageText, setMessageText] = useState('')
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null)

  const handleUploadComplete = (fileId: string) => {
    setUploadedFileId(fileId)
  }

  const handleSend = async () => {
    if (messageText.trim()) {
      await onSendMessage(messageText, uploadedFileId)
      setMessageText('')
      setUploadedFileId(null)
    }
  }

  return (
    <div className="chat-input space-y-2">
      <EncryptedMediaUpload
        mediaType="image"
        currentUserId={currentUserId}
        otherUserId={recipientId}
        onUploadComplete={handleUploadComplete}
      />

      <div className="flex gap-2">
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Type message..."
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

## Key Utilities Reference

### Chunked Media Utilities (`encryptedChunkedMedia.ts`)

```typescript
// Save media with chunking
saveEncryptedMediaChunks(
  binaryData: Uint8Array,
  mediaType: 'image' | 'video' | 'audio' | 'message',
  user1: string,
  user2: string,
  originalName?: string
): Promise<{ fileId, totalChunks, metadata, fileHash }>

// Retrieve and decrypt
retrieveDecryptedMedia(
  fileId: string,
  user1: string,
  user2: string
): Promise<{ data, mediaType, fileHash, verified }>

// Create displayable URL
createDisplayableMediaUrl(
  decryptedData: Uint8Array,
  mediaType: 'image' | 'video' | 'audio'
): Promise<string>
```

### Upload Handler (`mediaUploadHandler.ts`)

```typescript
// Upload with progress
uploadMediaWithProgress(
  file: File,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string,
  onProgress?: (progress) => void
): Promise<StoredMediaReference>

// Load for display
loadMediaForDisplay(
  fileId: string,
  mediaType: 'image' | 'video' | 'audio',
  user1: string,
  user2: string
): Promise<{ displayUrl, verified, mediaType }>

// Batch load
batchLoadMediaForDisplay(
  fileIds: Array<{ fileId, mediaType }>,
  user1: string,
  user2: string
): Promise<Map<string, { displayUrl, verified }>>
```

### Database (`messageDatabase.ts`)

```typescript
// Store message with media
saveEncryptedMessageWithMedia(
  messageContent: string,
  senderId: string,
  recipientId: string,
  attachmentFileIds: string[],
  user1: string,
  user2: string
): Promise<EncryptedMessageRecord>

// Get conversation
messageDb.getConversationMessages(
  conversationId: string,
  limit?: number,
  offset?: number
): Promise<EncryptedMessageRecord[]>

// Get media
messageDb.getConversationMedia(
  conversationId: string
): Promise<MediaMetadataRecord[]>
```

## React Hooks

### `useEncryptedMedia` - Load Single Media

```typescript
const { displayUrl, loading, error } = useEncryptedMedia(
  fileId,
  'image',
  { user1: userId, user2: recipientId }
)
```

### `useMediaUpload` - Upload Media

```typescript
const { uploading, progress, error, uploadedMedia, upload } = useMediaUpload({
  user1: userId,
  user2: recipientId,
})

const result = await upload(file, 'image')
```

### `useEncryptedMediaBatch` - Load Multiple

```typescript
const { mediaMap, loading, getMediaUrl } = useEncryptedMediaBatch(
  fileReferences,
  { user1: userId, user2: recipientId }
)

const url = getMediaUrl(fileId)
```

## Security Considerations

1. **Encryption Keys**: Derived from conversation participants' IDs using PBKDF2
2. **IV Randomization**: Each chunk gets a random IV for security
3. **Integrity Verification**: SHA-256 hashes verify no tampering
4. **Device-Local Storage**: No media transmitted unencrypted to server
5. **Memory Cache TTL**: Decrypted media auto-purged after 5 minutes
6. **Blob URL Cleanup**: Automatic revocation prevents memory leaks

## Performance Optimization

1. **Chunk Size**: 256KB optimized for mobile devices
2. **Lazy Loading**: Media only decrypted when displayed
3. **Batch Operations**: Sequential loading prevents device overload
4. **Memory Caching**: 5-minute cache reduces redundant decryption
5. **Parallel File Operations**: Non-blocking I/O operations

## Troubleshooting

### Media Not Displaying
- Check browser console for errors
- Verify both users exist in conversation
- Ensure file chunks are saved correctly

### Performance Issues
- Clear cache: `mediaCache.clear()`
- Reduce batch load size
- Monitor device storage space

### Integrity Failures
- Redownload media from sender
- Check device storage corruption
- Verify file system permissions

## Database Schema

Messages stored with:
- `messageId`: Unique identifier
- `encryptedChunkId`: Reference to encrypted chunks
- `attachmentFileIds`: Array of media file references
- `messageHash`: SHA-256 for verification

Media stored with:
- `fileId`: Unique identifier
- `totalChunks`: Number of encrypted chunks
- `fileHash`: SHA-256 of original file
- `fileSize`: Original size before encryption
- `uploadedAt`: Timestamp

## Example: Complete Chat Flow

```
User A sends message with image:
1. Image uploaded → saveEncryptedMediaChunks() → Creates chunks + metadata
2. Message saved → saveEncryptedMessageWithMedia() → Stores in IndexedDB
3. Message sent to User B via WebSocket (only metadata, not content)

User B receives message:
1. Message metadata received → storeReceivedMessage()
2. Media references stored in database
3. User opens chat → loadMediaForDisplay() → Retrieves chunks, decrypts, displays

User B views image:
1. loadMediaWithCache() checks cache first
2. If not cached: retrieveDecryptedMedia() → Reads chunks, decrypts, verifies
3. createDisplayableMediaUrl() → Creates blob URL
4. <img src={displayUrl} /> displays in UI
5. Auto-cached for 5 minutes
```

## Next Steps

1. ✅ Install utilities and components
2. ✅ Update chat message handler
3. ✅ Integrate upload component
4. ✅ Update display components
5. ✅ Test with real files
6. ✅ Monitor database growth
7. ✅ Implement cleanup strategies
