import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { authService } from '../../utils/firebaseServices';
import { motion } from 'motion/react';
import { Loader2, Mail, ArrowLeft, ChevronRight, Lock } from 'lucide-react';

type ViewMode = 'welcome' | 'auth';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login, register } = useApp();

  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
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

  const handleEnterAuth = () => {
    setViewMode('auth');
    setShowForgotPassword(false);
    setError('');
    setResetSuccess(false);
  };

  const handleBackToWelcome = () => {
    setViewMode('welcome');
    setShowForgotPassword(false);
    setError('');
    setResetSuccess(false);
  };

  const resetToLogin = () => {
    setIsLogin(true);
    setError('');
    setEmailError('');
    setPasswordError('');
    setEmail('');
    setPassword('');
    setUsername('');
  };

  if (showForgotPassword) {
    return (
      <div className="h-full w-full bg-[#0b141a] flex flex-col items-center justify-center p-4">
        <motion.div
          className="w-full max-w-97.5 bg-[#f7f8fa] rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.45)] border border-white/60 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="px-6 pt-8 pb-6 bg-linear-to-b from-[#ffffff] to-[#eef3f5]">
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setResetEmail('');
                setResetSuccess(false);
                setError('');
              }}
              className="inline-flex items-center gap-2 text-[#00A884] text-sm font-medium mb-5"
            >
              <ArrowLeft size={18} />
              Back to login
            </button>

            <div className="text-center space-y-4">
              <div className="mx-auto w-24 h-24 rounded-full bg-[#00A884]/12 flex items-center justify-center">
                <Mail className="w-10 h-10 text-[#00A884]" />
              </div>
              <div>
                <h1 className="text-[#111B21] mb-2" style={{ fontSize: '1.65rem', fontWeight: 700 }}>
                  Reset your password
                </h1>
                <p className="text-[#667781] text-sm leading-relaxed max-w-xs mx-auto">
                  Enter your email and we’ll send a password reset link to continue.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 space-y-4">
            {error && (
              <motion.div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.div>
            )}

            {resetSuccess && (
              <motion.div
                className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Password reset email sent. Check your inbox.
              </motion.div>
            )}

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Enter your email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={resetLoading}
                className="w-full rounded-2xl border border-[#dfe7ea] bg-white px-4 py-3.5 text-[#111B21] outline-none transition focus:border-[#00A884]"
              />

              <button
                type="submit"
                disabled={resetLoading || !resetEmail}
                className="w-full rounded-full bg-[#00A884] px-4 py-3.5 text-white font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {resetLoading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  if (viewMode === 'welcome') {
    return (
      <div className="h-full w-full overflow-hidden bg-[#0b141a] flex items-center justify-center px-4 py-6 relative">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(circle at top, rgba(0,168,132,0.18), transparent 42%), linear-gradient(180deg, #0b141a 0%, #111b21 100%)',
          }}
        />

        <motion.div
          className="relative w-full max-w-97.5 rounded-[30px] overflow-hidden border border-white/60 bg-[#f7f8fa] shadow-[0_28px_90px_rgba(0,0,0,0.5)]"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          <div className="px-6 pt-14 pb-8 flex flex-col items-center text-center min-h-155 justify-between">
            <div className="flex flex-col items-center gap-8">
              <motion.div
                className="w-28 h-28 rounded-full bg-[#00A884]/12 flex items-center justify-center"
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 2.8, repeat: Infinity }}
              >
                <div className="w-20 h-20 rounded-full bg-[#00A884] flex items-center justify-center shadow-[0_12px_30px_rgba(0,168,132,0.35)]">
                  <svg viewBox="0 0 48 48" width="42" height="42" fill="none" aria-hidden="true">
                    <path
                      d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm10 27h-20V17h20v14z"
                      fill="white"
                    />
                  </svg>
                </div>
              </motion.div>

              <div className="space-y-3 max-w-xs">
                <h1 className="text-[#111B21]" style={{ fontSize: '1.85rem', fontWeight: 700 }}>
                  Welcome to Quidec
                </h1>
                <p className="text-[#667781] text-sm leading-relaxed">
                  Read our <span className="text-[#00A884] font-medium">Privacy Policy</span>. Tap &quot;Agree and continue&quot; to accept the{' '}
                  <span className="text-[#00A884] font-medium">Terms of Service</span>.
                </p>
              </div>
            </div>

            <div className="w-full space-y-4">
              <button
                onClick={handleEnterAuth}
                className="w-full rounded-full bg-[#00A884] text-white px-5 py-3.5 flex items-center justify-center gap-2 font-semibold transition active:scale-[0.99] shadow-[0_10px_24px_rgba(0,168,132,0.28)]"
              >
                Agree and continue
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                onClick={handleEnterAuth}
                className="w-full rounded-full border border-[#dfe7ea] bg-white px-5 py-3.5 text-[#111B21] font-medium transition hover:border-[#00A884]/40"
              >
                Already have an account? Login
              </button>

              <div className="flex items-center justify-center gap-2 text-[#667781] text-xs pt-2">
                <Lock size={12} />
                <span>Your personal messages are end-to-end encrypted</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-[#0b141a] flex items-center justify-center px-4 py-6 relative">
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(circle at top, rgba(0,168,132,0.18), transparent 42%), linear-gradient(180deg, #0b141a 0%, #111b21 100%)',
        }}
      />

      <motion.div
        className="relative w-full max-w-97.5 rounded-[30px] overflow-hidden border border-white/60 bg-[#f7f8fa] shadow-[0_28px_90px_rgba(0,0,0,0.5)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="px-6 pt-6 pb-7 bg-linear-to-b from-[#ffffff] to-[#eef3f5]">
          <button
            type="button"
            onClick={handleBackToWelcome}
            className="inline-flex items-center gap-2 text-[#00A884] text-sm font-medium mb-5"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="text-center space-y-4">
            <motion.div
              className="mx-auto w-24 h-24 rounded-full bg-[#00A884]/12 flex items-center justify-center"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.6, repeat: Infinity }}
            >
              <div className="w-16 h-16 rounded-full bg-[#00A884] flex items-center justify-center shadow-[0_12px_30px_rgba(0,168,132,0.35)]">
                <svg viewBox="0 0 48 48" width="36" height="36" fill="none" aria-hidden="true">
                  <path
                    d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4zm10 27h-20V17h20v14z"
                    fill="white"
                  />
                </svg>
              </div>
            </motion.div>

            <div>
              <h1 className="text-[#111B21] mb-2" style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                Quidec
              </h1>
              <p className="text-[#667781] text-sm leading-relaxed">
                Secure real-time chat with Firebase-powered messaging.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {error && (
            <motion.div
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={handleEmailChange}
                disabled={loading}
                className="w-full rounded-2xl border border-[#dfe7ea] bg-white px-4 py-3.5 text-[#111B21] outline-none transition focus:border-[#00A884]"
              />
              {emailError && <p className="text-red-500 text-xs px-1">{emailError}</p>}

              {!isLogin && (
                <>
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={handleUsernameChange}
                    disabled={loading}
                    className="w-full rounded-2xl border border-[#dfe7ea] bg-white px-4 py-3.5 text-[#111B21] outline-none transition focus:border-[#00A884]"
                  />
                  <p className="text-[#667781] text-xs px-1">Pick a display name for your profile.</p>
                </>
              )}

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={handlePasswordChange}
                disabled={loading}
                className="w-full rounded-2xl border border-[#dfe7ea] bg-white px-4 py-3.5 text-[#111B21] outline-none transition focus:border-[#00A884]"
              />
              {passwordError && <p className="text-red-500 text-xs px-1">{passwordError}</p>}
            </div>

            {isLogin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-[#00A884] text-sm font-medium"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !!emailError || !!passwordError}
              className="w-full rounded-full bg-[#00A884] px-4 py-3.5 text-white font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(0,168,132,0.28)]"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Loading...' : isLogin ? 'Login' : 'Create Account'}
            </button>
          </form>

          <div className="pt-2 text-center space-y-3">
            <p className="text-[#667781] text-sm">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
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
                className="text-[#00A884] font-semibold"
              >
                {isLogin ? 'Register' : 'Login'}
              </button>
            </p>

            <button
              type="button"
              onClick={resetToLogin}
              className="w-full rounded-2xl border border-[#dfe7ea] bg-white px-4 py-3 text-[#111B21] font-medium"
            >
              Use a different account
            </button>

            <div className="flex items-center justify-center gap-2 text-[#667781] text-xs pt-1">
              <Lock size={12} />
              <span>Your personal messages are end-to-end encrypted</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
