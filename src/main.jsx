import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

// Capacitor initialization for mobile
async function initCapacitor() {
  try {
    // Import Capacitor core - only required if running on actual device
    const { CapacitorException, getPlatform } = await import('@capacitor/core')

    const platform = getPlatform()
    console.log(`📱 Running on platform: ${platform}`)

    // Set viewport properly for mobile
    if (platform === 'android' || platform === 'ios') {
      console.log('✅ Running on mobile device')
      
      // Set status bar style for better appearance
      try {
        const { StatusBar } = await import('@capacitor/status-bar')
        await StatusBar.setStyle({ style: 'DARK' })
        await StatusBar.setBackgroundColor({ color: '#0a0a14' })
        console.log('✅ Status bar configured')
      } catch (err) {
        console.warn('⚠️ Status bar not available:', err.message)
      }
      
      // Configure splash screen
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide()
        console.log('✅ Splash screen hidden')
      } catch (err) {
        console.warn('⚠️ Splash screen not available:', err.message)
      }
    } else if (platform === 'web') {
      console.log('✅ Running in web browser (development mode)')
      
      // Register service worker for PWA capabilities
      if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.log('⚠️ Service Worker registration skipped (may be normal in development):', err.message)
        })
      }
    }
  } catch (err) {
    // Capacitor not available (web development mode)
    console.log('ℹ️  Running in web-only mode')
  }
}

// Initialize Capacitor before rendering
initCapacitor().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

