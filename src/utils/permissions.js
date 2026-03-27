/**
 * Capacitor permissions handler
 * Manages camera, microphone, notifications, and storage permissions
 */

import { App } from '@capacitor/app'

export const PERMISSIONS = {
  CAMERA: 'camera',
  MICROPHONE: 'microphone',
  NOTIFICATIONS: 'notifications',
  CONTACTS: 'contacts',
  STORAGE: 'storage',
}

/**
 * Request camera and microphone permissions
 * Required for video/audio calls
 */
export async function requestCameraAndMicPermissions() {
  try {
    const permissions = await App.getPermissionStates(['camera', 'microphone'])

    const cameraState = permissions.camera
    const micState = permissions.microphone

    if (cameraState === 'granted' && micState === 'granted') {
      console.log('✅ Camera and mic permissions already granted')
      return true
    }

    // Request permissions
    if (cameraState !== 'granted') {
      const result = await App.requestPermissions(['camera'])
      console.log('🎥 Camera permission result:', result)
    }

    if (micState !== 'granted') {
      const result = await App.requestPermissions(['microphone'])
      console.log('🎤 Microphone permission result:', result)
    }

    // Check final state
    const finalPerms = await App.getPermissionStates(['camera', 'microphone'])
    return finalPerms.camera === 'granted' && finalPerms.microphone === 'granted'
  } catch (err) {
    console.error('❌ Permission request failed:', err)
    return false
  }
}

/**
 * Request notification permissions
 * Required for Firebase Cloud Messaging
 */
export async function requestNotificationPermission() {
  try {
    const permissions = await App.getPermissionStates(['notifications'])

    if (permissions.notifications === 'granted') {
      console.log('✅ Notification permissions already granted')
      return true
    }

    const result = await App.requestPermissions(['notifications'])
    console.log('🔔 Notification permission result:', result)

    return result.notifications === 'granted'
  } catch (err) {
    console.error('❌ Notification permission failed:', err)
    return false
  }
}

/**
 * Request storage permissions (for media files)
 */
export async function requestStoragePermission() {
  try {
    const permissions = await App.getPermissionStates(['storage'])

    if (permissions.storage === 'granted') {
      console.log('✅ Storage permissions already granted')
      return true
    }

    const result = await App.requestPermissions(['storage'])
    console.log('💾 Storage permission result:', result)

    return result.storage === 'granted'
  } catch (err) {
    console.error('❌ Storage permission failed:', err)
    return false
  }
}

/**
 * Check all required permissions for calling features
 */
export async function checkCallingPermissions() {
  try {
    const perms = await App.getPermissionStates(['camera', 'microphone', 'notifications'])

    return {
      camera: perms.camera === 'granted',
      microphone: perms.microphone === 'granted',
      notifications: perms.notifications === 'granted',
    }
  } catch (err) {
    console.error('❌ Permission check failed:', err)
    return {
      camera: false,
      microphone: false,
      notifications: false,
    }
  }
}

/**
 * Setup permission listeners (Android 6.0+)
 */
export function setupPermissionListeners() {
  // Listen for permissions changes
  App.addListener('appPermissionStatusChanged', ({ permission, status }) => {
    console.log(`📱 Permission changed - ${permission}: ${status}`)
  })

  // Listen for app resume
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      console.log('📱 App resumed - checking permissions')
      checkCallingPermissions().then((perms) => {
        if (!perms.camera || !perms.microphone || !perms.notifications) {
          console.warn('⚠️ Some permissions were revoked')
        }
      })
    }
  })
}
