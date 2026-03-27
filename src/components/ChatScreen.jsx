import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import FriendRequestsModal from './FriendRequestsModal'
import FriendRequestNotification from './FriendRequestNotification'
import '../styles/chat.css'

export default function ChatScreen({
  currentUser,
  ws,
  messages,
  friends,
  typingUsers,
  friendRequests,
  outgoingRequests,
  incomingRequestFrom,
  onIncomingRequestHandled,
  onLogout,
  refreshRequests,
}) {
  const [currentChatWith, setCurrentChatWith] = useState(null)
  const [notificationFrom, setNotificationFrom] = useState(null)
  const [showRequestsModal, setShowRequestsModal] = useState(false)
  const [mobileViewChat, setMobileViewChat] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Track window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Polling fallback: refresh requests every 5 seconds when modal is open
  useEffect(() => {
    if (!showRequestsModal) return;
    
    const interval = setInterval(() => {
      console.log('⏰ Polling: auto-refreshing friend requests...');
      if (refreshRequests) refreshRequests();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [showRequestsModal, refreshRequests])

  const handleSelectFriend = (username) => {
    setCurrentChatWith(username)
    // On mobile, show chat view only
    if (isMobile) {
      setMobileViewChat(true)
    }
  }

  const handleBackFromChat = () => {
    setMobileViewChat(false)
  }

  // Show notification when friend request arrives
  useEffect(() => {
    if (incomingRequestFrom) {
      setNotificationFrom(incomingRequestFrom)
      onIncomingRequestHandled()
    }
  }, [incomingRequestFrom, onIncomingRequestHandled])

  const handleAcceptFriendRequest = async (from) => {
    // Optimistically remove from incoming requests immediately
    console.log('✅ Accepting request from:', from);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'friend-response',
        from: currentUser,
        to: from,
        accept: true,
      }))
      console.log('📤 Sent friend-response message');
    }
    
    // Wait for server to process, then refresh to get updated lists
    setTimeout(() => {
      if (refreshRequests) {
        console.log('🔄 Refreshing after accept...');
        refreshRequests();
      }
    }, 500);
  }

  const handleRejectFriendRequest = async (from) => {
    // Optimistically remove from incoming requests immediately
    console.log('❌ Rejecting request from:', from);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'friend-response',
        from: currentUser,
        to: from,
        accept: false,
      }))
      console.log('📤 Sent friend-response message (reject)');
    }
    
    // Refresh requests after rejecting
    setTimeout(() => {
      if (refreshRequests) {
        console.log('🔄 Refreshing after reject...');
        refreshRequests();
      }
    }, 500);
  }

  const handleSendFriendRequest = (input) => {
    if (!input) {
      alert('Please enter an 8-digit user ID');
      return;
    }

    // Validate 8-digit ID only
    if (!/^\d{8}$/.test(input)) {
      alert('Invalid format. Must be exactly 8 digits.');
      return;
    }

    if (!ws) {
      alert('WebSocket not connected. Please refresh the page.');
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) {
      alert(`WebSocket not ready. State: ${ws.readyState} (Expected: 1 for OPEN)`);
      return;
    }

    // Build message with toUserId only
    const messagePayload = {
      type: 'friend-request',
      from: currentUser,
      toUserId: input,
    };

    // Send message via WebSocket
    try {
      ws.send(JSON.stringify(messagePayload));
    } catch (err) {
      alert('Failed to send request: ' + err.message);
      return;
    }

    // Refresh data
    setTimeout(() => {
      if (refreshRequests) {
        refreshRequests();
      }
    }, 500);
  }

  return (
    <div className={`chat-screen ${mobileViewChat && isMobile ? 'mobile-view-active' : ''}`}>
      {(!mobileViewChat || !isMobile) && (
        <Sidebar
          currentUser={currentUser}
          friends={friends}
          currentChatWith={currentChatWith}
          onSelectFriend={handleSelectFriend}
          onOpenRequests={() => setShowRequestsModal(true)}
          onLogout={onLogout}
          messages={messages}
        />
      )}

      <ChatPanel
        currentUser={currentUser}
        currentChatWith={currentChatWith}
        ws={ws}
        messages={messages}
        typingUsers={typingUsers}
        onMobileBack={isMobile ? handleBackFromChat : null}
        friends={friends}
      />

      {notificationFrom && (
        <FriendRequestNotification
          from={notificationFrom}
          onDismiss={() => setNotificationFrom(null)}
          onAccept={() => {
            handleAcceptFriendRequest(notificationFrom)
            setNotificationFrom(null)
          }}
          onReject={() => {
            handleRejectFriendRequest(notificationFrom)
            setNotificationFrom(null)
          }}
        />
      )}

      {showRequestsModal && (
        <FriendRequestsModal
          onClose={() => setShowRequestsModal(false)}
          incomingRequests={friendRequests}
          outgoingRequests={outgoingRequests}
          onAccept={handleAcceptFriendRequest}
          onReject={handleRejectFriendRequest}
          onSendRequest={handleSendFriendRequest}
          onRefresh={refreshRequests}
        />
      )}
    </div>
  )
}
