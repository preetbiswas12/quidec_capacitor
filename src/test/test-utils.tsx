import React, { type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';

export const defaultMockContext = {
  isOnboarded: true,
  currentUser: { userId: 'user-1', email: 'test@test.com', username: 'testuser', displayName: 'Test User' },
  authUid: 'user-1',
  isAuthenticating: false,
  showSplash: false,
  needsVerification: false,
  completeOnboarding: vi.fn(),
  updateCurrentUser: vi.fn(),
  updateUserEmail: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  isConnected: true,
  contacts: [
    { id: 'contact-1', name: 'Alice', username: 'alice', email: 'alice@test.com', isGroup: false },
  ],
  discoverableContacts: [],
  updateContact: vi.fn(),
  chats: [
    { id: 'chat-1', contactId: 'contact-1', lastMessage: 'Hello', unreadCount: 0, isTyping: false },
  ],
  messages: {
    'chat-1': [
      { id: 'msg-1', chatId: 'chat-1', senderId: 'contact-1', content: 'Hello', type: 'text', timestamp: Date.now() },
      { id: 'msg-2', chatId: 'chat-1', senderId: 'me', content: 'Hi there!', type: 'text', timestamp: Date.now() },
    ],
  },
  calls: [],
  activeIncomingCall: null,
  clearIncomingCall: vi.fn(),
  saveCallRecord: vi.fn(),
  clearAllCalls: vi.fn(),
  statuses: [],
  chatRequests: [],
  sendChatRequest: vi.fn(),
  acceptRequest: vi.fn(),
  declineRequest: vi.fn(),
  pendingIncomingCount: 0,
  activeTab: 'chats' as const,
  setActiveTab: vi.fn(),
  activeChatId: 'chat-1',
  setActiveChatId: vi.fn(),
  showRequests: false,
  setShowRequests: vi.fn(),
  sendMessage: vi.fn(),
  startChat: vi.fn(),
  addMessagesToChat: vi.fn(),
  reactToMessage: vi.fn(),
  markAsRead: vi.fn(),
  clearAllChats: vi.fn(),
  clearChat: vi.fn(),
  deleteMessage: vi.fn(),
  typingContacts: {},
  groups: [],
  groupMessages: {},
  createGroup: vi.fn(),
  sendGroupMessage: vi.fn(),
  addGroupMembers: vi.fn(),
  removeGroupMember: vi.fn(),
  leaveGroup: vi.fn(),
  transferOwnership: vi.fn(),
  updateGroupInfo: vi.fn(),
  markGroupRead: vi.fn(),
  searchQuery: '',
  setSearchQuery: vi.fn(),
  chatFilter: 'all' as const,
  setChatFilter: vi.fn(),
  myStatuses: [],
  addStatus: vi.fn(),
  deleteMyStatus: vi.fn(),
  viewStatus: vi.fn(),
  activeStatusViewer: null,
  setActiveStatusViewer: vi.fn(),
  starredMessages: [],
  toggleStarMessage: vi.fn(),
  editMessage: vi.fn(),
  refreshStarredMessages: vi.fn(),
  contactInfoOpen: false,
  setContactInfoOpen: vi.fn(),
  replyTo: null,
  setReplyTo: vi.fn(),
  settings: {
    notifications: true,
    groupNotifications: true,
    callNotifications: true,
    readReceipts: true,
    lastSeenVisibility: 'everyone',
    profilePhotoVisibility: 'everyone',
    mediaAutoDownload: true,
    fontSize: 'medium',
    enterSendsMessage: true,
    theme: 'dark',
    notificationTone: 'default',
    vibrationType: 'default',
  },
  updateSettings: vi.fn(),
  searchUsers: vi.fn(),
  searchAllMessages: vi.fn(),
  disappearingTimers: {},
  setDisappearingTimer: vi.fn(),
  getDisappearingRemaining: vi.fn(() => 0),
  isDisappearingActive: vi.fn(() => false),
};

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { route?: string }
) {
  const { route = '/chat/chat-1', ...renderOptions } = options || {};

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        {children}
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
