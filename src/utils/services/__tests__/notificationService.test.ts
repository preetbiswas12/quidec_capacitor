import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  realtimeDb: {},
  getFCMToken: vi.fn(),
  EMBEDDED_VAPID_KEY: 'test-vapid-key',
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
}));

vi.mock('@capawesome/capacitor-badge', () => ({
  Badge: { setBadge: vi.fn(), clear: vi.fn() },
}));

const { mockGetMessaging, mockGetToken, mockOnMessage, mockGetFirestore, mockDoc, mockUpdateDoc } = vi.hoisted(() => ({
  mockGetMessaging: vi.fn(),
  mockGetToken: vi.fn(),
  mockOnMessage: vi.fn(),
  mockGetFirestore: vi.fn(() => 'firestoreInstance'),
  mockDoc: vi.fn((_db: any, ...parts: string[]) => ({ path: parts.join('/') })),
  mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/messaging', () => ({
  getMessaging: mockGetMessaging,
  getToken: mockGetToken,
  onMessage: mockOnMessage,
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: mockGetFirestore,
  doc: mockDoc,
  updateDoc: mockUpdateDoc,
}));

import { notificationService } from '../notificationService';

beforeEach(() => {
  vi.resetAllMocks();
  if (typeof globalThis.Notification === 'undefined') {
    (globalThis as any).Notification = class {
      static permission = 'default';
      static requestPermission = vi.fn().mockResolvedValue('granted');
      constructor(_title?: string, _options?: NotificationOptions) {}
    };
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestFCMPermission', () => {
  it('requests permission and saves token when granted', async () => {
    const mockMessaging = { _messaging: true };
    mockGetMessaging.mockReturnValue(mockMessaging);

    Object.defineProperty(Notification, 'requestPermission', {
      value: vi.fn().mockResolvedValue('granted'),
      writable: true,
      configurable: true,
    });

    mockGetToken.mockResolvedValue('fcm-token-abc');

    const token = await notificationService.requestFCMPermission('uid1');

    expect(mockGetMessaging).toHaveBeenCalled();
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalledWith(mockMessaging, {
      vapidKey: 'test-vapid-key',
    });
    expect(mockUpdateDoc).toHaveBeenCalledOnce();
    const [ref, data] = mockUpdateDoc.mock.calls[0];
    expect(ref.path).toBe('users/uid1');
    expect(data).toEqual({
      fcmToken: 'fcm-token-abc',
      notificationsEnabled: true,
    });
    expect(token).toBe('fcm-token-abc');
  });

  it('returns null when permission is denied', async () => {
    mockGetMessaging.mockReturnValue({});

    Object.defineProperty(Notification, 'requestPermission', {
      value: vi.fn().mockResolvedValue('denied'),
      writable: true,
      configurable: true,
    });

    const token = await notificationService.requestFCMPermission('uid1');

    expect(token).toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('returns null on error', async () => {
    mockGetMessaging.mockImplementation(() => {
      throw new Error('messaging unavailable');
    });

    const token = await notificationService.requestFCMPermission('uid1');

    expect(token).toBeNull();
  });
});

describe('listenToNotifications', () => {
  it('sets up onMessage listener and returns unsubscribe', () => {
    const unsubscribe = vi.fn();
    mockOnMessage.mockReturnValue(unsubscribe);

    const result = notificationService.listenToNotifications(vi.fn());

    expect(mockGetMessaging).toHaveBeenCalled();
    expect(mockOnMessage).toHaveBeenCalledTimes(1);
    expect(result).toBe(unsubscribe);
  });

  it('calls callback with mapped payload on message', () => {
    const callback = vi.fn();
    const unsubscribe = vi.fn();
    mockOnMessage.mockImplementation((_messaging: any, handler: (...args: unknown[]) => void) => {
      handler({
        notification: { title: 'Hello', body: 'World' },
        data: { url: '/chat' },
      });
      return unsubscribe;
    });

    notificationService.listenToNotifications(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      title: 'Hello',
      body: 'World',
      data: { url: '/chat' },
    });
  });

  it('handles missing notification fields gracefully', () => {
    const callback = vi.fn();
    mockOnMessage.mockImplementation((_messaging: any, handler: (...args: unknown[]) => void) => {
      handler({});
      return vi.fn();
    });

    notificationService.listenToNotifications(callback);

    expect(callback).toHaveBeenCalledWith({
      title: undefined,
      body: undefined,
      data: undefined,
    });
  });

  it('returns empty function on error', () => {
    mockGetMessaging.mockImplementation(() => {
      throw new Error('not available');
    });

    const result = notificationService.listenToNotifications(vi.fn());

    expect(typeof result).toBe('function');
  });
});

describe('sendLocalNotification', () => {
  const originalNotification = (globalThis as any).Notification;

  afterEach(() => {
    (globalThis as any).Notification = originalNotification;
  });

  it('creates a Notification when permission is granted', () => {
    const MockNotificationConstructor = vi.fn();
    (globalThis as any).Notification = MockNotificationConstructor;
    Object.defineProperty(MockNotificationConstructor, 'permission', {
      value: 'granted',
      writable: true,
      configurable: true,
    });

    const opts: NotificationOptions = { body: 'Test body', icon: '/icon.png' };
    notificationService.sendLocalNotification('Test Title', opts);

    expect(MockNotificationConstructor).toHaveBeenCalledWith('Test Title', opts);
  });

  it('does nothing when permission is not granted', () => {
    const MockNotificationConstructor = vi.fn();
    (globalThis as any).Notification = MockNotificationConstructor;
    Object.defineProperty(MockNotificationConstructor, 'permission', {
      value: 'denied',
      writable: true,
      configurable: true,
    });

    notificationService.sendLocalNotification('Test Title');

    expect(MockNotificationConstructor).not.toHaveBeenCalled();
  });

  it('does nothing when Notification is not in window', async () => {
    delete (globalThis as any).Notification;

    const result = await notificationService.sendLocalNotification('Test Title');

    expect(result).toBeUndefined();
  });
});
