import { useState } from 'react'
import '../styles/login.css'

export default function LoginScreen({ onLogin, onRegister, loading }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState('')
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const validateUsername = (value) => {
    if (!value) return 'Username is required'
    if (value.length < 3) return 'Username must be at least 3 characters'
    if (value.length > 20) return 'Username must be less than 20 characters'
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Username can only contain letters, numbers, underscores, and hyphens'
    return ''
  }

  const validatePassword = (value) => {
    if (!value) return 'Password is required'
    if (!isLogin && value.length < 6) return 'Password must be at least 6 characters'
    return ''
  }

  const handleUsernameChange = (e) => {
    const value = e.target.value
    setUsername(value)
    setUsernameError(validateUsername(value))
  }

  const handlePasswordChange = (e) => {
    const value = e.target.value
    setPassword(value)
    setPasswordError(validatePassword(value))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setShowRegisterPrompt(false)

    const usernameErr = validateUsername(username)
    const passwordErr = validatePassword(password)

    if (usernameErr || passwordErr) {
      setUsernameError(usernameErr)
      setPasswordError(passwordErr)
      return
    }

    if (isLogin) {
      const result = await onLogin(username, password)
      if (result && result.userNotFound) {
        setShowRegisterPrompt(true)
      } else if (result && result.error) {
        setError(result.error)
      }
    } else {
      const result = await onRegister(username, password)
      if (result && result.error) {
        setError(result.error)
      }
    }
  }

  const handleSwitchToRegister = () => {
    setIsLogin(false)
    setShowRegisterPrompt(false)
    setError('')
    setUsernameError('')
    setPasswordError('')
  }

  const handleSwitchToLogin = () => {
    setIsLogin(true)
    setError('')
    setUsernameError('')
    setPasswordError('')
  }

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <h1 className="login-title">🎭 Quidec</h1>
          <p className="login-subtitle">Encrypted Real-time Chat</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {showRegisterPrompt && (
          <div className="register-prompt">
            <p className="prompt-text">This user doesn't exist yet.</p>
            <p className="prompt-text">Would you like to register?</p>
            <button
              type="button"
              onClick={handleSwitchToRegister}
              className="btn btn-secondary btn-full-width"
            >
              Register Now
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={handleUsernameChange}
              maxLength="20"
              disabled={loading}
              autoComplete={isLogin ? 'username' : 'off'}
              required
            />
            {usernameError && <span className="field-error">{usernameError}</span>}
          </div>

          <div className="form-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={handlePasswordChange}
              disabled={loading}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
            />
            {passwordError && <span className="field-error">{passwordError}</span>}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full-width" 
            disabled={loading || !!usernameError || !!passwordError}
          >
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

        <div className="login-toggle">
          <p className="toggle-text">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            {' '}
            <button
              type="button"
              onClick={isLogin ? handleSwitchToRegister : handleSwitchToLogin}
              disabled={loading}
              className="toggle-btn"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
