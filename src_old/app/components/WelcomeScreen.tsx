import { Lock, Download } from 'lucide-react';
import { motion } from 'motion/react';

export default function WelcomeScreen() {
  return (
    <div className="h-full w-full bg-[#222E35] flex flex-col items-center justify-between py-16 px-8">
      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-52 h-52 rounded-full bg-[#00A884]/10 flex items-center justify-center"
        >
          <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
            <circle cx="60" cy="60" r="60" fill="#00A884" opacity="0.15" />
            <circle cx="60" cy="60" r="44" fill="#00A884" opacity="0.2" />
            <circle cx="60" cy="60" r="28" fill="#00A884" />
            <path
              d="M60 24C40.12 24 24 40.12 24 60c0 6.4 1.74 12.4 4.8 17.56L24 96l19.04-4.98A35.86 35.86 0 0060 96c19.88 0 36-16.12 36-36S79.88 24 60 24z"
              fill="white"
            />
            <path
              d="M76.5 67.2c-1-.5-5.9-2.9-6.8-3.23-.93-.33-1.6-.5-2.27.5-1.77.5-2.17 3.73-2.67 5.2-.5 1-.9 1.13-2 .63-5.43-2.7-9.0-4.83-12.6-10.97-.95-1.63.95-1.52 2.72-5.05.33-.66.16-1.25-.08-1.75-.25-.5-2.24-5.38-3.07-7.37-.8-1.93-1.62-1.66-2.23-1.7-.58-.02-1.25-.03-1.92-.03-.66 0-1.74.25-2.66 1.25-.92 1-3.5 3.4-3.5 8.3s3.58 9.63 4.08 10.3c.5.66 7.02 10.72 17.02 15.05 6.34 2.73 8.82 2.96 11.98 2.5 1.93-.29 5.91-2.42 6.74-4.75.83-2.34.83-4.34.58-4.76-.24-.42-.91-.66-1.91-1.16z"
              fill="#00A884"
            />
          </svg>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h1 className="text-[#E9EDEF] mb-3" style={{ fontSize: '1.75rem', fontWeight: 300 }}>
            WhatsApp
          </h1>
          <p className="text-[#8696A0] max-w-xs mx-auto leading-relaxed" style={{ fontSize: '0.875rem' }}>
            Select a chat to start messaging.
          </p>
          <p className="text-[#8696A0] max-w-xs mx-auto mt-2 leading-relaxed" style={{ fontSize: '0.875rem' }}>
            Your messages are end-to-end encrypted.
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-2 border border-[#00A884] text-[#00A884] px-6 py-2.5 rounded-full hover:bg-[#00A884]/10 transition-colors"
          style={{ fontSize: '0.875rem', fontWeight: 500 }}
        >
          <Download size={16} />
          Get the app
        </motion.button>
      </div>

      {/* Bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-2 text-[#8696A0]"
      >
        <Lock size={12} />
        <span style={{ fontSize: '0.8rem' }}>Your personal messages are end-to-end encrypted</span>
      </motion.div>
    </div>
  );
}