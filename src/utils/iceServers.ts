/**
 * Centralized ICE server configuration.
 * TURN credentials are read from environment variables — never hardcoded.
 */

interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN_SERVERS: ICEServer = {
  urls: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
  ],
};

/**
 * Returns the list of ICE servers for WebRTC connections.
 * TURN servers are optional — only included when env vars are set.
 */
export function getICEServers(): ICEServer[] {
  const servers: ICEServer[] = [STUN_SERVERS];

  const turnUrl = import.meta.env.VITE_TURN_URLS;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrl.split(','),
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}

/**
 * Returns RTCPeerConnection config with ICE servers.
 */
export function getRTCConfig(): RTCConfiguration {
  return {
    iceServers: getICEServers(),
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}

/**
 * Media constraints for audio.
 */
export function getAudioConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

/**
 * Media constraints for video.
 */
export function getVideoConstraints(isFrontCamera = true): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15 },
      facingMode: isFrontCamera ? 'user' : 'environment',
    },
  };
}
