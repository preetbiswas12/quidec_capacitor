import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router';
import { PhoneOff, Mic, MicOff, VideoOff, Video, RotateCcw, Maximize2, MessageSquare, Volume2, VolumeX, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

const TURN_SERVERS = [{
  urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
}, {
  urls: ['turn:free.expressturn.com:3478'],
  username: import.meta.env.VITE_TURN_USERNAME ?? '',
  credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
}];

export default function VideoCallScreen() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contacts, currentUser } = useApp();
  const contact = contacts.find(c => c.id === contactId);

  const [callState, setCallState] = useState<'calling' | 'connected' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const ws = (window as any).__ws;
    if (ws) wsRef.current = ws;
  }, []);

  useEffect(() => {
    if (!contact || !currentUser) return;
    const initializeVideoCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: isFrontCamera ? 'user' : 'environment' },
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({ iceServers: TURN_SERVERS });
        peerConnectionRef.current = pc;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
          remoteStreamRef.current.addTrack(event.track);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
        };
        pc.onicecandidate = (event) => {
          if (event.candidate && wsRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'webrtc-candidate', from: currentUser?.userId, to: contact.id, candidate: event.candidate }));
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') setCallState('connected');
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({ type: 'webrtc-offer', from: currentUser?.userId, to: contact.id, offer }));
        }
      } catch (err) {
        console.error('❌ Failed to initialize video call:', err);
        setCallState('ended');
      }
    };
    initializeVideoCall();
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnectionRef.current?.close();
    };
  }, [contact, currentUser, isFrontCamera]);

  useEffect(() => {
    if (!wsRef.current) return;
    const handleMessage = async (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data.type === 'webrtc-answer' && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.type === 'webrtc-candidate' && peerConnectionRef.current && data.candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.warn);
        }
      } catch (err) { console.error('Error handling WebRTC message:', err); }
    };
    wsRef.current.addEventListener('message', handleMessage);
    return () => wsRef.current?.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (callState === 'connected') timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [callState]);

  const handleTap = () => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(!isMuted);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = isCameraOff; });
    setIsCameraOff(!isCameraOff);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleEndCall = () => {
    setCallState('ended');
    clearInterval(timerRef.current);
    setTimeout(() => navigate(-1), 1500);
  };

  const handleFlipCamera = async () => {
    if (!localStreamRef.current) return;
    try {
      localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: !isFrontCamera ? 'user' : 'environment' },
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(videoTrack);
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setIsFrontCamera(!isFrontCamera);
    } catch (err) { console.error('❌ Failed to flip camera:', err); }
  };

  if (!contact) return null;

  return (
    <div className="h-full w-full relative overflow-hidden bg-[#0B141A]" onClick={handleTap}>
      {/* Remote video */}
      <div className="absolute inset-0">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ display: callState === 'connected' ? 'block' : 'none' }} />
        {(callState !== 'connected' || !remoteStreamRef.current) && (
          <>
            {contact.avatar
              ? <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" style={{ filter: callState === 'calling' ? 'blur(8px) brightness(0.4)' : 'brightness(0.7)' }} />
              : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${contact.avatarColor}44, #0B141A)` }}>
                  <Avatar src={null} name={contact.name} color={contact.avatarColor} size={120} />
                </div>
            }
          </>
        )}
        <AnimatePresence>
          {isCameraOff && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#1F2C34] flex items-center justify-center">
              <div className="text-center">
                <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={80} />
                <p className="text-white/50 text-sm mt-3">Camera is off</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Local video thumbnail (draggable) */}
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}
        className="absolute top-20 right-4 w-24 h-36 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-[#1F2C34] z-20"
        drag dragConstraints={{ top: 60, right: 0, bottom: -400, left: -200 }}
      >
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </motion.div>

      {/* Top controls overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-30 pt-12 pb-4 px-6"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}
          >
            <div className="flex items-center justify-between">
              <button onClick={(e) => { e.stopPropagation(); navigate(-1); }} className="text-white/80 hover:text-white p-2"><ChevronDown size={24} /></button>
              <div className="text-center">
                <p className="text-white" style={{ fontWeight: 600 }}>{contact.name}</p>
                <AnimatePresence mode="wait">
                  {callState === 'calling' ? (
                    <motion.div key="calling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-white/60 text-sm">Calling</span>
                        {[0, 1, 2].map(i => (
                          <motion.span key={i} className="text-white/60 text-sm" animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}>.</motion.span>
                        ))}
                      </div>
                    </motion.div>
                  ) : callState === 'connected' ? (
                    <motion.p key="time" className="text-[#00A884] text-sm" style={{ letterSpacing: '2px' }}>{formatDuration(duration)}</motion.p>
                  ) : (
                    <motion.p key="ended" className="text-red-400 text-sm">Call ended</motion.p>
                  )}
                </AnimatePresence>
              </div>
              <button className="text-white/80 hover:text-white p-2" onClick={(e) => e.stopPropagation()}><Maximize2 size={20} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calling animation */}
      <AnimatePresence>
        {callState === 'calling' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="absolute inset-0 flex items-center justify-center z-10">
            <div className="relative flex items-center justify-center">
              {[1, 2, 3].map(i => (
                <motion.div key={i} className="absolute rounded-full border border-white/20"
                  animate={{ width: [80, 80 + i * 50], height: [80, 80 + i * 50], opacity: [0.6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                />
              ))}
              <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={80} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 z-30 pb-12 pt-6 px-8"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <VideoCallBtn icon={isMuted ? <MicOff size={22} /> : <Mic size={22} />} label={isMuted ? 'Unmute' : 'Mute'} active={isMuted} onClick={toggleMute} />
              <VideoCallBtn icon={isCameraOff ? <VideoOff size={22} /> : <Video size={22} />} label={isCameraOff ? 'Start' : 'Stop'} active={isCameraOff} onClick={toggleCamera} />
              <VideoCallBtn icon={isSpeakerMuted ? <VolumeX size={22} /> : <Volume2 size={22} />} label="Speaker" active={isSpeakerMuted} onClick={() => setIsSpeakerMuted(!isSpeakerMuted)} />
              <VideoCallBtn icon={<RotateCcw size={22} />} label="Flip" onClick={handleFlipCamera} />
            </div>
            <div className="flex justify-center">
              <motion.button onClick={handleEndCall} whileTap={{ scale: 0.9 }} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-xl hover:bg-red-600 transition-colors">
                <PhoneOff size={28} className="text-white" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VideoCallBtn({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-white text-[#111B21]' : 'bg-white/20 text-white hover:bg-white/30'}`}>{icon}</div>
      <span className="text-white/70" style={{ fontSize: '0.7rem' }}>{label}</span>
    </button>
  );
}