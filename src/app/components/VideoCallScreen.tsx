import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  PhoneOff, Mic, MicOff, Video, VideoOff, RotateCcw,
  Volume2, VolumeX, MessageSquare, Users,
} from 'lucide-react';
import { MediaConnection } from 'peerjs';
import { useApp } from '../context/AppContext';
import peerService from '../../utils/peerService';
import firebaseCallManager, { CallSession } from '../../utils/firebaseCallManager';
import Avatar from './Avatar';

interface VideoCallScreenProps {
  callId?: string;
  remotePeerId?: string;
  isIncoming?: boolean;
}

type CallState = 'initializing' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'error';

export default function VideoCallScreen(props: VideoCallScreenProps) {
  const { id: routeCallId } = useParams<{ id?: string }>();
  const { id: routeRemoteId } = useParams<{ id: string; }>();
  const navigate = useNavigate();
  const { currentUser, contacts, saveCallRecord } = useApp();

  const callId = props.callId || routeCallId || `call_${Date.now()}`;
  const remoteUserId = props.remotePeerId || routeRemoteId;
  const isIncoming = props.isIncoming !== undefined ? props.isIncoming : new URLSearchParams(window.location.search).get('received') === 'true';

  // State
  const [callState, setCallState] = useState<CallState>('initializing');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callSessionData, setCallSessionData] = useState<CallSession | null>(null);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<MediaConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const unsubscribeCallRef = useRef<(() => void) | null>(null);
  const unsubscribeCallListenerRef = useRef<(() => void) | null>(null);

  const remoteContact = contacts.find((c) => c.id === remoteUserId);

  /**
   * Format call duration (MM:SS)
   */
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Get local media stream
   */
  const getLocalStream = useCallback(async (): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: isFrontCamera ? 'user' : 'environment',
        },
      });

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (err: any) {
      const errorMsg = `Failed to access camera/microphone: ${err.message}`;
      console.error(errorMsg);
      setErrorMessage(errorMsg);
      throw err;
    }
  }, [isFrontCamera]);

  /**
   * Stop all media tracks
   */
  const stopMediaTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      remoteStreamRef.current = null;
    }
  }, []);

  /**
   * Initialize PeerJS and listen for incoming calls (receiver only)
   */
  const setupPeerListener = useCallback(() => {
    try {
      if (!isIncoming) return;

      unsubscribeCallListenerRef.current = peerService.onIncomingCall(
        (incomingCall: MediaConnection) => {
          console.log(`📱 Incoming call from ${incomingCall.peer}`);
          peerConnectionRef.current = incomingCall;

          incomingCall.on('stream', (remoteStream: MediaStream) => {
            console.log('🎬 Remote stream received');
            remoteStreamRef.current = remoteStream;
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            setCallState('connected');
          });

          incomingCall.on('error', (err) => {
            console.error('Incoming call error:', err);
            setErrorMessage(`Call error: ${err.message}`);
            setCallState('error');
          });

          incomingCall.on('close', () => {
            console.log('Incoming call closed');
            handleEndCall();
          });
        }
      );
    } catch (err) {
      console.error('Failed to setup peer listener:', err);
    }
  }, [isIncoming]);

  /**
   * Initialize call as caller
   */
  const initializeOutgoingCall = useCallback(async () => {
    try {
      setCallState('initializing');

      // Initialize PeerJS
      if (!peerService.isInitialized()) {
        console.log('Initializing PeerJS...');
        await peerService.initialize({
          userId: currentUser?.userId || '',
          debug: false,
        });
      }

      // Get local stream
      console.log('Getting local media stream...');
      const localStream = await getLocalStream();

      // Create Firebase call document
      console.log('Creating call document in Firestore...');
      await firebaseCallManager.initiateCall(callId, currentUser?.userId ?? '', remoteUserId ?? '', {
        callerName: currentUser?.name ?? undefined,
        callerAvatar: currentUser?.avatar ?? undefined,
        callType: 'video',
      });

      // Setup Firebase listener to watch for acceptance
      unsubscribeCallRef.current = firebaseCallManager.listenToCall(
        callId,
        async (callData) => {
          if (!callData) return;

          setCallSessionData(callData);

          if (callData.status === 'accepted') {
            console.log('✅ Call accepted by receiver');
            try {
              setCallState('connecting');

              // Initiate WebRTC call
              const call = await peerService.initiateCall(remoteUserId ?? '', localStream);
              peerConnectionRef.current = call;

              call.on('stream', (remoteStream: MediaStream) => {
                console.log('🎬 Remote stream received');
                remoteStreamRef.current = remoteStream;
                if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStream;
                }
                setCallState('connected');
              });

              call.on('error', (err) => {
                console.error('WebRTC call error:', err);
                setErrorMessage(`WebRTC error: ${err.message}`);
                setCallState('error');
              });

              call.on('close', () => {
                console.log('WebRTC call closed');
                handleEndCall();
              });
            } catch (err: any) {
              console.error('Failed to establish WebRTC connection:', err);
              setErrorMessage(err.message);
              setCallState('error');
              await firebaseCallManager.endCall(callId);
              if (currentUser && remoteUserId) {
                saveCallRecord(remoteUserId, 'video', 'outgoing', 0).catch(() => {});
              }
            }
          } else if (callData.status === 'rejected' || callData.status === 'missed') {
            console.log('Call rejected or missed');
            setCallState('ended');
            handleEndCall();
          } else if (callData.status === 'ended') {
            console.log('Call ended by remote user');
            handleEndCall();
          }
        }
      );

      setCallState('ringing');
    } catch (err: any) {
      console.error('Failed to initialize outgoing call:', err);
      setErrorMessage(err.message);
      setCallState('error');
    }
  }, [callId, currentUser, remoteUserId, getLocalStream]);

  /**
   * Handle incoming call acceptance
   */
  const handleAcceptCall = useCallback(async () => {
    try {
      setCallState('initializing');

      // Initialize PeerJS
      if (!peerService.isInitialized()) {
        console.log('Initializing PeerJS for receiver...');
        await peerService.initialize({
          userId: currentUser?.userId || '',
          debug: false,
        });
      }

      // Get local stream
      console.log('Getting local media stream...');
      const localStream = await getLocalStream();

      // Accept call in Firestore
      console.log('Accepting call...');
      await firebaseCallManager.acceptCall(callId);

      // Setup to handle incoming WebRTC call
      peerService.onIncomingCall((incomingCall: MediaConnection) => {
        console.log(`📱 Incoming WebRTC call from ${incomingCall.peer}`);
        peerConnectionRef.current = incomingCall;

        // Answer the call
        peerService.answerCall(incomingCall, localStream).catch((err) => {
          console.error('Failed to answer call:', err);
          setErrorMessage(err.message);
          setCallState('error');
        });

        incomingCall.on('stream', (remoteStream: MediaStream) => {
          console.log('🎬 Remote stream received');
          remoteStreamRef.current = remoteStream;
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          setCallState('connected');
        });

        incomingCall.on('error', (err) => {
          console.error('Incoming call error:', err);
          setErrorMessage(err.message);
          setCallState('error');
        });

        incomingCall.on('close', () => {
          console.log('Incoming call closed');
          handleEndCall();
        });
      });

      setCallState('connecting');
    } catch (err: any) {
      console.error('Failed to accept call:', err);
      setErrorMessage(err.message);
      setCallState('error');
      try {
        await firebaseCallManager.rejectCall(callId);
      } catch (rejectErr) {
        console.error('Failed to reject call:', rejectErr);
      }
    }
  }, [callId, currentUser, getLocalStream]);

  /**
   * Handle call rejection
   */
  const handleRejectCall = useCallback(async () => {
    try {
      console.log('Rejecting call...');
      await firebaseCallManager.rejectCall(callId);
      setCallState('ended');
      navigate(-1);
    } catch (err: any) {
      console.error('Failed to reject call:', err);
    }
  }, [callId, navigate]);

  /**
   * Handle call termination
   */
  const handleEndCall = useCallback(async () => {
    try {
      console.log('Ending call...');

      // Close PeerJS connection
      await peerService.hangUp();

      // Stop media tracks
      stopMediaTracks();

      // Update Firestore call session
      await firebaseCallManager.endCall(callId);

      // Save call history record with duration
      if (currentUser && remoteUserId) {
        saveCallRecord(remoteUserId, 'video', isIncoming ? 'incoming' : 'outgoing', duration).catch(() => {});
      }

      // Cleanup
      if (timerRef.current) clearInterval(timerRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (unsubscribeCallRef.current) unsubscribeCallRef.current();
      if (unsubscribeCallListenerRef.current) unsubscribeCallListenerRef.current();

      setCallState('ended');

      // Navigate back after 2 seconds
      setTimeout(() => {
        navigate(-1);
      }, 2000);
    } catch (err) {
      console.error('Error ending call:', err);
      navigate(-1);
    }
  }, [callId, stopMediaTracks, navigate]);

  /**
   * Toggle mute
   */
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  /**
   * Toggle camera
   */
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = isCameraOff;
      });
    }
    setIsCameraOff(!isCameraOff);
  }, [isCameraOff]);

  /**
   * Flip camera
   */
  const handleFlipCamera = useCallback(async () => {
    try {
      setIsFrontCamera(!isFrontCamera);

      // Stop current video track
      localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());

      // Get new stream with flipped camera
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: !isFrontCamera ? 'user' : 'environment',
        },
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (peerConnectionRef.current && videoTrack) {
        const sender = peerConnectionRef.current.peerConnection?.getSenders?.()
          .find((s: any) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      }

      // Update local stream
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to flip camera:', err);
    }
  }, [isFrontCamera]);

  /**
   * Handle tap to show/hide controls
   */
  const handleTap = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    if (!currentUser || !remoteUserId) {
      setErrorMessage('Missing user information');
      setCallState('error');
      return;
    }

    if (isIncoming) {
      setupPeerListener();
    } else {
      initializeOutgoingCall();
    }

    return () => {
      // Cleanup
      stopMediaTracks();
      if (unsubscribeCallRef.current) unsubscribeCallRef.current();
      if (unsubscribeCallListenerRef.current) unsubscribeCallListenerRef.current();
    };
  }, [currentUser, remoteUserId, isIncoming]);

  /**
   * Start timer when call is connected
   */
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  /**
   * Render error state
   */
  if (callState === 'error') {
    return (
      <div className="w-full h-screen bg-[#1F2C34] flex items-center justify-center flex-col gap-4">
        <div className="text-center px-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-bold mb-2">Call Error</h2>
          <p className="text-white/60 mb-6">{errorMessage || 'An error occurred during the call'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  /**
   * Render ended state
   */
  if (callState === 'ended') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-screen bg-[#1F2C34] flex items-center justify-center flex-col gap-4"
      >
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-6xl mb-4"
          >
            ✅
          </motion.div>
          <h2 className="text-white text-xl font-bold mb-2">Call Ended</h2>
          <p className="text-white/60">Duration: {formatDuration(duration)}</p>
        </div>
      </motion.div>
    );
  }

  /**
   * Render incoming call UI
   */
  if (isIncoming && (callState === 'initializing' || callState === 'ringing')) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-screen bg-gradient-to-b from-[#202C33] to-[#111B21] flex items-center justify-center flex-col gap-6 px-6"
      >
        {/* Caller avatar */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="w-24 h-24 rounded-full bg-[#00A884]/20 flex items-center justify-center border-4 border-[#00A884]/40"
        >
          {remoteContact?.avatar ? (
            <img
              src={remoteContact.avatar}
              alt={remoteContact.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="text-4xl font-bold text-[#00A884]">
              {remoteContact?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </motion.div>

        {/* Caller name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <h2 className="text-white text-2xl font-bold">{remoteContact?.name || 'Unknown'}</h2>
          <p className="text-white/60 mt-1">Incoming video call...</p>
        </motion.div>

        {/* Ringing animation */}
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex gap-2 mt-4"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 bg-[#00A884] rounded-full"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>

        {/* Accept/Reject buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex gap-6 mt-8"
        >
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleAcceptCall}
            className="w-16 h-16 bg-[#00A884] rounded-full flex items-center justify-center shadow-2xl hover:bg-[#06cf9c] transition-colors"
          >
            <Video size={28} className="text-white" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleRejectCall}
            className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 transition-colors"
          >
            <PhoneOff size={28} className="text-white" />
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  /**
   * Render outgoing ringing UI
   */
  if (!isIncoming && callState === 'ringing') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full h-screen bg-gradient-to-b from-[#202C33] to-[#111B21] flex items-center justify-center flex-col gap-6 px-6"
      >
        {/* Remote user avatar */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="w-24 h-24 rounded-full bg-[#00A884]/20 flex items-center justify-center border-4 border-[#00A884]/40"
        >
          {remoteContact?.avatar ? (
            <img
              src={remoteContact.avatar}
              alt={remoteContact.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="text-4xl font-bold text-[#00A884]">
              {remoteContact?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </motion.div>

        {/* Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <h2 className="text-white text-2xl font-bold">{remoteContact?.name || 'Unknown'}</h2>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="text-white/60">Calling</span>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-white/60"
            >
              ●
            </motion.span>
          </div>
        </motion.div>

        {/* Cancel button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleEndCall}
          className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-2xl hover:bg-red-600 transition-colors mt-8"
        >
          <PhoneOff size={28} className="text-white" />
        </motion.button>
      </motion.div>
    );
  }

  /**
   * Render active call UI
   */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={handleTap}
      className="relative w-full h-screen bg-[#000000] overflow-hidden"
    >
      {/* Remote video (fullscreen) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Local video (pip) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute top-6 right-6 w-24 h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-[#1F2C34] z-20"
        drag
        dragConstraints={{ top: 0, right: 0, bottom: -400, left: -200 }}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      </motion.div>

      {/* Top overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-30 pt-6 pb-4 px-6"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
              <div className="text-center flex-1">
                <p className="text-white font-semibold">{remoteContact?.name || 'Unknown'}</p>
                <p className="text-[#00A884] text-sm">{formatDuration(duration)}</p>
              </div>
              <button className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                <Users size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 z-30 pb-12 pt-6 px-8"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Media controls */}
            <div className="flex items-center justify-between mb-8">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isMuted ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white'
                }`}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isCameraOff ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white'
                }`}
              >
                {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isSpeakerOn ? 'bg-white/20 text-white' : 'bg-red-500/80 text-white'
                }`}
              >
                {isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleFlipCamera}
                className="w-14 h-14 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <RotateCcw size={22} />
              </motion.button>
            </div>

            {/* End call button */}
            <div className="flex justify-center">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleEndCall}
                className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-xl hover:bg-red-600 transition-colors"
              >
                <PhoneOff size={28} className="text-white" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}