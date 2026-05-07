# Encrypted Chunked Media - Code Examples & Patterns

## Example 1: Complete Chat Flow - Send Message with Image

```typescript
// ChatWindow.tsx - Sending message with image
import { saveEncryptedMessageWithMedia } from '@/utils/messageDatabase'
import { uploadMediaWithProgress } from '@/utils/mediaUploadHandler'
import { useMediaUpload } from '@/hooks/useEncryptedMedia'
import EncryptedMediaUpload from '@/components/EncryptedMediaUpload'

function ChatWindow({ currentUserId, recipientId, onMessageSent }) {
  const [messageText, setMessageText] = useState('')
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const handleSendMessage = async () => {
    if (!messageText.trim() && !uploadedFileId) {
      alert('Message or attachment required')
      return
    }

    setSending(true)

    try {
      // Save encrypted message with media reference
      const messageRecord = await saveEncryptedMessageWithMedia(
        messageText,
        currentUserId,
        recipientId,
        uploadedFileId ? [uploadedFileId] : [], // Attachment file IDs
        currentUserId,
        recipientId
      )

      // Send message metadata to recipient
      // (via WebSocket, Firebase, or your backend)
      onMessageSent({
        messageId: messageRecord.messageId,
        senderId: currentUserId,
        recipientId: recipientId,
        timestamp: messageRecord.timestamp,
        attachmentFileIds: messageRecord.attachmentFileIds,
        content: messageText,
      })

      // Clear form
      setMessageText('')
      setUploadedFileId(null)

      console.log('✅ Message sent successfully')
    } catch (err) {
      console.error('❌ Failed to send message:', err)
      alert('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat-window">
      {/* Media upload section */}
      <div className="mb-4">
        <EncryptedMediaUpload
          mediaType="image"
          currentUserId={currentUserId}
          otherUserId={recipientId}
          onUploadComplete={(fileId) => {
            setUploadedFileId(fileId)
            console.log('📤 Media uploaded:', fileId)
          }}
          onError={(err) => {
            console.error('Upload error:', err)
            alert('Failed to upload media')
          }}
        />

        {/* Show uploaded file indicator */}
        {uploadedFileId && (
          <div className="bg-green-50 border border-green-200 p-2 rounded mt-2 text-sm">
            ✅ Media ready to send
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="flex gap-2">
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 px-3 py-2 border rounded resize-none"
          rows={3}
        />
        <button
          onClick={handleSendMessage}
          disabled={sending || (!messageText.trim() && !uploadedFileId)}
          className="px-6 py-2 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
```

## Example 2: Display Message with Encrypted Media

```typescript
// MessageBubble.tsx - Display encrypted media
import EncryptedMediaDisplay from '@/app/components/EncryptedMediaDisplay'
import type { EncryptedMessageRecord } from '@/utils/messageDatabase'

interface MessageBubbleProps {
  message: EncryptedMessageRecord
  currentUserId: string
  onDelete?: (messageId: string) => void
}

export function MessageBubble({
  message,
  currentUserId,
  onDelete,
}: MessageBubbleProps) {
  const isOwn = message.senderId === currentUserId
  const otherUserId = isOwn ? message.recipientId : message.senderId

  return (
    <div className={`message-bubble ${isOwn ? 'own' : 'other'}`}>
      {/* Sender name */}
      {!isOwn && (
        <p className="text-xs font-semibold text-gray-600 mb-1">
          {message.senderId}
        </p>
      )}

      {/* Message content */}
      <div className="bg-blue-100 rounded-lg p-3">
        {message.content && (
          <p className="text-base text-gray-900">{message.content}</p>
        )}

        {/* Attachments section */}
        {message.attachmentFileIds && message.attachmentFileIds.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.attachmentFileIds.map((fileId) => (
              <div key={fileId} className="bg-white rounded p-2">
                <EncryptedMediaDisplay
                  fileId={fileId}
                  mediaType="image" // Detect from metadata if available
                  currentUserId={currentUserId}
                  otherUserId={otherUserId}
                  maxHeight={250}
                  maxWidth="100%"
                  onError={(err) => {
                    console.error('Failed to load media:', err)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
        <span>
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>

        {/* Status indicator */}
        <span className="status-indicator">
          {message.status === 'read' && '✓✓ Read'}
          {message.status === 'delivered' && '✓ Delivered'}
          {message.status === 'sent' && '○ Sent'}
          {message.status === 'failed' && '✗ Failed'}
        </span>

        {/* Delete button for own messages */}
        {isOwn && onDelete && (
          <button
            onClick={() => onDelete(message.messageId)}
            className="text-red-500 hover:text-red-700"
            title="Delete message"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
```

## Example 3: Load and Display Chat Conversation

```typescript
// ChatPanel.tsx - Load all messages in conversation
import { messageDb, getConversationId } from '@/utils/messageDatabase'
import { MessageBubble } from './MessageBubble'
import { useEffect, useState } from 'react'

interface ChatPanelProps {
  currentUserId: string
  recipientId: string
}

export function ChatPanel({ currentUserId, recipientId }: ChatPanelProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true)

        // Get conversation ID
        const conversationId = getConversationId(currentUserId, recipientId)

        // Load messages from database
        const loadedMessages = await messageDb.getConversationMessages(
          conversationId,
          50, // Load last 50 messages
          0
        )

        setMessages(loadedMessages)
        setError(null)
      } catch (err) {
        console.error('Failed to load messages:', err)
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    loadMessages()
  }, [currentUserId, recipientId])

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await messageDb.deleteMessage(messageId)
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId))
    } catch (err) {
      console.error('Failed to delete message:', err)
      alert('Failed to delete message')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block animate-spin">
            <div className="w-8 h-8 border-4 border-blue-300 border-t-blue-600 rounded-full"></div>
          </div>
          <p className="text-gray-600 mt-2">Loading messages...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-600 text-center">
          <p className="font-semibold">Failed to load messages</p>
          <p className="text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel space-y-4 overflow-y-auto">
      {messages.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <p>No messages yet. Start the conversation!</p>
        </div>
      ) : (
        messages.map((message) => (
          <MessageBubble
            key={message.messageId}
            message={message}
            currentUserId={currentUserId}
            onDelete={handleDeleteMessage}
          />
        ))
      )}
    </div>
  )
}
```

## Example 4: Batch Load Media for Chat List

```typescript
// ChatList.tsx - Display conversations with latest message
import { useEncryptedMediaBatch } from '@/hooks/useEncryptedMedia'
import { messageDb, getConversationId } from '@/utils/messageDatabase'
import { useEffect, useState } from 'react'

interface ConversationInfo {
  participantId: string
  lastMessage: string
  timestamp: number
  attachmentFileId?: string
  mediaType?: 'image' | 'video' | 'audio'
}

export function ChatList({ currentUserId, conversations }: any) {
  const [convosWithMedia, setConvosWithMedia] = useState<ConversationInfo[]>([])

  // Prepare media references for batch loading
  const mediaReferences = convosWithMedia
    .filter((c) => c.attachmentFileId)
    .map((c) => ({
      fileId: c.attachmentFileId!,
      mediaType: (c.mediaType || 'image') as 'image' | 'video' | 'audio',
    }))

  // Batch load all media
  const { mediaMap, loading: mediaLoading } = useEncryptedMediaBatch(
    mediaReferences,
    {
      user1: currentUserId,
      user2: convosWithMedia[0]?.participantId || '',
    }
  )

  useEffect(() => {
    // Load latest message for each conversation
    const loadConversations = async () => {
      const withMedia = await Promise.all(
        conversations.map(async (convo: any) => {
          const conversationId = getConversationId(currentUserId, convo.id)
          const messages = await messageDb.getConversationMessages(
            conversationId,
            1 // Get last message
          )

          const lastMsg = messages[0]
          return {
            participantId: convo.id,
            lastMessage: lastMsg?.content || 'No messages',
            timestamp: lastMsg?.timestamp || 0,
            attachmentFileId: lastMsg?.attachmentFileIds?.[0],
            mediaType: 'image',
          }
        })
      )

      setConvosWithMedia(withMedia)
    }

    loadConversations()
  }, [conversations, currentUserId])

  return (
    <div className="chat-list space-y-2">
      {convosWithMedia.map((convo) => (
        <div
          key={convo.participantId}
          className="bg-white p-3 rounded hover:bg-gray-50 cursor-pointer"
        >
          <div className="flex gap-3">
            {/* Avatar placeholder */}
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{convo.participantId}</p>

              {/* Last message preview */}
              {convo.attachmentFileId ? (
                <div className="mt-1">
                  {mediaLoading ? (
                    <p className="text-xs text-gray-500">Loading media...</p>
                  ) : (
                    <img
                      src={mediaMap.get(convo.attachmentFileId)}
                      alt="Latest message"
                      className="w-16 h-16 rounded object-cover"
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-600 truncate">
                  {convo.lastMessage}
                </p>
              )}

              <p className="text-xs text-gray-400 mt-1">
                {new Date(convo.timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

## Example 5: Media Gallery View

```typescript
// MediaGallery.tsx - View all media in a conversation
import { messageDb, getConversationId } from '@/utils/messageDatabase'
import { useEncryptedMediaBatch } from '@/hooks/useEncryptedMedia'
import { useEffect, useState } from 'react'

interface MediaGalleryProps {
  currentUserId: string
  otherUserId: string
}

export function MediaGallery({
  currentUserId,
  otherUserId,
}: MediaGalleryProps) {
  const [mediaFiles, setMediaFiles] = useState<any[]>([])
  const conversationId = getConversationId(currentUserId, otherUserId)

  const mediaReferences = mediaFiles.map((m) => ({
    fileId: m.fileId,
    mediaType: m.mediaType as 'image' | 'video' | 'audio',
  }))

  const { mediaMap, loading } = useEncryptedMediaBatch(mediaReferences, {
    user1: currentUserId,
    user2: otherUserId,
  })

  useEffect(() => {
    const loadMedia = async () => {
      const media = await messageDb.getConversationMedia(conversationId)
      setMediaFiles(media)
    }

    loadMedia()
  }, [conversationId])

  return (
    <div className="media-gallery">
      <h3 className="font-bold mb-4">Media ({mediaFiles.length})</h3>

      {loading ? (
        <p className="text-gray-500">Loading gallery...</p>
      ) : mediaFiles.length === 0 ? (
        <p className="text-gray-500">No media in this conversation</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {mediaFiles.map((media) => (
            <div key={media.fileId} className="relative bg-gray-100 rounded overflow-hidden">
              {media.mediaType === 'image' && (
                <img
                  src={mediaMap.get(media.fileId)}
                  alt="Media"
                  className="w-full h-24 object-cover"
                />
              )}
              {media.mediaType === 'video' && (
                <div className="w-full h-24 bg-gray-300 flex items-center justify-center">
                  <span className="text-2xl">🎥</span>
                </div>
              )}

              <div className="absolute bottom-0 right-0 bg-black bg-opacity-50 text-white text-xs px-1 py-0.5">
                {media.mediaType}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

## Example 6: Health Check & Diagnostics Page

```typescript
// SettingsPage.tsx - Admin panel for encryption diagnostics
import { useEffect, useState } from 'react'
import {
  performHealthCheck,
  getEncryptionStats,
  backupEncryptedData,
  getConversationStats,
} from '@/utils/migrationAndUtils'
import { mediaCache } from '@/utils/mediaUploadHandler'

export function SettingsPage({ currentUserId }: { currentUserId: string }) {
  const [health, setHealth] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [cacheSize, setCacheSize] = useState(0)
  const [backupStatus, setBackupStatus] = useState('')

  useEffect(() => {
    const loadStats = async () => {
      const [healthResult, statsResult] = await Promise.all([
        performHealthCheck(),
        getEncryptionStats(),
      ])

      setHealth(healthResult)
      setStats(statsResult)
      setCacheSize(mediaCache.size())
    }

    loadStats()
  }, [])

  const handleBackup = async () => {
    setBackupStatus('Creating backup...')
    try {
      const result = await backupEncryptedData('backups/manual')
      setBackupStatus(
        `✅ Backup created: ${result.messagesCount} messages, ${result.mediaCount} media`
      )
    } catch (err) {
      setBackupStatus('❌ Backup failed: ' + String(err))
    }
  }

  const handleClearCache = () => {
    mediaCache.clear()
    setCacheSize(0)
    alert('Cache cleared')
  }

  return (
    <div className="settings-page space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Encryption Health Check</h2>

        {health && (
          <div className="space-y-2">
            <p
              className={`font-semibold ${
                health.healthy ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {health.healthy ? '✅ System Healthy' : '⚠️ Issues Detected'}
            </p>

            {health.issues.length > 0 && (
              <div className="bg-red-50 p-3 rounded">
                <p className="font-semibold text-red-700 mb-2">Issues:</p>
                <ul className="text-sm text-red-600 space-y-1">
                  {health.issues.map((issue: string, i: number) => (
                    <li key={i}>• {issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {health.recommendations.length > 0 && (
              <div className="bg-blue-50 p-3 rounded">
                <p className="font-semibold text-blue-700 mb-2">
                  Recommendations:
                </p>
                <ul className="text-sm text-blue-600 space-y-1">
                  {health.recommendations.map((rec: string, i: number) => (
                    <li key={i}>• {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Storage Statistics</h2>

        {stats && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-sm text-gray-600">Total Messages</p>
              <p className="text-2xl font-bold text-blue-600">
                {stats.totalMessages}
              </p>
            </div>

            <div className="bg-green-50 p-4 rounded">
              <p className="text-sm text-gray-600">Total Media Files</p>
              <p className="text-2xl font-bold text-green-600">
                {stats.totalMediaFiles}
              </p>
            </div>

            <div className="bg-purple-50 p-4 rounded">
              <p className="text-sm text-gray-600">Total Chunks</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.totalChunks}
              </p>
            </div>

            <div className="bg-orange-50 p-4 rounded">
              <p className="text-sm text-gray-600">Storage Used</p>
              <p className="text-2xl font-bold text-orange-600">
                {stats.estimatedMemory}
              </p>
            </div>

            <div className="bg-cyan-50 p-4 rounded">
              <p className="text-sm text-gray-600">Cache Size</p>
              <p className="text-2xl font-bold text-cyan-600">
                {cacheSize} items
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Actions</h2>

        <div className="space-y-3">
          <button
            onClick={handleBackup}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            📦 Create Backup
          </button>

          <button
            onClick={handleClearCache}
            className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            🧹 Clear Cache ({cacheSize})
          </button>

          {backupStatus && (
            <div className="mt-2 p-3 bg-gray-100 rounded text-sm">
              {backupStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

## Example 7: Error Handling Pattern

```typescript
// useEncryptedMediaSafe.ts - Safe wrapper with error handling
import { useEncryptedMedia } from '@/hooks/useEncryptedMedia'
import { useState } from 'react'

export function useEncryptedMediaSafe(
  fileId: string | null,
  mediaType: 'image' | 'video' | 'audio',
  options: any,
  onRetry?: () => void
) {
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  const { displayUrl, loading, error } = useEncryptedMedia(
    fileId,
    mediaType,
    {
      ...options,
      onError: (err) => {
        console.error(`Media load error (attempt ${retryCount + 1}):`, err)

        // Auto-retry on transient errors
        if (retryCount < maxRetries && err.message.includes('decrypt')) {
          setTimeout(() => {
            setRetryCount((prev) => prev + 1)
            onRetry?.()
          }, 1000)
        }
      },
    }
  )

  return {
    displayUrl,
    loading,
    error,
    retryCount,
    canRetry: retryCount < maxRetries,
  }
}
```

---

These examples demonstrate the full lifecycle of encrypted media storage in your chat application. Adapt them to your specific needs!
