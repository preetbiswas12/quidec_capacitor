import { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/chat-panel.css'
import { getMessages, saveMessage, markMessagesAsRead, addToSyncQueue, deleteConversation } from '../utils/storage'
import { getConversationKey, encryptMessage } from '../utils/encryption'

// Format last seen time into human-readable format
function formatLastSeen(lastSeenDate) {
  if (!lastSeenDate) return 'Never'
  
  const date = new Date(lastSeenDate)
  const now = new Date()
  const diffMs = now - date
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffSecs < 60) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}

export default function ChatPanel({
  currentUser,
  currentChatWith,
  ws,
  messages,
  typingUsers,
  onMobileBack,
  friends,
  sendEncryptedMessage,
}) {
  const [messageText, setMessageText] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)
  const [readReceipts, setReadReceipts] = useState({})
  const [showJumpButton, setShowJumpButton] = useState(false)  // Show jump-to-latest button
  const messagesEndRef = useRef(null)
  const pollingIntervalRef = useRef(null)
  const friendStatusRef = useRef({})  // Track friend status to detect changes
  const visibilityRef = useRef(true)  // Track if tab is visible (starts true)
  const focusRef = useRef(false)  // Track if window is focused (starts false, set to true only after focus event)
  const observerRef = useRef(null)  // Intersection Observer for viewport detection
  const visibleMessagesRef = useRef(new Set())  // Track which messages are visible in viewport
  const isUserScrollingRef = useRef(false)  // Track if user is manually scrolling
  const lastScrollPositionRef = useRef(0)  // Track scroll position to detect user scroll
  const messagesContainerRef = useRef(null)  // Reference to messages container for jump functionality

  // Only scroll to bottom on new messages, NOT on every re-render
  // AND only if user hasn't scrolled up to view older messages
  useEffect(() => {
    if (!messagesEndRef.current || isUserScrollingRef.current) return
    
    const container = messagesEndRef.current.parentElement
    if (container) {
      // Only auto-scroll if user is at the bottom (within 50px)
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50
      if (isAtBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [chatMessages])

  // Detect when user manually scrolls
  const handleScroll = useCallback((e) => {
    const container = e.target
    const scrollFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    
    // If user scrolls up (away from bottom), disable auto-scroll and show jump button
    isUserScrollingRef.current = scrollFromBottom > 100
    setShowJumpButton(scrollFromBottom > 100)
    lastScrollPositionRef.current = container.scrollTop
  }, [])

  // Setup visibility and focus detection (global for the entire app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      visibilityRef.current = !document.hidden
      console.log('👁️ Tab visibility changed:', visibilityRef.current ? 'visible' : 'hidden')
      // Auto-mark visible messages as read if all conditions are met
      checkAndMarkVisibleMessagesAsRead()
    }

    const handleFocus = () => {
      focusRef.current = true
      console.log('🎯 Window FOCUSED - read receipt conditions now checked')
      checkAndMarkVisibleMessagesAsRead()
    }

    const handleBlur = () => {
      focusRef.current = false
      console.log('❌ Window BLURRED - messages will not auto-mark')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  // Check if all conditions met for marking messages as read
  const checkAndMarkVisibleMessagesAsRead = () => {
    console.log('🔍 Checking auto-mark conditions: tabVisible=' + visibilityRef.current + ', windowFocused=' + focusRef.current + ', currentChatWith=' + currentChatWith + ', visibleMessages=' + visibleMessagesRef.current.size)
    
    if (!visibilityRef.current || !focusRef.current || !currentChatWith) {
      console.log('❌ Cannot auto-mark: one or more conditions not met')
      return
    }
    
    console.log('✅ All conditions met! Tab visible, window focused, and in chat. Checking visible messages...')
    
    // Mark all visible unread messages from the current chat as read
    visibleMessagesRef.current.forEach((msgId) => {
      const msg = chatMessages.find((m) => {
        const id = m.messageId || m._id || m.id
        return id === msgId
      })
      
      if (msg) {
        console.log('  📌 Found message:', { msgId, from: msg.from, read: msg.read, content: msg.content?.substring(0, 30) })
        // Only mark as read if it's FROM the other user AND not already read
        if (msg.from === currentChatWith && !msg.read) {
          console.log('✅ Auto-marking visible message as read:', msgId)
          markMessageAsRead(msgId)
        } else if (msg.read) {
          console.log('  ⏭️  Already read, skipping')
        } else {
          console.log('  ⏭️  Sent by us, skipping')
        }
      } else {
        console.log('  ❓ Message not found in messages array:', msgId)
      }
    })
  }

  // Track friend status changes and add status messages
  useEffect(() => {
    if (!currentChatWith || !friends.length) return;
    
    const friend = friends.find((f) => f.username === currentChatWith);
    if (!friend) return;
    
    const previousStatus = friendStatusRef.current[currentChatWith];
    
    // If status changed, add status message to chat
    if (previousStatus !== undefined && previousStatus !== friend.online) {
      const statusMessage = {
        type: 'status',
        content: `${currentChatWith} is ${friend.online ? 'online' : 'offline'}`,
        timestamp: new Date(),
      };
      
      console.log(`✅ ${currentChatWith} is now ${friend.online ? 'online' : 'offline'}`);
      
      // Add status message to the end of chat messages
      setChatMessages((prev) => [...prev, statusMessage]);
      
      // Force re-render of messages to update read receipt states
      // This will change sent-offline -> sent or stay as is based on new status
      setChatMessages((prev) => [...prev]);
    }
    
    // Update the status ref
    friendStatusRef.current[currentChatWith] = friend.online;
  }, [currentChatWith, friends])

  // Load chat history from local storage when conversation changes
  useEffect(() => {
    if (!currentChatWith) return;
    
    // Reset scroll tracking when opening a new chat
    isUserScrollingRef.current = false
    setShowJumpButton(false)
    
    const loadHistory = async () => {
      try {
        const conversationKey = [currentUser, currentChatWith].sort().join('-')
        const messages = await getMessages(conversationKey)
        console.log('📬 Chat history loaded from storage:', messages)
        setChatMessages(messages || [])
      } catch (err) {
        console.error('❌ Error loading chat history:', err)
      }
    }
    
    loadHistory();
  }, [currentChatWith, currentUser])

  // Scroll to bottom when chat is first opened or messages loaded (WhatsApp-like behavior)
  useEffect(() => {
    if (!currentChatWith || chatMessages.length === 0) return
    
    // Small delay to allow DOM to render all messages
    const timeoutId = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
        console.log('📱 Scrolled to bottom when opening chat with', chatMessages.length, 'messages')
      }
    }, 50)
    
    return () => clearTimeout(timeoutId)
  }, [currentChatWith, chatMessages.length])

  // Poll for new messages from local storage every 1 second when in a conversation
  useEffect(() => {
    if (!currentChatWith) return;
    
    const pollMessages = async () => {
      try {
        const conversationKey = [currentUser, currentChatWith].sort().join('-')
        const messages = await getMessages(conversationKey)
        
        // Update messages with latest data from local storage
        if (messages) {
          console.log('🔄 Polling messages from local storage for', currentChatWith)
          
          // Always update with fresh data from storage to get latest read status
          setChatMessages(messages)
          
          // Don't auto-mark here! Let the Intersection Observer and visibility detection handle marking
          // Polling is just for syncing the latest read status from local storage
          console.log('📋 Chat history updated from storage')
        }
      } catch (err) {
        console.error('❌ Error polling messages from storage:', err)
      }
    }
    
    // Poll immediately and then every 1 second for message delivery
    pollMessages();
    pollingIntervalRef.current = setInterval(pollMessages, 1000)
    
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
    }
  }, [currentChatWith, currentUser])

  // Cleanup observer when component unmounts or conversation changes
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
        visibleMessagesRef.current.clear()
      }
    }
  }, [currentChatWith])

  const markMessageAsRead = async (messageId) => {
    try {
      if (!messageId) {
        console.error('❌ No messageId provided')
        return
      }
      
      console.log('📤 Marking message as read locally:', { messageId, readBy: currentUser })
      
      // Update the message in local storage and UI
      const conversationKey = [currentUser, currentChatWith].sort().join('-')
      await markMessagesAsRead(conversationKey)
      
      // Update the actual message object to mark it as read with timestamp
      setChatMessages((prev) =>
        prev.map((msg) => {
          const msgId = msg.messageId || msg._id || msg.id
          if (msgId === messageId) {
            console.log('📝 Updating message read status in UI')
            return { ...msg, read: true, readAt: new Date().toISOString() }
          }
          return msg
        })
      )
      
      console.log(`✅ Message ${messageId} marked as read locally`)
    } catch (err) {
      console.error('❌ Error marking message as read:', err)
    }

    // ALWAYS send via WebSocket for real-time updates
    // This ensures the sender gets the read notification immediately
    if (ws && ws.readyState === WebSocket.OPEN && currentChatWith) {
      console.log('📡 Broadcasting read status via WebSocket:', { messageId, to: currentChatWith })
      ws.send(JSON.stringify({
        type: 'mark-read',
        messageId,
        from: currentChatWith,  // Recipient is marking as read
        readAt: new Date().toISOString(),
      }))
    }
  }

  const handleJumpToLatest = () => {
    setShowJumpButton(false)
    isUserScrollingRef.current = false
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!messageText.trim() || !currentChatWith) return

    const content = messageText.trim()

    // Handle commands
    if (content.startsWith('/')) {
      handleCommand(content)
      setMessageText('')
      return
    }

    try {
      const conversationKey = [currentUser, currentChatWith].sort().join('-')
      const messageId = `msg-${Date.now()}`
      const timestamp = new Date().toISOString()
      
      // Get recipient's online status
      const recipient = friends.find((f) => f.username === currentChatWith)
      const recipientOffline = !recipient?.online
      
      const msgObj = {
        id: messageId,
        messageId,
        conversationKey,
        from: currentUser,
        to: currentChatWith,
        content,
        timestamp,
        read: false,
        unread: true,
        recipientOffline, // Track if recipient was offline when sent
      }
      
      // Save to local storage immediately (optimistic update)
      await saveMessage(msgObj)
      console.log('✅ Message saved locally:', msgObj)
      
      // Add to local UI immediately
      setChatMessages((prev) => [...prev, msgObj])
      
      // Send encrypted message via WebSocket if connected
      if (sendEncryptedMessage) {
        console.log('📤 Sending encrypted message via WebSocket:', { from: currentUser, to: currentChatWith })
        const sent = await sendEncryptedMessage(currentChatWith, content)
        if (!sent) {
          // If encryption failed, queue for later sync
          console.log('📋 Failed to send encrypted message, queueing for sync')
          await addToSyncQueue(msgObj)
        }
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        // Fallback: send unencrypted if sendEncryptedMessage not available
        console.log('⚠️ sendEncryptedMessage not available, sending unencrypted message')
        ws.send(JSON.stringify({
          type: 'message',
          from: currentUser,
          to: currentChatWith,
          content,
          messageId,
          timestamp,
        }))
      } else {
        // If not connected, queue for later sync
        console.log('📋 WebSocket not connected, queueing message for sync')
        await addToSyncQueue(msgObj)
      }
    } catch (err) {
      console.error('❌ Error sending message:', err)
      alert('Error sending message: ' + err.message)
    }

    setMessageText('')
  }

  const handleCommand = async (command) => {
    if (command === '/clear') {
      try {
        const conversationKey = [currentUser, currentChatWith].sort().join('-')
        console.log('🗑️ Clearing chat from local storage...')
        
        await deleteConversation(conversationKey)
        
        console.log('✅ Chat cleared!')
        setChatMessages([])
        console.log(`✅ Chat cleared! Deleted all messages from conversation.`)
      } catch (err) {
        console.error('❌ Error clearing chat:', err)
      }
    } else if (command === '/help') {
      alert('Commands:\n/clear - Clear chat\n/online - List online users\n/friends - List friends')
    }
  }

  if (!currentChatWith) {
    return (
      <div className="chat-panel empty">
        <div className="empty-state">
          <h2>Select a friend to start chatting<br/>
          or send a friend request to add new friends</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        {onMobileBack && (
          <button className="mobile-back-btn" onClick={onMobileBack}>
            ← Back
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{currentChatWith}</h2>
          <div className="status-indicator">
            {(() => {
              const friend = friends.find(f => f.username === currentChatWith)
              const isOnline = friend?.online
              const lastSeen = friend?.lastSeen
              
              return (
                <>
                  <span className="status-dot" style={{ 
                    background: isOnline ? '#4ade80' : '#A0A0B0'
                  }}></span>
                  <small>
                    {isOnline ? 'Online now' : `Last seen ${formatLastSeen(lastSeen)}`}
                  </small>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="messages-container" onScroll={handleScroll} ref={messagesContainerRef}>
        {chatMessages.map((msg, idx) => {
          // Handle status messages differently
          if (msg.type === 'status') {
            return (
              <div key={idx} className="status-message">
                <p>
                  {msg.content}
                  <small>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>
                </p>
              </div>
            );
          }
          
          const readInfo = readReceipts[msg.messageId]
          
          // Get current recipient online status (recalculate each render)
          const recipient = friends.find((f) => f.username === currentChatWith)
          const recipientCurrentlyOnline = recipient?.online || false
          
          // Determine read receipt state - PRIORITY: read status > offline status
          let receiptState = '○ Sent' // Default
          if (msg.read && msg.readAt) {
            // Message has been read with timestamp - show it regardless of current online status
            const readTime = new Date(msg.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            receiptState = `✓✓ ${readTime}`
          } else if (msg.read) {
            // Message was read but no timestamp (fallback for old messages)
            receiptState = '✓ Delivered'
          } else if (!recipientCurrentlyOnline) {
            // Message not read AND recipient is offline
            receiptState = '⊘ Sent-Offline'
          }
          // else: unread and recipient is online = '○ Sent'
          
          // Get message ID
          const msgId = msg.messageId || msg._id || msg.id
          
          return (
            <div
              key={idx}
              ref={(el) => {
                if (el && msgId) {
                  // Setup Intersection Observer to detect if message is visible
                  if (!observerRef.current) {
                    observerRef.current = new IntersectionObserver((entries) => {
                      entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                          visibleMessagesRef.current.add(msgId)
                          console.log('�️ Message ENTERED viewport:', msgId, '(total visible:', visibleMessagesRef.current.size + ')')
                          // Check if we should auto-mark as read
                          checkAndMarkVisibleMessagesAsRead()
                        } else {
                          visibleMessagesRef.current.delete(msgId)
                          console.log('👁️ Message LEFT viewport:', msgId, '(total visible:', visibleMessagesRef.current.size + ')')
                        }
                      })
                    }, { threshold: 0.5 })
                  }
                  
                  observerRef.current.observe(el)
                }
              }}
              className={`message ${msg.from === currentUser ? 'sent' : 'received'}`}
            >
              <div className="message-content">
                <p className="message-text">{msg.content}</p>
                <div className="message-footer">
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.from === currentUser && (
                    <span className="read-receipt" title={msg.readAt ? `Read at ${new Date(msg.readAt).toLocaleString()}` : receiptState}>
                      {receiptState}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {showJumpButton && (
          <button className="jump-to-latest-btn" onClick={handleJumpToLatest}>
            ↓ Jump to Latest
          </button>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="message-input-form">
        <input
          type="text"
          placeholder="Message... (/ for commands)"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn btn-send">
          Send
        </button>
      </form>
    </div>
  )
}
