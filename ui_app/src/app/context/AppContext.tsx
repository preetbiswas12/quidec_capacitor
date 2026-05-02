import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Contact, Message, Chat, CallRecord, Status, ChatRequest,
  contacts as initialContacts,
  discoverableContacts as initialDiscoverable,
  chats as initialChats,
  messages as initialMessages,
  calls as initialCalls,
  statuses as initialStatuses,
  autoReplies,
  initialChatRequests,
} from '../data/mockData';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurrentUser {
  name: string;
  email: string;
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
  isOnboarded: boolean;
  currentUser: CurrentUser;
  completeOnboarding: (user: CurrentUser) => void;
  updateCurrentUser: (updates: Partial<CurrentUser>) => void;
  logout: () => void;

  contacts: Contact[];
  discoverableContacts: Contact[];
  updateContact: (id: string, updates: Partial<Contact>) => void;
  chats: Chat[];
  messages: Record<string, Message[]>;
  calls: CallRecord[];
  statuses: Status[];

  chatRequests: ChatRequest[];
  sendChatRequest: (contactId: string) => void;
  acceptRequest: (requestId: string) => string;
  declineRequest: (requestId: string) => void;
  pendingIncomingCount: number;

  activeTab: 'chats' | 'calls' | 'settings';
  setActiveTab: (tab: 'chats' | 'calls' | 'settings') => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  showRequests: boolean;
  setShowRequests: (v: boolean) => void;

  sendMessage: (chatId: string, content: string, type?: Message['type'], extra?: Partial<Message>) => void;
  markAsRead: (chatId: string) => void;
  typingContacts: Record<string, boolean>;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  chatFilter: 'all' | 'unread' | 'groups';
  setChatFilter: (f: 'all' | 'unread' | 'groups') => void;

  contactInfoOpen: boolean;
  setContactInfoOpen: (open: boolean) => void;
  replyTo: Message | null;
  setReplyTo: (msg: Message | null) => void;

  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

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

const DEFAULT_USER: CurrentUser = {
  name: '',
  email: '',
  userId: '',
  avatar: null,
  about: 'Hey there! I am using WhatsApp.',
};

function safeLocalGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch (_e) { return null; }
}

function safeLocalSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch (_e) { /* ignore */ }
}

function safeLocalRemove(key: string): void {
  try { localStorage.removeItem(key); } catch (_e) { /* ignore */ }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | null>(null);

// ─── Provider ─────────────────────────────────────��───────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    return safeLocalGet('wa_onboarded') === 'true';
  });

  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => {
    const raw = safeLocalGet('wa_user');
    if (!raw) return { ...DEFAULT_USER };
    try {
      const p = JSON.parse(raw) as Record<string, unknown>;
      if (p.phone && !p.email) { p.email = p.phone; delete p.phone; }
      if (!p.userId) p.userId = '@user.' + String(Math.floor(1000 + Math.random() * 9000));
      return p as unknown as CurrentUser;
    } catch (_e) {
      return { ...DEFAULT_USER };
    }
  });

  // ── Data ────────────────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [discoverableContacts, setDiscoverableContacts] = useState<Contact[]>(initialDiscoverable);
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [messages, setMessages] = useState<Record<string, Message[]>>(initialMessages);
  const [calls] = useState<CallRecord[]>(initialCalls);
  const [statuses] = useState<Status[]>(initialStatuses);
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>(initialChatRequests);

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'chats' | 'calls' | 'settings'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [typingContacts, setTypingContacts] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const raw = safeLocalGet('wa_settings');
    if (!raw) return { ...DEFAULT_SETTINGS };
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch (_e) { return { ...DEFAULT_SETTINGS }; }
  });

  // ── Latest-value refs (prevent stale closures in async callbacks) ────────────
  const chatsRef = useRef<Chat[]>(chats);
  const chatRequestsRef = useRef<ChatRequest[]>(chatRequests);
  const discoverableRef = useRef<Contact[]>(discoverableContacts);

  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { chatRequestsRef.current = chatRequests; }, [chatRequests]);
  useEffect(() => { discoverableRef.current = discoverableContacts; }, [discoverableContacts]);

  // ── Online status simulation ─────────────────────────────────────────────────
  useEffect(() => {
    const ids = initialContacts.filter((c) => !c.isGroup).map((c) => c.id);
    const flip = () => {
      const id = ids[Math.floor(Math.random() * ids.length)];
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== id || c.isGroup) return c;
          const on = !c.isOnline;
          return { ...c, isOnline: on, lastSeen: on ? 'online' : 'last seen just now' };
        })
      );
    };
    const t1 = setTimeout(flip, 8000);
    const t2 = setTimeout(flip, 18000);
    const iv = setInterval(flip, 25000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(iv); };
  }, []);

  // ── Derived ──────────���───────────────────────────────────────────────────────
  const pendingIncomingCount = chatRequests.filter(
    (r) => r.direction === 'incoming' && r.status === 'pending'
  ).length;

  // ── Auth actions ─────────────────────────────────────────────────────────────
  const completeOnboarding = useCallback((user: CurrentUser) => {
    setCurrentUser(user);
    setIsOnboarded(true);
    safeLocalSet('wa_onboarded', 'true');
    safeLocalSet('wa_user', JSON.stringify(user));
  }, []);

  const updateCurrentUser = useCallback((updates: Partial<CurrentUser>) => {
    setCurrentUser((prev) => {
      const updated = { ...prev, ...updates };
      safeLocalSet('wa_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    safeLocalRemove('wa_onboarded');
    safeLocalRemove('wa_user');
    setIsOnboarded(false);
    setCurrentUser({ ...DEFAULT_USER });
  }, []);

  // ── Settings ─────────────────────────────────────────────────────────────────
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updates };
      safeLocalSet('wa_settings', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ── Chat helpers ─────────────────────────────────────────────────────────────
  const markAsRead = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
  }, []);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  useEffect(() => {
    if (activeChatId) markAsRead(activeChatId);
  }, [activeChatId, markAsRead]);

  // ── Send chat request ────────────────────────────────────────────────────────
  const sendChatRequest = useCallback((contactId: string) => {
    const reqId = 'cr-out-' + Date.now();
    const newReq: ChatRequest = {
      id: reqId,
      contactId,
      direction: 'outgoing',
      status: 'pending',
      timestamp: 'just now',
      previewMessage: 'Hi! I found your ID and would love to connect 👋',
    };
    setChatRequests((prev) => [...prev, newReq]);

    const delay = 3000 + Math.random() * 2000;
    setTimeout(() => {
      setChatRequests((prev) =>
        prev.map((r) => (r.id === reqId ? { ...r, status: 'accepted' } : r))
      );
      const disc = discoverableRef.current.find((c) => c.id === contactId);
      if (disc) {
        setContacts((prev) =>
          prev.find((c) => c.id === contactId) ? prev : [...prev, disc]
        );
        setDiscoverableContacts((prev) => prev.filter((c) => c.id !== contactId));
      }
      setChats((prev) => {
        if (prev.find((c) => c.contactId === contactId)) return prev;
        return [
          ...prev,
          {
            id: 'chat-' + contactId + '-' + Date.now(),
            contactId,
            lastMessage: 'Request accepted ✓',
            lastMessageTime: 'now',
            unreadCount: 0,
          },
        ];
      });
    }, delay);
  }, []);

  // ── Accept incoming request ──────────────────────────────────────────────────
  const acceptRequest = useCallback((requestId: string): string => {
    const req = chatRequestsRef.current.find((r) => r.id === requestId);
    if (!req) return '';
    const { contactId, previewMessage } = req;

    setChatRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'accepted' } : r))
    );

    const disc = discoverableRef.current.find((c) => c.id === contactId);
    if (disc) {
      setContacts((prev) =>
        prev.find((c) => c.id === contactId) ? prev : [...prev, disc]
      );
      setDiscoverableContacts((prev) => prev.filter((c) => c.id !== contactId));
    }

    // Check if chat already exists
    const existingChat = chatsRef.current.find((c) => c.contactId === contactId);
    if (existingChat) return existingChat.id;

    const chatId = 'chat-' + contactId + '-' + Date.now();
    setChats((prev) => {
      if (prev.find((c) => c.contactId === contactId)) return prev;
      return [
        ...prev,
        { id: chatId, contactId, lastMessage: previewMessage, lastMessageTime: 'now', unreadCount: 1 },
      ];
    });

    setTimeout(() => {
      setMessages((prev) => {
        if (prev[chatId]) return prev;
        return {
          ...prev,
          [chatId]: [
            {
              id: chatId + '-sys',
              chatId: chatId,
              content: 'Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.',
              type: 'system' as const,
              senderId: 'system',
              timestamp: '',
              status: 'read' as const,
            },
            {
              id: chatId + '-m1',
              chatId: chatId,
              content: previewMessage,
              type: 'text' as const,
              senderId: contactId,
              timestamp: 'now',
              status: 'delivered' as const,
            },
          ],
        };
      });
    }, 100);

    return chatId;
  }, []);

  // ── Decline incoming request ─────────────────────────────────────────────────
  const declineRequest = useCallback((requestId: string) => {
    setChatRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'declined' } : r))
    );
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    (
      chatId: string,
      content: string,
      msgType: Message['type'] = 'text',
      extra: Partial<Message> = {}
    ) => {
      const now = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const msgId = 'msg-' + Date.now();
      const newMsg: Message = {
        id: msgId,
        chatId,
        content,
        type: msgType,
        senderId: 'me',
        timestamp: now,
        status: 'sent',
        ...extra,
      };

      setMessages((prev) => ({ ...prev, [chatId]: [...(prev[chatId] || []), newMsg] }));

      const displayContent = msgType === 'link' ? extra.linkUrl || content : content;
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, lastMessage: displayContent, lastMessageTime: now, lastMessageSender: undefined }
            : c
        )
      );

      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) =>
            m.id === msgId ? { ...m, status: 'delivered' as const } : m
          ),
        }));
      }, 800);

      setTimeout(() => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) =>
            m.id === msgId ? { ...m, status: 'read' as const } : m
          ),
        }));
      }, 1500);

      // Auto-reply
      const chat = chatsRef.current.find((c) => c.id === chatId);
      if (!chat) return;
      const { contactId } = chat;
      const replies = autoReplies[contactId] || autoReplies['family'];
      if (!replies || replies.length === 0) return;

      setTimeout(() => setTypingContacts((prev) => ({ ...prev, [chatId]: true })), 1500);
      const replyDelay = 2500 + Math.random() * 1500;
      setTimeout(() => {
        setTypingContacts((prev) => ({ ...prev, [chatId]: false }));
        const replyContent = replies[Math.floor(Math.random() * replies.length)];
        const replyTime = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const replyMsg: Message = {
          id: 'msg-' + Date.now() + '-reply',
          chatId,
          content: replyContent,
          type: 'text',
          senderId: contactId,
          timestamp: replyTime,
          status: 'read',
        };
        setMessages((prev) => ({ ...prev, [chatId]: [...(prev[chatId] || []), replyMsg] }));
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, lastMessage: replyContent, lastMessageTime: replyTime } : c
          )
        );
      }, replyDelay);
    },
    []
  );

  // ── Context value ─────────────────────────────────────────────────────────────
  const value: AppContextType = {
    isOnboarded,
    currentUser,
    completeOnboarding,
    updateCurrentUser,
    logout,
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
    pendingIncomingCount,
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
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}