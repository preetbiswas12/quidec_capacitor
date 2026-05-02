import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen'
import ChatScreen from './components/ChatScreen'
import ErrorBoundary from './components/ErrorBoundary'
import { LoadingScreen } from './components/LoadingSpinner'
import useWebSocket from './hooks/useWebSocket'
import { initializeDB, getAuth, saveAuth, clearAuth } from './utils/storage'
import { getEncryptionKey } from './utils/encryption'
import { initializeNetworkMonitoring } from './utils/network'
import { requestCameraAndMicPermissions, setupPermissionListeners } from './utils/permissions'
import { initializePushNotifications, setupNotificationActions } from './utils/fcm'
import { App as CapacitorApp } from '@capacitor/app'

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState(null)
  const [incomingRequestFrom, setIncomingRequestFrom] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  
  // Initialize Capacitor and mobile features on mount
  useEffect(() => {
    const initializeMobileApp = async () => {
      try {
        // 1. Initialize database (IndexedDB)
        await initializeDB()
        console.log('✅ Database initialized')

        // 2. Setup network monitoring
        await initializeNetworkMonitoring((online) => {
          setIsOnline(online)
        })
        console.log('✅ Network monitoring setup')

        // 3. Setup permission listeners
        setupPermissionListeners()
        console.log('✅ Permission listeners setup')

        // 4. Setup notification actions
        await setupNotificationActions()
        console.log('✅ Notification actions setup')

        // 5. Handle app lifecycle
        CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            console.log('📱 App resumed')
          } else {
            console.log('📱 App paused')
          }
        })

        // 6. Handle back button (Android)
        CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          if (!canGoBack) {
            // Minimize app instead of closing
            CapacitorApp.minimizeApp()
          }
        })

        console.log('✅ Capacitor app initialized')
      } catch (err) {
        console.error('❌ Mobile initialization error:', err)
        setInitError('Failed to initialize app')
      }
    }

    initializeMobileApp()
  }, [])

  // Check for saved auth on mount (from IndexedDB, not localStorage)
  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const auth = await getAuth()
        if (auth.currentUser) {
          console.log('🔓 Restoring session for:', auth.currentUser)
          setCurrentUser(auth.currentUser)

          // Initialize push notifications
          if (auth.userId) {
            const encKey = await getEncryptionKey(auth.userId)
            await initializePushNotifications(auth.userId, encKey)
            console.log('✅ Push notifications initialized')
          }
        }
      } catch (err) {
        console.error('⚠️ Failed to restore auth:', err)
      } finally {
        setLoading(false)
      }
    }

    restoreAuth()
  }, [])

  // Track page visibility (minimize, tab switch, etc)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - handled in useWebSocket
      } else {
        // Page is visible - handled in useWebSocket
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Track focus/blur events
  useEffect(() => {
    const handleFocus = () => {
      // Window focused
    }
    const handleBlur = () => {
      // Window blurred
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])
  
  const handleIncomingFriendRequest = (from) => {
    setIncomingRequestFrom(from)
  }
  
  const { ws, messages, friends, typingUsers, friendRequests, outgoingRequests, refreshRequests } = useWebSocket(
    currentUser,
    handleIncomingFriendRequest
  )

  const handleLogin = async (username, password) => {
    setLoading(true)
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
      const httpUrl = serverUrl.replace(/wss?:/, 'https:').replace('http:', 'http:')
      
      const response = await fetch(`${httpUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()
      if (response.ok) {
        // Save to IndexedDB instead of localStorage
        await saveAuth(username, data.userId)

        // Initialize encryption key
        const encKey = await getEncryptionKey(data.userId)

        // Initialize push notifications
        await initializePushNotifications(data.userId, encKey)

        // Request camera and mic permissions for calling
        await requestCameraAndMicPermissions()

        setCurrentUser(username)
        return { success: true }
      } else {
        if (data.userNotFound) {
          return { userNotFound: true, error: data.error }
        }
        alert(data.error || 'Login failed')
        return { success: false }
      }
    } catch (err) {
      console.error('Login error details:', err)
      alert('Server connection error: ' + err.message + '\nMake sure server is running at: https://quidec-server.onrender.com')
      return { success: false }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (username, password) => {
    setLoading(true)
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
      const httpUrl = serverUrl.replace(/wss?:/, 'https:').replace('http:', 'http:')
      
      const response = await fetch(`${httpUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()
      if (response.ok) {
        // Save to IndexedDB instead of localStorage
        await saveAuth(username, data.userId)

        // Initialize encryption key
        const encKey = await getEncryptionKey(data.userId)

        // Initialize push notifications
        await initializePushNotifications(data.userId, encKey)

        // Request camera and mic permissions for calling
        await requestCameraAndMicPermissions()

        setCurrentUser(username)
      } else {
        alert(data.error || 'Registration failed')
      }
    } catch (err) {
      alert('Server connection error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    setCurrentUser(null)
    // Clear IndexedDB instead of localStorage
    await clearAuth()
    if (ws) ws.close()
  }

  // Track page visibility (minimize, tab switch, etc)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 App hidden')
      } else {
        console.log('📱 App visible')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  }

  // Show loading screen while initializing
  if (loading) {
    return <LoadingScreen message="Initializing app..." />
  }

  // Show error if initialization failed
  if (initError) {
    return (
      <div style={errorStyles.container}>
        <div style={errorStyles.content}>
          <h1 style={errorStyles.title}>⚠️ Initialization Error</h1>
          <p style={errorStyles.message}>{initError}</p>
          <button
            style={errorStyles.button}
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} loading={loading} />
  }

  return (
    <ChatScreen
      currentUser={currentUser}
      ws={ws}
      messages={messages}
      friends={friends}
      typingUsers={typingUsers}
      friendRequests={friendRequests}
      outgoingRequests={outgoingRequests}
      incomingRequestFrom={incomingRequestFrom}
      onIncomingRequestHandled={() => setIncomingRequestFrom(null)}
      onLogout={handleLogout}
      refreshRequests={refreshRequests}
      isOnline={isOnline}
    />
  )
}

const errorStyles = {
  container: {
    width: '100%',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0a0a14 0%, #111122 100%)',
    color: '#E3E3E3',
  },
  content: {
    textAlign: 'center',
    maxWidth: '400px',
    padding: '20px',
  },
  title: {
    fontSize: '24px',
    marginBottom: '12px',
  },
  message: {
    fontSize: '14px',
    color: '#A0A0B0',
    marginBottom: '24px',
  },
  button: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #1B3C53, #234C6A)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
}

// Export wrapped version with ErrorBoundary
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

