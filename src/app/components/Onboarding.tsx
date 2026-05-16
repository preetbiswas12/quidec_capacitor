import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import services from '../../utils/firebaseServices';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Mail, Shield, Camera, Check, Copy, AtSign, Loader2, Lock, User as UserIcon } from 'lucide-react';
const { authService } = services;

export default function Onboarding() {
  const navigate = useNavigate();
  const { login, register, updateCurrentUser } = useApp();
  
  // State
  const [step, setStep] = useState(0); // 0: Welcome, 1: Auth (Login/Reg), 2: Verify, 3: Profile
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form Data
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [idCopied, setIdCopied] = useState(false);
  
  // Verification State
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ─── Verification Polling ──────────────────────────────────────────────────
  
  useEffect(() => {
    let interval: any;
    if (step === 2 && !verified) {
      interval = setInterval(async () => {
        const user = await authService.reloadUser();
        if (user?.emailVerified) {
          setVerified(true);
          clearInterval(interval);
          setTimeout(() => setStep(3), 1500);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [step, verified]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email) || password.length < 6) return;
    
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const result = await login(email, password);
        if (result?.emailVerified === false) {
          setStep(2);
        } else if (result) {
          navigate('/app');
        }
      } else {
        const result = await register(email, username, password);
        if (result?.success) {
          setStep(2);
        }
      }
    } catch (err: any) {
      // User-friendly error mapping
      switch (err.code) {
        case 'auth/invalid-credential':
          setError('Incorrect email or password. Please try again or register.');
          break;
        case 'auth/user-not-found':
          setError('No account found with this email. Please register first.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password. Please try again.');
          break;
        case 'auth/email-already-in-use':
          setError('An account already exists with this email.');
          break;
        case 'auth/weak-password':
          setError('Password is too weak (min 6 characters).');
          break;
        default:
          setError('Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualVerify = async () => {
    setVerifying(true);
    setError('');
    try {
      const user = await authService.reloadUser();
      if (user?.emailVerified) {
        setVerified(true);
        setTimeout(() => setStep(3), 1000);
      } else {
        setError('Email not verified yet. Please click the link in your inbox.');
      }
    } catch (err) {
      setError('Verification check failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResendSent(true);
    try {
      await authService.resendEmailVerification();
      setTimeout(() => setResendSent(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend');
    }
  };

  const handleFinish = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      // Use the already generated unique ID
      const userId = generatedId;
      await updateCurrentUser({ name: name.trim(), userId, about: 'Available' });
      navigate('/app');
    } catch (err) {
      setError('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Real-time Unique ID Generation ───────────────────────────────────────
  useEffect(() => {
    if (!name.trim()) {
      setGeneratedId('');
      return;
    }

    const timer = setTimeout(async () => {
      const uniqueId = await services.generateUniqueUserId(name);
      setGeneratedId(uniqueId);
    }, 500); // Debounce to avoid too many Firestore lookups

    return () => clearTimeout(timer);
  }, [name]);

  const steps = [
    // Step 0: Welcome
    <motion.div
      key="welcome"
      className="flex flex-col items-center justify-between h-full px-8 py-12"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
    >
      <div />
      <div className="flex flex-col items-center gap-8">
        <div className="w-36 h-36 bg-[#00A884]/10 rounded-full flex items-center justify-center">
          <svg viewBox="0 0 48 48" width="80" height="80" fill="none">
            <circle cx="24" cy="24" r="24" fill="#00A884" />
            <path d="M24 8C15.163 8 8 15.163 8 24c0 2.96.792 5.733 2.177 8.118L8 40l8.136-2.13A15.934 15.934 0 0024 40c8.837 0 16-7.163 16-16S32.837 8 24 8z" fill="white" />
            <path d="M32.5 27.784c-.457-.228-2.702-1.33-3.12-1.483-.417-.152-.72-.228-.024.457-1.022.228-.993 1.71-1.22 2.39-.228.456-.457.516-.914.290-2.479-1.24-4.11-2.212-5.748-5.015-.434-.748.434-.694 1.239-2.308.152-.304.076-.57-.038-.798-.114-.228-1.022-2.462-1.4-3.37-.368-.884-.742-.762-1.022-.776-.264-.013-.57-.016-.874-.016-.304 0-.798.114-1.216.57-.417.457-1.596 1.558-1.596 3.8s1.634 4.408 1.862 4.712c.228.304 3.212 4.903 7.784 6.882 2.895 1.25 4.03 1.356 5.48 1.142.882-.132 2.702-1.105 3.083-2.174.38-1.069.38-1.985.266-2.174-.11-.19-.417-.304-.873-.532z" fill="#00A884" />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="text-[#111B21] mb-3" style={{ fontSize: '1.75rem', fontWeight: 700 }}>Welcome to Quidec</h1>
          <p className="text-[#667781] leading-relaxed" style={{ fontSize: '0.9rem' }}>
            Secure messaging powered by Firebase. Tap "Get Started" to create your account or login.
          </p>
        </div>
      </div>
      <button
        onClick={() => setStep(1)}
        className="w-full bg-[#00A884] text-white rounded-full py-3.5 flex items-center justify-center gap-2 active:bg-[#008f72] transition-colors shadow-lg"
        style={{ fontWeight: 600, fontSize: '0.95rem' }}
      >
        Get Started <ChevronRight size={18} />
      </button>
    </motion.div>,

    // Step 1: Auth (Login/Register)
    <motion.div
      key="auth"
      className="flex flex-col h-full px-6 py-12"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
    >
      <button onClick={() => setStep(0)} className="self-start mb-6 text-[#00A884] flex items-center gap-1">
        <ChevronLeft size={20} />
        <span style={{ fontSize: '0.95rem' }}>Back</span>
      </button>
      <div className="flex flex-col items-center gap-6 flex-1">
        <div className="w-20 h-20 bg-[#00A884]/10 rounded-full flex items-center justify-center">
          {isLogin ? <Lock size={32} className="text-[#00A884]" /> : <UserIcon size={32} className="text-[#00A884]" />}
        </div>
        <div className="text-center">
          <h2 className="text-[#111B21] mb-2" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-[#667781]" style={{ fontSize: '0.875rem' }}>
            {isLogin ? 'Login to your Quidec account' : 'Sign up for secure messaging'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="w-full bg-gray-100 p-1 rounded-full flex">
          <button 
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${isLogin ? 'bg-white text-[#00A884] shadow-sm' : 'text-gray-500'}`}
          >
            Login
          </button>
          <button 
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${!isLogin ? 'bg-white text-[#00A884] shadow-sm' : 'text-gray-500'}`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="w-full bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleAuthSubmit} className="w-full space-y-4">
          <div className="space-y-3">
            <div className="border-b-2 border-gray-100 focus-within:border-[#00A884] flex items-center gap-3 py-2 transition-colors">
              <Mail size={18} className="text-[#8696A0]" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 outline-none text-[#111B21] bg-transparent"
                style={{ fontSize: '1rem' }}
                required
              />
            </div>

            {!isLogin && (
              <div className="border-b-2 border-gray-100 focus-within:border-[#00A884] flex items-center gap-3 py-2 transition-colors">
                <AtSign size={18} className="text-[#8696A0]" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Username"
                  className="flex-1 outline-none text-[#111B21] bg-transparent"
                  style={{ fontSize: '1rem' }}
                  required={!isLogin}
                />
              </div>
            )}

            <div className="border-b-2 border-gray-100 focus-within:border-[#00A884] flex items-center gap-3 py-2 transition-colors">
              <Shield size={18} className="text-[#8696A0]" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="flex-1 outline-none text-[#111B21] bg-transparent"
                style={{ fontSize: '1rem' }}
                required
                minLength={6}
              />
            </div>
          </div>

          {isLogin && (
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={async () => {
                  if (!isValidEmail(email)) {
                    setError('Please enter your email first to reset password');
                    return;
                  }
                  try {
                    await authService.sendPasswordReset(email);
                    setError('Password reset link sent to your email!');
                  } catch (e) {
                    setError('Failed to send reset link');
                  }
                }}
                className="text-xs text-[#00A884] font-medium"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isValidEmail(email) || password.length < 6}
            className={`w-full rounded-full py-3.5 flex items-center justify-center gap-2 transition-all mt-2 ${loading ? 'bg-gray-100' : 'bg-[#00A884] text-white shadow-md'}`}
            style={{ fontWeight: 600 }}
          >
            {loading ? <Loader2 size={20} className="animate-spin text-[#00A884]" /> : (isLogin ? 'Login' : 'Sign Up')}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>

        <p className="text-[#667781] text-sm pt-2">
          {isLogin ? "New to Quidec?" : "Have an account?"}{' '}
          <span 
            className="text-[#00A884] font-semibold cursor-pointer" 
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Create one' : 'Login here'}
          </span>
        </p>
      </div>
    </motion.div>,

    // Step 2: Email Verification
    <motion.div
      key="verify"
      className="flex flex-col h-full px-6 py-12"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
    >
      <div className="flex flex-col items-center gap-6 flex-1 text-center">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-700 ${verified ? 'bg-green-500 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : 'bg-[#00A884]/10 animate-pulse'}`}>
          <AnimatePresence mode="wait">
            {verified
              ? <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }}>
                  <Check size={48} className="text-white" />
                </motion.div>
              : <motion.div key="mail" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                  <Mail size={40} className="text-[#00A884]" />
                </motion.div>
            }
          </AnimatePresence>
        </div>
        
        <div className="space-y-3">
          <h2 className="text-[#111B21]" style={{ fontSize: '1.6rem', fontWeight: 800 }}>
            {verified ? 'Email Verified!' : 'Verify your email'}
          </h2>
          <p className="text-[#667781] leading-relaxed" style={{ fontSize: '0.95rem' }}>
            {verified 
              ? "Great! Your account is now active. Let's finish setting up your profile."
              : <>A verification link has been sent to:<br/><span className="text-[#111B21] font-bold">{email}</span></>
            }
          </p>
        </div>

        {!verified && (
          <div className="w-full space-y-4 pt-4">
            <div className="bg-[#f0faf7] border border-[#00A884]/20 rounded-2xl p-5 text-left space-y-3">
              <p className="text-[#111B21] text-sm font-bold flex items-center gap-2">
                <Shield size={16} className="text-[#00A884]" />
                How to verify:
              </p>
              <ul className="text-[#667781] text-sm space-y-2.5">
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#00A884] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <span>Open your email app and find the mail from <b>Quidec</b>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#00A884] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <span>Click the <b>verification link</b> inside the email.</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#00A884] text-white text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <span>Return here to automatically continue.</span>
                </li>
              </ul>
            </div>

            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            {resendSent && <p className="text-[#00A884] text-sm font-medium animate-bounce">✅ New link sent to your inbox!</p>}

            <div className="space-y-3 pt-2">
              <button
                onClick={handleManualVerify}
                disabled={verifying}
                className="w-full bg-[#00A884] text-white rounded-full py-4 flex items-center justify-center gap-2 font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-70"
              >
                {verifying ? <Loader2 size={20} className="animate-spin" /> : "I've Verified My Email"}
              </button>
              
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleResend}
                  className="text-[#00A884] py-2 text-sm font-bold hover:underline"
                >
                  Resend verification email
                </button>
                <button
                  onClick={() => { setStep(1); setIsLogin(true); setError(''); }}
                  className="text-gray-400 py-2 text-sm font-medium flex items-center justify-center gap-1"
                >
                  <ChevronLeft size={16} /> Back to login
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>,

    // Step 3: Profile Setup
    <motion.div
      key="profile"
      className="flex flex-col h-full px-6 py-12"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
    >
      <div className="flex flex-col items-center gap-6 flex-1">
        <div className="w-20 h-20 bg-[#00A884]/10 rounded-full flex items-center justify-center">
          <Camera size={32} className="text-[#00A884]" />
        </div>
        <div className="text-center">
          <h2 className="text-[#111B21] mb-2" style={{ fontSize: '1.4rem', fontWeight: 700 }}>Almost there</h2>
          <p className="text-[#667781]" style={{ fontSize: '0.875rem' }}>
            Set your display name and your unique Quidec ID will be ready.
          </p>
        </div>
        <div className="w-full space-y-5">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-[#DFE5E7] flex items-center justify-center overflow-hidden">
                <Camera size={32} className="text-[#8696A0]" />
              </div>
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-[#00A884] rounded-full flex items-center justify-center shadow-md">
                <Camera size={14} className="text-white" />
              </button>
            </div>
          </div>
          <div className="border-b-2 border-[#00A884] flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Display Name"
              className="flex-1 outline-none py-3 text-[#111B21] bg-transparent"
              style={{ fontSize: '1.1rem' }}
              maxLength={25}
            />
            <span className="text-[#8696A0] text-xs">{25 - name.length}</span>
          </div>

          {generatedId && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#f0faf7] border border-[#00A884]/30 rounded-xl px-4 py-3"
            >
              <p className="text-[#667781] mb-1" style={{ fontSize: '0.75rem' }}>Your Unique ID</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AtSign size={16} className="text-[#00A884]" />
                  <span className="text-[#111B21]" style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.5px' }}>
                    {generatedId}
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedId).catch(() => {});
                    setIdCopied(true);
                    setTimeout(() => setIdCopied(false), 2000);
                  }}
                  className="text-[#00A884] flex items-center gap-1"
                  style={{ fontSize: '0.78rem' }}
                >
                  {idCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
      <button
        onClick={handleFinish}
        disabled={!name.trim()}
        className={`w-full rounded-full py-3.5 flex items-center justify-center gap-2 transition-all ${name.trim() ? 'bg-[#00A884] text-white shadow-lg' : 'bg-gray-200 text-gray-400'}`}
        style={{ fontWeight: 600 }}
      >
        Done <Check size={18} />
      </button>
    </motion.div>,
  ];

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden max-w-md mx-auto shadow-2xl">
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 flex-shrink-0">
        <motion.div
          className="h-full bg-[#00A884]"
          animate={{ width: `${(step / 3) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {steps[step]}
        </AnimatePresence>
      </div>
    </div>
  );
}