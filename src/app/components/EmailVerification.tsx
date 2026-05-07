import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { authService } from '../../utils/firebaseServices';
import { motion } from 'motion/react';
import { Loader2, Mail, CheckCircle, ArrowLeft } from 'lucide-react';
import { User } from 'firebase/auth';

export default function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, isNewUser } = (location.state as any) || {};

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Auto-check verification status
  useEffect(() => {
    const checkVerification = async () => {
      if (!currentUser) return;

      const updatedUser = await authService.reloadUser();
      if (updatedUser?.emailVerified) {
        setVerified(true);
        setTimeout(() => {
          navigate('/app');
        }, 2000);
      }
    };

    // Check every 3 seconds
    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [currentUser, navigate]);

  // Get current user on mount
  useEffect(() => {
    authService.getCurrentUser().then((user) => {
      if (!user) {
        navigate('/login');
        return;
      }
      setCurrentUser(user);
      if (user.emailVerified) {
        setVerified(true);
        setTimeout(() => navigate('/app'), 2000);
      }
    });
  }, [navigate]);

  const handleResendEmail = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authService.resendEmailVerification();
      setResendSent(true);
      setTimeout(() => setResendSent(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend email');
    } finally {
      setLoading(false);
    }
  };

  const handleManualVerification = async () => {
    setVerifying(true);
    setError('');
    try {
      const updatedUser = await authService.reloadUser();
      if (updatedUser?.emailVerified) {
        setVerified(true);
        setTimeout(() => navigate('/app'), 1500);
      } else {
        setError('Email not verified yet. Please check your inbox.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify email');
    } finally {
      setVerifying(false);
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  if (verified) {
    return (
      <div className="h-full w-full bg-linear-to-b from-[#0a0e27] to-[#111B21] flex flex-col items-center justify-center p-4">
        <motion.div
          className="w-full max-w-sm space-y-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-center space-y-4">
            <motion.div
              className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle className="w-12 h-12 text-green-400" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white">Email Verified!</h1>
            <p className="text-[#8696A0]">Redirecting to app...</p>
          </div>
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
      >
        {/* Header */}
        <button
          onClick={handleBackToLogin}
          className="flex items-center gap-2 text-[#00A884] hover:text-[#008C6E] transition"
        >
          <ArrowLeft size={20} />
          Back to Login
        </button>

        <div className="text-center space-y-2">
          <motion.div
            className="w-20 h-20 mx-auto bg-linear-to-br from-[#00A884] to-[#008C6E] rounded-full flex items-center justify-center shadow-lg"
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Mail className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white">Verify Your Email</h1>
          <p className="text-[#8696A0] text-sm">
            We sent a verification link to <strong>{currentUser?.email || email}</strong>
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-[#1F2937]/50 border border-[#00A884]/20 rounded-lg p-4 space-y-2">
          <p className="text-[#E9EDEF] text-sm">📧 Steps:</p>
          <ol className="text-[#8696A0] text-xs space-y-1 list-decimal list-inside">
            <li>Check your email inbox</li>
            <li>Click the verification link</li>
            <li>Return here and click "I've Verified"</li>
          </ol>
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

        {/* Resend Success Message */}
        {resendSent && (
          <motion.div
            className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-400 text-sm text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            ✅ Verification email resent! Check your inbox.
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleManualVerification}
            disabled={verifying}
            className="w-full px-4 py-3 bg-[#00A884] hover:bg-[#008C6E] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
            {verifying ? 'Checking...' : "I've Verified My Email"}
          </button>

          <button
            onClick={handleResendEmail}
            disabled={loading}
            className="w-full px-4 py-3 bg-[#374151] hover:bg-[#4B5563] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </button>
        </div>

        {/* Spam Info */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-yellow-400 text-xs text-center">
          💡 Didn't receive the email? Check your spam folder or resend it.
        </div>

        {/* New User Info */}
        {isNewUser && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-blue-400 text-xs text-center">
            🎉 Welcome to Quidec! Verify your email to get started with secure messaging.
          </div>
        )}
      </motion.div>
    </div>
  );
}
