import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { authService } from '../../utils/firebaseServices';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Shield, Check, Loader2, ArrowLeft, RefreshCw, LogOut } from 'lucide-react';

export default function EmailVerification() {
  const navigate = useNavigate();
  const { currentUser, needsVerification, logout } = useApp();
  
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState('');

  // Auto-refresh when verified
  useEffect(() => {
    let interval: any;
    if (needsVerification && !verified) {
      interval = setInterval(async () => {
        try {
          const user = await authService.reloadUser();
          if (user?.emailVerified) {
            setVerified(true);
            clearInterval(interval);
            // Update Firestore to mark email as verified
            await authService.updateUserEmailVerified(user.uid);
            // Small delay before redirecting to allow user to see success
            setTimeout(() => {
              navigate('/app', { replace: true });
            }, 2000);
          }
        } catch (err) {
          console.error('Error checking verification:', err);
        }
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [needsVerification, verified, navigate]);

  const handleManualVerify = async () => {
    setVerifying(true);
    setError('');
    try {
      const user = await authService.reloadUser();
      if (user?.emailVerified) {
        setVerified(true);
        // Update Firestore to mark email as verified
        await authService.updateUserEmailVerified(user.uid);
        setTimeout(() => {
          navigate('/app', { replace: true });
        }, 1500);
      } else {
        setError('Email not verified yet. Please check your inbox and click the link.');
      }
    } catch (err) {
      setError('Verification check failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResendSent(true);
    setError('');
    try {
      await authService.resendEmailVerification();
      setTimeout(() => setResendSent(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend. Please wait a minute and try again.');
      setResendSent(false);
    }
  };

  if (!currentUser && !needsVerification) {
    return null;
  }

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden max-w-md mx-auto shadow-2xl relative">
      {/* Header */}
      <div className="px-6 py-8 flex items-center gap-4">
        <button 
          onClick={logout}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-[#111B21]">Email Verification</h1>
      </div>

      <div className="flex-1 px-8 pb-12 flex flex-col items-center justify-center text-center">
        <motion.div 
          className={`w-28 h-28 rounded-full flex items-center justify-center mb-8 transition-all duration-700 ${verified ? 'bg-green-500 shadow-[0_0_40px_rgba(34,197,94,0.4)]' : 'bg-[#00A884]/10'}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <AnimatePresence mode="wait">
            {verified ? (
              <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                <Check size={56} className="text-white" />
              </motion.div>
            ) : (
              <motion.div key="mail" animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <Mail size={48} className="text-[#00A884]" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <h2 className="text-2xl font-extrabold text-[#111B21] mb-4">
          {verified ? 'Success!' : 'Confirm your email'}
        </h2>
        
        <p className="text-[#667781] leading-relaxed mb-8">
          {verified ? (
            "Your email has been verified. We're getting things ready for you..."
          ) : (
            <>
              We've sent a verification link to:<br/>
              <span className="text-[#111B21] font-bold text-lg break-all">{currentUser?.email}</span>
            </>
          )}
        </p>

        {!verified && (
          <div className="w-full space-y-6">
            <div className="bg-[#f0faf7] border border-[#00A884]/20 rounded-2xl p-6 text-left space-y-4">
              <h3 className="text-[#111B21] font-bold flex items-center gap-2">
                <Shield size={18} className="text-[#00A884]" />
                Next Steps
              </h3>
              <ul className="text-sm text-[#667781] space-y-3">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00A884] text-white text-xs flex items-center justify-center flex-shrink-0">1</span>
                  <span>Check your <b>Inbox</b> or <b>Spam</b> folder.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00A884] text-white text-xs flex items-center justify-center flex-shrink-0">2</span>
                  <span>Click the verification button in the email.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#00A884] text-white text-xs flex items-center justify-center flex-shrink-0">3</span>
                  <span>Come back here to start chatting!</span>
                </li>
              </ul>
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-sm font-semibold"
              >
                {error}
              </motion.p>
            )}

            {resendSent && (
              <motion.p 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-[#00A884] text-sm font-bold bg-[#00A884]/5 py-2 rounded-lg"
              >
                ✅ A new verification link is on its way!
              </motion.p>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleManualVerify}
                disabled={verifying}
                className="w-full bg-[#00A884] text-white rounded-full py-4 flex items-center justify-center gap-2 font-bold shadow-xl active:scale-95 transition-all disabled:opacity-50"
              >
                {verifying ? <Loader2 size={24} className="animate-spin" /> : "I've verified my email"}
              </button>

              <button
                onClick={handleResend}
                disabled={resendSent}
                className="w-full py-3 text-[#00A884] font-bold flex items-center justify-center gap-2 hover:bg-[#00A884]/5 rounded-xl transition-colors disabled:text-gray-400"
              >
                <RefreshCw size={18} className={resendSent ? "animate-spin" : ""} />
                Resend verification link
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="pb-8 flex flex-col items-center gap-2 opacity-50">
        <button 
          onClick={logout}
          className="flex items-center gap-2 text-gray-500 font-bold text-sm mb-4 hover:text-red-500 transition-colors"
        >
          <LogOut size={16} />
          Use a different account
        </button>
        <p className="text-[10px] uppercase tracking-widest font-black text-gray-400">Quidec Secure Messaging</p>
      </div>
    </div>
  );
}
