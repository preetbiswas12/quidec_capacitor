/**
 * Network connectivity handler for mobile
 * Manages online/offline state and WebSocket reconnection
 */

import { Network } from '@capacitor/network'
import { getPendingSyncItems, updateSyncItemStatus, removeSyncItem } from './storage'

let isOnline = true
let statusChangeCallback = null

/**
 * Initialize network monitoring
 */
export async function initializeNetworkMonitoring(onStatusChange) {
  try {
    statusChangeCallback = onStatusChange

    // Get initial status
    const status = await Network.getStatus()
    isOnline = status.connected
    console.log(`📡 Initial connection status: ${isOnline ? 'online' : 'offline'}`)

    // Listen for connection changes
    Network.addListener('networkStatusChange', async (status) => {
      const wasOnline = isOnline
      isOnline = status.connected

      console.log(
        `📡 Network changed: ${wasOnline ? 'online' : 'offline'} → ${isOnline ? 'online' : 'offline'}`
      )

      // Notify app about status change
      if (statusChangeCallback) {
        statusChangeCallback(isOnline)
      }

      // When coming back online, sync pending messages
      if (!wasOnline && isOnline) {
        console.log('🔄 Coming online - syncing pending messages')
        await syncPendingMessages()
      }
    })

    console.log('✅ Network monitoring initialized')
  } catch (err) {
    console.error('❌ Network monitoring init failed:', err)
  }
}

/**
 * Check if device is online
 */
export function getConnectionStatus() {
  return {
    isOnline,
    type: 'wifi', // Would need additional implementation for connection type
  }
}

/**
 * Sync pending messages when coming online
 */
async function syncPendingMessages() {
  try {
    const pendingItems = await getPendingSyncItems()

    if (pendingItems.length === 0) {
      console.log('✅ No pending messages to sync')
      return
    }

    console.log(`📤 Syncing ${pendingItems.length} pending messages...`)

    for (const item of pendingItems) {
      try {
        // Update status to processing
        await updateSyncItemStatus(item.id, 'processing')

        // Send message to server
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com'
        const httpUrl = serverUrl.replace(/wss?:/, 'https:').replace('http:', 'http:')

        const response = await fetch(`${httpUrl}/api/messages/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        })

        if (response.ok) {
          // Remove from sync queue
          await removeSyncItem(item.id)
          console.log(`✅ Synced message from ${item.from}`)
        } else {
          // Keep as pending for retry
          await updateSyncItemStatus(item.id, 'pending')
          console.warn(`⚠️ Failed to sync message - will retry`)
        }
      } catch (err) {
        // Network error - keep pending
        await updateSyncItemStatus(item.id, 'pending')
        console.error(`❌ Sync error (will retry): ${err.message}`)
        break // Stop trying if network fails
      }
    }
  } catch (err) {
    console.error('❌ Sync pending messages failed:', err)
  }
}

/**
 * Add message to sync queue if offline
 */
export async function queueMessageIfOffline(message) {
  if (isOnline) {
    return null // Will be sent immediately via WebSocket
  }

  // Import here to avoid circular dependency
  const { addToSyncQueue } = await import('./storage')
  const syncId = await addToSyncQueue(message)
  console.log(`📝 Message queued for sync (ID: ${syncId})`)
  return syncId
}

/**
 * Get network details
 */
export async function getNetworkDetails() {
  try {
    const status = await Network.getStatus()
    return {
      connected: status.connected,
      connectionType: status.connectionType,
      isOnline: status.connected,
    }
  } catch (err) {
    console.error('❌ Failed to get network details:', err)
    return {
      connected: isOnline,
      connectionType: 'unknown',
      isOnline,
    }
  }
}

/**
 * Wait for online before performing action
 */
export function waitForOnline(timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (isOnline) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for online status'))
    }, timeout)

    const checkInterval = setInterval(() => {
      if (isOnline) {
        clearInterval(checkInterval)
        clearTimeout(timer)
        resolve()
      }
    }, 500)
  })
}
