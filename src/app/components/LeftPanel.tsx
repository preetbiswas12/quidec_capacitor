import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, MoreVertical, PenSquare, ArrowLeft, X, Search, AtSign, UserPlus, Check, Clock, Users, Circle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import type { SearchResult } from '../context/AppContext';
import ChatList from './ChatList';
import StatusTab from './StatusTab';
import SettingsPage from './SettingsPage';
import MessageRequests from './MessageRequests';
import Avatar from './Avatar';


type NewChatTab = 'contacts' | 'find-id';

export default function LeftPanel() {
  const navigate = useNavigate();
  const {
    activeTab, setActiveTab, currentUser,
    contacts, discoverableContacts, chats,
    setActiveChatId, startChat,
    chatRequests, sendChatRequest,
    showRequests, setShowRequests,
    createGroup,
    searchUsers,
    searchAllMessages,
    isOffline,
  } = useApp();

  const [showMenu, setShowMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTab, setNewChatTab] = useState<NewChatTab>('contacts');
  const [newChatSearch, setNewChatSearch] = useState('');
  const [idQuery, setIdQuery] = useState('');
  const [idResult, setIdResult] = useState<typeof contacts[0] | null>(null);
  const [idNotFound, setIdNotFound] = useState(false);
  const [settingsSubPage, setSettingsSubPage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Group creation state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Global search state
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<SearchResult[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const globalSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (globalSearchTimerRef.current) clearTimeout(globalSearchTimerRef.current);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleGlobalSearch = useCallback((query: string) => {
    setGlobalSearchQuery(query);
    if (globalSearchTimerRef.current) clearTimeout(globalSearchTimerRef.current);
    if (!query.trim()) {
      setGlobalSearchResults([]);
      setGlobalSearchLoading(false);
      return;
    }
    setGlobalSearchLoading(true);
    globalSearchTimerRef.current = setTimeout(async () => {
      const results = await searchAllMessages(query);
      setGlobalSearchResults(results);
      setGlobalSearchLoading(false);
    }, 300);
  }, [searchAllMessages]);

  const resetGlobalSearch = () => {
    setShowGlobalSearch(false);
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setGlobalSearchLoading(false);
    if (globalSearchTimerRef.current) clearTimeout(globalSearchTimerRef.current);
  };

  useEffect(() => {
    if (showGlobalSearch) {
      setTimeout(() => globalSearchInputRef.current?.focus(), 100);
    }
  }, [showGlobalSearch]);

  if (!currentUser) return null;

  const tabs = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'status', icon: Circle, label: 'Status' },
  ] as const;

  const menuItems = [
    { label: 'New Group', action: () => { setShowMenu(false); setShowCreateGroup(true); } },
    { label: 'Starred messages', action: () => { setShowMenu(false); setActiveTab('settings'); setSettingsSubPage('starred'); } },
    { label: 'Settings', action: () => { setShowMenu(false); setActiveTab('settings'); } },
  ];

  const statusMenuItems = [
    { label: 'Status privacy', action: () => { setShowMenu(false); setActiveTab('settings'); } },
    { label: 'Settings', action: () => { setShowMenu(false); setActiveTab('settings'); } },
  ];

  const allSearchable = [...contacts.filter(c => !c.isGroup), ...discoverableContacts];
  const filteredContacts = newChatSearch
    ? contacts.filter(c => !c.isGroup && c.name.toLowerCase().includes(newChatSearch.toLowerCase()))
    : contacts.filter(c => !c.isGroup);

  const openChatWithContact = async (contactId: string) => {
    try {
      const chatId = await startChat(contactId);
      setActiveChatId(chatId);
      navigate(`/app/chat/${chatId}`);
    } catch (err) {
      console.error('❌ Failed to start chat:', err);
    }
    setShowNewChat(false);
    setNewChatSearch('');
  };

  // Find by ID — search locally first, then query Firestore
  const handleSearchId = async () => {
    const q = idQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return;
    // First check local contacts
    const localMatch = allSearchable.find(c => c.userId.toLowerCase().replace(/^@/, '') === q || c.userId.toLowerCase() === `@${q}`);
    if (localMatch) { setIdResult(localMatch); setIdNotFound(false); return; }
    // Then search Firestore
    if (searchUsers) {
      try {
        await searchUsers(q);
        // After search, check if the query matches any discoverable contact
        const firestoreMatch = discoverableContacts.find(c => c.userId.toLowerCase().replace(/^@/, '') === q || c.userId.toLowerCase() === `@${q}`);
        if (firestoreMatch) { setIdResult(firestoreMatch); setIdNotFound(false); }
        else { setIdResult(null); setIdNotFound(true); }
      } catch (err) {
        console.error('❌ Search failed:', err);
        setIdResult(null); setIdNotFound(true);
      }
    } else {
      setIdResult(null); setIdNotFound(true);
    }
  };

  const requestStatus = (contactId: string) => {
    const req = chatRequests.find(r => r.contactId === contactId && r.direction === 'outgoing');
    return req?.status ?? null;
  };

  const isExistingContact = (contactId: string) => contacts.some(c => c.id === contactId);
  const hasExistingChat = (contactId: string) => chats.some(c => c.contactId === contactId);

  const handleSendRequest = (contactId: string) => {
    if (!navigator.onLine) {
      import('sonner').then(({ toast }) => {
        toast.info('Friend request will be sent when you\'re back online');
      });
      return;
    }
    sendChatRequest(contactId);
  };

  const resetNewChat = () => {
    setShowNewChat(false);
    setNewChatSearch('');
    setIdQuery('');
    setIdResult(null);
    setIdNotFound(false);
    setNewChatTab('contacts');
  };

  return (
    <div className="flex flex-col h-full bg-wa-main text-wa-primary transition-colors duration-200 relative">
      {/* Offline indicator */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 flex items-center gap-2 shrink-0"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-amber-400" style={{ fontSize: '0.7rem', fontWeight: 500 }}>
              You're offline
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      {!settingsSubPage && (
        <div className="flex-shrink-0 bg-wa-header border-b border-wa-border/10 pt-10">
          {activeTab === 'settings' ? (
            <div className="flex items-center px-4 py-3">
              <button onClick={() => setActiveTab('chats')} className="text-wa-header-icon hover:text-wa-primary p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors flex-shrink-0">
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-wa-primary ml-2" style={{ fontSize: '1.15rem', fontWeight: 700 }}>Settings</h1>
            </div>
          ) : activeTab === 'status' ? (
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setActiveTab('settings')} className="hover:opacity-80 transition-opacity">
                <div className="w-9 h-9 rounded-full bg-wa-secondary flex items-center justify-center overflow-hidden border border-wa-border/20">
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-wa-primary" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      {currentUser.name ? currentUser.name[0].toUpperCase() : 'M'}
                    </span>
                  )}
                </div>
              </button>

              <h1 className="text-wa-primary" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Status</h1>

              <div className="flex items-center gap-1">
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowMenu(v => !v)}
                    className={`p-2 rounded-full hover:bg-white/5 transition-colors ${showMenu ? 'text-wa-primary bg-white/5' : 'text-wa-header-icon hover:text-wa-primary'}`}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-xl shadow-2xl overflow-hidden z-50 border border-wa-border">
                      {statusMenuItems.map(item => (
                        <button
                          key={item.label}
                          onClick={item.action}
                          className="w-full text-left px-5 py-3.5 text-wa-primary hover:bg-[#2A3942] transition-colors"
                          style={{ fontSize: '0.9rem' }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              {showGlobalSearch ? (
                <>
                  <button onClick={resetGlobalSearch} className="text-wa-header-icon hover:text-wa-primary p-1">
                    <ArrowLeft size={20} />
                  </button>
                  <div className="flex-1 mx-3 flex items-center gap-2">
                    <Search size={16} className="text-wa-text-muted flex-shrink-0" />
                    <input
                      ref={globalSearchInputRef}
                      type="text"
                      value={globalSearchQuery}
                      onChange={e => handleGlobalSearch(e.target.value)}
                      placeholder="Search all messages..."
                      className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted"
                      style={{ fontSize: '0.95rem' }}
                    />
                    {globalSearchQuery && (
                      <button onClick={() => handleGlobalSearch('')}>
                        <X size={16} className="text-wa-text-muted" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setActiveTab('settings')} className="hover:opacity-80 transition-opacity">
                    <div className="w-9 h-9 rounded-full bg-wa-secondary flex items-center justify-center overflow-hidden border border-wa-border/20">
                      {currentUser.avatar ? (
                        <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-wa-primary" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                          {currentUser.name ? currentUser.name[0].toUpperCase() : 'M'}
                        </span>
                      )}
                    </div>
                  </button>

                  <h1 className="text-wa-primary" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                    {activeTab === 'chats' ? 'Veill' : 'Status'}
                  </h1>

                  <div className="flex items-center gap-1">
                    {activeTab === 'chats' && (
                      <button
                        onClick={() => setShowGlobalSearch(true)}
                        className="text-wa-header-icon hover:text-wa-primary p-2 rounded-full hover:bg-white/5 transition-colors"
                        title="Search messages"
                      >
                        <Search size={18} />
                      </button>
                    )}
                    {activeTab === 'chats' && (
                      <button
                        onClick={() => setShowNewChat(true)}
                        className="text-wa-header-icon hover:text-wa-primary p-2 rounded-full hover:bg-white/5 transition-colors"
                        title="New chat"
                      >
                        <PenSquare size={18} />
                      </button>
                    )}
                    <div className="relative" ref={menuRef}>
                      <button
                        onClick={() => setShowMenu(v => !v)}
                        className={`p-2 rounded-full hover:bg-white/5 transition-colors ${showMenu ? 'text-wa-primary bg-white/5' : 'text-wa-header-icon hover:text-wa-primary'}`}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {showMenu && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-xl shadow-2xl overflow-hidden z-50 border border-wa-border">
                          {menuItems.map(item => (
                            <button
                              key={item.label}
                              onClick={item.action}
                              className="w-full text-left px-5 py-3.5 text-wa-primary hover:bg-[#2A3942] transition-colors"
                              style={{ fontSize: '0.9rem' }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chats' && showGlobalSearch && (
          <div className="flex-1 overflow-y-auto h-full">
            {globalSearchLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-wa-text-muted">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent border-wa-text-muted animate-spin" />
                <p style={{ fontSize: '0.85rem' }}>Searching messages...</p>
              </div>
            ) : globalSearchQuery.trim() && globalSearchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-wa-text-muted">
                <Search size={32} className="opacity-30" />
                <p style={{ fontSize: '0.9rem' }}>No results found</p>
                <p style={{ fontSize: '0.75rem' }}>Try a different search term</p>
              </div>
            ) : (
              <div>
                {globalSearchResults.map((result) => {
                  const contact = contacts.find(c => c.id === result.chatId);
                  const name = result.contactName || contact?.name || result.chatId;
                  const snippet = result.content.length > 80
                    ? result.content.substring(0, 80) + '...'
                    : result.content;
                  const time = new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  const lowerContent = result.content.toLowerCase();
                  const lowerQuery = globalSearchQuery.toLowerCase();
                  const matchIdx = lowerContent.indexOf(lowerQuery);

                  let highlightedSnippet;
                  if (matchIdx >= 0) {
                    const before = snippet.substring(0, matchIdx);
                    const match = snippet.substring(matchIdx, matchIdx + globalSearchQuery.length);
                    const after = snippet.substring(matchIdx + globalSearchQuery.length);
                    highlightedSnippet = (
                      <span>{before}<mark className="bg-[#4D91FB]/30 text-wa-primary rounded px-0.5">{match}</mark>{after}</span>
                    );
                  } else {
                    highlightedSnippet = snippet;
                  }

                  return (
                    <button
                      key={result.messageId}
                      onClick={() => {
                        resetGlobalSearch();
                        setActiveChatId(result.chatId);
                        navigate(`/app/chat/${result.chatId}`);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-secondary/50 transition-colors border-b border-wa-border/30 text-left"
                    >
                      <Avatar
                        src={contact?.avatar ?? null}
                        name={name}
                        color={contact?.avatarColor ?? '#667781'}
                        size={44}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-wa-primary truncate" style={{ fontWeight: 500, fontSize: '0.95rem' }}>{name}</p>
                          <span className="text-wa-text-muted flex-shrink-0 ml-2" style={{ fontSize: '0.7rem' }}>{time}</span>
                        </div>
                        <p className="text-wa-text-muted truncate" style={{ fontSize: '0.8rem' }}>
                          {highlightedSnippet}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === 'chats' && !showGlobalSearch && !showRequests && <ChatList />}
        {activeTab === 'chats' && !showGlobalSearch && showRequests && <MessageRequests />}
        {activeTab === 'status' && <StatusTab />}
        {activeTab === 'settings' && !settingsSubPage && <SettingsPage onSubPageChange={setSettingsSubPage} />}
      </div>

      {/* Bottom Nav */}
      {!settingsSubPage && (
        <div className="flex-shrink-0 bg-wa-header border-t border-wa-border pb-6">
          <div className="flex">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setShowRequests(false); }}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
                    isActive ? 'text-[#4d91fb]' : 'text-wa-text-muted hover:text-[#aebac1]'
                  }`}
                >
                  <tab.icon size={22} />
                  <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
                  {isActive && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-[#4d91fb] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings subpage full-panel overlay */}
      <AnimatePresence>
        {settingsSubPage && (
          <motion.div
            key={settingsSubPage}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="absolute inset-0 z-30 bg-wa-secondary flex flex-col overflow-hidden transition-colors duration-200"
          >
            <SettingsPage
              onSubPageChange={setSettingsSubPage}
              forcedSubPage={settingsSubPage}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New Chat overlay ── */}
      <AnimatePresence>
        {showNewChat && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="absolute inset-0 bg-wa-main flex flex-col z-40 transition-colors duration-200"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 pt-10 bg-wa-header flex-shrink-0 border-b border-wa-border/10">
              <button onClick={resetNewChat} className="text-wa-header-icon hover:text-wa-primary p-1">
                <ArrowLeft size={20} />
              </button>
              <span className="text-wa-primary" style={{ fontSize: '1.05rem', fontWeight: 700 }}>New Chat</span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-wa-border bg-wa-header flex-shrink-0">
              <button
                onClick={() => setNewChatTab('contacts')}
                className={`flex-1 py-3 text-center transition-colors ${newChatTab === 'contacts' ? 'text-[#4D91FB] border-b-2 border-[#4D91FB]' : 'text-wa-text-muted'}`}
                style={{ fontSize: '0.88rem', fontWeight: newChatTab === 'contacts' ? 600 : 400 }}
              >
                My Contacts
              </button>
              <button
                onClick={() => setNewChatTab('find-id')}
                className={`flex-1 py-3 text-center transition-colors flex items-center justify-center gap-1.5 ${newChatTab === 'find-id' ? 'text-[#4D91FB] border-b-2 border-[#4D91FB]' : 'text-wa-text-muted'}`}
                style={{ fontSize: '0.88rem', fontWeight: newChatTab === 'find-id' ? 600 : 400 }}
              >
                <AtSign size={14} />
                Find by ID
              </button>
            </div>

            {/* My Contacts tab */}
            {newChatTab === 'contacts' && (
              <>
                <div className="px-3 py-2 flex-shrink-0">
                  <div className="flex items-center gap-2 bg-wa-header rounded-xl px-4 py-2">
                    <Search size={16} className="text-wa-text-muted" />
                    <input
                      type="text"
                      placeholder="Search contacts"
                      value={newChatSearch}
                      onChange={e => setNewChatSearch(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]"
                      style={{ fontSize: '0.9rem' }}
                      autoFocus
                    />
                    {newChatSearch && (
                      <button onClick={() => setNewChatSearch('')}>
                        <X size={16} className="text-wa-text-muted" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => openChatWithContact(contact.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-wa-secondary/50 transition-colors border-b border-wa-border/30 text-left"
                    >
                      <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} isOnline={contact.isOnline} />
                      <div className="flex-1 min-w-0">
                        <p className="text-wa-primary" style={{ fontWeight: 500 }}>{contact.name}</p>
                        <p className="text-[#4D91FB]" style={{ fontSize: '0.75rem' }}>{contact.userId}</p>
                      </div>
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-wa-text-muted">
                      <Search size={32} className="opacity-30" />
                      <p style={{ fontSize: '0.9rem' }}>No contacts found</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Find by ID tab */}
            {newChatTab === 'find-id' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search input */}
                <div className="px-4 pt-4 pb-3 flex-shrink-0">
                  <div className="bg-wa-secondary/30 rounded-2xl px-4 py-3">
                    <p className="text-wa-text-muted mb-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>ENTER VEILL ID</p>
                    <div className="flex items-center gap-2">
                      <AtSign size={16} className="text-[#4D91FB] flex-shrink-0" />
                      <input
                        type="text"
                        value={idQuery}
                        onChange={e => { setIdQuery(e.target.value); setIdResult(null); setIdNotFound(false); }}
                        onKeyDown={e => e.key === 'Enter' && handleSearchId()}
                        placeholder="username.1234"
                        className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/40 font-bold"
                        style={{ fontSize: '1.1rem' }}
                        autoFocus
                      />
                      {idQuery && (
                        <button onClick={() => { setIdQuery(''); setIdResult(null); setIdNotFound(false); }}>
                          <X size={15} className="text-wa-text-muted" />
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleSearchId}
                    disabled={!idQuery.trim()}
                    className={`w-full mt-3 py-3 rounded-full transition-all flex items-center justify-center gap-2 ${idQuery.trim() ? 'bg-[#4D91FB] text-white shadow-lg active:scale-95' : 'bg-wa-secondary text-wa-text-muted'}`}
                    style={{ fontWeight: 700, fontSize: '0.95rem' }}
                  >
                    <Search size={18} />
                    Search Identity
                  </button>
                </div>

                {/* Hint — known IDs */}
                {!idResult && !idNotFound && (
                  <div className="px-4 flex-1 overflow-y-auto">
                    <p className="text-[#4D91FB] mb-3 mt-4" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                      SUGGESTED CONTACTS
                    </p>
                    {[...contacts.filter(c => !c.isGroup), ...discoverableContacts].map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setIdQuery(c.userId.replace('@', '')); }}
                        className="w-full flex items-center gap-4 py-3 px-2 hover:bg-wa-secondary/30 border-b border-wa-border/10 last:border-0 transition-colors"
                      >
                        <Avatar src={c.avatar} name={c.name} color={c.avatarColor} size={40} />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-wa-primary" style={{ fontSize: '0.95rem', fontWeight: 600 }}>{c.name}</p>
                          <p className="text-[#4D91FB]" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{c.userId}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Not found */}
                {idNotFound && (
                  <div className="flex flex-col items-center justify-center py-20 px-8 gap-4 text-center">
                    <div className="w-20 h-20 bg-wa-secondary/50 rounded-full flex items-center justify-center border border-wa-border/20">
                      <Search size={32} className="text-wa-text-muted opacity-50" />
                    </div>
                    <p className="text-wa-primary" style={{ fontSize: '1.2rem', fontWeight: 700 }}>No user found</p>
                    <p className="text-wa-text-muted" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                      We couldn't find a Veill user with the ID <span className="text-wa-primary font-bold">@{idQuery}</span>. Please verify the spelling and try again.
                    </p>
                  </div>
                )}

                {/* Found result */}
                {idResult && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 overflow-y-auto px-4"
                  >
                    <p className="text-[#4D91FB] mb-3 mt-4" style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px' }}>SEARCH RESULT</p>
                    
                    <div className="flex flex-col items-center py-8 gap-4">
                      <Avatar src={idResult.avatar} name={idResult.name} color={idResult.avatarColor} size={100} isOnline={idResult.isOnline} />
                      <div className="text-center">
                        <h2 className="text-wa-primary" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{idResult.name}</h2>
                        <p className="text-[#4D91FB] font-bold mt-1">{idResult.userId}</p>
                        <p className="text-wa-text-muted mt-3 italic" style={{ fontSize: '0.9rem' }}>{idResult.about}</p>
                      </div>

                      <div className="w-full max-w-xs mt-6">
                        {hasExistingChat(idResult.id) || isExistingContact(idResult.id) ? (
                          <button
                            onClick={() => openChatWithContact(idResult.id)}
                            className="w-full py-4 rounded-2xl bg-[#4D91FB] text-white flex items-center justify-center gap-2 hover:bg-[#06cf9c] transition-all shadow-lg active:scale-95"
                            style={{ fontWeight: 700 }}
                          >
                            <MessageSquare size={20} />
                            Open Conversation
                          </button>
                        ) : requestStatus(idResult.id) === 'pending' ? (
                          <div className="w-full py-4 rounded-2xl bg-wa-secondary text-wa-text-muted flex items-center justify-center gap-2 border border-wa-border/20">
                            <Clock size={18} />
                            <span style={{ fontWeight: 600 }}>Request Pending</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSendRequest(idResult.id)}
                            className="w-full py-4 rounded-2xl bg-[#4D91FB] text-white flex items-center justify-center gap-2 hover:bg-[#06cf9c] shadow-lg active:scale-95 transition-all"
                            style={{ fontWeight: 700 }}
                          >
                            <UserPlus size={20} />
                            Send Message Request
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Group overlay ── */}
      <AnimatePresence>
        {showCreateGroup && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="absolute inset-0 bg-wa-main flex flex-col z-40"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 pt-10 bg-wa-header flex-shrink-0 border-b border-wa-border/10">
              <button onClick={() => { setShowCreateGroup(false); setGroupName(''); setGroupDescription(''); setSelectedMembers([]); setGroupSearch(''); }} className="text-wa-header-icon hover:text-wa-primary p-1">
                <ArrowLeft size={20} />
              </button>
              <span className="text-wa-primary" style={{ fontSize: '1.05rem', fontWeight: 700 }}>New Group</span>
            </div>

            {/* Group name & description */}
            <div className="px-4 py-4 border-b border-wa-border/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-[#4d91fb]/20 flex items-center justify-center">
                  <Users size={24} className="text-[#4d91fb]" />
                </div>
                <input
                  type="text"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="Group name"
                  className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/50 font-bold"
                  style={{ fontSize: '1rem' }}
                  maxLength={30}
                />
              </div>
              <input
                type="text"
                value={groupDescription}
                onChange={e => setGroupDescription(e.target.value)}
                placeholder="Group description (optional)"
                className="w-full bg-transparent outline-none text-wa-text-muted placeholder-wa-text-muted/40"
                style={{ fontSize: '0.85rem' }}
                maxLength={100}
              />
            </div>

            {/* Selected members chips */}
            {selectedMembers.length > 0 && (
              <div className="px-4 py-2 flex gap-2 flex-wrap border-b border-wa-border/10">
                {selectedMembers.map(memberId => {
                  const member = contacts.find(c => c.id === memberId);
                  return (
                    <button
                      key={memberId}
                      onClick={() => setSelectedMembers(prev => prev.filter(id => id !== memberId))}
                      className="flex items-center gap-1.5 bg-[#4d91fb]/10 text-[#4d91fb] rounded-full px-3 py-1 text-xs font-medium"
                    >
                      {member?.name || memberId}
                      <X size={12} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search & member list */}
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 bg-wa-header rounded-xl px-4 py-2">
                <Search size={16} className="text-wa-text-muted" />
                <input
                  type="text"
                  value={groupSearch}
                  onChange={e => setGroupSearch(e.target.value)}
                  placeholder="Search contacts to add"
                  className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]"
                  style={{ fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {contacts.filter(c => !c.isGroup && c.name.toLowerCase().includes(groupSearch.toLowerCase())).map(contact => {
                const isSelected = selectedMembers.includes(contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => {
                      setSelectedMembers(prev =>
                        isSelected ? prev.filter(id => id !== contact.id) : [...prev, contact.id]
                      );
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-wa-border/10 text-left ${isSelected ? 'bg-[#4d91fb]/10' : 'hover:bg-wa-secondary/50'}`}
                  >
                    <div className="relative">
                      <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={44} isOnline={contact.isOnline} />
                      {isSelected && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#4d91fb] rounded-full flex items-center justify-center border-2 border-wa-main">
                          <Check size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-wa-primary" style={{ fontWeight: 500 }}>{contact.name}</p>
                      <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>{contact.userId}</p>
                    </div>
                  </button>
                );
              })}
              {contacts.filter(c => !c.isGroup).length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-wa-text-muted">
                  <Users size={32} className="opacity-30" />
                  <p style={{ fontSize: '0.9rem' }}>No contacts yet</p>
                  <p style={{ fontSize: '0.75rem' }}>Add friends first to create a group</p>
                </div>
              )}
            </div>

            {/* Create button */}
            <div className="px-4 py-4 border-t border-wa-border/10">
              <button
                onClick={async () => {
                  if (!groupName.trim() || selectedMembers.length === 0) return;
                  setCreatingGroup(true);
                  try {
                    const groupId = await createGroup(groupName.trim(), groupDescription.trim(), selectedMembers);
                    setShowCreateGroup(false);
                    setGroupName('');
                    setGroupDescription('');
                    setSelectedMembers([]);
                    setGroupSearch('');
                    setActiveChatId(groupId);
                    navigate(`/app/chat/${groupId}`);
                  } catch (err: any) {
                    alert('Failed to create group: ' + err.message);
                  } finally {
                    setCreatingGroup(false);
                  }
                }}
                disabled={!groupName.trim() || selectedMembers.length === 0 || creatingGroup}
                className={`w-full py-3.5 rounded-full flex items-center justify-center gap-2 font-bold transition-all ${
                  groupName.trim() && selectedMembers.length > 0 && !creatingGroup
                    ? 'bg-[#4D91FB] text-white shadow-lg active:scale-95'
                    : 'bg-wa-secondary text-wa-text-muted'
                }`}
              >
                {creatingGroup ? (
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-wa-text-muted animate-spin" />
                ) : (
                  <>
                    <Users size={18} />
                    Create Group ({selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''})
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}