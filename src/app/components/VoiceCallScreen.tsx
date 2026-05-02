import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  PhoneOff, Mic, MicOff, Volume2, VolumeX, Video, MessageSquare, Users, MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function VoiceCallScreen() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contacts } = useApp();
  const contact = contacts.find(c => c.id === contactId);

  const [callState, setCallState] = useState<'calling' | 'connected' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Simulate call being answered
    const connectTimer = setTimeout(() => {
      setCallState('connected');
    }, 2500);

    return () => clearTimeout(connectTimer);
  }, []);

  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const handleEndCall = () => {
    setCallState('ended');
    clearInterval(timerRef.current);
    setTimeout(() => navigate(-1), 1500);
  };

  if (!contact) return null;

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col items-center">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, #1a2a35, #0d1a20)`,
        }}
      />

      {/* Avatar background blur */}
      {contact.avatar && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${contact.avatar})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(30px)',
          }}
        />
      )}

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center h-full w-full max-w-sm mx-auto px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full pt-14 mb-auto">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00A884] animate-pulse" />
            <span className="text-white/80 text-sm">WhatsApp</span>
          </div>
          <button className="text-white/60 hover:text-white p-2">
            <MoreVertical size={20} />
          </button>
        </div>

        {/* Main contact info */}
        <div className="flex flex-col items-center gap-4 mt-8">
          {/* Animated rings */}
          <div className="relative flex items-center justify-center">
            {callState === 'calling' && (
              <>
                {[1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-[#00A884]/30"
                    animate={{
                      width: [90, 90 + i * 40, 90 + i * 40],
                      height: [90, 90 + i * 40, 90 + i * 40],
                      opacity: [0, 0.5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.5,
                    }}
                  />
                ))}
              </>
            )}
            <motion.div
              animate={callState === 'connected' ? { scale: [1, 1.04, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Avatar
                src={contact.avatar}
                name={contact.name}
                color={contact.avatarColor}
                size={90}
              />
            </motion.div>
          </div>

          <div className="text-center">
            <h2 className="text-white" style={{ fontSize: '1.6rem', fontWeight: 300 }}>
              {contact.name}
            </h2>
            <AnimatePresence mode="wait">
              {callState === 'calling' && (
                <motion.div
                  key="calling"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-1 mt-2"
                >
                  <span className="text-white/60" style={{ fontSize: '0.95rem' }}>Calling</span>
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="text-white/60"
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                    >.</motion.span>
                  ))}
                </motion.div>
              )}
              {callState === 'connected' && (
                <motion.p
                  key="connected"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[#00A884] mt-1"
                  style={{ fontSize: '1.1rem', fontWeight: 500, letterSpacing: '2px' }}
                >
                  {formatDuration(duration)}
                </motion.p>
              )}
              {callState === 'ended' && (
                <motion.p
                  key="ended"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-400 mt-1"
                  style={{ fontSize: '0.95rem' }}
                >
                  Call ended
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Status indicators */}
        {callState === 'connected' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-4 bg-white/10 rounded-full px-4 py-1.5"
          >
            <div className="w-2 h-2 rounded-full bg-[#00A884] animate-pulse" />
            <span className="text-white/80 text-xs">End-to-end encrypted</span>
          </motion.div>
        )}

        {/* Controls */}
        <div className="mt-auto mb-16 w-full">
          <div className="grid grid-cols-4 gap-4 mb-8">
            <CallButton
              icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              label={isMuted ? 'Unmute' : 'Mute'}
              active={isMuted}
              onClick={() => setIsMuted(!isMuted)}
            />
            <CallButton
              icon={<Video size={22} />}
              label="Video"
              onClick={() => navigate(`/call/video/${contactId}`)}
            />
            <CallButton
              icon={isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
              label="Speaker"
              active={isSpeakerOn}
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
            />
            <CallButton
              icon={<MessageSquare size={22} />}
              label="Message"
              onClick={() => navigate(-1)}
            />
          </div>

          {/* End call */}
          <div className="flex justify-center">
            <motion.button
              onClick={handleEndCall}
              whileTap={{ scale: 0.9 }}
              className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-xl hover:bg-red-600 transition-colors"
            >
              <PhoneOff size={28} className="text-white" />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallButton({ icon, label, active, onClick }: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 transition-all`}
    >
      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-white text-[#111B21]' : 'bg-white/15 text-white hover:bg-white/25'}`}>
        {icon}
      </div>
      <span className="text-white/70" style={{ fontSize: '0.7rem' }}>{label}</span>
    </button>
  );
}