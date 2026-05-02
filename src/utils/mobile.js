/**
 * Touch interaction utilities for mobile optimization
 */

export function preventTouchZoom(element) {
  if (!element) return

  element.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) {
      e.preventDefault()
    }
  })
}

export function debounce(func, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

export function throttle(func, limit) {
  let inThrottle
  return function (...args) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Detect if device supports touch
 */
export function isTouchDevice() {
  return (
    typeof window !== 'undefined' &&
    (!!navigator.maxTouchPoints ||
      !!navigator.msMaxTouchPoints ||
      ('ontouchstart' in window))
  )
}

/**
 * Get viewport dimensions
 */
export function getViewportSize() {
  return {
    width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
    height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0),
  }
}

/**
 * Check if device is mobile
 */
export function isMobileDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())
}

/**
 * Get safe area insets
 */
export function getSafeAreaInsets() {
  if (typeof window === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 }

  const styles = getComputedStyle(document.documentElement)
  return {
    top: parseFloat(styles.getPropertyValue('--safe-area-inset-top')) || 0,
    bottom: parseFloat(styles.getPropertyValue('--safe-area-inset-bottom')) || 0,
    left: parseFloat(styles.getPropertyValue('--safe-area-inset-left')) || 0,
    right: parseFloat(styles.getPropertyValue('--safe-area-inset-right')) || 0,
  }
}

/**
 * Request fullscreen (for mobile)
 */
export function requestFullscreen(element) {
  if (element.requestFullscreen) {
    return element.requestFullscreen()
  } else if (element.webkitRequestFullscreen) {
    return element.webkitRequestFullscreen()
  } else if (element.mozRequestFullScreen) {
    return element.mozRequestFullScreen()
  } else if (element.msRequestFullscreen) {
    return element.msRequestFullscreen()
  }
}

/**
 * Exit fullscreen
 */
export function exitFullscreen() {
  if (document.exitFullscreen) {
    return document.exitFullscreen()
  } else if (document.webkitExitFullscreen) {
    return document.webkitExitFullscreen()
  } else if (document.mozCancelFullScreen) {
    return document.mozCancelFullScreen()
  } else if (document.msExitFullscreen) {
    return document.msExitFullscreen()
  }
}

/**
 * Vibration feedback (for supported devices)
 */
export function vibrate(pattern = 100) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}

/**
 * Request battery status
 */
export function getBatteryStatus() {
  if (navigator.getBattery) {
    return navigator.getBattery()
  }
  return null
}

/**
 * Handle orientation change
 */
export function onOrientationChange(callback) {
  window.addEventListener('orientationchange', callback)
  window.addEventListener('resize', callback)

  return () => {
    window.removeEventListener('orientationchange', callback)
    window.removeEventListener('resize', callback)
  }
}

/**
 * Get current orientation
 */
export function getOrientation() {
  if (typeof window === 'undefined') return 'portrait'

  const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0
  return Math.abs(angle) === 90 ? 'landscape' : 'portrait'
}

/**
 * Lock screen orientation (requires permission)
 */
export function lockOrientation(orientation = 'portrait') {
  if (window.screen?.orientation?.lock) {
    return window.screen.orientation.lock(orientation)
  }
  return null
}

/**
 * Detect if in standalone mode (PWA)
 */
export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/**
 * Request persistent storage
 */
export function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist()
  }
  return Promise.resolve(false)
}

/**
 * Detect network status
 */
export function getNetworkStatus() {
  if (navigator.connection) {
    return {
      type: navigator.connection.type,
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt,
      saveData: navigator.connection.saveData,
    }
  }
  return { online: navigator.onLine }
}
