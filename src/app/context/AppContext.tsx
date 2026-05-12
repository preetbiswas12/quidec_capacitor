import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import services from '../../utils/firebaseServices';
const { messageService, authService, presenceService, friendRequestService, typingService, userService } = services;
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { initializePushNotifications } from '../../utils/fcm';
import { loadMessages as loadLocalMessages, clearKeyCache, updateMessageReactions } from '../../utils/localMessageStore';
import { getEncryptionKey } from '../../utils/encryption';
import { uploadMediaWithProgress, loadMediaWithCache } from '../../utils/mediaUploadHandler';
import { permissionManager } from '../../utils/permissionManager';
import { initializeProductionCollections } from '../../scripts/initCollections';

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
  theme: 'dark' | 'light';
}

interface AppContextType {
  // Auth
  isOnboarded: boolean;
  currentUser: CurrentUser | null;
  isAuthenticating: boolean;
  needsVerification: boolean;
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
  sendMessage: (chatId: string, content: string, type?: Message['type'], extra?: Partial<Message>, mediaFile?: File) => Promise<void>;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<void>;
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

  // Contact discovery
  searchUsers: (query: string) => void;
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
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Always true for Firebase as it manages its own connection

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

  // ─── Presence & Typing Refs ──────────────────────────────────────────────
  const presenceUnsubscribeRef = useRef<(() => void) | null>(null);
  const typingUnsubscribeRef = useRef<(() => void) | null>(null);
  const friendsUnsubscribeRef = useRef<(() => void) | null>(null);
  const requestsUnsubscribeRef = useRef<(() => void) | null>(null);
  const conversationsUnsubscribeRef = useRef<(() => void) | null>(null);

  // ─── Auth Methods ─────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<any> => {
    setIsAuthenticating(true);
    try {
      const result = await authService.loginUser(email, password);

      if (!result.success) {
        console.error('Login failed:', result.message);
        return result;
      }

      const user: CurrentUser = {
        name: result.user?.displayName || email.split('@')[0],
        email: email,
        userId: result.uid || result.user?.uid || '',
        avatar: result.user?.photoURL || null,
        about: '',
      };
      setCurrentUser(user);
      setNeedsVerification(!result.emailVerified);
      setIsOnboarded(!!result.emailVerified);

      // Initialize production collections
      if (result.emailVerified) {
        initializeProductionCollections().catch(err => console.warn('⚠️ Collection init skipped:', err));
      }

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
      setNeedsVerification(true);
      setIsOnboarded(false); 
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
      
      // Cleanup all Firebase listeners
      presenceUnsubscribeRef.current?.();
      typingUnsubscribeRef.current?.();
      friendsUnsubscribeRef.current?.();
      requestsUnsubscribeRef.current?.();
      conversationsUnsubscribeRef.current?.();

      clearKeyCache(); // Clear encryption keys on logout
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsAuthenticating(false);
      navigate('/login');
    }
  }, [navigate]);

  const initialAuthChecked = useRef(false);

  // ─── Initialize Auth State on Mount ───────────────────────────────────────
  useEffect(() => {
    const splashDelay = new Promise(resolve => setTimeout(resolve, 3000));
    
    const authUnsubscribe = authService.onAuthStateChange(async (currentFirebaseUser) => {
      // If we already finished the initial check, don't do it again
      if (initialAuthChecked.current) return;

      console.log('🔍 Initial Auth Check:', currentFirebaseUser ? `User ${currentFirebaseUser.email}` : 'No user detected');
      
      try {
        if (currentFirebaseUser) {
          console.log('📧 Email verified:', currentFirebaseUser.emailVerified);
          if (currentFirebaseUser.emailVerified) {
            // Fetch profile
            let about = 'Available';
            let avatar = currentFirebaseUser.photoURL || null;
            let name = currentFirebaseUser.displayName || currentFirebaseUser.email?.split('@')[0] || 'User';

            try {
              console.log('📥 Fetching Firestore profile...');
              // Use a timeout to prevent hanging the whole app
              const fetchDoc = getDoc(doc(db, 'users', currentFirebaseUser.uid));
              const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
              
              const userDoc = await Promise.race([fetchDoc, timeout]) as any;
              
              if (userDoc && userDoc.exists()) {
                const data = userDoc.data();
                about = data.about || about;
                avatar = data.photoURL || avatar;
                name = data.displayName || name;
                console.log('✅ Profile loaded:', name);
              } else {
                console.warn('⚠️ User doc does not exist');
              }
            } catch (docErr) {
              console.warn('⚠️ Profile fetch skipped (timeout or error):', docErr);
            }

            const user: CurrentUser = {
              name,
              email: currentFirebaseUser.email || '',
              userId: currentFirebaseUser.uid || '',
              avatar,
              about,
            };
            
            setCurrentUser(user);
            setNeedsVerification(false);
            setIsOnboarded(true);
            console.log('🚀 Finalizing state: ONBOARDED');

            // Background initializations
            initializeProductionCollections().catch(() => {});
            getEncryptionKey(user.userId).then(key => initializePushNotifications(user.userId, key)).catch(() => {});
          } else {
            console.log('🚀 Finalizing state: NEEDS_VERIFICATION');
            setCurrentUser({
              name: currentFirebaseUser.displayName || 'User',
              email: currentFirebaseUser.email || '',
              userId: currentFirebaseUser.uid || '',
              avatar: null,
              about: '',
            });
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
        // Wait for animation delay
        console.log('⏳ Ensuring splash duration...');
        await splashDelay;
        setIsAuthenticating(false);
        initialAuthChecked.current = true;
        console.log('🏁 Auth Initialization Complete');
      }
    });

    return () => authUnsubscribe();
  }, []);

  // ─── Native Permissions Initialization ────────────────────────────────────
  useEffect(() => {
    if (isOnboarded && currentUser) {
      const requestNativePermissions = async () => {
        console.log('🛡️ Requesting native Android permissions...');
        await permissionManager.requestPermission('camera');
        await permissionManager.requestPermission('microphone');
        await permissionManager.requestPermission('storage');
        // Location requested lazily when needed
      };
      requestNativePermissions();
    }
  }, [isOnboarded, currentUser]);

  useEffect(() => {
    if (!currentUser || chats.length === 0) {
      return;
    }

    const unsubscribers = chats.map((chat) => {
      if (!chat.contactId) {
        return () => {};
      }

      return messageService.listenToMessages(
        currentUser.userId,
        chat.contactId,
        (rawMessages) => {
          const mappedMessages = rawMessages.map((raw) => mapFirestoreMessage(raw, chat.id));

          setMessages((prev) => ({
            ...prev,
            [chat.id]: mappedMessages,
          }));

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

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // ignore cleanup errors
        }
      });
    };
  }, [currentUser, chats]);

  const completeOnboarding = useCallback((user: CurrentUser) => {
    setCurrentUser(user);
    setIsOnboarded(true);
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<CurrentUser>) => {
    if (!currentUser) return;

    try {
      let avatarToSave = updates.avatar;

      // If updating avatar and it's a dataURL (new selection)
      if (updates.avatar && updates.avatar.startsWith('data:')) {
        console.log('📦 Chunking and encrypting new profile picture...');
        // Convert dataURL to File
        const res = await fetch(updates.avatar);
        const blob = await res.blob();
        const file = new File([blob], `profile_${currentUser.userId}.jpg`, { type: 'image/jpeg' });

        // Store as encrypted chunks - use userId as Both user1 and user2 for self-media
        const mediaRef = await uploadMediaWithProgress(file, 'image', currentUser.userId, currentUser.userId);
        avatarToSave = mediaRef.fileId; // This is the hash reference
        
        // Update resolved URL immediately for UI responsiveness
        const displayUrl = URL.createObjectURL(blob);
        setCurrentUserAvatarUrl(displayUrl);
      }

      // Persist to Firebase
      await authService.updateUserProfile(currentUser.userId, {
        name: updates.name,
        avatar: avatarToSave,
        about: updates.about
      });

      // Update local state
      setCurrentUser((prev) => (prev ? { ...prev, ...updates, avatar: avatarToSave || prev.avatar } : null));
      console.log('✅ Profile saved to Firestore and local storage');
    } catch (err) {
      console.error('❌ Failed to save profile:', err);
    }
  }, [currentUser]);

  // ─── Initialize Real-time Listeners ───────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !isOnboarded) {
      return;
    }

    const uid = currentUser.userId;
    console.log('🔗 Establishing real-time Firebase listeners for', uid);

    // 1. Listen to Friends List
    friendsUnsubscribeRef.current = presenceService.listenToFriends(uid, (rawFriends) => {
      const normalized = rawFriends.map((f, i) => normalizeContact(f, i));
      setContacts(normalized);
    });

    // 2. Listen to Friends Presence
    presenceUnsubscribeRef.current = presenceService.listenToFriendsPresence(uid, (friendsStatus) => {
      setContacts(prev => prev.map(contact => {
        const status = friendsStatus[contact.id];
        if (status) {
          return {
            ...contact,
            isOnline: status.online,
            lastSeen: status.online ? 'online' : `last seen ${new Date(status.lastSeen).toLocaleTimeString()}`,
          };
        }
        return contact;
      }));
    });

    // 3. Listen to Friend Requests (Incoming)
    requestsUnsubscribeRef.current = friendRequestService.listenToPendingRequests(uid, (rawRequests) => {
      const requests = rawRequests.map((req, i) => ({
        id: req.id,
        contactId: req.fromUid,
        direction: 'incoming' as const,
        status: 'pending' as const,
        timestamp: normalizeFirestoreTimestamp(req.createdAt),
        previewMessage: `Friend request from ${req.fromUsername || req.fromUid}`,
      }));
      setChatRequests(requests);
    });

    // 4. Listen to Incoming Messages (Zero-Storage Pipe)
    conversationsUnsubscribeRef.current = messageService.listenToIncomingMessages(uid, async (msg) => {
      console.log('📬 New incoming message via Pipe:', msg.id);
      
      const chatId = msg.conversationId || msg.fromUid;
      const incomingMsg = mapFirestoreMessage(msg, chatId);

      // Add to UI state
      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), incomingMsg],
      }));

      // Update chat preview
      setChats((prev) => {
        const existing = prev.find(c => c.id === chatId);
        if (existing) {
          return prev.map(c => c.id === chatId ? {
            ...c,
            lastMessage: incomingMsg.content,
            lastMessageTime: incomingMsg.timestamp,
            lastMessageSender: incomingMsg.senderId,
            unreadCount: (activeChatId === chatId) ? 0 : (c.unreadCount + 1)
          } : c);
        } else {
          // If chat doesn't exist in list yet, we'd ideally fetch contact info
          // and add it. For now, let's just create a shell
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
    });

    // 5. Listen to Typing Indicators
    typingUnsubscribeRef.current = typingService.listenToTyping(uid, 'all', (typingData) => {
      // typingData is Record<chatId, boolean>
      setTypingContacts(typingData);
    });

    // 5. Global Call Signaling Listener (Detect Incoming Calls)
    const unsubscribeSignaling = presenceService.listenToSignaling(uid, (data) => {
      if (data.type === 'webrtc-offer') {
        console.log('📞 Incoming call detected from:', data.fromUid);
        // Automatically navigate to the call screen as the receiver
        // We'll pass a 'received' flag so the screen knows to accept the offer
        navigate(`/call/${data.callType || 'video'}/${data.fromUid}?received=true`);
      }
    });

    // Cleanup all listeners on unmount or user change
    return () => {
      presenceUnsubscribeRef.current?.();
      typingUnsubscribeRef.current?.();
      friendsUnsubscribeRef.current?.();
      requestsUnsubscribeRef.current?.();
      conversationsUnsubscribeRef.current?.();
      unsubscribeSignaling();
    };
  }, [currentUser, isOnboarded, navigate]);

  // ─── Helper: Convert raw contact to UI Contact ────────────────────────────

  const normalizeContact = useCallback((rawContact: any, index: number): Contact => {
    const name = rawContact.name || rawContact.username || rawContact.displayName || `User ${index}`;
    const userId = rawContact.uid || rawContact.userId || `@${rawContact.username || rawContact.name || `user${index}`}`.toLowerCase();
    
    return {
      id: rawContact.uid || rawContact.userId || rawContact.username || rawContact.name || `user-${index}`,
      userId,
      name,
      avatar: rawContact.avatar || rawContact.photoURL || null,
      avatarColor: getAvatarColor(userId),
      initials: getInitials(name),
      isOnline: rawContact.online ?? false,
      lastSeen: rawContact.lastSeen || 'offline',
      about: rawContact.about || '',
    };
  }, []);

  // ─── Chat Methods ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (chatId: string, content: string, type: Message['type'] = 'text', extra?: Partial<Message>, mediaFile?: File) => {
      if (!currentUser) return;

      const msgId = `msg-${Date.now()}`;
      let finalImageUrl = extra?.imageUrl;

      // 1. Handle Native Media Chunking (Local-First)
      if (mediaFile) {
        console.log(`📦 Chunking and encrypting ${type} for local vault...`);
        try {
          const mediaRef = await uploadMediaWithProgress(
            mediaFile,
            type === 'text' ? 'image' : (type as any),
            currentUser.userId,
            chatId
          );
          finalImageUrl = mediaRef.fileId; // The hash reference
        } catch (err) {
          console.error('❌ Media chunking failed:', err);
        }
      }

      // 2. Optimistic local message
      const msg: Message = {
        id: msgId,
        chatId,
        senderId: 'me',
        content,
        type,
        timestamp: new Date().toISOString(),
        status: 'sent',
        ...extra,
        imageUrl: finalImageUrl,
      };

      setMessages((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));

      // 3. Persist and Deliver (Cloud-Free content)
      // recordMessage now only saves to local DB
      messageService.recordMessage(currentUser.userId, chatId, content, {
        messageId: msgId,
        messageType: type,
        mediaUrl: finalImageUrl,
        timestamp: new Date(),
        status: 'sent',
      }).catch(err => console.warn('⚠️ Local record failed:', err));

      // 4. (No WebSocket needed - Firestore handles real-time delivery via snapshots)
    },
    [currentUser]
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
    await messageService.markAllMessagesAsRead(currentUser.userId, chatId);

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
  }, [currentUser]);

  // ─── Friend Request Methods ────────────────────────────────────────────────

  const sendChatRequest = useCallback(async (contactId: string) => {
    if (!currentUser) return;
    await friendRequestService.sendFriendRequest(currentUser.userId, contactId);
  }, [currentUser]);

  const acceptRequest = useCallback(async (requestId: string): Promise<string> => {
    const request = chatRequests.find((r) => r.id === requestId);
    if (request && currentUser) {
      await friendRequestService.acceptFriendRequest(requestId, request.contactId, currentUser.userId);
    }
    return requestId;
  }, [chatRequests, currentUser]);

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
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem('quidec_settings', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ─── User Discovery (#6) ──────────────────────────────────────────────────

  const searchUsers = useCallback(async (query: string) => {
    if (!currentUser) return;
    const results = await userService.searchUsers(query, currentUser.userId);
    const normalized = results.map((u: any, i: number) => normalizeContact(u, i));
    setDiscoverableContacts(normalized);
  }, [currentUser, normalizeContact]);

  // NOTE: Session restore is handled entirely by Firebase's browserLocalPersistence.
  // The initializeAuth useEffect above (using authService.getCurrentUser()) is
  // sufficient — no manual credential storage is needed or safe.

  // ─── Resolve Avatar Hash ──────────────────────────────────────────────────
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;

    const resolveAvatar = async () => {
      if (currentUser?.avatar && currentUser.avatar.startsWith('image_')) {
        try {
          console.log(`🔍 Resolving avatar hash: ${currentUser.avatar} (Attempt ${retryCount + 1})`);
          const url = await loadMediaWithCache(currentUser.avatar, 'image', currentUser.userId, currentUser.userId);
          setCurrentUserAvatarUrl(url);
          console.log('✅ Avatar resolved successfully');
        } catch (err) {
          console.warn(`⚠️ Failed to resolve avatar hash (Attempt ${retryCount + 1}):`, err);
          
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(resolveAvatar, 500 * retryCount); // Exponential backoff
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
  }, [currentUser?.avatar, currentUser?.userId]);

  // ─── Real-time Typing (Per Active Chat) ──────────────────────────────────
  useEffect(() => {
    if (!currentUser || !activeChatId) {
      setTypingContacts({});
      return;
    }

    const contact = chats.find(c => c.id === activeChatId)?.contactId;
    if (!contact) return;

    console.log(`⌨️ Listening for typing in ${activeChatId}`);
    const unsubscribe = typingService.listenToTyping(currentUser.userId, contact, (typingData) => {
      setTypingContacts(prev => ({
        ...prev,
        [activeChatId]: typingData[contact] || false
      }));
    });

    return () => unsubscribe();
  }, [currentUser, activeChatId, chats]);

  const value: AppContextType = {
    isOnboarded,
    currentUser: currentUser ? { ...currentUser, avatar: currentUserAvatarUrl } : null,
    isAuthenticating,
    needsVerification,
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
    searchUsers,
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
    reactToMessage,
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


