/**
 * WebRTC configuration for mobile video/audio calls
 * Works inside Capacitor WebView with native WebSocket support
 */

export const WEBRTC_CONFIG = {
  // STUN servers (for NAT traversal)
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
      ],
    },
    // Optional: Add TURN servers for relay (if provided by backend)
    // {
    //   urls: ['turn:your-turn-server.com:3478'],
    //   username: 'user',
    //   credential: 'pass',
    // },
  ],

  // ICE gathering and transport configuration
  iceGatheringPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10,

  // Codec preferences (for better mobile compatibility)
  codecs: {
    audio: ['opus'], // Best for VoIP
    video: ['VP8', 'VP9', 'H264'], // H.264 best for mobile
  },

  // Constraints for media devices
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },

  videoConstraints: {
    width: { ideal: 640 }, // Lower res for mobile
    height: { ideal: 480 },
    frameRate: { ideal: 15 }, // Lower FPS saves battery
    facingMode: 'user',
  },

  // Connection timeout
  connectionTimeout: 10000,
}

/**
 * Get RTCPeerConnection configuration
 */
export function getPeerConnectionConfig() {
  return {
    iceServers: WEBRTC_CONFIG.iceServers,
    iceGatheringPolicy: WEBRTC_CONFIG.iceGatheringPolicy,
    bundlePolicy: WEBRTC_CONFIG.bundlePolicy,
    rtcpMuxPolicy: WEBRTC_CONFIG.rtcpMuxPolicy,
    iceCandidatePoolSize: WEBRTC_CONFIG.iceCandidatePoolSize,
  }
}

/**
 * Get media constraints for audio
 */
export function getAudioConstraints() {
  return {
    audio: WEBRTC_CONFIG.audioConstraints,
  }
}

/**
 * Get media constraints for video
 */
export function getVideoConstraints() {
  return {
    audio: WEBRTC_CONFIG.audioConstraints,
    video: WEBRTC_CONFIG.videoConstraints,
  }
}

/**
 * Mobile-specific optimizations
 */
export const MOBILE_OPTIMIZATIONS = {
  // Reduce bitrate for mobile (kbps)
  minBitrate: 200,
  startBitrate: 500,
  maxBitrate: 1500,

  // CPU overload threshold
  cpuOverloadThreshold: 85,

  // Battery optimization
  enableDtx: true, // Discontinuous transmission
  enableHdQuality: false, // Disable by default
}

/**
 * Configure media track for mobile optimization
 */
export function optimizeMediaTrack(track, isMobile = true) {
  if (!isMobile) return track

  const settings = track.getSettings()

  // For video, reduce resolution and frame rate on low-end devices
  if (track.kind === 'video') {
    try {
      track.applyConstraints({
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 10 },
      })
      console.log('✅ Video track optimized for mobile')
    } catch (err) {
      console.warn('⚠️ Could not optimize video track:', err)
    }
  }

  return track
}

/**
 * Handle low battery optimization
 */
export function optimizeForLowBattery(rtcConnection) {
  if (!rtcConnection) return

  // Reduce video bitrate
  const sender = rtcConnection.getSenders().find((s) => s.track?.kind === 'video')
  if (sender) {
    sender
      .setParameters({
        encodings: [
          {
            maxBitrate: 500000, // 500 kbps
          },
        ],
      })
      .then(() => {
        console.log('✅ Video bitrate reduced for battery saving')
      })
      .catch((err) => {
        console.warn('⚠️ Could not adjust bitrate:', err)
      })
  }
}

/**
 * Check if device supports WebRTC
 */
export async function checkWebRTCSupport() {
  const support = {
    supported: !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.RTCPeerConnection
    ),
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    peerConnection: !!window.RTCPeerConnection,
    audioInput: false,
    videoInput: false,
  }

  if (support.supported) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      support.audioInput = devices.some((d) => d.kind === 'audioinput')
      support.videoInput = devices.some((d) => d.kind === 'videoinput')
    } catch (err) {
      console.warn('⚠️ Could not enumerate devices:', err)
    }
  }

  return support
}
