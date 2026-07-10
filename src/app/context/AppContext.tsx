import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import services, { sanitizePathComponent } from '../../utils/firebaseServices';
const { messageService, authService, presenceService, friendRequestService, typingService, userService, groupService, statusService, callService, conversationService } = services;
import { getCustomUsernameByFirebaseUid } from '../../utils/services/shared';
import { getDoc, doc, query, collection, where, getDocs, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { initializePushNotifications } from '../../utils/fcm';
import { loadMessages as loadLocalMessages, loadAllChats, listLocalChatIds, clearKeyCache, updateMessageReactions, updateMessageStar, updateMessageContent, getStarredMessages, searchAllMessages as searchLocalMessages, migrateOldEncryptionData, appendMessage as appendLocalMessage } from '../../utils/sqliteMessageStore';
import type { SearchResult as LocalSearchResult } from '../../utils/sqliteMessageStore';
import { getEncryptionKey, getKeyVersion, checkAndRotateKey, decryptMessageV2, getConversationKey } from '../../utils/encryption';
import { ensureKeyPair, encryptUserData, decryptUserData } from '../../utils/e2ee';
import { sendMessageWhenAvailable, startAutoFlushOnReconnect, queueReadReceipt } from '../../utils/offlineMessageSender';
import { uploadMediaWithProgress, loadMediaWithCache } from '../../utils/mediaUploadHandler';
import { permissionManager } from '../../utils/permissionManager';
import { setAppBadge } from '../../utils/services/notificationService';
import { initializeProductionCollections } from '../../scripts/initCollections';
import { 
  initSettingsPersistence, 
  saveSettingsToNative, 
  syncSettingsToFirebase,
  getOrCreateDeviceId 
} from '../../utils/settingsPersistence';
import { 
  initializeNotificationChannels,
  requestNotificationPermissions 
} from '../../utils/notificationSettingsManager';
import { 
  getPrivacySettings,
  getAccountSecuritySettings 
} from '../../utils/privacySettingsManager';
import {
  createDeviceSession,
  listenToDeviceSessions
} from '../../utils/linkedDevicesManager';

// ─── Types (Matching UI App Expectations) ──────────────────────────────────

export interface Contact {
  id: string;                    // unique internal id
  userId: string;                // e.g. "@username"
  name: string;
  avatar: string | null;
  avatarColor: string;
  initials: string;
  isOnline: boolean;
  lastSeen: string;
  phone?: string;
  email?: string;
  about: string;
  isGroup?: boolean;
  members?: string[];
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'system' | 'document' | 'link';
  senderId: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  reactions?: { emoji: string; count: number }[];
  isStarred?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
  imageUrl?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDomain?: string;
  expiresAt?: number;
  isEdited?: boolean;
  keyVersion?: number;
  hmac?: string;
  totalChunks?: number;
}

export interface Chat {
  id: string;
  contactId: string;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageSender?: string;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
}

export interface SearchResult {
  chatId: string;
  messageId: string;
  content: string;
  senderId: string;
  timestamp: string;
  contactName?: string;
}

export interface CallRecord {
  id: string;
  contactId: string;
  type: 'voice' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  duration?: string;
  timestamp: string;
}

export interface Status {
  id: string;
  contactId: string;
  content: string;
  type: 'text' | 'image';
  backgroundColor?: string;
  timestamp: string;
  viewed: boolean;
}

export interface ChatRequest {
  id: string;
  contactId: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
  timestamp: string;
  previewMessage: string;
}

export interface CurrentUser {
  name: string;
  email?: string;
  userId: string;
  avatar: string | null;
  about: string;
}

export interface AppSettings {
  notifications: boolean;
  groupNotifications: boolean;
  callNotifications: boolean;
  readReceipts: boolean;
  lastSeenVisibility: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility: 'everyone' | 'contacts' | 'nobody';
  mediaAutoDownload: boolean;
  fontSize: 'small' | 'medium' | 'large';
  enterSendsMessage: boolean;
  theme: 'dark' | 'light';
  notificationTone: string;
  vibrationType: string;
}

interface AppContextType {
  // Auth
  isOnboarded: boolean;
  currentUser: CurrentUser | null;
  authUid: string | null;       // Firebase Auth UID — for PeerJS ID, never for Firestore paths
  isAuthenticating: boolean;
  showSplash: boolean;
  needsVerification: boolean;
  completeOnboarding: (user: CurrentUser) => void;
  updateCurrentUser: (updates: Partial<CurrentUser>) => void;
  updateUserEmail: (newEmail: string) => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; emailVerified?: boolean; message?: string }>;
  register: (email: string, username: string, password: string) => Promise<{ success: boolean; emailVerified?: boolean; message?: string }>;
  logout: () => Promise<void>;

  // WebSocket & Real Data
  isConnected: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  syncProgress: { sent: number; total: number } | null;
  contacts: Contact[];
  discoverableContacts: Contact[];
  updateContact: (id: string, updates: Partial<Contact>) => void;
  chats: Chat[];
  messages: Record<string, Message[]>;
  calls: CallRecord[];
  activeIncomingCall: CallRecord | null;
  clearIncomingCall: () => void;
  saveCallRecord: (contactId: string, type: 'voice' | 'video', direction: 'incoming' | 'outgoing' | 'missed', duration?: number) => Promise<void>;
  clearAllCalls: () => Promise<void>;
  statuses: Status[];

  // Chat Requests
  chatRequests: ChatRequest[];
  sendChatRequest: (contactId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<string>;
  declineRequest: (requestId: string) => Promise<void>;
  pendingIncomingCount: number;

  // UI State
  activeTab: 'chats' | 'calls' | 'status' | 'settings';
  setActiveTab: (tab: 'chats' | 'calls' | 'status' | 'settings') => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  showRequests: boolean;
  setShowRequests: (v: boolean) => void;
  chatsLoaded: boolean;

  // Messaging
  sendMessage: (chatId: string, content: string, type?: Message['type'], extra?: Partial<Message>, mediaFile?: File, options?: { msgId?: string; onUploadProgress?: (progress: { percentComplete: number; stage: string }) => void }) => Promise<void>;
  startChat: (contactId: string) => Promise<string>;
  addMessagesToChat: (chatId: string, items: Message[]) => void;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<void>;
  markAsRead: (chatId: string) => Promise<void>;
  clearAllChats: () => Promise<void>;
  clearChat: (chatId: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  typingContacts: Record<string, boolean>;

  // Groups
  groups: any[];
  groupMessages: Record<string, Message[]>;
  createGroup: (name: string, description: string, memberIds: string[]) => Promise<string>;
  sendGroupMessage: (groupId: string, content: string, type?: Message['type'], extra?: Partial<Message>) => Promise<void>;
  addGroupMembers: (groupId: string, memberIds: string[], callerId?: string) => Promise<void>;
  removeGroupMember: (groupId: string, memberId: string, callerId?: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  transferOwnership: (groupId: string, newOwnerId: string) => Promise<void>;
  updateGroupInfo: (groupId: string, updates: { name?: string; description?: string; avatar?: string }, callerId?: string) => Promise<void>;
  markGroupRead: (groupId: string) => Promise<void>;

  // Search & Filters
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  chatFilter: 'all' | 'unread' | 'groups';
  setChatFilter: (f: 'all' | 'unread' | 'groups') => void;

  // Status / Stories
  myStatuses: Status[];
  addStatus: (content: string, type: 'text' | 'image', backgroundColor?: string, mediaFile?: File) => Promise<void>;
  deleteMyStatus: (statusId: string) => Promise<void>;
  viewStatus: (contactId: string, statusId: string) => void;
  activeStatusViewer: { contactId: string; statusIndex: number } | null;
  setActiveStatusViewer: (viewer: { contactId: string; statusIndex: number } | null) => void;

  // Starred Messages
  starredMessages: Message[];
  toggleStarMessage: (chatId: string, messageId: string) => Promise<void>;
  editMessage: (chatId: string, messageId: string, newContent: string) => Promise<void>;
  refreshStarredMessages: () => Promise<void>;

  // Contact Info
  contactInfoOpen: boolean;
  setContactInfoOpen: (open: boolean) => void;
  replyTo: Message | null;
  setReplyTo: (msg: Message | null) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Contact discovery
  searchUsers: (query: string) => void;

  // Cross-chat search
  searchAllMessages: (query: string) => Promise<SearchResult[]>;

  // Disappearing messages
  disappearingTimers: Record<string, number>;
  setDisappearingTimer: (chatId: string, ttlSeconds: number) => void;
  getDisappearingRemaining: (chatId: string) => number;
  isDisappearingActive: (chatId: string) => boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
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
};

const AppContext = createContext<AppContextType | undefined>(undefined);

// ─── Helper Functions ─────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function getAvatarColor(userId: string): string {
  const colors = [
    '#e91e8c', '#1976d2', '#388e3c', '#f57c00',
    '#7b1fa2', '#00796b', '#d32f2f', '#1565c0',
  ];
  const hash = userId.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function normalizeFirestoreTimestamp(value: any): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapFirestoreMessage(raw: any, chatId: string): Message {
  const messageType = raw.messageType || (raw.mediaUrl ? 'image' : 'text');

  return {
    id: raw.messageId || raw.id || `${chatId}-${Date.now()}`,
    chatId,
    content: raw.content || '',
    type: messageType,
    senderId: raw.fromUid || raw.senderId || '',
    timestamp: normalizeFirestoreTimestamp(raw.timestamp),
    status: raw.status || 'sent',
    imageUrl: raw.mediaUrl || undefined,
    replyToId: raw.replyToId || undefined,
    replyToContent: raw.replyToContent || undefined,
    replyToSender: raw.replyToSender || undefined,
    expiresAt: raw.expiresAt?.toMillis?.() || raw.expiresAt || undefined,
    totalChunks: raw.totalChunks || undefined,
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Always true for Firebase as it manages its own connection
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ sent: number; total: number } | null>(null);

  // Internal: Firebase Auth UID (e.g. "3tMFJtJK...") — used ONLY for Firestore paths
  // that require auth UID (friendships, subcollection rules), NEVER for display.
  const [authUid, setAuthUid] = useState<string | null>(null);

  // WebSocket & Real Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [discoverableContacts, setDiscoverableContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);

  // Group Data
  const [groups, setGroups] = useState<any[]>([]);
  const [groupMessages, setGroupMessages] = useState<Record<string, Message[]>>({});

  // Chat Requests
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);

  // Call State
  const [activeIncomingCall, setActiveIncomingCall] = useState<CallRecord | null>(null);

  // Starred Messages State
  const [starredMessages, setStarredMessages] = useState<Message[]>([]);

  // Status State
  const [myStatuses, setMyStatuses] = useState<Status[]>([]);
  const [activeStatusViewer, setActiveStatusViewer] = useState<{ contactId: string; statusIndex: number } | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'chats' | 'calls' | 'status' | 'settings'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  // Loading state — true once initial listeners have fired at least once
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const chatsLoadedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingContacts, setTypingContacts] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('quidec_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  
  // Apply theme to document
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // ─── App Icon Badge (red circle with number on home screen) ────────────────
  useEffect(() => {
    const totalUnread = chats.reduce((sum, c) => sum + c.unreadCount, 0);
    setAppBadge(totalUnread);
  }, [chats]);

  // ─── Network Status Listener ──────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setIsReconnecting(true);
      console.log('🌐 Network: online');
    };
    const handleOffline = () => {
      setIsOffline(true);
      setIsReconnecting(false);
      console.log('📴 Network: offline');
    };

    const handleFlushResult = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsReconnecting(false);
      setSyncProgress(null);
      if (detail?.failed > 0) {
        import('sonner').then(({ toast }) => {
          toast.warning(`${detail.failed} message${detail.failed !== 1 ? 's' : ''} failed to send — will retry`);
        });
      } else if (detail?.sent > 0) {
        import('sonner').then(({ toast }) => {
          toast.success(`${detail.sent} message${detail.sent !== 1 ? 's' : ''} sent`);
        });
      }
    };

    const handleFlushProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setSyncProgress({ sent: detail.sent, total: detail.total });
      }
    };

    setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offlineFlushResult', handleFlushResult);
    window.addEventListener('offlineFlushProgress', handleFlushProgress);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offlineFlushResult', handleFlushResult);
      window.removeEventListener('offlineFlushProgress', handleFlushProgress);
    };
  }, []);

  // ─── Auto-flush message queue on reconnect ────────────────────────────────
  useEffect(() => {
    const cleanup = startAutoFlushOnReconnect(() => currentUser?.userId || null);
    return cleanup;
  }, [currentUser]);

  // ─── Presence & Typing Refs ──────────────────────────────────────────────
  const presenceUnsubscribeRef = useRef<(() => void) | null>(null);
  const typingUnsubscribeRef = useRef<(() => void) | null>(null);
  const friendsUnsubscribeRef = useRef<(() => void) | null>(null);
  const requestsUnsubscribeRef = useRef<(() => void) | null>(null);
  const outgoingRequestsUnsubscribeRef = useRef<(() => void) | null>(null);
  const conversationsUnsubscribeRef = useRef<(() => void) | null>(null);
  const statusUnsubscribeRef = useRef<(() => void) | null>(null);
  const statusListenersRef = useRef<Record<string, () => void>>({});
  const callHistoryUnsubscribeRef = useRef<(() => void) | null>(null);
  const incomingCallUnsubscribeRef = useRef<(() => void) | null>(null);
  const deviceSessionUnsubscribeRef = useRef<(() => void) | null>(null);

  // ─── Helper: merge messages into a chat (used by pagination/local store)
  const addMessagesToChat = useCallback((chatId: string, items: Message[]) => {
    if (!chatId || !items || items.length === 0) return;
    setMessages(prev => {
      const existing = prev[chatId] || [];
      // Prepend older items, dedupe by id and sort by timestamp
      const merged = [...items, ...existing];
      const map = new Map<string, Message>();
      merged.forEach((m) => map.set(m.id, m));
      const combined = Array.from(map.values());
      combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return { ...prev, [chatId]: combined };
    });
  }, []);

  // ─── Auth Methods ─────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<any> => {
    setIsAuthenticating(true);
    loginInProgress.current = true;
    try {
      const result = await authService.loginUser(email, password);

      if (!result.success) {
        console.error('Login failed:', result.message);
        setIsAuthenticating(false);
        loginInProgress.current = false;
        return result;
      }

      // Resolve the custom handle (Quidec ID) by querying Firestore via auth UID.
      // result.user.displayName may be a human name (e.g. "preetb"), NOT the custom
      // handle doc ID (e.g. "preetb.5815"), so we query by uid field instead.
      let customId = result.username || result.user?.email?.split('@')[0] || email.split('@')[0];
      let profileName = result.user?.displayName || email.split('@')[0];
      let profileAvatar = result.user?.photoURL || null;
      let profileAbout = '';
      try {
        const uid = result.user?.uid;
        if (uid) {
          const q = query(collection(db, 'users'), where('uid', '==', uid));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const rawData = userDoc.data();
            const data = await decryptUserData(userDoc.id, rawData).catch(() => rawData);
            profileName = data.displayName || profileName;
            profileAvatar = data.photoURL || profileAvatar;
            profileAbout = data.about || '';
            customId = userDoc.id || data.username || customId;
            console.log('✅ Login profile resolved via uid:', { name: profileName, customId, docId: userDoc.id });
          } else {
            console.warn('⚠️ Login: no Firestore doc found by uid, using fallback');
          }
        }
      } catch (profileErr) {
        console.warn('⚠️ Could not fetch profile during login:', profileErr);
      }
      const user: CurrentUser = {
        name: profileName,
        email: email,
        userId: customId,
        avatar: profileAvatar,
        about: profileAbout,
      };
      setCurrentUser(user);
      setAuthUid(result.user?.uid || null); // Store auth UID for internal Firestore paths
      setNeedsVerification(!result.emailVerified);

      setIsOnboarded(!!result.emailVerified);

      // Initialize production collections
      if (result.emailVerified) {
        initializeProductionCollections().catch(err => console.warn('⚠️ Collection init skipped:', err));

        // Initialize E2EE key pair (ECDH + HKDF + Ratchet)
        import('../../utils/e2ee').then(({ ensureKeyPair }) => {
          ensureKeyPair(customId).catch(err => console.warn('⚠️ E2EE key pair init skipped:', err));
        });
      }

      // NOTE: Permission requests for returning users are handled by the
      // Native Permissions useEffect below (triggered by isOnboarded change).

      // ── Load locally stored messages for all known chats ──
      try {
        const uid = user.userId;
        // We load lazily per-chat as chats are opened (see loadChatMessages below)
        // But pre-load is triggered in the WebSocket open handler after friends-list arrives
        console.log('📦 Local message store ready for user', uid);
      } catch (storeErr) {
        console.warn('⚠️ Could not pre-load local messages:', storeErr);
      }

      return { success: true, emailVerified: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, message: (err as any).message || 'Login failed' };
    } finally {
      setIsAuthenticating(false);
      loginInProgress.current = false;
    }
  }, []);


  const register = useCallback(async (email: string, username: string, password: string): Promise<any> => {
    setIsAuthenticating(true);
    try {
      const result = await authService.registerUser(email, username, password);

      if (!result.success) {
        console.error('Registration failed:', result.message);
        return result;
      }

      // Registration successful - user needs to verify email
      // result.username = custom handle (e.g. "preet.5815") generated in registerUser
      const regCustomId = result.username || username;
      const user: CurrentUser = {
        name: username,
        email: email,
        userId: regCustomId,
        avatar: null,
        about: '',
      };
      setCurrentUser(user);
      setAuthUid(result.user?.uid || null); // Store auth UID for internal Firestore paths
      setNeedsVerification(true);
      setIsOnboarded(false);

      // NOTE: Permission requests are deferred until after email verification
      // (see the Native Permissions useEffect). Requesting here is too early
      // and causes crashes when combined with the post-verification flow.

      return { success: true, emailVerified: false, user: result.user };
    } catch (err) {
      console.error('Registration error:', err);
      return { success: false, message: (err as any).message || 'Registration failed' };
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      await authService.logoutUser();
      setCurrentUser(null);
      setAuthUid(null);
      setIsOnboarded(false);
      setContacts([]);
      setMessages({});
      setChatRequests([]);
      
      // Cleanup all Firebase listeners
      presenceUnsubscribeRef.current?.();
      typingUnsubscribeRef.current?.();
      friendsUnsubscribeRef.current?.();
      requestsUnsubscribeRef.current?.();
      outgoingRequestsUnsubscribeRef.current?.();
      conversationsUnsubscribeRef.current?.();

      clearKeyCache(); // Clear encryption keys on logout

      // Reset onboarding state so next login goes through full flow
      permissionManager.resetOnboardingState().catch(() => {});
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsAuthenticating(false);
      navigate('/login');
    }
  }, [navigate]);

  const initialAuthChecked = useRef(false);
  const loginInProgress = useRef(false);

  // ─── Splash Screen Timer ──────────────────────────────────────────────────
  // Always show splash screen for minimum 2.5s on every app open
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // ─── Initialize Auth State on Mount ───────────────────────────────────────
  useEffect(() => {
    const authUnsubscribe = authService.onAuthStateChange(async (currentFirebaseUser) => {
      // If a login is in progress, skip — the login() function handles state
      if (loginInProgress.current) return;
      // If we already finished the initial check, don't do it again
      if (initialAuthChecked.current) return;

      console.log('🔍 Initial Auth Check:', currentFirebaseUser ? `User ${currentFirebaseUser.email}` : 'No user detected');
      
      try {
        if (currentFirebaseUser) {
          console.log('📧 Email verified:', currentFirebaseUser.emailVerified);
          if (currentFirebaseUser.emailVerified) {
            // Fetch profile — always resolve via auth UID first, since displayName
            // on the auth profile may be a human name (e.g. "preetb") while the
            // Firestore doc ID is the custom handle (e.g. "preetb.5815").
            let about = 'Available';
            let avatar = currentFirebaseUser.photoURL || null;
            let name = currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User';
            let userId = currentFirebaseUser.uid; // Temporary; will be replaced by custom handle

            try {
              // PRIMARY: Query by uid field to find the Firestore doc.
              // The doc ID IS the custom handle / Quidec ID (e.g. "preetb.5815").
              console.log('📥 Resolving profile via auth UID:', currentFirebaseUser.uid);
              const q = query(collection(db, 'users'), where('uid', '==', currentFirebaseUser.uid));
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                const userDoc = querySnapshot.docs[0];
                const rawData = userDoc.data();
                const data = await decryptUserData(userDoc.id, rawData).catch(() => rawData);
                about = data.about || about;
                avatar = data.photoURL || avatar;
                name = data.displayName || name;
                // userId = custom handle from doc ID (preferred) or username field
                userId = userDoc.id || data.username || currentFirebaseUser.uid;
                console.log('✅ Profile resolved via uid:', { name, userId, docId: userDoc.id });
                setIsOnboarded(true);
              } else {
                // Fallback: displayName might be the custom handle itself
                const handle = currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User';
                console.warn('⚠️ No doc found by uid, trying displayName as doc ID:', handle);
                const handleDoc = await getDoc(doc(db, 'users', handle));
                if (handleDoc.exists()) {
                  const rawData = handleDoc.data();
                  const data = await decryptUserData(handle, rawData).catch(() => rawData);
                  about = data.about || about;
                  avatar = data.photoURL || avatar;
                  name = data.displayName || name;
                  userId = data.username || handle;
                  console.log('✅ Profile resolved via displayName:', { name, userId });
                } else {
                  console.warn('⚠️ All profile lookups failed, using displayName as userId');
                  userId = handle;
                  name = handle;
                }
                setIsOnboarded(true);
              }
            } catch (docErr) {
              console.warn('⚠️ Profile fetch skipped (error):', docErr);
              // Last resort: use displayName (could be human name, but never auth UID)
              const handle = currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User';
              userId = handle;
              name = handle;
              setIsOnboarded(true);
            }

            const user: CurrentUser = {
              name,
              email: currentFirebaseUser.email || '',
              userId, // Always the custom handle, never the raw Firebase Auth UID
              avatar,
              about,
            };
            
            setCurrentUser(user);
            setAuthUid(currentFirebaseUser.uid); // Store auth UID for internal Firestore paths
            setNeedsVerification(false);
            // Moved isOnboarded to inside the if/else above
            console.log('🚀 Finalizing state: ONBOARDED');

            // Background initializations
            initializeProductionCollections().catch(() => {});
            // Run migration to clear old device-salt encrypted data.
            // Key rotation is disabled for now — both users must agree on the same
            // key version, which requires shared state (not per-device Preferences).
            migrateOldEncryptionData().catch(() => {});
            getEncryptionKey(user.userId).then(key => initializePushNotifications(user.userId, key)).catch(() => {});

            // Initialize E2EE key pair (ECDH + HKDF + Ratchet)
            import('../../utils/e2ee').then(({ ensureKeyPair }) => {
              ensureKeyPair(user.userId).catch(err => console.warn('⚠️ E2EE key pair init skipped:', err));
            });
          } else {
            console.log('🚀 Finalizing state: NEEDS_VERIFICATION');
            
            // Resolve custom username for unverified users.
            // displayName was set to the custom ID (e.g. "preet.5815") during registration.
            let customUsernameForUnverified = currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User';
            // Also try Firestore lookup to confirm, but prefer displayName
            try {
              const customUsername = await getCustomUsernameByFirebaseUid(currentFirebaseUser.uid);
              if (customUsername) {
                customUsernameForUnverified = customUsername;
              }
            } catch (err) {
              console.warn('⚠️ Could not fetch custom username for unverified user:', err);
            }
            
            setCurrentUser({
              name: currentFirebaseUser.displayName || 'User',
              email: currentFirebaseUser.email || '',
              userId: customUsernameForUnverified,
              avatar: null,
              about: '',
            });
            setAuthUid(currentFirebaseUser.uid); // Store auth UID for internal Firestore paths
            setNeedsVerification(true);
            setIsOnboarded(false);
          }
        } else {
          // No user - but give it a tiny bit of extra time to be absolutely sure
          console.log('❓ No user found yet, verifying...');
          await new Promise(r => setTimeout(r, 500));
          
          // Re-check current user from auth object directly
          const reCheckUser = authService.getCurrentUserSync(); 
          if (!reCheckUser) {
            console.log('🚀 Finalizing state: NOT_LOGGED_IN');
            setCurrentUser(null);
            setIsOnboarded(false);
            setNeedsVerification(false);
          } else {
             // If we found a user on re-check, don't finish yet
             return; 
          }
        }
      } catch (err) {
        console.error('❌ Auth init error:', err);
        setIsOnboarded(false);
      } finally {
        setIsAuthenticating(false);
        initialAuthChecked.current = true;
        console.log('🏁 Auth Initialization Complete');
      }
    });

    return () => authUnsubscribe();
  }, []);

  // ─── Monitor Email Verification Changes ───────────────────────────────────
  useEffect(() => {
    if (!currentUser || !needsVerification) return;

    let verificationCheckInterval: ReturnType<typeof setInterval> | null = null;
    
    const checkEmailVerification = async () => {
      try {
        const firebaseUser = await authService.reloadUser();
        if (firebaseUser?.emailVerified) {
          console.log('✅ Email verification detected! Updating app state...');
          
          // Fetch updated profile — resolve via auth UID first
          let about = 'Available';
          let avatar = firebaseUser.photoURL || null;
          let name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
          let userId = firebaseUser.uid; // Temporary; will be replaced by custom handle

          try {
            // PRIMARY: Query by uid field to find the Firestore doc
            const q = query(collection(db, 'users'), where('uid', '==', firebaseUser.uid));
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
            const querySnapshot = await Promise.race([getDocs(q), timeout]) as any;

            if (querySnapshot && !querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              const rawData = userDoc.data();
              const data = await decryptUserData(userDoc.id, rawData).catch(() => rawData);
              about = data.about || about;
              avatar = data.photoURL || avatar;
              name = data.displayName || name;
              userId = userDoc.id || data.username || firebaseUser.uid;
            } else {
              // Fallback: displayName might be the custom handle
              const handle = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
              const handleDoc = await getDoc(doc(db, 'users', handle));
              if (handleDoc.exists()) {
                const rawData = handleDoc.data();
                const data = await decryptUserData(handle, rawData).catch(() => rawData);
                about = data.about || about;
                avatar = data.photoURL || avatar;
                name = data.displayName || name;
                userId = data.username || handle;
              } else {
                userId = handle;
                name = handle;
              }
            }
          } catch (docErr) {
            console.warn('⚠️ Profile fetch skipped:', docErr);
            const handle = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
            userId = handle;
            name = handle;
          }

          // Update context state
          setCurrentUser({
            name,
            email: firebaseUser.email || '',
            userId,
            avatar,
            about,
          });
          setAuthUid(firebaseUser.uid); // Store auth UID for internal Firestore paths
          setNeedsVerification(false);
          setIsOnboarded(true);
          
          // Stop checking
          if (verificationCheckInterval) clearInterval(verificationCheckInterval);

          // Initialize background services
          initializeProductionCollections().catch(() => {});

          // Initialize push notifications (non-blocking, with its own error handling)
          getEncryptionKey(userId).then(key => initializePushNotifications(userId, key)).catch(() => {});

          // Mark onboarding complete for crash recovery
          permissionManager.markOnboardingComplete().catch(() => {});

          console.log('🚀 Email verified! User is now onboarded');
        }
      } catch (err) {
        console.warn('⚠️ Verification check error:', err);
      }
    };

    // Check every 3 seconds for email verification
    verificationCheckInterval = setInterval(checkEmailVerification, 3000);
    
    return () => {
      if (verificationCheckInterval) clearInterval(verificationCheckInterval);
    };
  }, [currentUser, needsVerification]);

  // ─── Detect Email Change After Verification ───────────────────────────────
  // When a user changes their email via verifyBeforeUpdateEmail, Firebase
  // updates auth.currentUser.email after they click the verification link.
  // This effect detects that change and syncs it to Firestore + local state.
  useEffect(() => {
    if (!currentUser || !isOnboarded) return;

    const emailCheckInterval = setInterval(async () => {
      try {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;

        await firebaseUser.reload();
        const latestEmail = firebaseUser.email || '';

        // If the email in Firebase Auth differs from our local state, sync it
        if (latestEmail !== currentUser.email) {
          console.log(`📧 Email change detected: ${currentUser.email} → ${latestEmail}`);

          // Update Firestore
          const userRef = doc(db, 'users', currentUser.userId);
          const encFields = await encryptUserData(currentUser.userId, { email: latestEmail });
          await updateDoc(userRef, {
            ...encFields,
            updatedAt: serverTimestamp(),
          });

          // Update local state
          setCurrentUser((prev) => (prev ? { ...prev, email: latestEmail } : null));
          console.log('✅ Email synced to Firestore and local state');
          toast.success('Email updated successfully', { description: `Your email has been changed to ${latestEmail}` });
        }
      } catch (err) {
        // Silently ignore — this is a background check
      }
    }, 5000);

    return () => clearInterval(emailCheckInterval);
  }, [currentUser, isOnboarded]);

  // ─── Native Permissions Initialization ────────────────────────────────────
  // Runs when isOnboarded becomes true (after email verification or returning user).
  // Uses crash recovery: if onboarding was already completed in a previous session,
  // skip re-requesting permissions to avoid infinite crash loops.
  useEffect(() => {
    if (!isOnboarded || !currentUser) return;

    const requestNativePermissions = async () => {
      try {
        // Crash recovery: if onboarding was already completed, skip permissions
        const alreadyCompleted = await permissionManager.hasCompletedOnboarding();
        if (alreadyCompleted) {
          console.log('✅ Onboarding already completed in previous session — skipping permission requests');
          return;
        }

        console.log('🛡️ First-time onboarding: requesting Android permissions...');

        // Check if we've asked before (but maybe didn't complete)
        const hasAsked = await permissionManager.hasAskedPermissions();

        if (!hasAsked) {
          // First time: request all permissions sequentially
          const result = await permissionManager.requestAllPermissions();
          console.log('📱 Permissions granted:', result);

          // Request notification permission separately via the LocalNotifications API
          // (Android 13+ POST_NOTIFICATIONS). This is the only safe path — the
          // PushNotifications API crashes the app on Android 13+ when accepted.
          const notifGranted = await requestNotificationPermissions();
          if (notifGranted) {
            const saved = await permissionManager.loadPermissionStatus() || { camera: true, microphone: true, storage: true, notifications: false };
            saved.notifications = true;
            await permissionManager.savePermissionStatus(saved);
          }
        } else {
          // Asked before but onboarding wasn't completed (possible crash):
          // only request missing permissions
          console.log('⚠️ Permissions were asked but onboarding did not complete — requesting missing only');
          const result = await permissionManager.requestMissingPermissions();
          console.log('📱 Permission status:', result);
        }
      } catch (err) {
        console.warn('⚠️ Permission initialization error (non-fatal):', err);
      }
    };

    requestNativePermissions();
  }, [isOnboarded, currentUser]);

  // ─── Offline-First: Load messages from local .bin store on startup ─────────
  // Pre-populates the messages state from encrypted local storage so the user
  // sees their message history immediately, even before Firestore connects.
  useEffect(() => {
    if (!currentUser || !isOnboarded) return;

    let cancelled = false;

    const loadLocalMessages = async () => {
      try {
        // One-time: clear old data encrypted with incompatible device-salt key
        await migrateOldEncryptionData();

        const chatIds = await listLocalChatIds(currentUser.userId);
        if (cancelled || chatIds.length === 0) return;

        const localData = await loadAllChats(currentUser.userId, chatIds);
        if (cancelled) return;

        const myId = currentUser.userId;

        setMessages(prev => {
          const next = { ...prev };
          for (const [chatId, storedMsgs] of Object.entries(localData)) {
            if (storedMsgs.length === 0) continue;
            if (!next[chatId] || next[chatId].length === 0) {
              next[chatId] = storedMsgs.map(m => ({
                id: m.id,
                chatId: m.chatId,
                content: m.content,
                type: m.type,
                senderId: m.senderId,
                timestamp: m.timestamp,
                status: m.status,
                imageUrl: m.mediaPath || undefined,
                replyToId: m.replyToId,
                replyToContent: m.replyToContent,
                replyToSender: m.replyToSender,
                expiresAt: m.expiresAt,
                isEdited: m.isEdited,
                keyVersion: m.keyVersion,
                hmac: m.hmac,
                isStarred: m.isStarred,
                reactions: m.reactions,
              }));
            }
          }
          return next;
        });

        // Create Chat entries from local data so the chat list is populated
        setChats(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newChats: Chat[] = [];

          for (const [chatId, storedMsgs] of Object.entries(localData)) {
            if (storedMsgs.length === 0 || existingIds.has(chatId)) continue;

            // Derive contactId from conversation ID (sorted UIDs joined by _)
            let contactId = chatId;
            if (chatId.startsWith(myId + '_')) {
              contactId = chatId.slice(myId.length + 1);
            } else if (chatId.endsWith('_' + myId)) {
              contactId = chatId.slice(0, chatId.length - myId.length - 1);
            }

            const lastMsg = storedMsgs[storedMsgs.length - 1];
            const unreadCount = storedMsgs.filter(
              m => m.senderId !== myId && m.status !== 'read'
            ).length;

            newChats.push({
              id: chatId,
              contactId,
              lastMessage: lastMsg.content,
              lastMessageTime: lastMsg.timestamp,
              lastMessageSender: lastMsg.senderId,
              unreadCount,
            });
          }

          return newChats.length > 0 ? [...newChats, ...prev] : prev;
        });

        console.log(`📦 Loaded local messages for ${chatIds.length} chats`);
      } catch (err) {
        console.warn('⚠️ Failed to load local messages:', err);
      }
    };

    loadLocalMessages();
    return () => { cancelled = true; };
  }, [currentUser, isOnboarded]);

  // Store chat list in ref so the listener callback always sees latest chats without re-subscribing
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  useEffect(() => {
    if (!currentUser) return;

    // Set up listeners for all current chats — but only re-subscribe when currentUser changes,
    // NOT when chats changes. This prevents the catastrophic listener churn where every new
    // message tears down and re-creates all Firestore onSnapshot listeners.
    const setupListeners = () => {
      const currentChats = chatsRef.current;
      if (currentChats.length === 0) return [];

      return currentChats.map((chat) => {
        if (!chat.contactId) return () => {};

        const myId = currentUser.userId;
        let otherUserId = chat.contactId;
        if (otherUserId === myId) {
          if (chat.id.startsWith(myId + '_')) {
            otherUserId = chat.id.slice(myId.length + 1);
          } else if (chat.id.endsWith('_' + myId)) {
            otherUserId = chat.id.slice(0, chat.id.length - myId.length - 1);
          }
        }

        return messageService.listenToMessages(
          currentUser.userId,
          otherUserId,
          (rawMessages) => {
            const mappedMessages = rawMessages.map((raw) => mapFirestoreMessage(raw, chat.id));

            setMessages((prev) => {
              if (rawMessages.length === 0 && prev[chat.id] && prev[chat.id].length > 0) {
                return prev;
              }
              const firestoreIds = new Set(mappedMessages.map(m => m.id));
              const optimistic = (prev[chat.id] || []).filter(m => !firestoreIds.has(m.id));
              return {
                ...prev,
                [chat.id]: [...optimistic, ...mappedMessages],
              };
            });

            if (mappedMessages.length > 0) {
              const lastMessage = mappedMessages[mappedMessages.length - 1];
              setChats((prev) =>
                prev.map((item) =>
                  item.id === chat.id
                    ? {
                        ...item,
                        lastMessage: lastMessage.content,
                        lastMessageTime: lastMessage.timestamp,
                        lastMessageSender: lastMessage.senderId,
                      }
                    : item
                )
              );
            }
          }
        );
      });
    };

    const unsubscribers = setupListeners();

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup errors
        }
      });
    };
  }, [currentUser]); // Removed `chats` from deps — messages arrive via RTDB, not these Firestore listeners

  // ─── Group Messages Listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || groups.length === 0) return;

    const unsubscribers = groups.map((group) => {
      return groupService.listenToGroupMessages(group.groupId, (msgs) => {
        const mappedMessages: Message[] = msgs.map((raw: any) => ({
          id: raw.messageId || raw.id,
          chatId: raw.groupId,
          senderId: raw.senderId,
          content: raw.content || '',
          type: raw.messageType || 'text',
          timestamp: normalizeFirestoreTimestamp(raw.timestamp),
          status: 'sent',
          imageUrl: raw.mediaUrl || undefined,
          replyToId: raw.replyToId || undefined,
          replyToContent: raw.replyToContent || undefined,
          replyToSender: raw.replyToSender || undefined,
        }));

        setGroupMessages(prev => ({
          ...prev,
          [group.groupId]: mappedMessages,
        }));

        // Also update the main messages map so ChatWindow can render
        setMessages(prev => ({
          ...prev,
          [group.groupId]: mappedMessages,
        }));

        // Update chat preview
        if (mappedMessages.length > 0) {
          const lastMsg = mappedMessages[mappedMessages.length - 1];
          setChats(prev => prev.map(c =>
            c.id === group.groupId
              ? {
                  ...c,
                  lastMessage: lastMsg.content,
                  lastMessageTime: lastMsg.timestamp,
                  lastMessageSender: lastMsg.senderId,
                  unreadCount: (activeChatIdRef.current === group.groupId) ? 0 : (c.unreadCount + 1),
                }
              : c
          ));
        }
      });
    });

    return () => {
      unsubscribers.forEach(unsub => {
        try { unsub(); } catch { /* ignore */ }
      });
    };
  }, [currentUser, groups]);

  const completeOnboarding = useCallback((user: CurrentUser) => {
    setCurrentUser(user);
    setIsOnboarded(true);
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<CurrentUser>) => {
    if (!currentUser) return;

    try {
      let avatarToSave = updates.avatar;

      // If updating avatar and it's a dataURL (new selection from camera/file picker)
      if (updates.avatar && updates.avatar.startsWith('data:')) {
        console.log('📦 Saving profile picture directly...');
        // Store the compressed dataURL directly in Firestore (within 1MB doc limit)
        avatarToSave = updates.avatar;
        // Update resolved URL immediately for UI responsiveness
        setCurrentUserAvatarUrl(updates.avatar);
      }

      // Persist to Firebase
      await authService.updateUserProfile({
        name: updates.name,
        avatar: avatarToSave,
        about: updates.about,
        userId: updates.userId || currentUser.userId
      });

      // Update local state
      setCurrentUser((prev) => (prev ? { ...prev, ...updates, avatar: avatarToSave || prev.avatar } : null));
      console.log('✅ Profile saved to Firestore and local storage');
    } catch (err) {
      console.error('❌ Failed to save profile:', err);
      throw err;
    }
  }, [currentUser]);

  // ─── Update User Email ────────────────────────────────────────────────────
  const updateUserEmail = useCallback(async (newEmail: string) => {
    if (!currentUser) return;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      // Reload Firebase user to get latest email (in case it was changed via verification link)
      await user.reload();
      const latestEmail = user.email || newEmail;

      // Update Firestore user document
      const userRef = doc(db, 'users', currentUser.userId);
      const encFields = await encryptUserData(currentUser.userId, { email: latestEmail });
      await updateDoc(userRef, {
        ...encFields,
        updatedAt: serverTimestamp(),
      });

      // Update local state
      setCurrentUser((prev) => (prev ? { ...prev, email: latestEmail } : null));
      console.log('✅ Email updated to:', latestEmail);
    } catch (err: any) {
      console.error('❌ Failed to update email:', err);
      throw err;
    }
  }, [currentUser]);

  // ─── Disappearing Messages ────────────────────────────────────────────────
  // chatId → ttl in seconds (0 = disabled)
  const [disappearingTimers, setDisappearingTimers] = useState<Record<string, number>>({});

  /** Enable or disable disappearing messages for a specific chat */
  const setDisappearingTimer = useCallback((chatId: string, ttlSeconds: number) => {
    setDisappearingTimers(prev => {
      const next = { ...prev };
      if (ttlSeconds <= 0) {
        delete next[chatId];
      } else {
        next[chatId] = ttlSeconds;
      }
      return next;
    });

    // Persist to Firestore
    if (currentUser) {
      const chatRef = doc(db, 'users', currentUser.userId, 'chatSettings', chatId);
      setDoc(chatRef, {
        disappearingTtl: ttlSeconds,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }

    console.log(`⏱️ Disappearing messages ${ttlSeconds > 0 ? `enabled (${ttlSeconds}s)` : 'disabled'} for chat ${chatId}`);
  }, [currentUser]);

  /** Get remaining seconds for the last message in a chat, or 0 if disabled */
  const getDisappearingRemaining = useCallback((chatId: string): number => {
    const ttl = disappearingTimers[chatId];
    if (!ttl || ttl <= 0) return 0;
    const chatMsgs = messages[chatId];
    if (!chatMsgs || chatMsgs.length === 0) return 0;
    const lastMsg = chatMsgs[chatMsgs.length - 1];
    if (!lastMsg.expiresAt) return 0;
    const remaining = Math.round((lastMsg.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }, [disappearingTimers, messages]);

  /** Check if disappearing messages are active for a chat */
  const isDisappearingActive = useCallback((chatId: string): boolean => {
    return (disappearingTimers[chatId] || 0) > 0;
  }, [disappearingTimers]);

  // Cleanup timer: runs every 10s and removes expired messages from local state + persists to local store
  useEffect(() => {
    if (!currentUser) return;

    const cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const expiredByChat: Record<string, string[]> = {};

      setMessages(prev => {
        const next: typeof prev = {};
        for (const [chatId, msgs] of Object.entries(prev)) {
          const expired = msgs.filter(m => m.expiresAt && m.expiresAt <= now);
          if (expired.length > 0) {
            expiredByChat[chatId] = expired.map(m => m.id);
          }
          const filtered = msgs.filter(m => !m.expiresAt || m.expiresAt > now);
          next[chatId] = filtered;
        }
        return next;
      });

      // Persist deletions to local store
      for (const [chatId, expiredIds] of Object.entries(expiredByChat)) {
        try {
          const { loadMessages, saveMessages } = await import('../../utils/sqliteMessageStore');
          const stored = await loadMessages(currentUser.userId, chatId);
          const remaining = stored.filter(m => !expiredIds.includes(m.id));
          if (remaining.length !== stored.length) {
            await saveMessages(currentUser.userId, chatId, remaining);
            console.log(`🧹 Removed ${expiredIds.length} expired message(s) from local store for chat ${chatId}`);
          }
        } catch (err) {
          console.warn('⚠️ Failed to persist expired message cleanup:', err);
        }
      }
    }, 10000);

    return () => clearInterval(cleanupInterval);
  }, [currentUser]);

  // Load per-chat disappearing message settings on mount
  useEffect(() => {
    if (!currentUser || !isOnboarded) return;

    const loadSettings = async () => {
      try {
        const q2 = query(collection(db, 'users', currentUser.userId, 'chatSettings'));
        const snap = await getDocs(q2);
        const timers: Record<string, number> = {};
        snap.forEach(d => {
          const data = d.data();
          if (data.disappearingTtl > 0) {
            timers[d.id] = data.disappearingTtl;
          }
        });
        if (Object.keys(timers).length > 0) {
          setDisappearingTimers(prev => ({ ...prev, ...timers }));
          console.log(`⏱️ Loaded disappearing message settings for ${Object.keys(timers).length} chats`);
        }
      } catch (err) {
        console.warn('⚠️ Could not load disappearing message settings:', err);
      }
    };
    loadSettings();
  }, [currentUser, isOnboarded]);

  // ─── Initialize Real-time Listeners ───────────────────────────────────────
  // This is the main initialization that runs after isOnboarded becomes true.
  // It sets up push notifications, Android settings, and all Firebase listeners.
  // On success, it marks onboarding as complete for crash recovery.
  useEffect(() => {
    if (!currentUser || !isOnboarded) {
      return;
    }

    const uid = currentUser.userId;
    console.log('🔗 Establishing real-time Firebase listeners for', uid);

    // Small delay to let any in-flight permission dialogs settle
    // before starting async initialization
    const INIT_DELAY_MS = 500;
    let onboardingMarkedComplete = false;

    const initializeAll = async () => {
      await new Promise(resolve => setTimeout(resolve, INIT_DELAY_MS));

      // 0. Initialize Push Notifications & Action Groups
      try {
        const { initializePushNotifications, setupNotificationActions, setNotificationsEnabled } = await import('../../utils/fcm');
        await setupNotificationActions();
        await initializePushNotifications(uid, null);
        setNotificationsEnabled(settings.notifications);
        console.log('✅ Push notifications initialized');
      } catch (err) {
        console.warn('⚠️ Notification init failed (non-fatal):', err);
      }

      // 0.1 Initialize notification channels (Android 8+)
      try {
        await initializeNotificationChannels();
        console.log('✅ Android notification channels initialized');
      } catch (err) {
        console.warn('⚠️ Notification channels init failed (non-fatal):', err);
      }

      // 0.2 Initialize settings persistence (load from native storage + Firebase)
      try {
        const loadedSettings = await initSettingsPersistence(uid);
        setSettings(prev => ({ ...prev, ...loadedSettings }));
        console.log('✅ Settings loaded from native storage and Firebase');
      } catch (err) {
        console.warn('⚠️ Settings persistence init failed (non-fatal):', err);
      }

      // 0.3 Load privacy settings
      try {
        await getPrivacySettings(uid);
        console.log('✅ Privacy settings loaded');
      } catch (err) {
        console.warn('⚠️ Privacy settings load failed (non-fatal):', err);
      }

      // 0.4 Load account security settings
      try {
        await getAccountSecuritySettings(uid);
        console.log('✅ Account security settings loaded');
      } catch (err) {
        console.warn('⚠️ Security settings load failed (non-fatal):', err);
      }

      // 0.5 Create device session and listen for linked devices
      try {
        const pushToken = localStorage.getItem('fcm_token');
        await createDeviceSession(uid, 'mobile', pushToken || undefined);
        console.log('✅ Device session created for linked devices');
      } catch (err) {
        console.warn('⚠️ Device session creation failed (non-fatal):', err);
      }

      // 0.6 Listen to device sessions for real-time updates
      try {
        deviceSessionUnsubscribeRef.current = listenToDeviceSessions(uid, (sessions) => {
          console.log('📱 Active devices: ' + sessions.length);
        });
      } catch (err) {
        console.warn('⚠️ Device session listener failed (non-fatal):', err);
      }

      // 0.7 Mark onboarding as complete ONLY after all initialization succeeded
      // This is the crash-recovery flag that prevents re-requesting permissions
      try {
        await permissionManager.markOnboardingComplete();
        onboardingMarkedComplete = true;
        console.log('✅ Onboarding marked complete');
      } catch (err) {
        console.warn('⚠️ Failed to mark onboarding complete:', err);
      }

      // 0.8 Run data retention cleanup (non-blocking, fire-and-forget)
      try {
        const { dataRetention } = await import('../../utils/services/dataRetention');
        dataRetention.runAllCleanup(uid).catch(err => {
          console.warn('⚠️ Data retention cleanup failed (non-fatal):', err);
        });
      } catch (err) {
        console.warn('⚠️ Data retention module load failed (non-fatal):', err);
      }
    };

    // Run initialization in background (don't block listener setup)
    initializeAll().catch(err => {
      console.error('❌ Unexpected error during initialization:', err);
    });

    // Service Worker message listener — navigate to conversation when notification is clicked
    const swMessageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CONVERSATION' && event.data?.conversationId) {
        console.log('📬 SW: Navigate to conversation', event.data.conversationId);
        setActiveChatId(event.data.conversationId);
      }
    };
    navigator.serviceWorker?.addEventListener('message', swMessageHandler);

    // 1. Listen to Friends List — friendships doc is keyed by custom handle
    friendsUnsubscribeRef.current = presenceService.listenToFriends(uid, (rawFriends) => {
      const normalized = rawFriends.map((f, i) => normalizeContact(f, i));
      setContacts(normalized);
      if (!chatsLoaded) setChatsLoaded(true);
    });

    // 2. Listen to Friends Presence — friendships doc is keyed by custom handle
    presenceUnsubscribeRef.current = presenceService.listenToFriendsPresence(uid, (friendsStatus) => {
      setContacts(prev => prev.map(contact => {
        const status = friendsStatus[contact.id];
        if (status) {
          return {
            ...contact,
            isOnline: status.online,
            lastSeen: status.online ? 'online' : `last seen ${(() => {
              const ls = status.lastSeen;
              if (!ls) return 'offline';
              if (typeof ls?.toDate === 'function') return ls.toDate().toLocaleTimeString();
              if (typeof ls?.seconds === 'number') return new Date(ls.seconds * 1000).toLocaleTimeString();
              try { const d = new Date(ls); return isNaN(d.getTime()) ? 'offline' : d.toLocaleTimeString(); } catch { return 'offline'; }
            })()}`,
          };
        }
        return contact;
      }));
    });

    // 3. Listen to Friend Requests (Incoming + Outgoing)
    const incomingRequestsRef = { current: [] as any[] };
    const outgoingRequestsRef = { current: [] as any[] };

    const mergeRequests = () => {
      const incoming = incomingRequestsRef.current.map((req: any) => ({
        id: req.id,
        contactId: req.fromUid,
        direction: 'incoming' as const,
        status: 'pending' as const,
        timestamp: normalizeFirestoreTimestamp(req.createdAt),
        previewMessage: `Friend request from ${req.fromUsername || req.fromUid}`,
      }));
      const outgoing = outgoingRequestsRef.current.map((req: any) => ({
        id: req.id,
        contactId: req.toUid,
        direction: 'outgoing' as const,
        status: 'pending' as const,
        timestamp: normalizeFirestoreTimestamp(req.createdAt),
        previewMessage: `Friend request to ${req.toUsername || req.toUid}`,
      }));
      setChatRequests([...incoming, ...outgoing]);
    };

    requestsUnsubscribeRef.current = friendRequestService.listenToPendingRequests(uid, (rawRequests) => {
      incomingRequestsRef.current = rawRequests;
      mergeRequests();
    });

    outgoingRequestsUnsubscribeRef.current = friendRequestService.listenToOutgoingRequests(uid, (rawRequests) => {
      outgoingRequestsRef.current = rawRequests;
      mergeRequests();
    });

    // 4. Listen to Incoming Messages (RTDB transient pipe - messages deleted after receipt)
    console.log(`👂 Setting up RTDB delivery listener for user: ${uid}`);
    conversationsUnsubscribeRef.current = messageService.listenToIncomingMessages(uid, async (msg) => {
      console.log('📬 New incoming message via Pipe:', msg.id, 'from:', msg.fromUid, 'conv:', msg.conversationId);
      const chatId = msg.conversationId || msg.fromUid;

      let decryptedContent = msg.content;
      if (msg.isEncrypted && msg.content) {
        try {
          const decrypted = await decryptMessageV2(msg.content, msg.fromUid, uid);
          decryptedContent = decrypted.content || '';
        } catch {
          console.warn('⚠️ Failed to decrypt incoming pipe message:', msg.id);
          decryptedContent = '[Message could not be decrypted]';
        }
      }

      const incomingMsg = mapFirestoreMessage({ ...msg, content: decryptedContent }, chatId);

      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), incomingMsg],
      }));

      // Persist incoming message to local SQLite so it survives refresh
      try {
        await appendLocalMessage(uid, {
          id: msg.id || incomingMsg.id,
          chatId,
          senderId: msg.fromUid,
          content: decryptedContent,
          type: (msg.messageType || 'text') as any,
          timestamp: incomingMsg.timestamp,
          status: 'delivered' as any,
          mediaPath: msg.mediaUrl || undefined,
          replyToId: msg.replyToId || undefined,
          replyToContent: msg.replyToContent || undefined,
          replyToSender: msg.replyToSender || undefined,
        });
      } catch (persistErr) {
        console.warn('⚠️ Failed to persist incoming pipe message to SQLite:', persistErr);
      }

      // Send delivery receipt back to sender (📨 double tick)
      try {
        await messageService.markMessageDelivered(chatId, msg.id, msg.fromUid);
      } catch (err) {
        console.warn('⚠️ Failed to send delivery receipt:', err);
      }

      // Update chat preview
      setChats((prev) => {
        const existing = prev.find(c => c.id === chatId);
        if (existing) {
          return prev.map(c => c.id === chatId ? {
            ...c,
            lastMessage: incomingMsg.content,
            lastMessageTime: incomingMsg.timestamp,
            lastMessageSender: incomingMsg.senderId,
            unreadCount: (activeChatIdRef.current === chatId) ? 0 : (c.unreadCount + 1)
          } : c);
        } else {
          return [{
            id: chatId,
            contactId: msg.fromUid,
            lastMessage: incomingMsg.content,
            lastMessageTime: incomingMsg.timestamp,
            lastMessageSender: incomingMsg.senderId,
            unreadCount: 1
          }, ...prev];
        }
      });

      // If user is actively viewing this chat, immediately send read receipts (blue tick)
      // This bypasses the markAsRead guard which skips when unreadCount is already 0
      if (activeChatIdRef.current === chatId && currentUser) {
        try {
          await messageService.markAllMessagesAsRead(chatId, currentUser.userId, msg.fromUid);
        } catch (err) {
          console.warn('⚠️ Failed to send immediate read receipts:', err);
        }
      }
    });

    // 5. Listen to Typing Indicators (global — convert string[] to Record<string, boolean>)
    typingUnsubscribeRef.current = typingService.listenToTyping(uid, 'all', (typingUsers) => {
      const typingRecord: Record<string, boolean> = {};
      typingUsers.forEach(u => { typingRecord[u] = true; });
      setTypingContacts(typingRecord);
    });

    // 6. Listen to Receipts (delivered double tick, read double blue tick)
    const STATUS_PRIORITY: Record<string, number> = { sent: 0, delivered: 1, read: 2 };
    const unsubscribeReceipts = messageService.listenToReceipts(uid, async (receipt) => {
      console.log(`📨 Received receipt: ${receipt.type} for ${receipt.messageId}`);

      const newStatus = receipt.type === 'delivered' ? 'delivered' : 'read';

      // Update in-memory state (only upgrade, never downgrade)
      setMessages((prev) => {
        const chatMessages = prev[receipt.conversationId];
        if (!chatMessages) return prev;

        return {
          ...prev,
          [receipt.conversationId]: chatMessages.map((msg) =>
            msg.id === receipt.messageId
              ? { ...msg, status: (STATUS_PRIORITY[newStatus] ?? 0) > (STATUS_PRIORITY[msg.status] ?? 0) ? newStatus : msg.status }
              : msg
          ),
        };
      });

      // Also persist to local .bin file (so status survives app restart)
      try {
        const { updateMessageStatus } = await import('../../utils/sqliteMessageStore');
        await updateMessageStatus(uid, receipt.conversationId, receipt.messageId, newStatus);
        console.log(`💾 Receipt status saved to local .bin: ${receipt.messageId} → ${newStatus}`);
      } catch (err) {
        console.warn('⚠️ Failed to persist receipt to local .bin:', err);
      }
    });

    // 7. Listen to Deletions (cross-device message deletion sync)
    const unsubscribeDeletions = messageService.listenToDeletions(uid, async (payload) => {
      console.log(`🗑️ Received deletion for message: ${payload.messageId}`);

      setMessages(prev => {
        const chatMessages = prev[payload.conversationId];
        if (!chatMessages) return prev;
        return {
          ...prev,
          [payload.conversationId]: chatMessages.map(m =>
            m.id === payload.messageId
              ? { ...m, content: '[Deleted]', type: 'system' as const }
              : m
          ),
        };
      });

      try {
        const { deleteMessageById } = await import('../../utils/sqliteMessageStore');
        await deleteMessageById(uid, payload.conversationId, payload.messageId);
      } catch (err) {
        console.warn('⚠️ Failed to sync deletion to local store:', err);
      }
    });

    // 5. Global Call Signaling Listener (Detect Incoming Calls) — DISABLED (PeerJS down)
    const unsubscribeSignaling = presenceService.listenToSignaling(uid, (data) => {
      if (data.type === 'webrtc-offer') {
        console.log('📞 Incoming call detected from:', data.fromUid, '(calls disabled, ignoring)');
      }
    });

    // 7. Listen to user's groups
    const unsubscribeGroups = groupService.listenToUserGroups(uid, (userGroups) => {
      setGroups(userGroups);
      // Sync groups into contacts list so they appear in chat list
      const groupContacts: Contact[] = userGroups.map((g: any) => ({
        id: g.groupId,
        userId: g.groupId,
        name: g.name,
        avatar: g.avatar || null,
        avatarColor: getAvatarColor(g.groupId),
        initials: getInitials(g.name),
        isOnline: false,
        lastSeen: '',
        about: g.description || '',
        isGroup: true,
        members: g.members || [],
      }));
      // Merge group contacts with friend contacts (avoid duplicates)
      setContacts(prev => {
        const friendContacts = prev.filter(c => !c.isGroup);
        const existingGroupIds = new Set(prev.filter(c => c.isGroup).map(c => c.id));
        const newGroups = groupContacts.filter(gc => !existingGroupIds.has(gc.id));
        // Update existing group contacts with fresh data
        const updatedGroups = prev.filter(c => c.isGroup).map(c => {
          const fresh = groupContacts.find(gc => gc.id === c.id);
          return fresh || c;
        });
        return [...friendContacts, ...updatedGroups, ...newGroups];
      });
      // Create chat entries for groups that don't have one yet
      setChats(prev => {
        const existingGroupChatIds = new Set(prev.filter(c => {
          const contact = contacts.find(ct => ct.id === c.contactId);
          return contact?.isGroup;
        }).map(c => c.id));
        const newChatEntries: Chat[] = userGroups
          .filter((g: any) => !existingGroupChatIds.has(g.groupId))
          .map((g: any) => ({
            id: g.groupId,
            contactId: g.groupId,
            lastMessage: g.lastMessage || '',
            lastMessageTime: g.lastMessageTime ? new Date(g.lastMessageTime.seconds * 1000).toLocaleTimeString() : '',
            lastMessageSender: g.lastMessageSender || '',
            unreadCount: 0,
          }));
        return [...prev, ...newChatEntries];
      });
    });

    // 8. Listen to my own statuses
    statusUnsubscribeRef.current = statusService.listenToUserStatuses(uid, (rawStatuses) => {
      const mapped: Status[] = rawStatuses.map((s: any) => ({
        id: s.statusId || s.id,
        contactId: uid,
        content: s.content || '',
        type: s.type || 'text',
        backgroundColor: s.backgroundColor || '#4D91FB',
        timestamp: normalizeFirestoreTimestamp(s.createdAt),
        viewed: true, // my own statuses are always "viewed"
      }));
      setMyStatuses(mapped);
    });

    // 9. Listen to call history
    callHistoryUnsubscribeRef.current = callService.listenToCallHistory(uid, (records) => {
      console.log(`📞 [AppContext] Call history update: ${records.length} records`);
      const mapped: CallRecord[] = records.map((r: any) => ({
        id: r.callId || r.id,
        contactId: r.contactId,
        type: r.type || 'voice',
        direction: r.direction || 'outgoing',
        // duration is stored as seconds (number); format as "M:SS" — only show if > 0
        duration: r.duration > 0 ? `${Math.floor(r.duration / 60)}:${(r.duration % 60).toString().padStart(2, '0')}` : undefined,
        timestamp: normalizeFirestoreTimestamp(r.timestamp),
      }));
      setCalls(mapped);
    });

    // 10. Listen for incoming calls (ringing)
    incomingCallUnsubscribeRef.current = callService.listenToIncomingCalls(uid, (call) => {
      if (!call) {
        setActiveIncomingCall(null);
        return;
      }
      const incoming: CallRecord = {
        id: call.callId || call.id,
        contactId: call.callerId,
        type: call.callType || 'voice',
        direction: 'incoming',
        duration: undefined,
        timestamp: new Date().toISOString(),
      };
      setActiveIncomingCall(incoming);
    });

    // 11. Listen to each friend's statuses — setup moved to a separate
    //    useContext + useEffect block below so it reacts to contacts changes.

    // Fallback: mark loaded after 3s even if no friends listener fires
    chatsLoadedTimeout.current = setTimeout(() => {
      if (!chatsLoaded) setChatsLoaded(true);
    }, 3000);

    // Cleanup all listeners on unmount or user change
    return () => {
      if (chatsLoadedTimeout.current) clearTimeout(chatsLoadedTimeout.current);
      navigator.serviceWorker?.removeEventListener('message', swMessageHandler);
      presenceUnsubscribeRef.current?.();
      typingUnsubscribeRef.current?.();
      friendsUnsubscribeRef.current?.();
      requestsUnsubscribeRef.current?.();
      outgoingRequestsUnsubscribeRef.current?.();
      conversationsUnsubscribeRef.current?.();
      statusUnsubscribeRef.current?.();
      Object.values(statusListenersRef.current).forEach(unsub => unsub());
      statusListenersRef.current = {};
      callHistoryUnsubscribeRef.current?.();
      incomingCallUnsubscribeRef.current?.();
      unsubscribeReceipts?.();
      unsubscribeDeletions?.();
      unsubscribeSignaling();
      unsubscribeGroups();
      deviceSessionUnsubscribeRef.current?.();
    };
  }, [currentUser, isOnboarded, navigate]);

  // ─── Friend Status Listeners (reacts to contacts changes) ─────────────────

  const setupFriendStatusListeners = useCallback((friendsList: string[]) => {
    if (!currentUser) return;
    const uid = currentUser.userId;
    // Unsubscribe from old listeners that are no longer friends
    Object.keys(statusListenersRef.current).forEach(friendUid => {
      if (!friendsList.includes(friendUid)) {
        statusListenersRef.current[friendUid]?.();
        delete statusListenersRef.current[friendUid];
      }
    });
    // Add listeners for new friends
    friendsList.forEach(friendUid => {
      if (statusListenersRef.current[friendUid]) return; // already listening
      statusListenersRef.current[friendUid] = statusService.listenToUserStatuses(friendUid, (rawStatuses) => {
        const mapped: Status[] = rawStatuses.map((s: any) => ({
          id: s.statusId || s.id,
          contactId: friendUid,
          content: s.content || '',
          type: s.type || 'text',
          backgroundColor: s.backgroundColor || '#4D91FB',
          timestamp: normalizeFirestoreTimestamp(s.createdAt),
          viewed: (s.viewedBy || []).includes(uid),
        }));
        // Merge into the statuses state, replacing this friend's statuses
        setStatuses(prev => {
          const others = prev.filter(s => s.contactId !== friendUid);
          return [...others, ...mapped];
        });
      });
    });
  }, [currentUser]);

  // Whenever contacts list changes, (re-)attach status listeners for all friends
  useEffect(() => {
    if (!currentUser) return;
    const friendUids = contacts.map(c => c.id);
    setupFriendStatusListeners(friendUids);
  }, [contacts, currentUser, setupFriendStatusListeners]);

  // ─── Helper: Convert raw contact to UI Contact ────────────────────────────

  const normalizeContact = useCallback((rawContact: any, index: number): Contact => {
    const name = rawContact.name || rawContact.username || rawContact.displayName || `User ${index}`;
    const contactHandle = rawContact.handle || rawContact.id || rawContact.username || `user${index}`;
    const userId = contactHandle;
    
    return {
      id: contactHandle,
      userId,
      name,
      avatar: rawContact.avatar || rawContact.photoURL || null,
      avatarColor: getAvatarColor(userId),
      initials: getInitials(name),
      isOnline: rawContact.isOnline ?? rawContact.online ?? false,
      lastSeen: (() => {
        const ls = rawContact.lastSeen;
        if (!ls) return 'offline';
        if (typeof ls === 'string') return ls;
        if (typeof ls?.toDate === 'function') return `last seen ${ls.toDate().toLocaleTimeString()}`;
        if (typeof ls?.seconds === 'number') return `last seen ${new Date(ls.seconds * 1000).toLocaleTimeString()}`;
        try { return `last seen ${new Date(ls).toLocaleTimeString()}`; } catch { return 'offline'; }
      })(),
      about: rawContact.about || '',
    };
  }, []);

  // ─── Group Methods (must be before sendMessage) ──────────────────────────

  const sendGroupMessage = useCallback(
    async (groupId: string, content: string, type: Message['type'] = 'text', extra?: Partial<Message>) => {
      if (!currentUser) return;

      const msgId = `gmsg-${Date.now()}`;
      const ttl = disappearingTimers[groupId] || 0;
      const msg: Message = {
        id: msgId,
        chatId: groupId,
        senderId: currentUser.userId,
        content,
        type,
        timestamp: new Date().toISOString(),
        status: 'sent',
        ...extra,
        expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
        keyVersion: await getKeyVersion(),
      };

      // Optimistic update
      setMessages(prev => ({
        ...prev,
        [groupId]: [...(prev[groupId] || []), msg],
      }));
      setGroupMessages(prev => ({
        ...prev,
        [groupId]: [...(prev[groupId] || []), msg],
      }));

      // Send to Firestore (encrypted + updates group preview)
      if (!navigator.onLine) {
        const result = await sendMessageWhenAvailable(currentUser.userId, groupId, content, {
          messageType: type as 'text' | 'image' | 'video' | 'audio' | 'document' | 'link',
          mediaUrl: extra?.imageUrl || null,
          replyToId: extra?.replyToId,
          replyToContent: extra?.replyToContent,
          replyToSender: extra?.replyToSender,
          expiresAt: msg.expiresAt,
          keyVersion: await getKeyVersion(),
          groupId,
        });
        if (result.status === 'queued') {
          import('sonner').then(({ toast }) => {
            toast.info('Group message will be sent when you\'re back online');
          });
        }
      } else {
        await groupService.sendGroupMessage(groupId, currentUser.userId, content, {
          messageType: type,
          mediaUrl: extra?.imageUrl || null,
          replyToId: extra?.replyToId,
          replyToContent: extra?.replyToContent,
          replyToSender: extra?.replyToSender,
          expiresAt: msg.expiresAt,
        });
      }

      // Push notifications to other group members via Render FCM relay
      const notifyUrl = import.meta.env.VITE_NOTIFY_URL;
      if (notifyUrl) {
        const senderName = currentUser.name || 'Someone';
        const notifyType = (type === 'image' || type === 'video' || type === 'audio' || type === 'document')
          ? type
          : 'text';
        const memberIds = (groups.find(g => g.groupId === groupId)?.members || [])
          .filter((m: string) => m !== currentUser.userId);
        for (const memberId of memberIds) {
          fetch(`${notifyUrl}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: memberId, fromName: senderName, type: notifyType, conversationId: groupId }),
          }).catch(() => {});
        }
      }
    },
    [currentUser]
  );

  // ─── Chat Methods ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (chatId: string, content: string, type: Message['type'] = 'text', extra?: Partial<Message>, mediaFile?: File, options?: { msgId?: string; onUploadProgress?: (progress: { percentComplete: number; stage: string }) => void }) => {
      if (!currentUser) return;

      // Check if this is a group chat
      const isGroupChat = groups.some(g => g.groupId === chatId);

      if (isGroupChat) {
        // Route to group messaging
        await sendGroupMessage(chatId, content, type, extra);
        return;
      }

      // ─── 1-on-1 messaging via offline-aware sender ───
      const msgId = options?.msgId || `msg-${Date.now()}`;

      // Derive toUid FIRST — needed for media encryption key derivation
      const myId = currentUser.userId;
      let toUid: string;
      if (chatId.startsWith(myId + '_')) {
        toUid = chatId.slice(myId.length + 1);
      } else if (chatId.endsWith('_' + myId)) {
        toUid = chatId.slice(0, chatId.length - myId.length - 1);
      } else {
        const otherContact = contacts.find(c => chatId.includes(c.id) && c.id !== myId);
        toUid = otherContact?.id || chatId;
      }

      // 1. Show optimistic message IMMEDIATELY with local blob URL preview (WhatsApp-style)
      const sharedTimestamp = new Date().toISOString();
      const ttl = disappearingTimers[chatId] || 0;
      const localPreviewUrl = mediaFile ? URL.createObjectURL(mediaFile) : extra?.imageUrl;
      const msg: Message = {
        id: msgId,
        chatId,
        senderId: 'me',
        content,
        type,
        timestamp: sharedTimestamp,
        status: 'sent',
        ...extra,
        imageUrl: localPreviewUrl,
        expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
        keyVersion: await getKeyVersion(),
      };

      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));

      setChats((prev) => prev.map(c =>
        c.id === chatId
          ? { ...c, lastMessage: content, lastMessageTime: msg.timestamp, lastMessageSender: currentUser.userId }
          : c
      ));

      // 2. Upload media in background, then patch the message with the real fileId
      let finalImageUrl = extra?.imageUrl;
      let finalTotalChunks = 0;
      if (mediaFile) {
        console.log(`📦 Chunking and encrypting ${type} for local vault...`);
        try {
          const mediaRef = await uploadMediaWithProgress(
            mediaFile,
            (['image', 'video', 'audio', 'document'].includes(type) ? type : 'image') as 'image' | 'video' | 'audio' | 'document',
            currentUser.userId,
            toUid,
            options?.onUploadProgress ? (p) => options.onUploadProgress!({ percentComplete: p.percentComplete, stage: p.stage }) : undefined
          );
          finalImageUrl = mediaRef.fileId;
          finalTotalChunks = mediaRef.totalChunks || 0;

          // Patch the optimistic message with the real fileId and totalChunks
          setMessages((prev) => ({
            ...prev,
            [chatId]: (prev[chatId] || []).map(m =>
              m.id === msgId ? { ...m, imageUrl: finalImageUrl, totalChunks: finalTotalChunks } : m
            ),
          }));

          if (localPreviewUrl && localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPreviewUrl);
        } catch (err) {
          console.error('❌ Media chunking failed:', err);
          toast.error('Media upload failed');
        }
      }

      // 3. Send via offline-aware sender (queues if offline, sends if online)
      console.log(`📤 sendMessage: from=${myId} to=${toUid} chatId=${chatId}`);
      const result = await sendMessageWhenAvailable(currentUser.userId, toUid, content, {
        messageType: type as 'text' | 'image' | 'video' | 'audio' | 'document' | 'link',
        mediaUrl: finalImageUrl,
        messageId: msgId,
        replyToId: extra?.replyToId,
        replyToContent: extra?.replyToContent,
        replyToSender: extra?.replyToSender,
        expiresAt: msg.expiresAt,
        keyVersion: await getKeyVersion(),
        timestamp: sharedTimestamp,
        totalChunks: finalTotalChunks,
      });

      if (result.status === 'queued') {
        console.log(`📴 Message queued for offline delivery (${result.messageId})`);
        toast.info('Message will be sent when you\'re back online');
      } else {
        console.log('📤 Message delivered via RTDB transient pipe');
      }

      // 4. Push notification to recipient via Render FCM relay (fire-and-forget)
      const notifyUrl = import.meta.env.VITE_NOTIFY_URL;
      if (notifyUrl && result.status === 'sent') {
        const senderName = currentUser.name || 'Someone';
        const notifyType = (type === 'image' || type === 'video' || type === 'audio' || type === 'document')
          ? type
          : 'text';
        fetch(`${notifyUrl}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: toUid, fromName: senderName, type: notifyType, conversationId: chatId }),
        }).catch(() => {});
      }
    },
    [currentUser, groups, sendGroupMessage]
  );

  // ─── Start Chat ────────────────────────────────────────────────────────────

  const startChat = useCallback(
    async (contactId: string): Promise<string> => {
      if (!currentUser) throw new Error('Not authenticated');

      // If contactId is self, try to derive the other user from contacts list
      if (contactId === currentUser.userId && contacts.length > 0) {
        console.warn('⚠️ startChat called with self — contacts:', contacts.map(c => c.id));
      }

      // Check if a chat already exists with this contact
      const existingChat = chats.find(c => c.contactId === contactId);
      if (existingChat) {
        console.log(`ℹ️ Chat already exists: ${existingChat.id}`);
        return existingChat.id;
      }

      // Create the conversation in Firestore
      const conversationId = await conversationService.createConversation(currentUser.userId, contactId);

      // Add the chat to the local chat list immediately (optimistic)
      const newChat: Chat = {
        id: conversationId,
        contactId,
        lastMessage: '',
        lastMessageTime: '',
        lastMessageSender: '',
        unreadCount: 0,
      };
      setChats(prev => [newChat, ...prev]);
      console.log(`✅ New chat started: ${conversationId} with ${contactId}`);
      return conversationId;
    },
    [currentUser, chats]
  );

  // ─── Group Methods ────────────────────────────────────────────────────────

  const createGroup = useCallback(
    async (name: string, description: string, memberIds: string[]): Promise<string> => {
      if (!currentUser) throw new Error('Not authenticated');
      const groupId = await groupService.createGroup(name, description, currentUser.userId, memberIds);
      return groupId;
    },
    [currentUser]
  );

  const addGroupMembers = useCallback(
    async (groupId: string, memberIds: string[], callerId?: string) => {
      await groupService.addMembers(groupId, memberIds, callerId);
    },
    []
  );

  const removeGroupMember = useCallback(
    async (groupId: string, memberId: string, callerId?: string) => {
      await groupService.removeMember(groupId, memberId, callerId);
    },
    []
  );

  const transferOwnership = useCallback(
    async (groupId: string, newOwnerId: string) => {
      if (!currentUser) return;
      await groupService.transferOwnership(groupId, newOwnerId, currentUser.userId);
    },
    [currentUser]
  );

  const leaveGroup = useCallback(
    async (groupId: string) => {
      if (!currentUser) return;
      await groupService.leaveGroup(groupId, currentUser.userId);
    },
    [currentUser]
  );

  const updateGroupInfo = useCallback(
    async (groupId: string, updates: { name?: string; description?: string; avatar?: string }, callerId?: string) => {
      await groupService.updateGroup(groupId, updates, callerId);
    },
    []
  );

  const markGroupRead = useCallback(
    async (groupId: string) => {
      if (!currentUser) return;
      // Guard: skip if already read
      const existing = chats.find(c => c.id === groupId);
      if (existing && existing.unreadCount === 0) return;
      await groupService.markGroupMessagesRead(groupId, currentUser.userId);
      setChats(prev => prev.map(c => c.id === groupId ? { ...c, unreadCount: 0 } : c));
    },
    [currentUser, chats]
  );

  const reactToMessage = useCallback(
    async (chatId: string, messageId: string, emoji: string) => {
      if (!currentUser) return;

      setMessages((prev) => {
        const chatMsgs = prev[chatId] || [];
        const msg = chatMsgs.find((m) => m.id === messageId);
        if (!msg) return prev;

        const currentReactions = msg.reactions || [];
        const existingIdx = currentReactions.findIndex((r) => r.emoji === emoji);

        let nextReactions;
        if (existingIdx > -1) {
          // Toggle off if it's the same emoji, or could increment count
          // For simplicity, let's just toggle for now
          nextReactions = currentReactions.filter((r) => r.emoji !== emoji);
        } else {
          nextReactions = [...currentReactions, { emoji, count: 1 }];
        }

        // Update local state
        const next = {
          ...prev,
          [chatId]: chatMsgs.map((m) =>
            m.id === messageId ? { ...m, reactions: nextReactions } : m
          ),
        };

        // Persist locally
        updateMessageReactions(currentUser.userId, chatId, messageId, nextReactions)
          .catch(err => console.warn('⚠️ Failed to persist reaction locally:', err));

        // Sync with Firestore (optional but good for persistence)
        messageService.reactToMessage(chatId, messageId, nextReactions);

        // 5. (No WebSocket needed)

        return next;
      });
    },
    [currentUser]
  );

  const markAsRead = useCallback(async (chatId: string) => {
    if (!currentUser) return;

    // Guard: skip if chat already read (prevents infinite loop with setChats)
    const existingChat = chatsRef.current.find(c => c.id === chatId);
    if (existingChat && existingChat.unreadCount === 0) return;

    const isGroupChat = groups.some(g => g.groupId === chatId);

    if (isGroupChat) {
      await markGroupRead(chatId);
    } else {
      const contactId = existingChat?.contactId || chatId;
      if (!navigator.onLine) {
        queueReadReceipt(chatId, '', contactId, currentUser.userId, 'read');
      } else {
        await messageService.markAllMessagesAsRead(chatId, currentUser.userId, contactId);
      }
      setChats((prev) => prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
    }
  }, [currentUser, groups, markGroupRead]); // Removed `chats` from deps — use chatsRef.current instead

  const clearAllChats = useCallback(async () => {
    if (!window.confirm('Are you sure you want to delete all messages? This cannot be undone.')) return;
    
    // 1. Clear local files
    const { clearAllMessages } = await import('../../utils/sqliteMessageStore');
    await clearAllMessages();
    
    // 2. Clear state
    setMessages({});
    setChats(prev => prev.map(c => ({ ...c, lastMessage: '', lastMessageTime: '', unreadCount: 0 })));
    
    console.log('🧹 All chats cleared locally.');
  }, []);

  const clearChat = useCallback(async (chatId: string) => {
    if (!window.confirm('Clear all messages in this chat?')) return;
    
    const { deleteLocalChat: deleteOldStore } = await import('../../utils/localMessageStore');
    await deleteOldStore(chatId);

    const { deleteLocalChat: deleteSqliteStore } = await import('../../utils/sqliteMessageStore');
    await deleteSqliteStore(chatId);
    
    setMessages(prev => ({ ...prev, [chatId]: [] }));
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, lastMessage: '', lastMessageTime: '', unreadCount: 0 } : c));
    
    console.log(`🧹 Chat ${chatId} cleared locally.`);
  }, []);

  const deleteMessage = useCallback(async (chatId: string, messageId: string) => {
    if (!currentUser) return;

    // 1. Optimistic update — replace content with [Deleted] so both sides see it
    setMessages(prev => {
      const chatMessages = prev[chatId] || [];
      const targetMsg = chatMessages.find(m => m.id === messageId);

      // 2. Cleanup Cloudinary chunks if this is a media message
      if (targetMsg?.imageUrl && targetMsg.totalChunks && targetMsg.totalChunks > 0) {
        import('../../utils/chunkRelayCleanup').then(({ cleanupOnMessageDelete }) => {
          cleanupOnMessageDelete(targetMsg.imageUrl!, targetMsg.totalChunks!).catch(() => {});
        }).catch(() => {});
      }

      return {
        ...prev,
        [chatId]: chatMessages.map(m =>
          m.id === messageId ? { ...m, content: '[Deleted]', type: 'system' as const } : m
        ),
      };
    });

    // 3. Persist to local store
    const { deleteMessageById } = await import('../../utils/sqliteMessageStore');
    await deleteMessageById(currentUser.userId, chatId, messageId);

    // 4. Notify the other user + tombstone in Firestore
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      const conversationId = messageService.getConversationId(currentUser.userId, chat.contactId);
      await messageService.deleteMessage(conversationId, messageId, currentUser.userId, chat.contactId);
    }
  }, [currentUser, chats]);

  // ─── Friend Request Methods ────────────────────────────────────────────────

  const sendChatRequest = useCallback(async (contactId: string) => {
    if (!currentUser) return;
    const result = await friendRequestService.sendFriendRequest(currentUser.userId, contactId);
    if (result?.requestId) {
      setChatRequests(prev => [...prev, {
        id: result.requestId,
        contactId,
        direction: 'outgoing' as const,
        status: 'pending' as const,
        timestamp: new Date().toLocaleString(),
        previewMessage: '',
      }]);
    }
  }, [currentUser]);

  const acceptRequest = useCallback(async (requestId: string): Promise<string> => {
    const request = chatRequests.find((r) => r.id === requestId);
    if (request && currentUser) {
      await friendRequestService.acceptFriendRequest(requestId, request.contactId, currentUser.userId);
      const chatId = await startChat(request.contactId);
      return chatId;
    }
    return '';
  }, [chatRequests, currentUser, startChat]);

  const declineRequest = useCallback(async (requestId: string) => {
    if (!currentUser) return;
    await friendRequestService.rejectFriendRequest(requestId, currentUser.userId);
  }, [currentUser]);

  // ─── Other Methods ────────────────────────────────────────────────────────

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  // ─── Theme & Appearance Management ───────────────────────────────────────
  useEffect(() => {
    const applyTheme = async () => {
      const isDark = settings.theme === 'dark';
      
      // 1. DOM class
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // 2. Android Status Bar (Native Binding)
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        await StatusBar.setBackgroundColor({ color: isDark ? '#1F2C34' : '#F0F2F5' });
      } catch (err) {
        // Not on mobile or plugin failed
      }
    };

    applyTheme();
  }, [settings.theme]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try { 
        localStorage.setItem('quidec_settings', JSON.stringify(next));
      } catch { /* ignore */ }
      
      // Also save to native storage and sync to Firebase
      if (currentUser) {
        saveSettingsToNative(next).catch(err => console.warn('⚠️ Failed to save to native storage:', err));
        syncSettingsToFirebase(currentUser.userId, next).catch(err => console.warn('⚠️ Failed to sync to Firebase:', err));
      }
      
      return next;
    });
  }, [currentUser]);

  // ─── Status Methods ──────────────────────────────────────────────────────

  const addStatus = useCallback(
    async (content: string, type: 'text' | 'image' = 'text', backgroundColor: string = '#4D91FB', mediaFile?: File) => {
      if (!currentUser) return;

      let mediaUrl: string | null = null;
      if (mediaFile && type === 'image') {
        try {
          const mediaRef = await uploadMediaWithProgress(mediaFile, 'image', currentUser.userId, currentUser.userId);
          mediaUrl = mediaRef.fileId;
        } catch (err) {
          console.error('❌ Media upload for status failed:', err);
        }
      }

      if (!navigator.onLine) {
        const queuedStatus = { userId: currentUser.userId, content, type, backgroundColor, mediaUrl, createdAt: Date.now() };
        const existing = JSON.parse(localStorage.getItem('queued_statuses') || '[]');
        existing.push(queuedStatus);
        localStorage.setItem('queued_statuses', JSON.stringify(existing));
        import('sonner').then(({ toast }) => toast.info('Status will be posted when you\'re back online'));
        const newStatus: Status = {
          id: `status_${Date.now()}`, contactId: currentUser.userId, content, type, backgroundColor,
          timestamp: new Date().toISOString(), viewed: true,
        };
        setMyStatuses(prev => [newStatus, ...prev]);
        return;
      }

      await statusService.createStatus(currentUser.userId, content, type, backgroundColor, mediaUrl);

      const newStatus: Status = {
        id: `status_${Date.now()}`,
        contactId: currentUser.userId,
        content,
        type,
        backgroundColor,
        timestamp: new Date().toISOString(),
        viewed: true,
      };
      setMyStatuses(prev => [newStatus, ...prev]);
    },
    [currentUser],
  );

  const deleteMyStatus = useCallback(async (statusId: string) => {
    if (!currentUser) return;
    await statusService.deleteStatus(currentUser.userId, statusId);
    setMyStatuses(prev => prev.filter(s => s.id !== statusId));
    setStatuses(prev => prev.filter(s => !(s.contactId === currentUser.userId && s.id === statusId)));
  }, [currentUser]);

  const viewStatus = useCallback((contactId: string, statusId: string) => {
    if (!currentUser) return;
    // Mark as viewed in Firestore
    statusService.markStatusViewed(contactId, statusId, currentUser.userId);
    // Update local state
    setStatuses(prev =>
      prev.map(s => (s.id === statusId && s.contactId === contactId ? { ...s, viewed: true } : s))
    );
  }, [currentUser]);

  // ─── Call Methods ────────────────────────────────────────────────────────

  const clearIncomingCall = useCallback(() => {
    setActiveIncomingCall(null);
  }, []);

  const saveCallRecord = useCallback(
    async (contactId: string, type: 'voice' | 'video', direction: 'incoming' | 'outgoing' | 'missed', duration?: number) => {
      if (!currentUser) return;
      const contact = contacts.find(c => c.id === contactId);
      await callService.saveCallRecord(currentUser.userId, {
        callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        contactId,
        contactName: contact?.name || 'Unknown',
        contactAvatar: contact?.avatar || undefined,
        type,
        direction,
        duration,
        timestamp: new Date().toISOString(),
      });
    },
    [currentUser, contacts],
  );

  const clearAllCalls = useCallback(async () => {
    if (!currentUser) return;
    if (!window.confirm('Clear all call history? This cannot be undone.')) return;
    await callService.clearCallHistory(currentUser.userId);
    setCalls([]);
  }, [currentUser]);

  // ─── Starred Messages ─────────────────────────────────────────────────────

  const refreshStarredMessages = useCallback(async () => {
    if (!currentUser) return;
    const starred = await getStarredMessages(currentUser.userId);
    setStarredMessages(starred);
  }, [currentUser]);

  const toggleStarMessage = useCallback(
    async (chatId: string, messageId: string) => {
      if (!currentUser) return;

      // Find current starred state from messages
      const chatMsgs = messages[chatId] || [];
      const msg = chatMsgs.find(m => m.id === messageId);
      if (!msg) return;

      const newStarred = !msg.isStarred;

      // Update in-memory state
      setMessages(prev => ({
        ...prev,
        [chatId]: (prev[chatId] || []).map(m =>
          m.id === messageId ? { ...m, isStarred: newStarred } : m
        ),
      }));

      // Persist to local store
      try {
        await updateMessageStar(currentUser.userId, chatId, messageId, newStarred);
      } catch (err) {
        console.error('❌ Failed to persist star toggle:', err);
      }

      // Refresh starred messages list
      await refreshStarredMessages();
    },
    [currentUser, messages, refreshStarredMessages],
  );

  const editMessage = useCallback(
    async (chatId: string, messageId: string, newContent: string) => {
      if (!currentUser) return;

      setMessages(prev => ({
        ...prev,
        [chatId]: (prev[chatId] || []).map(m =>
          m.id === messageId ? { ...m, content: newContent, isEdited: true } : m
        ),
      }));

      try {
        await updateMessageContent(currentUser.userId, chatId, messageId, newContent, true);
        messageService.syncEditToFirestore(chatId, messageId, newContent);
      } catch (err) {
        console.error('Failed to persist edited message:', err);
      }
    },
    [currentUser],
  );

  // Refresh starred messages on load and when messages change
  useEffect(() => {
    if (currentUser) {
      refreshStarredMessages();
    }
  }, [currentUser, refreshStarredMessages]);

  // ─── User Discovery (#6) ──────────────────────────────────────────────────

  const searchUsers = useCallback(async (query: string) => {
    if (!currentUser) return;
    const results = await userService.searchUsers(query, currentUser.userId);
    const normalized = results.map((u: any, i: number) => normalizeContact(u, i));
    setDiscoverableContacts(normalized);
  }, [currentUser, normalizeContact]);

  const searchAllMessagesFn = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!currentUser) return [];
    const localResults = await searchLocalMessages(currentUser.userId, query);
    return localResults.map(r => {
      const contact = contacts.find(c => c.id === r.chatId);
      return { ...r, contactName: contact?.name };
    });
  }, [currentUser, contacts]);

  // NOTE: Session restore is handled entirely by Firebase's browserLocalPersistence.
  // The initializeAuth useEffect above (using authService.getCurrentUser()) is
  // sufficient — no manual credential storage is needed or safe.

  // ─── Resolve Avatar Hash ──────────────────────────────────────────────────
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const resolveAvatar = async () => {
      if (cancelled) return;
      if (currentUser?.avatar && currentUser.avatar.startsWith('image_')) {
        try {
          console.log(`🔍 Resolving avatar hash: ${currentUser.avatar} (Attempt ${retryCount + 1})`);
          const url = await loadMediaWithCache(currentUser.avatar, 'image', currentUser.userId, currentUser.userId);
          if (!cancelled) {
            setCurrentUserAvatarUrl(url);
            console.log('✅ Avatar resolved successfully');
          }
        } catch (err) {
          if (cancelled) return;
          console.warn(`⚠️ Failed to resolve avatar hash (Attempt ${retryCount + 1}):`, err);
          
          if (retryCount < maxRetries) {
            retryCount++;
            retryTimer = setTimeout(resolveAvatar, 500 * retryCount);
          } else {
            console.error('❌ Max retries reached for avatar resolution');
            setCurrentUserAvatarUrl(null);
          }
        }
      } else {
        setCurrentUserAvatarUrl(currentUser?.avatar || null);
      }
    };
    resolveAvatar();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [currentUser?.avatar, currentUser?.userId]);

  // ─── Real-time Typing (Per Active Chat, 1:1 or group) ────────────────────
  useEffect(() => {
    if (!currentUser || !activeChatId) {
      setTypingContacts({});
      return;
    }

    const activeChat = chatsRef.current.find(c => c.id === activeChatId);
    if (!activeChat) return;

    // Detect group chat: check if this contact has isGroup set
    const activeContact = contacts.find(c => c.id === activeChat.contactId);
    const isGroupChat = !!activeContact?.isGroup;

    let unsubGroupTyping: (() => void) | undefined;
    let cancelled = false;

    if (isGroupChat) {
      console.log(`⌨️ Listening for group typing in ${activeChatId}`);
      import('firebase/database').then(({ ref, onValue, off }) => {
        import('../../utils/firebase').then(({ realtimeDb }) => {
          if (cancelled) return;
          const typingRef = ref(realtimeDb, `typing/${sanitizePathComponent(activeChatId)}`);
          unsubGroupTyping = onValue(typingRef, (snapshot: any) => {
            const data = snapshot.val() || {};
            const othersTyping = Object.entries(data).filter(([uid]: [string, any]) => uid !== currentUser.userId);
            const isAnyoneTyping = othersTyping.length > 0;
            setTypingContacts(prev => ({
              ...prev,
              [activeChatId]: isAnyoneTyping,
            }));
          });
        });
      });
      return () => {
        cancelled = true;
        try { unsubGroupTyping?.(); } catch { /* */ }
      };
    }

    // ── 1:1 typing ──
    const contact = activeChat.contactId;
    console.log(`⌨️ Listening for typing in ${activeChatId}`);
    const unsubscribe = typingService.listenToTyping(currentUser.userId, contact, (typingData) => {
      setTypingContacts(prev => ({
        ...prev,
        [activeChatId]: typingData.includes(contact)
      }));
    });

    return () => unsubscribe();
  }, [currentUser, activeChatId, contacts]); // Removed `chats` — use chatsRef.current instead

  // Sync Mute status with FCM service
  useEffect(() => {
    const syncMute = async () => {
      try {
        const { setNotificationsEnabled } = await import('../../utils/fcm');
        setNotificationsEnabled(settings.notifications);
      } catch (err) {
        // ignore
      }
    };
    syncMute();
  }, [settings.notifications]);

  const value: AppContextType = {
    isOnboarded,
    currentUser: currentUser ? { ...currentUser, avatar: currentUserAvatarUrl } : null,
    authUid,
    isAuthenticating,
    showSplash,
    needsVerification,
    completeOnboarding,
    updateCurrentUser,
    updateUserEmail,
    login,
    register,
    logout,
    isConnected,
    isOffline,
    isReconnecting,
    syncProgress,
    contacts,
    discoverableContacts,
    updateContact,
    chats,
    messages,
    calls,
    activeIncomingCall,
    clearIncomingCall,
    saveCallRecord,
    clearAllCalls,
    starredMessages,
    toggleStarMessage,
    editMessage,
    refreshStarredMessages,
    statuses,
    searchUsers,
    searchAllMessages: searchAllMessagesFn,
    disappearingTimers,
    setDisappearingTimer,
    getDisappearingRemaining,
    isDisappearingActive,
    chatRequests,
    sendChatRequest,
    acceptRequest,
    declineRequest,
    pendingIncomingCount: chatRequests.filter(r => r.direction === 'incoming' && r.status === 'pending').length,
    activeTab,
    setActiveTab,
    activeChatId,
    setActiveChatId,
    showRequests,
    setShowRequests,
    sendMessage,
    startChat,
    reactToMessage,
    markAsRead,
    clearAllChats,
    clearChat,
    deleteMessage,
    addMessagesToChat,
    typingContacts,
    searchQuery,
    setSearchQuery,
    chatFilter,
    setChatFilter,
    chatsLoaded,
    myStatuses,
    addStatus,
    deleteMyStatus,
    viewStatus,
    activeStatusViewer,
    setActiveStatusViewer,
    contactInfoOpen,
    setContactInfoOpen,
    replyTo,
    setReplyTo,
    settings,
    updateSettings,
    groups,
    groupMessages,
    createGroup,
    sendGroupMessage,
    addGroupMembers,
    removeGroupMember,
    leaveGroup,
    transferOwnership,
    updateGroupInfo,
    markGroupRead,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}


