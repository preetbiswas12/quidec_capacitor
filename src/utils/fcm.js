/**
 * Firebase Cloud Messaging (FCM) integration
 * Handles push notifications for incoming calls and messages
 */

import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { decryptMessage } from './encryption'

let encryptionKey = null

/**
 * Initialize push notifications (requires Firebase configured)
 */
export async function initializePushNotifications(userId, key) {
  try {
    encryptionKey = key

    // Request notification permission first
    await PushNotifications.requestPermissions()

    // Register for push notifications
    await PushNotifications.register()

    // Listen for incoming notifications
    PushNotifications.addListener('registration', (token) => {
      console.log('✅ FCM Registration token:', token.value)
      // Send this token to your backend for cloud messaging
      sendTokenToBackend(userId, token.value)
    })

    PushNotifications.addListener('registrationError', (error) => {
      console.error('❌ FCM Registration error:', error.error)
    })

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📬 Notification received:', notification)
      handleIncomingNotification(notification)
    })

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('🔔 Notification action:', notification)
      handleNotificationAction(notification)
    })

    console.log('✅ Push notifications initialized')
  } catch (err) {
    console.error('❌ Push notifications init failed:', err)
  }
}

/**
 * Send FCM token to backend
 */
async function sendTokenToBackend(userId, fcmToken) {
  try {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
    const httpUrl = serverUrl.replace(/wss?:/, 'https:').replace('http:', 'http:')

    const response = await fetch(`${httpUrl}/api/users/${userId}/fcm-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken }),
    })

    if (response.ok) {
      console.log('✅ FCM token sent to backend')
    } else {
      console.warn('⚠️ Failed to send FCM token to backend')
    }
  } catch (err) {
    console.error('❌ Error sending FCM token:', err)
  }
}

/**
 * Handle incoming FCM notification
 * Data-only messages contain encrypted content
 */
async function handleIncomingNotification(notification) {
  const { data } = notification.notification || notification

  // Extract notification type
  const type = data?.type // 'incoming-call', 'message', 'friend-request'
  const from = data?.from
  const title = data?.title || 'New Notification'
  const body = data?.body || ''

  console.log(`📬 Notification type: ${type} from ${from}`)

  // Handle different notification types
  switch (type) {
    case 'incoming-call':
      await handleIncomingCall(from, notification)
      break

    case 'message':
      await handleMessageNotification(from, data, notification)
      break

    case 'friend-request':
      await handleFriendRequestNotification(from, notification)
      break

    default:
      // Show generic notification
      await showLocalNotification(title, body)
  }
}

/**
 * Handle incoming call notification
 * Shows native-like incoming call UI
 */
async function handleIncomingCall(from, notification) {
  console.log(`📞 Incoming call from ${from}`)

  // Show high-priority local notification
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 1,
        title: 'Incoming Call',
        body: `${from} is calling...`,
        smallIcon: 'ic_launcher',
        largeBody: `Tap to answer call from ${from}`,
        actionTypeId: 'call-action',
        sound: true,
        vibrate: [500, 200, 500],
        schedule: {
          at: new Date(),
        },
      },
    ],
  })

  // Dispatch custom event to wake up React component
  window.dispatchEvent(
    new CustomEvent('incomingCall', {
      detail: { from },
    })
  )
}

/**
 * Handle message notification
 * Decrypt message content before showing
 */
async function handleMessageNotification(from, data, notification) {
  console.log(`💬 Message from ${from}`)

  let messageBody = data?.body || '...'

  // If encrypted content provided and key available, decrypt it
  if (data?.encryptedContent && encryptionKey) {
    try {
      const decrypted = await decryptMessage(data.encryptedContent, encryptionKey)
      messageBody = decrypted.text || messageBody
    } catch (err) {
      console.warn('⚠️ Could not decrypt message:', err)
      messageBody = '[Encrypted message]'
    }
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.random() * 10000,
        title: `Message from ${from}`,
        body: messageBody,
        smallIcon: 'ic_launcher',
        sound: true,
        vibrate: [200],
        schedule: {
          at: new Date(),
        },
      },
    ],
  })
}

/**
 * Handle friend request notification
 */
async function handleFriendRequestNotification(from, notification) {
  console.log(`👥 Friend request from ${from}`)

  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.random() * 10000,
        title: 'Friend Request',
        body: `${from} sent you a friend request`,
        smallIcon: 'ic_launcher',
        sound: true,
        schedule: {
          at: new Date(),
        },
      },
    ],
  })
}

/**
 * Show generic local notification
 */
export async function showLocalNotification(title, body, notificationId = null) {
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId || Math.random() * 10000,
          title,
          body,
          smallIcon: 'ic_launcher',
          schedule: {
            at: new Date(),
          },
        },
      ],
    })
  } catch (err) {
    console.error('❌ Failed to show notification:', err)
  }
}

/**
 * Handle user interaction with notification
 */
function handleNotificationAction(notification) {
  const { notification: data } = notification

  // Get the action that was performed
  const actionId = notification.actionId
  console.log(`🔔 User performed action: ${actionId}`)

  // Handle call actions
  if (data?.actionTypeId === 'call-action') {
    if (actionId === 'accept') {
      // User tapped "Accept"
      window.dispatchEvent(
        new CustomEvent('acceptCall', {
          detail: {
            from: data?.from,
          },
        })
      )
    } else if (actionId === 'reject') {
      // User tapped "Reject"
      window.dispatchEvent(
        new CustomEvent('rejectCall', {
          detail: {
            from: data?.from,
          },
        })
      )
    }
  }
}

/**
 * Configure local notification actions
 * Called during app initialization
 */
export async function setupNotificationActions() {
  try {
    await LocalNotifications.createActionGroup({
      id: 'call-action',
      actions: [
        {
          id: 'accept',
          title: 'Accept',
          foreground: true,
        },
        {
          id: 'reject',
          title: 'Reject',
          foreground: false,
        },
      ],
    })
    console.log('✅ Notification actions configured')
  } catch (err) {
    console.error('❌ Failed to setup notification actions:', err)
  }
}

/**
 * Get FCM token (useful for debugging)
 */
export async function getFCMToken() {
  try {
    // This requires additional setup - usually Firebase Admin SDK on backend
    console.log('Note: FCM token obtained during registration')
  } catch (err) {
    console.error('❌ Error getting FCM token:', err)
  }
}
