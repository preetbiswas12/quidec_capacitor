import { useEffect } from 'react'
import '../styles/toast.css'

export default function Toast({ 
  message, 
  type = 'info', 
  duration = 3000, 
  onClose 
}) {
  useEffect(() => {
    if (!message) return
    
    const timer = setTimeout(() => {
      onClose?.()
    }, duration)

    return () => clearTimeout(timer)
  }, [message, duration, onClose])

  if (!message) return null

  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">
        {type === 'success' && '✓'}
        {type === 'error' && '✕'}
        {type === 'info' && 'ℹ'}
        {type === 'warning' && '⚠'}
      </span>
      <span className="toast-message">{message}</span>
    </div>
  )
}

export function useToast() {
  const [message, setMessage] = React.useState('')
  const [type, setType] = React.useState('info')

  const show = (msg, toastType = 'info', duration = 3000) => {
    setMessage(msg)
    setType(toastType)
  }

  const close = () => setMessage('')

  return { message, type, show, close }
}
