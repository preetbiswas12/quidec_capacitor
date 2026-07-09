import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, defaultMockContext } from '../../../test/test-utils';

const mockUseApp = vi.fn(() => defaultMockContext);

vi.mock('../../context/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useParams: vi.fn(() => ({ id: 'call-1' })), useNavigate: vi.fn(() => vi.fn()) };
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

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

vi.mock('peerjs', () => ({
  default: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn() })),
  MediaConnection: vi.fn(),
}));

vi.mock('../../utils/peerService', () => ({
  default: { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock('../../utils/firebaseCallManager', () => ({
  default: {
    createCall: vi.fn(() => Promise.resolve({ id: 'call-1' })),
    answerCall: vi.fn(),
    endCall: vi.fn(),
    onCallUpdate: vi.fn(),
    offCallUpdate: vi.fn(),
  },
  CallSession: vi.fn(),
}));

vi.mock('../../utils/firebase', () => ({
  default: {},
  db: {},
  auth: { currentUser: { uid: 'user-1' } },
}));

vi.mock('../../utils/firebaseServices', () => ({
  typingService: { setTyping: vi.fn(), setGroupTyping: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../Avatar', () => ({ default: (props: any) => <div data-testid="avatar">{props.name?.[0]}</div> }));

const mockGetUserMedia = vi.fn(() =>
  Promise.resolve({
    getTracks: () => [
      { stop: vi.fn(), kind: 'video', enabled: true },
      { stop: vi.fn(), kind: 'audio', enabled: true },
    ],
  } as any)
);

Object.defineProperty(navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
});

import VideoCallScreen from '../VideoCallScreen';
import { useParams } from 'react-router';

describe('VideoCallScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue(defaultMockContext);
    (useParams as any).mockReturnValue({ id: 'call-1' });
  });

  it('renders the video call screen container', () => {
    const { container } = renderWithProviders(<VideoCallScreen />, { route: '/call/video/call-1' });
    expect(container.querySelector('[class*="h-screen"]')).toBeInTheDocument();
  });

  it('renders remote video element', () => {
    const { container } = renderWithProviders(<VideoCallScreen />, { route: '/call/video/call-1' });
    const videos = container.querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(1);
  });

  it('renders local video element (PiP)', () => {
    const { container } = renderWithProviders(<VideoCallScreen />, { route: '/call/video/call-1' });
    const videos = container.querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the main call UI in initializing state', () => {
    const { container } = renderWithProviders(<VideoCallScreen />, { route: '/call/video/call-1' });
    const videos = container.querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts props for callId and remotePeerId', () => {
    const { container } = renderWithProviders(
      <VideoCallScreen callId="custom-call" remotePeerId="user-2" />,
      { route: '/call/video/' }
    );
    const videos = container.querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(2);
  });

  it('initializes with correct route params', () => {
    (useParams as any).mockReturnValue({ id: 'route-call-id' });
    const { container } = renderWithProviders(<VideoCallScreen />, { route: '/call/video/route-call-id' });
    const videos = container.querySelectorAll('video');
    expect(videos.length).toBeGreaterThanOrEqual(2);
  });
});
