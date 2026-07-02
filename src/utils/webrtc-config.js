/**
 * WebRTC configuration for mobile video/audio calls
 * Works inside Capacitor WebView with native WebSocket support
 */

import { getICEServers, getRTCConfig, getAudioConstraints, getVideoConstraints } from './iceServers';

export const WEBRTC_CONFIG = {
  iceServers: getICEServers(),
  iceGatheringPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10,
  codecs: {
    audio: ['opus'],
    video: ['VP8', 'VP9', 'H264'],
  },
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  videoConstraints: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
    facingMode: 'user',
  },
  connectionTimeout: 10000,
};

export function getPeerConnectionConfig() {
  return getRTCConfig();
}

export function getAudioConstraintsExport() {
  return getAudioConstraints();
}

export function getVideoConstraintsExport(isFrontCamera = true) {
  return getVideoConstraints(isFrontCamera);
}

export const MOBILE_OPTIMIZATIONS = {
  minBitrate: 200,
  startBitrate: 500,
  maxBitrate: 1500,
  cpuOverloadThreshold: 85,
  enableDtx: true,
  enableHdQuality: false,
};

export function optimizeMediaTrack(track, isMobile = true) {
  if (!isMobile) return track;
  if (track.kind === 'video') {
    try {
      track.applyConstraints({
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 10 },
      });
    } catch (err) {
      console.warn('Could not optimize video track:', err);
    }
  }
  return track;
}

export function optimizeForLowBattery(rtcConnection) {
  if (!rtcConnection) return;
  const sender = rtcConnection.getSenders().find((s) => s.track?.kind === 'video');
  if (sender) {
    sender.setParameters({
      encodings: [{ maxBitrate: 500000 }],
    }).catch(() => {});
  }
}

export async function checkWebRTCSupport() {
  const support = {
    supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection),
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    peerConnection: !!window.RTCPeerConnection,
    audioInput: false,
    videoInput: false,
  };
  if (support.supported) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      support.audioInput = devices.some((d) => d.kind === 'audioinput');
      support.videoInput = devices.some((d) => d.kind === 'videoinput');
    } catch (err) {
      console.warn('Could not enumerate devices:', err);
    }
  }
  return support;
}
