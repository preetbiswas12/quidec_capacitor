import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { authService } from '../../utils/firebaseServices';

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
  type: 'text' | 'image' | 'audio' | 'system' | 'document' | 'link';
  senderId: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  reactions?: { emoji: string; count: number }[];
  isStarred?: boolean;
  replyToId?: string;
  replyToContent?: string;
  replyToSender?: string;
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
  theme: 'dark';
}

interface AppContextType {
  // Auth
  isOnboarded: boolean;
  currentUser: CurrentUser | null;
  isAuthenticating: boolean;
  completeOnboarding: (user: CurrentUser) => void;
  updateCurrentUser: (updates: Partial<CurrentUser>) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; emailVerified?: boolean; message?: string }>;
  register: (email: string, username: string, password: string) => Promise<{ success: boolean; emailVerified?: boolean; message?: string }>;
  logout: () => Promise<void>;

  // WebSocket & Real Data
  isConnected: boolean;
  contacts: Contact[];
  discoverableContacts: Contact[];
  updateContact: (id: string, updates: Partial<Contact>) => void;
  chats: Chat[];
  messages: Record<string, Message[]>;
  calls: CallRecord[];
  statuses: Status[];

  // Chat Requests
  chatRequests: ChatRequest[];
  sendChatRequest: (contactId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<string>;
  declineRequest: (requestId: string) => Promise<void>;
  pendingIncomingCount: number;

  // UI State
  activeTab: 'chats' | 'calls' | 'settings';
  setActiveTab: (tab: 'chats' | 'calls' | 'settings') => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  showRequests: boolean;
  setShowRequests: (v: boolean) => void;

  // Messaging
  sendMessage: (chatId: string, content: string, type?: Message['type'], extra?: Partial<Message>) => Promise<void>;
  markAsRead: (chatId: string) => Promise<void>;
  typingContacts: Record<string, boolean>;

  // Search & Filters
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  chatFilter: 'all' | 'unread' | 'groups';
  setChatFilter: (f: 'all' | 'unread' | 'groups') => void;

  // Contact Info
  contactInfoOpen: boolean;
  setContactInfoOpen: (open: boolean) => void;
  replyTo: Message | null;
  setReplyTo: (msg: Message | null) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
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

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // WebSocket & Real Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [discoverableContacts, setDiscoverableContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);

  // Chat Requests
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);

  // UI State
  const [activeTab, setActiveTab] = useState<'chats' | 'calls' | 'settings'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingContacts, setTypingContacts] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;

  // ─── Auth Methods ─────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<any> => {
    setIsAuthenticating(true);
    try {
      const result = await authService.loginUser(email, password);

      if (!result.success) {
        console.error('Login failed:', result.message);
        return result; // Return object with emailVerified: false if not verified
      }

      // User verified - set up context
      const user: CurrentUser = {
        name: result.user?.displayName || email.split('@')[0],
        email: email,
        userId: result.uid || result.user?.uid || '',
        avatar: result.user?.photoURL || null,
        about: '',
      };
      setCurrentUser(user);
      setIsOnboarded(true);
      return { success: true, emailVerified: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, message: (err as any).message || 'Login failed' };
    } finally {
      setIsAuthenticating(false);
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
      const user: CurrentUser = {
        name: username,
        email: email,
        userId: result.uid || result.user?.uid || '',
        avatar: null,
        about: '',
      };
      setCurrentUser(user);
      // Don't set isOnboarded yet - user must verify email first
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
      setIsOnboarded(false);
      setContacts([]);
      setMessages({});
      setChatRequests([]);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsAuthenticating(false);
      navigate('/login');
    }
  }, [navigate]);

  // ─── Initialize Auth State on Mount ───────────────────────────────────────

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const currentFirebaseUser = await authService.getCurrentUser();
        if (currentFirebaseUser) {
          // User is already logged in
          if (currentFirebaseUser.emailVerified) {
            // User verified - set up context
            const user: CurrentUser = {
              name: currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User',
              email: currentFirebaseUser.email || '',
              userId: currentFirebaseUser.uid || '',
              avatar: currentFirebaseUser.photoURL || null,
              about: '',
            };
            setCurrentUser(user);
            setIsOnboarded(true);
          } else {
            // User exists but not verified
            const user: CurrentUser = {
              name: currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User',
              email: currentFirebaseUser.email || '',
              userId: currentFirebaseUser.uid || '',
              avatar: null,
              about: '',
            };
            setCurrentUser(user);
            setIsOnboarded(false); // Prevent access to app
          }
        } else {
          // No user logged in
          setCurrentUser(null);
          setIsOnboarded(false);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setCurrentUser(null);
        setIsOnboarded(false);
      } finally {
        setIsAuthenticating(false);
      }
    };

    initializeAuth();
  }, []);

  const completeOnboarding = useCallback((user: CurrentUser) => {
    setCurrentUser(user);
    setIsOnboarded(true);
  }, []);

  const updateCurrentUser = useCallback((updates: Partial<CurrentUser>) => {
    setCurrentUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  // ─── Helper: Convert raw contact to UI Contact ────────────────────────────

  const normalizeContact = useCallback((rawContact: any, index: number): Contact => {
    const name = rawContact.name || rawContact.username || `User ${index}`;
    const userId = `@${rawContact.username || rawContact.name || `user${index}`}`.toLowerCase();
    
    return {
      id: rawContact.username || rawContact.name || `user-${index}`,
      userId,
      name,
      avatar: rawContact.avatar || null,
      avatarColor: getAvatarColor(userId),
      initials: getInitials(name),
      isOnline: rawContact.online ?? false,
      lastSeen: rawContact.lastSeen || 'offline',
      about: rawContact.about || '',
    };
  }, []);

  // ─── WebSocket Connection ─────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) {
      setIsAuthenticating(false);
      return;
    }

    const connectWebSocket = () => {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'wss://quidec-server.onrender.com';
      const ws = new WebSocket(serverUrl);

      ws.onopen = () => {
        console.log('✅ Connected to server');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Authenticate user
        ws.send(JSON.stringify({
          type: 'auth',
          userId: currentUser.userId,
        }));

        // Request initial data
        ws.send(JSON.stringify({ type: 'get-friends-list' }));
        ws.send(JSON.stringify({ type: 'get-chat-requests' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          setTimeout(connectWebSocket, delay);
        }
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [currentUser]);

  // ─── WebSocket Message Handler ────────────────────────────────────────────

  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'friends-list': {
        const normalized = (message.friends || []).map((f: any, i: number) =>
          normalizeContact(f, i)
        );
        setContacts(normalized);
        break;
      }

      case 'pending-requests': {
        const requests = (message.requests || []).map((req: any, i: number) => ({
          id: `req-${i}`,
          contactId: req.sender || req.username || `user-${i}`,
          direction: 'incoming' as const,
          status: 'pending' as const,
          timestamp: new Date(req.sentAt || Date.now()).toISOString(),
          previewMessage: `Friend request from ${req.sender || req.username}`,
        }));
        setChatRequests(requests);
        break;
      }

      case 'new-message': {
        const msgId = message.id || `msg-${Date.now()}`;
        const chatId = message.from;
        setMessages((prev) => ({
          ...prev,
          [chatId]: [
            ...(prev[chatId] || []),
            {
              id: msgId,
              chatId,
              senderId: message.from,
              content: message.content,
              type: 'text',
              timestamp: new Date(message.timestamp || Date.now()).toISOString(),
              status: 'delivered' as const,
            },
          ],
        }));

        // Update chat's last message
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  lastMessage: message.content,
                  lastMessageTime: new Date(message.timestamp || Date.now()).toISOString(),
                  lastMessageSender: message.from,
                  unreadCount: c.unreadCount + 1,
                }
              : c
          )
        );
        break;
      }

      case 'typing': {
        setTypingContacts((prev) => ({
          ...prev,
          [message.from]: true,
        }));
        setTimeout(() => {
          setTypingContacts((prev) => ({
            ...prev,
            [message.from]: false,
          }));
        }, 2000);
        break;
      }

      case 'friend-online': {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === message.username
              ? { ...c, isOnline: true, lastSeen: 'online' }
              : c
          )
        );
        break;
      }

      case 'friend-offline': {
        setContacts((prev) =>
          prev.map((c) =>
            c.id === message.username
              ? {
                  ...c,
                  isOnline: false,
                  lastSeen: `last seen ${new Date().toLocaleTimeString()}`,
                }
              : c
          )
        );
        break;
      }

      default:
        console.log('Unknown message type:', message.type);
    }
  }, [normalizeContact]);

  // ─── Chat Methods ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (chatId: string, content: string, type: Message['type'] = 'text', extra?: Partial<Message>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('WebSocket not connected');
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          type: 'send-message',
          to: chatId,
          content,
          messageType: type,
          timestamp: Date.now(),
        })
      );

      // Optimistically add message to local state
      const msgId = `msg-${Date.now()}`;
      const msg: Message = {
        id: msgId,
        chatId,
        senderId: 'me',
        content,
        type,
        timestamp: new Date().toISOString(),
        status: 'sent',
        ...extra,
      };

      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));
    },
    []
  );

  const markAsRead = useCallback(async (chatId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'mark-as-read',
        chatId,
      })
    );

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
  }, []);

  // ─── Friend Request Methods ────────────────────────────────────────────────

  const sendChatRequest = useCallback(async (contactId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'send-friend-request',
        to: contactId,
      })
    );
  }, []);

  const acceptRequest = useCallback(async (requestId: string): Promise<string> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return '';
    }

    // Find the request to get contactId
    const request = chatRequests.find((r) => r.id === requestId);
    if (request) {
      wsRef.current.send(
        JSON.stringify({
          type: 'accept-friend-request',
          from: request.contactId,
        })
      );

      // Remove from chat requests
      setChatRequests((prev) => prev.filter((r) => r.id !== requestId));

      // Create new chat
      setChats((prev) => [
        ...prev,
        {
          id: request.contactId,
          contactId: request.contactId,
          lastMessage: '',
          lastMessageTime: new Date().toISOString(),
          unreadCount: 0,
        },
      ]);
    }

    return requestId;
  }, [chatRequests]);

  const declineRequest = useCallback(async (requestId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    const request = chatRequests.find((r) => r.id === requestId);
    if (request) {
      wsRef.current.send(
        JSON.stringify({
          type: 'decline-friend-request',
          from: request.contactId,
        })
      );

      setChatRequests((prev) => prev.filter((r) => r.id !== requestId));
    }
  }, [chatRequests]);

  // ─── Other Methods ────────────────────────────────────────────────────────

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Restore auth on mount
  useEffect(() => {
    const auth = localStorage.getItem('auth');
    if (auth) {
      const { username, password } = JSON.parse(auth);
      login(username, password);
    } else {
      setIsAuthenticating(false);
    }
  }, [login]);

  const value: AppContextType = {
    isOnboarded,
    currentUser,
    isAuthenticating,
    completeOnboarding,
    updateCurrentUser,
    login,
    register,
    logout,
    isConnected,
    contacts,
    discoverableContacts,
    updateContact,
    chats,
    messages,
    calls,
    statuses,
    chatRequests,
    sendChatRequest,
    acceptRequest,
    declineRequest,
    pendingIncomingCount: chatRequests.length,
    activeTab,
    setActiveTab,
    activeChatId,
    setActiveChatId,
    showRequests,
    setShowRequests,
    sendMessage,
    markAsRead,
    typingContacts,
    searchQuery,
    setSearchQuery,
    chatFilter,
    setChatFilter,
    contactInfoOpen,
    setContactInfoOpen,
    replyTo,
    setReplyTo,
    settings,
    updateSettings,
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
