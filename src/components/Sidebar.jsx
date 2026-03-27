import '../styles/sidebar.css'
import { useState, useEffect } from 'react'

export default function Sidebar({
  currentUser,
  friends,
  currentChatWith,
  onSelectFriend,
  onOpenRequests,
  onLogout,
  messages = [],
}) {
  const onlineFriends = friends.filter((f) => f.online)
  const offlineFriends = friends.filter((f) => !f.online)
  const [unreadCounts, setUnreadCounts] = useState({})
  const [lastMessages, setLastMessages] = useState({})

  // Calculate unread messages and last message for each friend
  useEffect(() => {
    if (!Array.isArray(messages)) {
      console.warn('⚠️ Messages is not an array:', typeof messages)
      setUnreadCounts({})
      setLastMessages({})
      return
    }

    const counts = {}
    const lastMsg = {}
    
    friends.forEach((friend) => {
      // Get messages with this friend
      const friendMessages = messages.filter(
        (msg) => msg && (msg.from === friend.username || msg.to === friend.username)
      )
      
      // Count unread messages from this friend
      const unread = friendMessages.filter(
        (msg) => msg && msg.from === friend.username && !msg.read
      ).length
      counts[friend.username] = unread
      
      // Get last message
      if (friendMessages.length > 0) {
        const last = friendMessages[friendMessages.length - 1]
        if (last && last.content) {
          lastMsg[friend.username] = last.content.substring(0, 30) + 
            (last.content.length > 30 ? '...' : '')
        }
      }
    })
    
    setUnreadCounts(counts)
    setLastMessages(lastMsg)
  }, [messages, friends])

  const userInitial = currentUser.charAt(0).toUpperCase()
  const isOnline = true // Assume current user is online since they're logged in

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>🎭 Quidec</h2>
      </div>

      <div className="user-info">
        <div className="user-profile">
          <div className="user-avatar">{userInitial}</div>
          <div className="user-profile-info">
            <span className="username">{currentUser}</span>
            <div className="user-id">ID: {(localStorage.getItem('userId') || 'N/A').substring(0, 8)}</div>
            <div className="user-connected-status">Connected</div>
          </div>
          {isOnline && <div className="user-status-online"></div>}
        </div>
      </div>

      <div className="friends-section">
        <h3 className="friends-title">
          Friends <span className="count">{onlineFriends.length}/{friends.length}</span>
        </h3>

        {onlineFriends.length > 0 && (
          <div className="friends-group">
            <h4 className="group-label">Online</h4>
            {onlineFriends.map((friend) => (
              <button
                key={friend.username}
                className={`friend-item ${currentChatWith === friend.username ? 'active' : ''}`}
                onClick={() => onSelectFriend(friend.username)}
              >
                <span className="status-dot online"></span>
                <div className="friend-item-content">
                  <span className="friend-name">{friend.username}</span>
                  {lastMessages[friend.username] && (
                    <span className="friend-last-message">
                      {lastMessages[friend.username]}
                    </span>
                  )}
                </div>
                {unreadCounts[friend.username] > 0 && (
                  <span className="friend-unread-badge">
                    {unreadCounts[friend.username]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {offlineFriends.length > 0 && (
          <div className="friends-group">
            <h4 className="group-label">Offline</h4>
            {offlineFriends.map((friend) => (
              <button
                key={friend.username}
                className={`friend-item ${currentChatWith === friend.username ? 'active' : ''}`}
                onClick={() => onSelectFriend(friend.username)}
              >
                <span className="status-dot offline"></span>
                <div className="friend-item-content">
                  <span className="friend-name">{friend.username}</span>
                  {lastMessages[friend.username] && (
                    <span className="friend-last-message">
                      {lastMessages[friend.username]}
                    </span>
                  )}
                </div>
                {unreadCounts[friend.username] > 0 && (
                  <span className="friend-unread-badge">
                    {unreadCounts[friend.username]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {friends.length === 0 && (
          <p className="no-friends">No friends yet. Send a request to get started!</p>
        )}
      </div>

      <div className="sidebar-footer">
        <button onClick={onOpenRequests} className="btn btn-small">
          Friend Requests
        </button>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>
    </aside>
  )
}
