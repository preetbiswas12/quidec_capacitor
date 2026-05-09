import { useState, useEffect, useRef, useCallback } from 'react'
import { getFriendRequests, getFriends, saveFriendRequests, saveFriends, saveMessage, getAuth } from '../utils/storage'
import { syncPendingMessagesWithSocket } from '../utils/network'
import { getConversationKey, encryptMessage, decryptMessage } from '../utils/encryption.js'
import * as ed from '@noble/ed25519'

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array()
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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
  const pollingIntervalRef = useRef(null)
  const maxReconnectAttemptsRef = useRef(10)
  const shouldReconnectRef = useRef(true)
  const serverUrlRef = useRef(null)

  // Update ref when callback changes (but doesn't trigger reconnect)
  useEffect(() => {
    onIncomingRef.current = onIncomingFriendRequest
  }, [onIncomingFriendRequest])

  const refreshFromStorage = useCallback(async () => {
    try {
      const { incoming, outgoing } = await getFriendRequests()
      const incomingList = incoming.map((r) =>
        typeof r === 'string' ? { sender: r, sentAt: new Date().toISOString() } :
        r.relatedUser ? { sender: r.relatedUser, sentAt: r.sentAt } : r
      )
      const outgoingList = outgoing.map((r) =>
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
  }, [])

  useEffect(() => {
    if (!currentUser) return

    shouldReconnectRef.current = true

    const connectWebSocket = () => {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
      serverUrlRef.current = serverUrl
      const websocket = new WebSocket(serverUrl)

      websocket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data)

          switch (message.type) {
            case 'friends-list': {
              const list = message.friends || []
              setFriends(list)
              await saveFriends(list)
              break
            }

            case 'pending-requests': {
              const incomingReqs = message.requests || []
              setFriendRequests(incomingReqs)
              await saveFriendRequests(incomingReqs, [])
              break
            }

            case 'outgoing-requests': {
              const outgoingReqs = message.outgoing || []
              setOutgoingRequests(outgoingReqs)
              const { incoming } = await getFriendRequests()
              await saveFriendRequests(incoming || [], outgoingReqs)
              break
            }

            case 'request-sent':
              setOutgoingRequests((prev) => [...prev, { recipient: message.to, sentAt: message.sentAt }])
              break

            case 'friend-response':
              if (message.accept) {
                setFriends((prev) => [...prev, { username: message.from, online: false }])
                setOutgoingRequests((prev) =>
                  prev.filter((req) => (typeof req === 'string' ? req : req.recipient) !== message.from)
                )
                console.log('✅ Friend request accepted by', message.from)
              } else {
                setOutgoingRequests((prev) =>
                  prev.filter((req) => (typeof req === 'string' ? req : req.recipient) !== message.from)
                )
                console.log('❌ Friend request rejected by', message.from)
              }
              break

            case 'incoming-request':
              setFriendRequests((prev) => [...prev, { sender: message.from, sentAt: message.sentAt }])
              if (onIncomingRef.current) onIncomingRef.current(message.from)
              break

            case 'friend-added':
              setFriends((prev) => [...prev, { username: message.friendUsername, online: false }])
              setFriendRequests((prev) =>
                prev.filter((req) => (typeof req === 'string' ? req : req.sender) !== message.friendUsername)
              )
              setOutgoingRequests((prev) =>
                prev.filter((req) => (typeof req === 'string' ? req : req.recipient) !== message.friendUsername)
              )
              break

            case 'request-declined':
              setOutgoingRequests((prev) =>
                prev.filter((req) => (typeof req === 'string' ? req : req.recipient) !== message.declinedBy)
              )
              break

            case 'friend-request':
              setFriendRequests((prev) => [...new Set([...prev, message.from])])
              if (onIncomingRef.current) onIncomingRef.current(message.from)
              break

            case 'user-status':
              setFriends((prev) =>
                prev.map((f) => (f.username === message.username ? { ...f, online: message.online } : f))
              )
              break

            case 'window-visibility':
              setFriends((prev) =>
                prev.map((f) => (f.username === message.username ? { ...f, windowVisible: message.visible } : f))
              )
              break

            case 'message': {
              if (message.from && (message.content || message.encrypted)) {
                const conversationKey = [currentUser, message.from].sort().join('-')
                let finalContent = message.content

                if (message.encrypted) {
                  try {
                    const conversationKeyObj = await getConversationKey(currentUser, message.from)
                    const decrypted = await decryptMessage(message.encrypted, conversationKeyObj)
                    finalContent = decrypted?.content || decrypted
                    console.log('🔓 Message decrypted from', message.from)
                  } catch (err) {
                    console.error('❌ Failed to decrypt message:', err)
                    finalContent = '[Decryption failed]'
                  }
                }

                const msgObj = {
                  id: `msg-${Date.now()}`,
                  messageId: message.messageId || `msg-${Date.now()}`,
                  conversationKey,
                  from: message.from,
                  to: currentUser,
                  content: finalContent,
                  timestamp: message.timestamp || new Date().toISOString(),
                  read: false,
                  unread: true,
                  encrypted: !!message.encrypted,
                }

                await saveMessage(msgObj)
                setMessages((prev) => ({
                  ...prev,
                  [conversationKey]: [...(prev[conversationKey] || []), msgObj],
                }))
              }
              break
            }

            case 'typing':
              if (message.typing) {
                setTypingUsers((prev) => [...new Set([...prev, message.from])])
              } else {
                setTypingUsers((prev) => prev.filter((u) => u !== message.from))
              }
              break

            case 'mark-read':
            case 'webrtc-offer':
            case 'webrtc-answer':
            case 'webrtc-candidate':
              break

            default:
              console.log('⚠️ Unknown message type:', message.type)
          }
        } catch (err) {
          console.error('❌ Error processing WebSocket message:', err)
          console.error('❌ Raw event data:', event.data)
        }
      }

      websocket.onopen = async () => {
        reconnectAttemptsRef.current = 0
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)

        try {
          const auth = await getAuth()
          if (auth?.privateKey && auth?.publicKey) {
            const privateKeyBytes = hexToBytes(auth.privateKey)
            const messageBytes = new TextEncoder().encode(currentUser)
            const signatureBytes = await ed.sign(messageBytes, privateKeyBytes)
            const signatureHex = bytesToHex(signatureBytes)

            websocket.send(JSON.stringify({
              type: 'auth',
              username: currentUser,
              publicKey: auth.publicKey,
              signature: signatureHex,
            }))
            console.log('🔐 Signed auth sent')
          } else {
            websocket.send(JSON.stringify({ type: 'auth', username: currentUser }))
          }
        } catch (err) {
          console.error('❌ Error signing auth message:', err)
          websocket.send(JSON.stringify({ type: 'auth', username: currentUser }))
        }

        setTimeout(() => {
          if (websocket.readyState !== WebSocket.OPEN) return
          websocket.send(JSON.stringify({ type: 'get-friends' }))
          websocket.send(JSON.stringify({ type: 'get-pending' }))
          websocket.send(JSON.stringify({ type: 'get-outgoing' }))
          syncPendingMessagesWithSocket(websocket).catch((e) => console.error('Failed to sync pending messages:', e))

          setTimeout(() => {
            refreshFromStorage()
          }, 2000)
        }, 500)
      }

      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: 'get-friends' }))
          websocket.send(JSON.stringify({ type: 'get-pending' }))
          websocket.send(JSON.stringify({ type: 'get-outgoing' }))
        }
      }, 3000)

      websocket.onerror = (err) => {
        console.error('❌ WebSocket error:', err)
      }

      websocket.onclose = () => {
        console.log('🔌 WebSocket Closed', websocket.readyState)

        if (!shouldReconnectRef.current) return

        if (reconnectAttemptsRef.current < maxReconnectAttemptsRef.current) {
          const delayMs = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          reconnectAttemptsRef.current += 1
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket()
          }, delayMs)
          console.log(`🔄 Reconnecting in ${delayMs}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttemptsRef.current})`)
        } else {
          console.error('❌ Max reconnection attempts reached, giving up')
        }
      }

      wsRef.current = websocket
      setWs(websocket)
    }

    connectWebSocket()

    return () => {
      shouldReconnectRef.current = false

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [currentUser, refreshFromStorage])

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
    ws: ws || wsRef.current, 
    friends, 
    messages, 
    typingUsers, 
    friendRequests, 
    outgoingRequests, 
    refreshRequests,
    sendEncryptedMessage,
  }
}
