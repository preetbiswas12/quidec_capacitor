import { useState, useEffect, useRef, useCallback } from 'react'
import { getFriendRequests, getFriends, saveFriendRequests, saveFriends, saveMessage, getAuth } from '../utils/storage'
import { syncPendingMessagesWithSocket } from '../utils/network'
import { getConversationKey, encryptMessage, decryptMessage } from '../utils/encryption'
import * as ed from '@noble/ed25519'

export default function useWebSocket(currentUser, onIncomingFriendRequest) {
  const [ws, setWs] = useState(null)
  const [friends, setFriends] = useState([])
  const [messages, setMessages] = useState({})
  const [typingUsers, setTypingUsers] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const wsRef = useRef(null)
  const onIncomingRef = useRef(onIncomingFriendRequest)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const maxReconnectAttemptsRef = useRef(10)
  const serverUrlRef = useRef(null)

  // Update ref when callback changes (but doesn't trigger reconnect)
  useEffect(() => {
    onIncomingRef.current = onIncomingFriendRequest
  }, [onIncomingFriendRequest])

  useEffect(() => {
    if (!currentUser) return

    // Function to create WebSocket connection with reconnection logic
    const connectWebSocket = () => {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
      serverUrlRef.current = serverUrl
      const websocket = new WebSocket(serverUrl)

    // Local storage fallback: read friend requests and friends from IndexedDB storage
    const refreshRequestsHTTP = async () => {
      try {
        const { incoming, outgoing } = await getFriendRequests()
        // Map stored requests back to the expected format
        const incomingList = incoming.map(r => 
          typeof r === 'string' ? { sender: r, sentAt: new Date().toISOString() } :
          r.relatedUser ? { sender: r.relatedUser, sentAt: r.sentAt } : r
        )
        const outgoingList = outgoing.map(r =>
          typeof r === 'string' ? { recipient: r, sentAt: new Date().toISOString() } :
          r.relatedUser ? { recipient: r.relatedUser, sentAt: r.sentAt } : r
        )
        setFriendRequests(incomingList)
        setOutgoingRequests(outgoingList)

        const friendsList = await getFriends()
        setFriends(friendsList || [])
      } catch (err) {
        console.error('❌ Local storage fallback error:', err)
      }
    }

    // Set onmessage FIRST before any other handlers
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

      switch (message.type) {
        case 'friends-list':
          setFriends(message.friends || [])
          saveFriends(message.friends || []).catch(e => console.error('Failed to save friends locally:', e))
          break

        case 'pending-requests':
          const incomingReqs = message.requests || []
          setFriendRequests(incomingReqs)
          saveFriendRequests(incomingReqs, []).catch(e => console.error('Failed to save incoming requests locally:', e))
          break

        case 'outgoing-requests':
          const outgoingReqs = message.outgoing || []
          setOutgoingRequests(outgoingReqs)
          // Get existing incoming requests from state and save both
          getFriendRequests().then(({ incoming }) => {
            saveFriendRequests(incoming || [], outgoingReqs).catch(e => console.error('Failed to save outgoing requests locally:', e))
          })
          break

        case 'request-sent':
          // When we send a friend request, add it to outgoing requests
          setOutgoingRequests((prev) => [
            ...prev,
            { recipient: message.to, sentAt: message.sentAt }
          ])
          break

        case 'friend-response':
          // When someone accepts/rejects our friend request
          if (message.accept) {
            // Add to friends list
            setFriends((prev) => [...prev, { username: message.from, online: false }])
            // Remove from outgoing requests
            setOutgoingRequests((prev) =>
              prev.filter((req) => {
                const recipient = typeof req === 'string' ? req : req.recipient
                return recipient !== message.from
              })
            )
            console.log('✅ Friend request accepted by', message.from)
          } else {
            // Remove from outgoing requests on rejection
            setOutgoingRequests((prev) =>
              prev.filter((req) => {
                const recipient = typeof req === 'string' ? req : req.recipient
                return recipient !== message.from
              })
            )
            console.log('❌ Friend request rejected by', message.from)
          }
          break

        case 'incoming-request':
          // Real-time notification when someone sends us a request
          setFriendRequests((prev) => [
            ...prev,
            { sender: message.from, sentAt: message.sentAt }
          ])
          // Trigger notification callback
          if (onIncomingRef.current) {
            onIncomingRef.current(message.from)
          }
          break

        case 'friend-added':
          // When friendship is accepted, add to friends and remove from requests
          setFriends((prev) => [
            ...prev,
            { username: message.friendUsername, online: false }
          ])
          // Remove from incoming or outgoing requests
          setFriendRequests((prev) =>
            prev.filter((req) => {
              const sender = typeof req === 'string' ? req : req.sender;
              return sender !== message.friendUsername;
            })
          )
          setOutgoingRequests((prev) =>
            prev.filter((req) => {
              const recipient = typeof req === 'string' ? req : req.recipient;
              return recipient !== message.friendUsername;
            })
          )
          break

        case 'request-declined':
          // When request is declined, remove from outgoing
          setOutgoingRequests((prev) =>
            prev.filter((req) => {
              const recipient = typeof req === 'string' ? req : req.recipient;
              return recipient !== message.declinedBy;
            })
          )
          break

        case 'friend-request':
          // Legacy handler - add incoming friend request to the list
          setFriendRequests((prev) => [...new Set([...prev, message.from])])
          // Trigger notification callback
          if (onIncomingRef.current) {
            onIncomingRef.current(message.from)
          }
          break

        case 'user-status':
          setFriends((prev) =>
            prev.map((f) =>
              f.username === message.username
                ? { ...f, online: message.online }
                : f
            )
          )
          break

        case 'window-visibility':
          // Handle window visibility updates from other users
          setFriends((prev) =>
            prev.map((f) =>
              f.username === message.username
                ? { ...f, windowVisible: message.visible }
                : f
            )
          )
          break

        case 'message':
          // Receive and decrypt incoming message
          if (message.from && (message.content || message.encrypted)) {
            const conversationKey = [currentUser, message.from].sort().join('-')
            
            const handleDecryptedMessage = async (decryptedContent) => {
              const msgObj = {
                id: `msg-${Date.now()}`,
                messageId: message.messageId || `msg-${Date.now()}`,
                conversationKey,
                from: message.from,
                to: currentUser,
                content: decryptedContent,
                timestamp: message.timestamp || new Date().toISOString(),
                read: false,
                unread: true,
                encrypted: !!message.encrypted, // Flag that message was encrypted
              }
              saveMessage(msgObj).catch(e => console.error('Failed to save message locally:', e))
            }
            
            // If message is encrypted, decrypt it first
            if (message.encrypted) {
              try {
                const conversationKey_obj = await getConversationKey(currentUser, message.from)
                const decrypted = await decryptMessage(message.encrypted, conversationKey_obj)
                handleDecryptedMessage(decrypted.content || decrypted)
                console.log('🔓 Message decrypted from', message.from)
              } catch (err) {
                console.error('❌ Failed to decrypt message:', err)
                handleDecryptedMessage('[Decryption failed]')
              }
            } else {
              // Fallback for unencrypted messages
              handleDecryptedMessage(message.content)
            }
          }
          break

        case 'typing':
          if (message.typing) {
            setTypingUsers((prev) => [...new Set([...prev, message.from])])
          } else {
            setTypingUsers((prev) =>
              prev.filter((u) => u !== message.from)
            )
          }
          break

        case 'mark-read':
          // Handle real-time read receipts from WebSocket
          // The message will trigger a re-fetch of messages via polling
          // which will update the read status
          break

        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-candidate':
          // Pass through WebRTC signaling messages to global handler
          // Call screens will listen for these on the WebSocket
          console.log('📡 WebRTC message received:', message.type, 'from', message.from)
          break

        default:
          console.log('⚠️ Unknown message type:', message.type)
      }
      } catch (err) {
        console.error('❌ Error processing WebSocket message:', err)
        console.error('❌ Raw event data:', event.data)
      }
    }

    // Now set onopen after onmessage is ready
    websocket.onopen = async () => {
      
      // Reset reconnection counter on successful connection
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      
      // Get stored keypair and sign the auth message
      try {
        const auth = await getAuth()
        if (auth.privateKey && auth.publicKey) {
          // Sign username with Ed25519
          const signature = await ed.sign(currentUser, Buffer.from(auth.privateKey, 'hex'))
          
          websocket.send(JSON.stringify({
            type: 'auth',
            username: currentUser,
            publicKey: auth.publicKey,
            signature: Buffer.from(signature).toString('hex'),
          }))
          console.log('🔐 Signed auth sent')
        } else {
          // Fallback if no keypair (shouldn't happen)
          websocket.send(JSON.stringify({
            type: 'auth',
            username: currentUser,
          }))
        }
      } catch (err) {
        console.error('❌ Error signing auth message:', err)
        websocket.send(JSON.stringify({
          type: 'auth',
          username: currentUser,
        }))
      }

      // Add a small delay to ensure server processes auth before requesting data
      setTimeout(() => {
        websocket.send(JSON.stringify({
          type: 'get-friends',
        }))

        websocket.send(JSON.stringify({
          type: 'get-pending',
        }))

        websocket.send(JSON.stringify({
          type: 'get-outgoing',
        }))

        // Sync any pending (queued) messages over WebSocket
        syncPendingMessagesWithSocket(websocket).catch(e => console.error('Failed to sync pending messages:', e))
        
        // Use local storage fallback after 2 seconds if WebSocket messages don't arrive
        setTimeout(() => {
          refreshRequestsHTTP()
        }, 2000);
      }, 500);
    }

    // Set up periodic polling for real-time updates (every 3 seconds)
    const pollingInterval = setInterval(() => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'get-friends' }))
        websocket.send(JSON.stringify({ type: 'get-pending' }))
        websocket.send(JSON.stringify({ type: 'get-outgoing' }))
      }
    }, 3000)

    websocket.onerror = (err) => {
      console.error('❌ WebSocket error:', err)
      console.error('❌ Error details:', err.message)
    }

    websocket.onclose = () => {
      console.log('🔌 WebSocket Closed', websocket.readyState)
      
      // Attempt to reconnect with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttemptsRef.current) {
        const delayMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
        reconnectAttemptsRef.current++
        console.log(`🔄 Reconnecting in ${delayMs}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttemptsRef.current})`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket()
        }, delayMs)
      } else {
        console.error('❌ Max reconnection attempts reached, giving up')
      }
    }

    setWs(websocket)
    wsRef.current = websocket
    }

    // Call connectWebSocket to start the connection
    connectWebSocket()

    return () => {
      console.log('🛑 Cleaning up WebSocket on dependency change')
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      let pollingInterval = setInterval(() => {}, 1000)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      clearInterval(pollingInterval)
    }
  }, [currentUser, wsRef])

  // Track page visibility and send status updates
  useEffect(() => {
    if (!currentUser || !wsRef.current) return

    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'user-status',
          username: currentUser,
          online: !isHidden,
        }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser])

  // Debug: log what we're returning
  useEffect(() => {
    console.log('🎣 useWebSocket hook returning:', { friendRequests, outgoingRequests });
  }, [friendRequests, outgoingRequests])

  // Manual refresh function - reads from local storage (IndexedDB)
  const refreshRequests = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      console.log('🔄 Loading requests and friends from local storage...')
      
      const { incoming, outgoing } = await getFriendRequests()
      console.log('📥 Incoming requests (local):', incoming)
      
      // Map stored requests back to the expected format
      const incomingList = incoming.map(r => 
        typeof r === 'string' ? { sender: r, sentAt: new Date().toISOString() } :
        r.relatedUser ? { sender: r.relatedUser, sentAt: r.sentAt } : r
      )
      const outgoingList = outgoing.map(r =>
        typeof r === 'string' ? { recipient: r, sentAt: new Date().toISOString() } :
        r.relatedUser ? { recipient: r.relatedUser, sentAt: r.sentAt } : r
      )
      setFriendRequests(incomingList)
      setOutgoingRequests(outgoingList)
      console.log('📤 Outgoing requests (local):', outgoingList)
      
      const friendsList = await getFriends()
      console.log('👥 Friends list (local):', friendsList)
      setFriends(friendsList || [])
    } catch (err) {
      console.error('❌ Error loading requests/friends from local storage:', err)
    }
  }, [currentUser])

  // Send an encrypted message via WebSocket to a recipient
  const sendEncryptedMessage = useCallback(async (recipient, content) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket not ready')
      return false
    }

    try {
      // Get the conversation-specific encryption key
      const conversationKey_obj = await getConversationKey(currentUser, recipient)
      
      // Encrypt the message content
      const messagePayload = { content }
      const encryptedContent = await encryptMessage(messagePayload, conversationKey_obj)
      
      // Send encrypted message via WebSocket
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          to: recipient,
          encrypted: encryptedContent, // Send encrypted blob
          timestamp: new Date().toISOString(),
        })
      )
      
      console.log('🔒 Encrypted message sent to', recipient)
      return true
    } catch (err) {
      console.error('❌ Failed to send encrypted message:', err)
      return false
    }
  }, [currentUser])

  return { 
    ws: wsRef.current, 
    friends, 
    messages, 
    typingUsers, 
    friendRequests, 
    outgoingRequests, 
    refreshRequests,
    sendEncryptedMessage,
  }
}
