import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const {
  mockSendMessage,
  mockRecordMessage,
  mockGetChatsForUser,
  mockGetFriendsList,
  mockGetPendingRequests,
  mockGetCallHistory,
  mockGetUserStatuses,
  mockSearchUsers,
} = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
  mockRecordMessage: vi.fn(),
  mockGetChatsForUser: vi.fn(async () => []),
  mockGetFriendsList: vi.fn(async () => []),
  mockGetPendingRequests: vi.fn(async () => []),
  mockGetCallHistory: vi.fn(async () => []),
  mockGetUserStatuses: vi.fn(async () => []),
  mockSearchUsers: vi.fn(async () => []),
}));

vi.mock('../../../utils/firebaseServices', () => ({
  default: {
    messageService: {
      sendMessage: mockSendMessage,
      recordMessage: mockRecordMessage,
      handleIncomingMessage: vi.fn(),
      markMessageDelivered: vi.fn(),
      markMessageRead: vi.fn(),
      listenToIncomingMessages: vi.fn(() => vi.fn()),
      listenToReceipts: vi.fn(() => vi.fn()),
      listenToDeletions: vi.fn(() => vi.fn()),
      listenToMessages: vi.fn(() => vi.fn()),
      getConversationId: vi.fn((a: string, b: string) => [a, b].sort().join('_')),
      getChatsForUser: mockGetChatsForUser,
      cleanupDeliveryPipe: vi.fn(),
      syncEditToFirestore: vi.fn(),
      deleteMessage: vi.fn(),
      reactToMessage: vi.fn(),
    },
    authService: {
      registerUser: vi.fn(),
      loginUser: vi.fn(),
      logoutUser: vi.fn(),
      getCurrentUser: vi.fn(() => null),
      getCurrentUserSync: vi.fn(() => null),
      onAuthStateChange: vi.fn(() => vi.fn()),
      updateUserProfile: vi.fn(),
      resendEmailVerification: vi.fn(),
    },
    presenceService: {
      setUserOnline: vi.fn(),
      setUserOffline: vi.fn(),
      listenToUserPresence: vi.fn(() => vi.fn()),
      listenToFriendsPresence: vi.fn(() => vi.fn()),
      sendSignaling: vi.fn(),
      listenToSignaling: vi.fn(() => vi.fn()),
      getOnlineUsers: vi.fn(async () => []),
    },
    friendRequestService: {
      sendFriendRequest: vi.fn(),
      acceptFriendRequest: vi.fn(),
      rejectFriendRequest: vi.fn(),
      getPendingRequests: mockGetPendingRequests,
      listenToPendingRequests: vi.fn(() => vi.fn()),
      removeFriend: vi.fn(),
      getFriendsList: mockGetFriendsList,
      getUserInfo: vi.fn(),
      sendNotificationToUser: vi.fn(),
    },
    typingService: {
      setTyping: vi.fn(),
      setGroupTyping: vi.fn(),
      listenToTyping: vi.fn(() => vi.fn()),
      listenToGroupTyping: vi.fn(() => vi.fn()),
    },
    userService: {
      getUserProfile: vi.fn(),
      updateUserProfile: vi.fn(),
      searchUsers: mockSearchUsers,
      getUserByUsername: vi.fn(),
      deleteUserAccount: vi.fn(),
      markNotificationAsRead: vi.fn(),
    },
    groupService: {
      createGroup: vi.fn(),
      getGroup: vi.fn(),
      updateGroup: vi.fn(),
      addMembers: vi.fn(),
      removeMember: vi.fn(),
      leaveGroup: vi.fn(),
      transferOwnership: vi.fn(),
      sendGroupMessage: vi.fn(),
      listenToUserGroups: vi.fn(() => vi.fn()),
      markGroupMessagesRead: vi.fn(),
      sendGroupNotification: vi.fn(),
    },
    statusService: {
      createStatus: vi.fn(),
      getUserStatuses: mockGetUserStatuses,
      markStatusViewed: vi.fn(),
      deleteStatus: vi.fn(),
      deleteExpiredStatuses: vi.fn(),
    },
    callService: {
      saveCallRecord: vi.fn(),
      getCallHistory: mockGetCallHistory,
      listenToCallHistory: vi.fn(() => vi.fn()),
      listenToIncomingCalls: vi.fn(() => vi.fn()),
      deleteCallRecord: vi.fn(),
      clearCallHistory: vi.fn(),
    },
    conversationService: {
      createConversation: vi.fn(),
      updateConversationMetadata: vi.fn(),
      deleteConversation: vi.fn(),
      getUserConversations: vi.fn(async () => []),
    },
  },
  sanitizePathComponent: (s: string) => s,
}));

vi.mock('../../../utils/firebase', () => ({
  db: {},
  realtimeDb: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  initializeFirestore: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
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
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
}));

vi.mock('../../../utils/sqliteMessageStore', () => ({
  appendMessage: vi.fn(),
  loadMessages: vi.fn(async () => []),
  loadAllChats: vi.fn(async () => ({})),
  listLocalChatIds: vi.fn(async () => []),
  clearAllMessages: vi.fn(),
  clearKeyCache: vi.fn(),
  updateMessageReactions: vi.fn(),
  updateMessageStar: vi.fn(),
  updateMessageContent: vi.fn(),
  getStarredMessages: vi.fn(async () => []),
  searchAllMessages: vi.fn(async () => []),
  deleteMessageById: vi.fn(),
}));

vi.mock('../../../utils/encryption', () => ({
  getEncryptionKey: vi.fn(),
  getKeyVersion: vi.fn(() => 1),
  checkAndRotateKey: vi.fn(),
  encryptMessage: vi.fn(async (content: string) => `encrypted:${content}`),
  decryptMessage: vi.fn(async () => ({ content: 'decrypted' })),
  decryptMessageWithHistoricalKeys: vi.fn(async () => ({ content: 'decrypted' })),
  getConversationKey: vi.fn(),
  deriveSigningKey: vi.fn(),
  signMessage: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock('../../../utils/offlineMessageSender', () => ({
  sendMessageWhenAvailable: vi.fn(),
  startAutoFlushOnReconnect: vi.fn(),
  queueReadReceipt: vi.fn(),
}));

vi.mock('../../../utils/mediaUploadHandler', () => ({
  uploadMediaWithProgress: vi.fn(),
  loadMediaWithCache: vi.fn(),
}));

vi.mock('../../../utils/permissionManager', () => ({
  permissionManager: { checkAndRequest: vi.fn() },
}));

vi.mock('../../../scripts/initCollections', () => ({
  initializeProductionCollections: vi.fn(),
}));

vi.mock('../../../utils/settingsPersistence', () => ({
  initSettingsPersistence: vi.fn(),
  saveSettingsToNative: vi.fn(),
  syncSettingsToFirebase: vi.fn(),
  listenToSettingsChanges: vi.fn(() => vi.fn()),
  getOrCreateDeviceId: vi.fn(async () => 'test-device-id'),
}));

vi.mock('../../../utils/notificationSettingsManager', () => ({
  initializeNotificationChannels: vi.fn(),
  requestNotificationPermissions: vi.fn(),
}));

vi.mock('../../../utils/privacySettingsManager', () => ({
  getPrivacySettings: vi.fn(async => ({})),
  getAccountSecuritySettings: vi.fn(async => ({})),
}));

vi.mock('../../../utils/linkedDevicesManager', () => ({
  createDeviceSession: vi.fn(),
  listenToDeviceSessions: vi.fn(() => vi.fn()),
}));

vi.mock('../../../utils/fcm', () => ({
  initializePushNotifications: vi.fn(),
}));

vi.mock('../../../utils/idbPaginator', () => ({
  idbPaginator: { addMessages: vi.fn() },
}));

vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../utils/persistentMessageQueue', () => ({
  messageQueue: { addMessage: vi.fn(() => 'msg-id') },
}));

vi.mock('../../../utils/services/shared', () => ({
  getCustomUsernameByFirebaseUid: vi.fn(),
  MESSAGE_STATUS: { SENT: 'sent', DELIVERED: 'delivered', READ: 'read', QUEUED: 'queued' },
  sanitizePathComponent: (s: string) => s,
}));

vi.mock('../../../utils/services/dataRetention', () => ({
  dataRetentionService: { cleanupOldData: vi.fn() },
}));

vi.mock('../../../utils/websocketManager', () => ({
  websocketManager: { connect: vi.fn(), disconnect: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { AppProvider, useApp } from '../AppContext';

function TestComponent() {
  const ctx = useApp();
  return (
    <div>
      <span data-testid="isOffline">{String(ctx.isOffline)}</span>
      <span data-testid="isReconnecting">{String(ctx.isReconnecting)}</span>
      <span data-testid="syncProgress">{ctx.syncProgress ? `${ctx.syncProgress.sent}/${ctx.syncProgress.total}` : 'null'}</span>
      <span data-testid="activeTab">{ctx.activeTab}</span>
      <span data-testid="contactsCount">{ctx.contacts.length}</span>
      <span data-testid="chatsCount">{ctx.chats.length}</span>
      <span data-testid="currentUser">{ctx.currentUser ? 'logged-in' : 'logged-out'}</span>
    </div>
  );
}

function renderApp(route = '/app') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider>
        <TestComponent />
      </AppProvider>
    </MemoryRouter>
  );
}

describe('AppContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('provides context values to children', () => {
    renderApp();
    expect(screen.getByTestId('isOffline')).toHaveTextContent('false');
    expect(screen.getByTestId('activeTab')).toHaveTextContent('chats');
  });

  it('throws when useApp is used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useApp must be used within AppProvider');
    consoleSpy.mockRestore();
  });

  it('sets isOffline to true when navigator.onLine is false initially', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    renderApp();
    expect(screen.getByTestId('isOffline')).toHaveTextContent('true');
  });

  it('updates isOffline when offline event fires', () => {
    renderApp();
    expect(screen.getByTestId('isOffline')).toHaveTextContent('false');
    fireEvent(window, new Event('offline'));
    expect(screen.getByTestId('isOffline')).toHaveTextContent('true');
  });

  it('updates isOffline and sets isReconnecting when online event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    renderApp();
    expect(screen.getByTestId('isOffline')).toHaveTextContent('true');
    fireEvent(window, new Event('online'));
    expect(screen.getByTestId('isOffline')).toHaveTextContent('false');
    expect(screen.getByTestId('isReconnecting')).toHaveTextContent('true');
  });

  it('handles offlineFlushResult event with failures', () => {
    renderApp();
    fireEvent(window, new CustomEvent('offlineFlushResult', { detail: { sent: 0, failed: 2 } }));
    expect(screen.getByTestId('isReconnecting')).toHaveTextContent('false');
  });

  it('handles offlineFlushResult event with success', () => {
    renderApp();
    fireEvent(window, new CustomEvent('offlineFlushResult', { detail: { sent: 3, failed: 0 } }));
    expect(screen.getByTestId('isReconnecting')).toHaveTextContent('false');
  });

  it('handles offlineFlushProgress event', () => {
    renderApp();
    fireEvent(window, new CustomEvent('offlineFlushProgress', { detail: { sent: 2, total: 5 } }));
    expect(screen.getByTestId('syncProgress')).toHaveTextContent('2/5');
  });

  it('clears syncProgress on flush result', () => {
    renderApp();
    fireEvent(window, new CustomEvent('offlineFlushProgress', { detail: { sent: 1, total: 3 } }));
    expect(screen.getByTestId('syncProgress')).toHaveTextContent('1/3');
    fireEvent(window, new CustomEvent('offlineFlushResult', { detail: { sent: 3, failed: 0 } }));
    expect(screen.getByTestId('syncProgress')).toHaveTextContent('null');
  });

  it('defaults to chats tab', () => {
    renderApp();
    expect(screen.getByTestId('activeTab')).toHaveTextContent('chats');
  });
});
