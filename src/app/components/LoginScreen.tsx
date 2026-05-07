import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { authService } from '../../utils/firebaseServices';
import { motion } from 'motion/react';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login, register } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const validateEmail = (value: string) => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email';
    return '';
  };

  const validateUsername = (value: string) => {
    if (!value && !isLogin) return 'Username is required';
    if (!isLogin && value.length < 3) return 'Username must be at least 3 characters';
    return '';
  };

  const validatePassword = (value: string) => {
    if (!value) return 'Password is required';
    if (!isLogin && value.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setEmailError(validateEmail(value));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordError(validatePassword(value));
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    const usernameErr = !isLogin ? validateUsername(username) : '';

    if (emailErr || passwordErr || usernameErr) {
      setEmailError(emailErr);
      setPasswordError(passwordErr);
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const result = await login(email, password);
        if (result?.emailVerified === false) {
          setError('Please verify your email. Check your inbox or resend verification.');
          setTimeout(() => navigate('/verify-email', { state: { email } }), 2000);
        } else if (result) {
          navigate('/app');
        } else {
          setError('Login failed. Check your credentials.');
        }
      } else {
        const result = await register(email, username, password);
        if (result?.success) {
          setError('');
          navigate('/verify-email', { state: { email, isNewUser: true } });
        } else {
          setError('Registration failed. Try again.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSuccess(false);
    
    if (!resetEmail || !validateEmail(resetEmail)) {
      setError('Enter a valid email');
      return;
    }

    setResetLoading(true);
    try {
      await authService.sendPasswordReset(resetEmail);
      setResetSuccess(true);
      setResetEmail('');
      setTimeout(() => setShowForgotPassword(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="h-full w-full bg-linear-to-b from-[#0a0e27] to-[#111B21] flex flex-col items-center justify-center p-4">
        <motion.div
          className="w-full max-w-sm space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <button
            onClick={() => {
              setShowForgotPassword(false);
              setError('');
              setResetSuccess(false);
              setResetEmail('');
            }}
            className="flex items-center gap-2 text-[#00A884] hover:text-[#008C6E] transition"
          >
            <ArrowLeft size={20} />
            Back to Login
          </button>

          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto bg-linear-to-br from-[#00A884] to-[#008C6E] rounded-3xl flex items-center justify-center shadow-lg">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Reset Password</h1>
            <p className="text-[#8696A0] text-sm">Enter your email to receive a password reset link</p>
          </div>

          {error && (
            <motion.div
              className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          {resetSuccess && (
            <motion.div
              className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-400 text-sm text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              ✅ Password reset email sent! Check your inbox.
            </motion.div>
          )}

          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Enter your email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={resetLoading}
                className="w-full px-4 py-3 bg-[#1F2937] text-white rounded-lg border border-[#374151] focus:border-[#00A884] focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={resetLoading || !resetEmail}
              className="w-full px-4 py-3 bg-[#00A884] hover:bg-[#008C6E] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {resetLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-linear-to-b from-[#0a0e27] to-[#111B21] flex flex-col items-center justify-center p-4">
      <motion.div
        className="w-full max-w-sm space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <motion.div
            className="w-16 h-16 mx-auto bg-linear-to-br from-[#00A884] to-[#008C6E] rounded-3xl flex items-center justify-center shadow-lg"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <svg viewBox="0 0 48 48" width="40" height="40" fill="white">
              <path d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm10 27h-20V17h20v14z" />
            </svg>
          </motion.div>
          <h1 className="text-3xl font-bold text-white">Quidec</h1>
          <p className="text-[#8696A0] text-sm">Secure Real-time Chat</p>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={handleEmailChange}
              disabled={loading}
              className="w-full px-4 py-3 bg-[#1F2937] text-white rounded-lg border border-[#374151] focus:border-[#00A884] focus:outline-none transition"
            />
            {emailError && (
              <p className="text-red-400 text-xs mt-1">{emailError}</p>
            )}
          </div>

          {/* Username Input (Register Only) */}
          {!isLogin && (
            <div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={handleUsernameChange}
                disabled={loading}
                className="w-full px-4 py-3 bg-[#1F2937] text-white rounded-lg border border-[#374151] focus:border-[#00A884] focus:outline-none transition"
              />
            </div>
          )}

          {/* Password Input */}
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={handlePasswordChange}
              disabled={loading}
              className="w-full px-4 py-3 bg-[#1F2937] text-white rounded-lg border border-[#374151] focus:border-[#00A884] focus:outline-none transition"
            />
            {passwordError && (
              <p className="text-red-400 text-xs mt-1">{passwordError}</p>
            )}
          </div>

          {/* Forgot Password Link (Login Only) */}
          {isLogin && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-[#00A884] hover:text-[#008C6E] text-sm transition"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !!emailError || !!passwordError}
            className="w-full px-4 py-3 bg-[#00A884] hover:bg-[#008C6E] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

        {/* Toggle Auth Mode */}
        <div className="text-center">
          <p className="text-[#8696A0] text-sm">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            {' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setEmailError('');
                setPasswordError('');
                setEmail('');
                setPassword('');
                setUsername('');
              }}
              className="text-[#00A884] hover:underline font-medium"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>

        {/* Info Text */}
        <div className="bg-[#1F2937]/50 rounded-lg p-3 text-center">
          <p className="text-[#8696A0] text-xs">
            {isLogin
              ? 'Enter your credentials to continue'
              : 'Create a new account to get started'}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
