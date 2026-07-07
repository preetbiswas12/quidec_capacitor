import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Check, X } from 'lucide-react';

interface SecurityActionModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  email?: string;
  action: 'password' | 'email' | '2fa';
  onClose: () => void;
}

export default function SecurityActionModal({
  isOpen,
  title,
  message,
  email,
  action,
  onClose,
}: SecurityActionModalProps) {
  const [autoClose, setAutoClose] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAutoClose(false);
      const timer = setTimeout(() => {
        setAutoClose(true);
      }, 8000); // Auto close after 8 seconds

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto close if timer expired
  useEffect(() => {
    if (autoClose) {
      onClose();
    }
  }, [autoClose, onClose]);

  const actionConfig = {
    password: {
      icon: '🔐',
      color: 'bg-blue-500/10 border-blue-500/20',
      titleColor: 'text-blue-500',
      buttonColor: 'bg-blue-500 hover:bg-blue-600',
    },
    email: {
      icon: '📧',
      color: 'bg-purple-500/10 border-purple-500/20',
      titleColor: 'text-purple-500',
      buttonColor: 'bg-purple-500 hover:bg-purple-600',
    },
    '2fa': {
      icon: '🔑',
      color: 'bg-green-500/10 border-green-500/20',
      titleColor: 'text-green-500',
      buttonColor: 'bg-green-500 hover:bg-green-600',
    },
  };

  const config = actionConfig[action];

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="w-full max-w-sm mx-4 bg-wa-main border border-wa-accent/30 rounded-2xl shadow-2xl pointer-events-auto overflow-hidden">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 hover:bg-[#202C33] rounded-full transition-colors z-10 group"
              >
                <X size={24} className="text-wa-accent group-hover:text-[#06cf9c]" />
              </button>

              {/* Content */}
              <div className="pt-12 pb-8 px-8 flex flex-col items-center text-center">
                {/* Icon Animation */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.1, type: 'spring', damping: 15, stiffness: 200 }}
                  className={`w-20 h-20 rounded-full ${config.color} border flex items-center justify-center mb-6`}
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-4xl"
                  >
                    {config.icon}
                  </motion.div>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`text-xl font-bold mb-3 ${config.titleColor}`}
                >
                  {title}
                </motion.h2>

                {/* Message */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-wa-text-muted text-sm leading-relaxed mb-4"
                >
                  {message}
                </motion.p>

                {/* Email (if provided) */}
                {email && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="w-full bg-[#202C33] rounded-xl px-4 py-3 mb-6 border border-wa-accent/20 flex items-center gap-3 justify-center"
                  >
                    <Mail size={16} className="text-wa-accent" />
                    <p className="text-wa-text-primary font-semibold text-sm break-all">{email}</p>
                  </motion.div>
                )}

                {/* Next Steps */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="w-full bg-wa-accent/10 rounded-xl px-4 py-3 mb-6 text-left border border-wa-accent/20"
                >
                  <p className="text-wa-accent font-semibold text-xs mb-2">NEXT STEPS:</p>
                  <ol className="text-wa-text-muted text-xs space-y-1">
                    <li>1. Check your inbox and spam folder</li>
                    <li>2. Click the link in the email</li>
                    <li>3. Complete the action on the secure page</li>
                  </ol>
                </motion.div>

                {/* Auto-close timer */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-wa-text-muted text-xs mb-4"
                >
                  Auto-closing in {Math.max(0, Math.round((8000 - (autoClose ? 8000 : 0)) / 1000))}s
                </motion.div>

                {/* Close Button */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  onClick={onClose}
                  className={`w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95 ${config.buttonColor}`}
                >
                  Got It
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
