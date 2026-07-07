import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  PhoneOff, Mic, MicOff, Volume2, VolumeX, Video, MessageSquare, Users, MoreVertical, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';
import services from '../../utils/firebaseServices';
import { getRTCConfig } from '../../utils/iceServers';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

export default function VoiceCallScreen() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contacts, currentUser, saveCallRecord } = useApp();
  const contact = contacts.find(c => c.id === contactId) || (contactId === currentUser?.userId && currentUser ? {
    id: currentUser.userId,
    userId: currentUser.userId,
    name: `${currentUser.name} (You)`,
    avatar: currentUser.avatar,
    avatarColor: '#4D91FB',
    initials: currentUser.name[0]?.toUpperCase() || 'U',
    isOnline: true,
    lastSeen: 'online',
    about: currentUser.about || 'Available'
  } as any : null);

  useEffect(() => {
    if (!contact && !currentUser) {
      navigate('/app');
    }
  }, [contact, currentUser, navigate]);

  if (!contact) return null;

  const [callState, setCallState] = useState<'calling' | 'connected' | 'reconnecting' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const isReceiverRef = useRef(false);
  const callEndedRef = useRef(false);

  const performIceRestart = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !currentUser || callEndedRef.current) return;

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await services.presenceService.sendSignaling(currentUser.userId, contact.id, {
        type: 'webrtc-offer',
        offer,
        callType: 'voice',
        isRestart: true,
      });
    } catch (err) {
      console.error('ICE restart failed:', err);
    }
  }, [currentUser, contact]);

  const handleIceDisconnect = useCallback(() => {
    if (callEndedRef.current || isReconnectingRef.current) return;

    isReconnectingRef.current = true;
    setCallState('reconnecting');

    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    setReconnectAttempt(attempt);

    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.warn('Max reconnection attempts reached');
      callEndedRef.current = true;
      setCallState('ended');
      clearInterval(timerRef.current);
      if (currentUser && contactId) {
        saveCallRecord(contactId, 'voice', isReceiverRef.current ? 'incoming' : 'outgoing', duration).catch(() => {});
      }
      navigateTimerRef.current = setTimeout(() => navigate(-1), 2000);
      return;
    }

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimeoutRef.current = setTimeout(() => {
      isReconnectingRef.current = false;
      performIceRestart();
    }, delay);
  }, [currentUser, contactId, contact, duration, navigate, performIceRestart, saveCallRecord]);

  const initializeCall = useCallback(async () => {
    if (!contact || !currentUser) return;

    const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1]);
    const isReceiver = params.get('received') === 'true';
    isReceiverRef.current = isReceiver;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      
      localStreamRef.current = stream;

      const peerConnection = new RTCPeerConnection(getRTCConfig());
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && !callEndedRef.current) {
          services.presenceService.sendSignaling(currentUser.userId, contact.id, {
            type: 'webrtc-candidate',
            candidate: event.candidate,
          });
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === 'connected') {
          setCallState('connected');
          reconnectAttemptRef.current = 0;
          isReconnectingRef.current = false;
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        if (iceState === 'connected' || iceState === 'completed') {
          setCallState('connected');
          reconnectAttemptRef.current = 0;
          isReconnectingRef.current = false;
        } else if (iceState === 'disconnected') {
          console.warn('ICE connection disconnected');
          handleIceDisconnect();
        } else if (iceState === 'failed') {
          console.error('ICE connection failed');
          handleIceDisconnect();
        }
      };

      if (!isReceiver) {
        console.log('Creating WebRTC offer as caller...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        await services.presenceService.sendSignaling(currentUser.userId, contact.id, {
          type: 'webrtc-offer',
          offer: offer,
          callType: 'voice'
        });
      } else {
        console.log('Waiting for incoming WebRTC offer as receiver...');
      }
    } catch (err) {
      console.error('Failed to initialize call:', err);
      setCallState('ended');
    }
  }, [contact, currentUser, handleIceDisconnect]);

  useEffect(() => {
    if (!contact || !currentUser) return;

    initializeCall();

    const unsubscribeSignaling = services.presenceService.listenToSignaling(currentUser.userId, async (data) => {
      if (data.fromUid !== contact.id || callEndedRef.current) return;

      try {
        if (data.type === 'webrtc-answer' && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === 'webrtc-offer' && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          await services.presenceService.sendSignaling(currentUser.userId, contact.id, {
            type: 'webrtc-answer',
            answer: answer
          });
        } else if (data.type === 'webrtc-candidate' && peerConnectionRef.current && data.candidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            console.warn('Failed to add ICE candidate:', err);
          }
        }
      } catch (err) {
        console.error('Error handling WebRTC signaling:', err);
      }
    });

    return () => {
      unsubscribeSignaling();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [contact, currentUser, initializeCall]);

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

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
  };

  const handleEndCall = () => {
    callEndedRef.current = true;
    setCallState('ended');
    clearInterval(timerRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    if (currentUser && contactId) {
      const isReceiver = new URLSearchParams(window.location.search || window.location.hash.split('?')[1]).get('received') === 'true';
      saveCallRecord(contactId, 'voice', isReceiver ? 'incoming' : 'outgoing', duration).catch(() => {});
    }

    navigateTimerRef.current = setTimeout(() => navigate(-1), 1500);
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
            <div className="w-2 h-2 rounded-full bg-wa-accent animate-pulse" />
            <span className="text-white/80 text-sm">Veill</span>
          </div>
          <button className="text-white/60 hover:text-white p-2">
            <MoreVertical size={20} />
          </button>
        </div>

        {/* Main contact info */}
        <div className="flex flex-col items-center gap-4 mt-8">
          {/* Animated rings */}
          <div className="relative flex items-center justify-center">
            {(callState === 'calling' || callState === 'reconnecting') && (
              <>
                {[1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-wa-accent/30"
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
              {callState === 'reconnecting' && (
                <motion.div
                  key="reconnecting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 mt-2"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <RefreshCw size={14} className="text-yellow-400" />
                  </motion.div>
                  <span className="text-yellow-400" style={{ fontSize: '0.95rem' }}>
                    Reconnecting... ({reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS})
                  </span>
                </motion.div>
              )}
              {callState === 'connected' && (
                <motion.p
                  key="connected"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-wa-accent mt-1"
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
            <div className="w-2 h-2 rounded-full bg-wa-accent animate-pulse" />
            <span className="text-white/80 text-xs">End-to-end encrypted</span>
          </motion.div>
        )}

        {/* Reconnecting banner */}
        {callState === 'reconnecting' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-4 bg-yellow-500/20 rounded-full px-4 py-1.5"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw size={12} className="text-yellow-400" />
            </motion.div>
            <span className="text-yellow-400 text-xs">Connection lost — reconnecting</span>
          </motion.div>
        )}

        {/* Controls */}
        <div className="mt-auto mb-16 w-full">
          <div className="grid grid-cols-4 gap-4 mb-8">
            <CallButton
              icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              label={isMuted ? 'Unmute' : 'Mute'}
              active={isMuted}
              onClick={toggleMute}
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
              onClick={toggleSpeaker}
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
      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-white text-wa-main' : 'bg-white/15 text-white hover:bg-white/25'}`}>
        {icon}
      </div>
      <span className="text-white/70" style={{ fontSize: '0.7rem' }}>{label}</span>
    </button>
  );
}
