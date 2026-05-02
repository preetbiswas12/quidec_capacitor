import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Mail, Shield, Camera, Check, Copy, AtSign } from 'lucide-react';
import { generateUserId } from '../data/mockData';

export default function Onboarding() {
  const navigate = useNavigate();
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [idCopied, setIdCopied] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSendCode = () => {
    if (!isValidEmail(email)) return;
    setEmailSent(true);
    setStep(2);
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
    if (newOtp.every(d => d !== '') && newOtp.join('').length === 6) {
      setTimeout(() => setIsVerified(true), 300);
      setTimeout(() => setStep(3), 1000);
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleFinish = () => {
    if (!name.trim()) return;
    const userId = generatedId || generateUserId(name);
    completeOnboarding({ name: name.trim(), email, userId, avatar: null, about: 'Hey there! I am using WhatsApp.' });
    navigate('/app');
  };

  const steps = [
    // Step 0: Welcome / Terms
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
          <h1 className="text-[#111B21] mb-3" style={{ fontSize: '1.75rem', fontWeight: 700 }}>Welcome to WhatsApp</h1>
          <p className="text-[#667781] leading-relaxed" style={{ fontSize: '0.9rem' }}>
            Read our <span className="text-[#00A884]">Privacy Policy</span>. Tap "Agree and continue" to accept the{' '}
            <span className="text-[#00A884]">Terms of Service</span>.
          </p>
        </div>
      </div>
      <button
        onClick={() => setStep(1)}
        className="w-full bg-[#00A884] text-white rounded-full py-3.5 flex items-center justify-center gap-2 active:bg-[#008f72] transition-colors"
        style={{ fontWeight: 600, fontSize: '0.95rem' }}
      >
        Agree and continue <ChevronRight size={18} />
      </button>
    </motion.div>,

    // Step 1: Email Address
    <motion.div
      key="email"
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
          <Mail size={32} className="text-[#00A884]" />
        </div>
        <div className="text-center">
          <h2 className="text-[#111B21] mb-2" style={{ fontSize: '1.4rem', fontWeight: 700 }}>Enter your email</h2>
          <p className="text-[#667781]" style={{ fontSize: '0.875rem' }}>
            WhatsApp will send a verification code to your email address.
          </p>
        </div>
        <div className="w-full">
          <div className="border-b-2 border-[#00A884] flex items-center gap-3 py-2">
            <Mail size={18} className="text-[#8696A0]" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 outline-none text-[#111B21] bg-transparent"
              style={{ fontSize: '1.05rem' }}
              autoComplete="email"
            />
          </div>
          {email && !isValidEmail(email) && (
            <p className="text-red-500 mt-2" style={{ fontSize: '0.78rem' }}>
              Please enter a valid email address
            </p>
          )}
        </div>
        <p className="text-[#667781] text-xs text-center px-4">
          A 6-digit verification code will be sent to this address. Standard data rates may apply.
        </p>
      </div>
      <button
        onClick={handleSendCode}
        disabled={!isValidEmail(email)}
        className={`w-full rounded-full py-3.5 flex items-center justify-center gap-2 transition-colors ${isValidEmail(email) ? 'bg-[#00A884] text-white' : 'bg-gray-200 text-gray-400'}`}
        style={{ fontWeight: 600 }}
      >
        Send verification code <ChevronRight size={18} />
      </button>
    </motion.div>,

    // Step 2: OTP Verification
    <motion.div
      key="otp"
      className="flex flex-col h-full px-6 py-12"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
    >
      <button onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); setIsVerified(false); }} className="self-start mb-6 text-[#00A884] flex items-center gap-1">
        <ChevronLeft size={20} />
        <span style={{ fontSize: '0.95rem' }}>Back</span>
      </button>
      <div className="flex flex-col items-center gap-6 flex-1">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${isVerified ? 'bg-[#00A884]' : 'bg-[#00A884]/10'}`}>
          <AnimatePresence mode="wait">
            {isVerified
              ? <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                  <Check size={36} className="text-white" />
                </motion.div>
              : <motion.div key="shield" initial={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Shield size={32} className="text-[#00A884]" />
                </motion.div>
            }
          </AnimatePresence>
        </div>
        <div className="text-center">
          <h2 className="text-[#111B21] mb-2" style={{ fontSize: '1.4rem', fontWeight: 700 }}>Verify your email</h2>
          <p className="text-[#667781]" style={{ fontSize: '0.875rem' }}>
            Enter the 6-digit code sent to<br />
            <span className="text-[#111B21]" style={{ fontWeight: 600 }}>{email}</span>
          </p>
        </div>

        {/* Simulated email preview */}
        {emailSent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-[#f0faf7] border border-[#00A884]/30 rounded-xl p-3 flex items-start gap-3"
          >
            <div className="w-8 h-8 bg-[#00A884] rounded-full flex items-center justify-center flex-shrink-0">
              <Mail size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[#111B21]" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Verification email sent!</p>
              <p className="text-[#667781] mt-0.5" style={{ fontSize: '0.75rem' }}>
                Check your inbox at <strong>{email}</strong>. Use any 6-digit code for demo.
              </p>
            </div>
          </motion.div>
        )}

        <div className="flex gap-3">
          {otp.map((digit, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleOtpChange(e.target.value, i)}
              onKeyDown={e => handleOtpKeyDown(e, i)}
              className={`w-11 h-14 text-center rounded-xl border-2 outline-none text-[#111B21] bg-white transition-all ${digit ? 'border-[#00A884]' : 'border-gray-200'}`}
              style={{ fontSize: '1.4rem', fontWeight: 700 }}
            />
          ))}
        </div>
        <p className="text-[#667781] text-sm">
          Didn't receive the code?{' '}
          <span className="text-[#00A884] cursor-pointer" onClick={() => setEmailSent(true)}>Resend email</span>
        </p>
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
          <h2 className="text-[#111B21] mb-2" style={{ fontSize: '1.4rem', fontWeight: 700 }}>Profile info</h2>
          <p className="text-[#667781]" style={{ fontSize: '0.875rem' }}>
            Please provide your name. Your unique WhatsApp ID will be generated automatically.
          </p>
        </div>
        <div className="w-full space-y-5">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-[#DFE5E7] flex items-center justify-center overflow-hidden">
                <Camera size={32} className="text-[#8696A0]" />
              </div>
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-[#00A884] rounded-full flex items-center justify-center">
                <Camera size={14} className="text-white" />
              </button>
            </div>
          </div>
          <div className="border-b-2 border-[#00A884] flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setGeneratedId(e.target.value.trim() ? generateUserId(e.target.value) : '');
              }}
              placeholder="Your name"
              className="flex-1 outline-none py-3 text-[#111B21] bg-transparent"
              style={{ fontSize: '1.1rem' }}
              maxLength={25}
            />
            <span className="text-[#8696A0] text-xs">{25 - name.length}</span>
          </div>

          {/* Generated ID preview */}
          {generatedId && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#f0faf7] border border-[#00A884]/30 rounded-xl px-4 py-3"
            >
              <p className="text-[#667781] mb-1" style={{ fontSize: '0.75rem' }}>Your WhatsApp ID</p>
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
              <p className="text-[#8696A0] mt-2" style={{ fontSize: '0.72rem' }}>
                Share this ID so others can find and message you.
              </p>
            </motion.div>
          )}

          <p className="text-[#667781] text-xs text-center">
            This name will be visible to your WhatsApp contacts.
          </p>
        </div>
      </div>
      <button
        onClick={handleFinish}
        disabled={!name.trim()}
        className={`w-full rounded-full py-3.5 flex items-center justify-center gap-2 transition-colors ${name.trim() ? 'bg-[#00A884] text-white' : 'bg-gray-200 text-gray-400'}`}
        style={{ fontWeight: 600 }}
      >
        Done <Check size={18} />
      </button>
    </motion.div>,
  ];

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden max-w-md mx-auto">
      {/* Progress bar */}
      <div className="h-1 bg-gray-100 flex-shrink-0">
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