import { useState, useEffect, useRef, useCallback } from 'react'

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

    // HTTP fallback function
    const refreshRequestsHTTP = async () => {
      try {
        const httpUrl = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
        
        const incomingRes = await fetch(`${httpUrl}/api/friend-requests/incoming/${currentUser}`)
        const incomingData = await incomingRes.json()
        setFriendRequests(incomingData.requests || [])
        
        const outgoingRes = await fetch(`${httpUrl}/api/friend-requests/outgoing/${currentUser}`)
        const outgoingData = await outgoingRes.json()
        setOutgoingRequests(outgoingData.outgoing || [])
      } catch (err) {
        console.error('❌ HTTP fallback error:', err)
      }
    }

    // Set onmessage FIRST before any other handlers
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

      switch (message.type) {
        case 'friends-list':
          setFriends(message.friends || [])
          break

        case 'pending-requests':
          setFriendRequests(message.requests || [])
          break

        case 'outgoing-requests':
          setOutgoingRequests(message.outgoing || [])
          break

        case 'request-sent':
          // When we send a friend request, add it to outgoing requests
          setOutgoingRequests((prev) => [
            ...prev,
            { recipient: message.to, sentAt: message.sentAt }
          ])
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
          // Handle incoming chat messages from other users
          // Messages are handled via polling from ChatPanel
          // This ensures messages are fetched and displayed correctly
          // You can optionally trigger a re-fetch here if needed
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

        default:
          console.log('⚠️ Unknown message type:', message.type)
      }
      } catch (err) {
        console.error('❌ Error processing WebSocket message:', err)
        console.error('❌ Raw event data:', event.data)
      }
    }

    // Now set onopen after onmessage is ready
    websocket.onopen = () => {
      
      // Reset reconnection counter on successful connection
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      
      websocket.send(JSON.stringify({
        type: 'auth',
        username: currentUser,
      }))

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
        
        // Use HTTP fallback after 2 seconds if WebSocket messages don't arrive
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
  }, [currentUser])

  // Track page visibility and send status updates
  useEffect(() => {
    if (!currentUser || !wsRef.current) return;

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

  // Manual refresh function - uses HTTP fallback since WebSocket isn't bidirectional on Render
  const refreshRequests = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
      const httpUrl = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
      
      console.log('🔄 HTTP fallback: fetching requests and friends from', httpUrl)
      
      // Fetch incoming requests
      const incomingRes = await fetch(`${httpUrl}/api/friend-requests/incoming/${currentUser}`)
      const incomingData = await incomingRes.json()
      console.log('📥 Incoming requests (HTTP):', incomingData)
      setFriendRequests(incomingData.requests || [])
      
      // Fetch outgoing requests
      const outgoingRes = await fetch(`${httpUrl}/api/friend-requests/outgoing/${currentUser}`)
      const outgoingData = await outgoingRes.json()
      console.log('📤 Outgoing requests (HTTP):', outgoingData)
      setOutgoingRequests(outgoingData.outgoing || [])
      
      // Fetch friends list
      const friendsRes = await fetch(`${httpUrl}/api/friends/${currentUser}`)
      const friendsData = await friendsRes.json()
      console.log('👥 Friends list (HTTP):', friendsData)
      setFriends(friendsData.friends || [])
    } catch (err) {
      console.error('❌ Error fetching requests/friends via HTTP:', err)
    }
  }, [currentUser])

  return { ws, friends, messages, typingUsers, friendRequests, outgoingRequests, refreshRequests }
}
