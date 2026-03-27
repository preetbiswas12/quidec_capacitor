import { useState } from 'react'
import '../styles/login.css'

export default function LoginScreen({ onLogin, onRegister, loading }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState('')
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setShowRegisterPrompt(false)

    if (!username || !password) {
      setError('Enter username and password')
      return
    }

    if (!isLogin && password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (isLogin) {
      const result = await onLogin(username, password)
      // Check if user not found
      if (result && result.userNotFound) {
        setShowRegisterPrompt(true)
      }
    } else {
      await onRegister(username, password)
    }
  }

  const handleSwitchToRegister = () => {
    setIsLogin(false)
    setShowRegisterPrompt(false)
    setError('')
  }

  return (
    <div className="login-screen">
      <div className="login-container">
        <h1 className="login-title">🎭 0408</h1>

        {error && <div className="error-message">{error}</div>}

        {showRegisterPrompt && (
          <div className="register-prompt">
            <p>This user doesn't exist yet.</p>
            <p>Would you like to register first?</p>
            <button
              type="button"
              onClick={handleSwitchToRegister}
              className="btn btn-secondary"
            >
              Register Now
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength="20"
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>

        <div className="login-toggle">
          <p>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            {' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin)
                setError('')
                setShowRegisterPrompt(false)
              }}
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
