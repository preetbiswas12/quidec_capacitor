import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login, register } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateEmail = (value: string) => {
    if (!value) return 'Email/Username is required';
    if (value.length < 3) return 'Must be at least 3 characters';
    if (value.length > 50) return 'Must be less than 50 characters';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);

    if (emailErr || passwordErr) {
      setEmailError(emailErr);
      setPasswordError(passwordErr);
      return;
    }

    setLoading(true);
    try {
      const success = isLogin
        ? await login(email, password)
        : await register(email, password);

      if (success) {
        navigate('/app');
      } else {
        setError(isLogin ? 'Login failed. Please check your credentials.' : 'Registration failed. Try a different username.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
          <div>
            <input
              type="text"
              placeholder="Email or Username"
              value={email}
              onChange={handleEmailChange}
              disabled={loading}
              className="w-full px-4 py-3 bg-[#1F2937] text-white rounded-lg border border-[#374151] focus:border-[#00A884] focus:outline-none transition"
            />
            {emailError && (
              <p className="text-red-400 text-xs mt-1">{emailError}</p>
            )}
          </div>

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
