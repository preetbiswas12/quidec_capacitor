import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { motion } from 'motion/react';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { isOnboarded } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOnboarded) {
        navigate('/app');
      } else {
        navigate('/onboarding');
      }
    }, 2800);
    return () => clearTimeout(timer);
  }, [navigate, isOnboarded]);

  return (
    <div className="h-full w-full flex flex-col items-center justify-between bg-[#00A884] overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        {/* WhatsApp-style Icon */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'backOut' }}
          className="relative"
        >
          <div className="w-28 h-28 bg-white rounded-[32px] flex items-center justify-center shadow-2xl">
            <svg viewBox="0 0 48 48" width="72" height="72" fill="none">
              <circle cx="24" cy="24" r="24" fill="#00A884" />
              <path
                d="M24 8C15.163 8 8 15.163 8 24c0 2.96.792 5.733 2.177 8.118L8 40l8.136-2.13A15.934 15.934 0 0024 40c8.837 0 16-7.163 16-16S32.837 8 24 8z"
                fill="white"
              />
              <path
                d="M32.5 27.784c-.457-.228-2.702-1.33-3.12-1.483-.417-.152-.72-.228-.024.457-1.022.228-.993 1.71-1.22 2.39-.228.456-.457.516-.914.290-2.479-1.24-4.11-2.212-5.748-5.015-.434-.748.434-.694 1.239-2.308.152-.304.076-.57-.038-.798-.114-.228-1.022-2.462-1.4-3.37-.368-.884-.742-.762-1.022-.776-.264-.013-.57-.016-.874-.016-.304 0-.798.114-1.216.57-.417.457-1.596 1.558-1.596 3.8s1.634 4.408 1.862 4.712c.228.304 3.212 4.903 7.784 6.882 2.895 1.25 4.03 1.356 5.48 1.142.882-.132 2.702-1.105 3.083-2.174.38-1.069.38-1.985.266-2.174-.11-.19-.417-.304-.873-.532z"
                fill="#00A884"
              />
            </svg>
          </div>
          {/* Ripple rings */}
          <motion.div
            className="absolute inset-0 rounded-[32px] border-4 border-white/30"
            animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-0 rounded-[32px] border-4 border-white/20"
            animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="text-white text-center"
        >
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>WhatsApp</h1>
        </motion.div>
      </div>

      {/* Bottom section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="pb-12 flex flex-col items-center gap-3"
      >
        {/* Loading dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-white/70"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-white/60 text-xs">from</p>
          <p className="text-white/80" style={{ fontSize: '0.875rem', fontWeight: 600 }}>Meta</p>
        </div>
      </motion.div>
    </div>
  );
}