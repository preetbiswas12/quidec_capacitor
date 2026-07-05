import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, defaultMockContext } from '../../../test/test-utils';

const mockUseApp = vi.fn(() => defaultMockContext);

vi.mock('../../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useParams: vi.fn(() => ({ id: 'contact-1' })), useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock('motion/react', () => {
  const el = (tag: string) =>
    React.forwardRef(({ children, ...props }: any, ref: any) => {
      const filtered: Record<string, any> = {};
      for (const [k, v] of Object.entries(props)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || k === 'style' || k.startsWith('data-') || k.startsWith('aria-') || k.startsWith('on') || typeof v === 'function') {
          filtered[k] = v;
        }
      }
      return React.createElement(tag, { ...filtered, ref }, children);
    });

  const handler: ProxyHandler<any> = {
    get(_target, prop: string) {
      if (prop === 'AnimatePresence') return ({ children }: any) => <>{children}</>;
      if (prop === 'useMotionValue') return vi.fn(() => ({ get: () => 0, set: vi.fn() }));
      if (prop === 'useTransform') return vi.fn(() => 0);
      return el(prop);
    },
  };

  return {
    motion: new Proxy({}, handler),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useMotionValue: vi.fn(() => ({ get: () => 0, set: vi.fn() })),
    useTransform: vi.fn(() => 0),
  };
});

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  initializeFirestore: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(),
  ref: vi.fn(() => ({})),
  set: vi.fn(),
  get: vi.fn(),
  onChildAdded: vi.fn(() => vi.fn()),
  remove: vi.fn(),
}));

vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
}));

vi.mock('../../utils/peerService', () => ({
  default: { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn(), destroy: vi.fn() },
}));

vi.mock('../../utils/firebase', () => ({
  default: {},
  db: {},
  auth: { currentUser: { uid: 'user-1' } },
}));

vi.mock('../../utils/firebaseServices', () => ({
  default: {
    presenceService: {
      sendSignaling: vi.fn(),
      listenToSignaling: vi.fn(() => vi.fn()),
    },
    typingService: { setTyping: vi.fn(), setGroupTyping: vi.fn() },
  },
  typingService: { setTyping: vi.fn(), setGroupTyping: vi.fn() },
}));

vi.mock('../../utils/iceServers', () => ({
  getRTCConfig: vi.fn(() => ({})),
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../Avatar', () => ({ default: (props: any) => <div data-testid="avatar">{props.name?.[0]}</div> }));

const mockGetUserMedia = vi.fn(() =>
  Promise.resolve({
    getTracks: () => [
      { stop: vi.fn(), kind: 'audio', enabled: true },
    ],
    getAudioTracks: () => [
      { stop: vi.fn(), kind: 'audio', enabled: true },
    ],
  } as any)
);

Object.defineProperty(navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

(globalThis as any).RTCPeerConnection = vi.fn(() => ({
  createOffer: vi.fn().mockResolvedValue({}),
  createAnswer: vi.fn().mockResolvedValue({}),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  addIceCandidate: vi.fn().mockResolvedValue(undefined),
  addTrack: vi.fn(),
  close: vi.fn(),
  onicecandidate: null,
  onconnectionstatechange: null,
  oniceconnectionstatechange: null,
  iceConnectionState: 'new',
  connectionState: 'new',
}));

(globalThis as any).RTCSessionDescription = vi.fn((init: any) => init);
(globalThis as any).RTCIceCandidate = vi.fn((init: any) => init);

import VoiceCallScreen from '../VoiceCallScreen';
import { useParams, useNavigate } from 'react-router';

describe('VoiceCallScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue(defaultMockContext);
    (useParams as any).mockReturnValue({ id: 'contact-1' });
  });

  it('renders the voice call screen container', () => {
    const { container } = renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    expect(container.querySelector('[class*="h-full"]')).toBeInTheDocument();
  });

  it('renders the contact avatar', () => {
    renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('displays the contact name', () => {
    renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders call control buttons', () => {
    renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    expect(screen.getByText('Mute')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Speaker')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('renders the end call button', () => {
    const { container } = renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    const endCallBtn = container.querySelector('[class*="bg-red-500"]');
    expect(endCallBtn).toBeInTheDocument();
  });

  it('calls getUserMedia on mount for voice call', () => {
    renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  });

  it('navigates away if no contact found', async () => {
    const mockNavigate = vi.fn();
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useParams as any).mockReturnValue({ id: 'nonexistent' });
    mockUseApp.mockReturnValue({ ...defaultMockContext, contacts: [], currentUser: undefined as any });
    renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/nonexistent' });
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderWithProviders(<VoiceCallScreen />, { route: '/call/voice/contact-1' });
    unmount();
  });
});
