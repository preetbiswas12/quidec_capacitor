import { useState, useEffect } from 'react'
import '../styles/friend-request-notification.css'

export default function FriendRequestNotification({
  from,
  onDismiss,
  onAccept,
  onReject,
}) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(onDismiss, 300) // Wait for animation
    }, 5000)

    return () => clearTimeout(timer)
  }, [onDismiss])

  const handleAccept = () => {
    setIsExiting(true)
    setTimeout(() => {
      onAccept()
    }, 300)
  }

  const handleReject = () => {
    setIsExiting(true)
    setTimeout(() => {
      onReject()
    }, 300)
  }

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(onDismiss, 300)
  }

  return (
    <div className={`friend-request-notification ${isExiting ? 'exiting' : 'entering'}`}>
      <div className="notification-content">
        <div className="notification-message">
          <span className="notification-icon">👋</span>
          <div className="notification-text">
            <p className="notification-title">Friend Request</p>
            <p className="notification-user">{from} wants to be your friend</p>
          </div>
        </div>
        <div className="notification-actions">
          <button
            className="notification-accept"
            onClick={handleAccept}
            title="Accept"
          >
            ✓
          </button>
          <button
            className="notification-reject"
            onClick={handleReject}
            title="Reject"
          >
            ✕
          </button>
          <button
            className="notification-close"
            onClick={handleDismiss}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="notification-progress"></div>
    </div>
  )
}
