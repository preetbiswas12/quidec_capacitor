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

    // Platform-specific initialization can go here
    if (platform === 'android' || platform === 'ios') {
      console.log('✅ Running on mobile device')
    } else if (platform === 'web') {
      console.log('✅ Running in web browser (development mode)')
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
