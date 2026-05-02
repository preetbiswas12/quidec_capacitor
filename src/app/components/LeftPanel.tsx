import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Phone, MoreVertical, PenSquare, ArrowLeft, X, Search, AtSign, UserPlus, Check, Clock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import ChatList from './ChatList';
import CallsTab from './CallsTab';
import SettingsPage from './SettingsPage';
import MessageRequests from './MessageRequests';
import Avatar from './Avatar';

type NewChatTab = 'contacts' | 'find-id';

export default function LeftPanel() {
  const navigate = useNavigate();
  const {
    activeTab, setActiveTab, currentUser,
    contacts, discoverableContacts, chats,
    setActiveChatId,
    chatRequests, sendChatRequest,
    showRequests, setShowRequests,
  } = useApp();

  const [showMenu, setShowMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTab, setNewChatTab] = useState<NewChatTab>('contacts');
  const [newChatSearch, setNewChatSearch] = useState('');
  const [idQuery, setIdQuery] = useState('');
  const [idResult, setIdResult] = useState<typeof contacts[0] | null>(null);
  const [idNotFound, setIdNotFound] = useState(false);
  // Settings subpage state lifted up to LeftPanel so overlay covers full panel
  const [settingsSubPage, setSettingsSubPage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const tabs = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'calls', icon: Phone, label: 'Calls' },
  ] as const;

  const menuItems = [
    { label: 'New Group', action: () => { setShowMenu(false); setShowNewChat(true); } },
    { label: 'Starred messages', action: () => { setShowMenu(false); setActiveTab('settings'); } },
    { label: 'Settings', action: () => { setShowMenu(false); setActiveTab('settings'); } },
  ];

  const allSearchable = [...contacts.filter(c => !c.isGroup), ...discoverableContacts];
  const filteredContacts = newChatSearch
    ? contacts.filter(c => !c.isGroup && c.name.toLowerCase().includes(newChatSearch.toLowerCase()))
    : contacts.filter(c => !c.isGroup);

  const openChatWithContact = (contactId: string) => {
    const chat = chats.find(c => c.contactId === contactId);
    if (chat) {
      setActiveChatId(chat.id);
      navigate(`/app/chat/${chat.id}`);
    }
    // If no chat exists yet (edge case after request just accepted),
    // we just close the overlay – the user will see it in chat list shortly
    setShowNewChat(false);
    setNewChatSearch('');
  };

  // Find by ID
  const handleSearchId = () => {
    const q = idQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return;
    const match = allSearchable.find(c => c.userId.toLowerCase().replace(/^@/, '') === q || c.userId.toLowerCase() === `@${q}`);
    if (match) { setIdResult(match); setIdNotFound(false); }
    else { setIdResult(null); setIdNotFound(true); }
  };

  const requestStatus = (contactId: string) => {
    const req = chatRequests.find(r => r.contactId === contactId && r.direction === 'outgoing');
    return req?.status ?? null;
  };

  const isExistingContact = (contactId: string) => contacts.some(c => c.id === contactId);
  const hasExistingChat = (contactId: string) => chats.some(c => c.contactId === contactId);

  const handleSendRequest = (contactId: string) => sendChatRequest(contactId);

  const resetNewChat = () => {
    setShowNewChat(false);
    setNewChatSearch('');
    setIdQuery('');
    setIdResult(null);
    setIdNotFound(false);
    setNewChatTab('contacts');
  };

  return (
    <div className="flex flex-col h-full bg-[#111B21] overflow-hidden relative">
      {/* Header */}
      <div className="flex-shrink-0 bg-[#202C33]">
        {activeTab === 'settings' ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <button onClick={() => setActiveTab('chats')} className="text-[#aebac1] hover:text-[#E9EDEF] p-1 rounded-full hover:bg-white/5 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <span className="text-[#E9EDEF] flex-1" style={{ fontSize: '1.1rem', fontWeight: 600 }}>Settings</span>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setActiveTab('settings')} className="hover:opacity-80 transition-opacity">
              <div className="w-9 h-9 rounded-full bg-[#DFE5E7]/20 flex items-center justify-center overflow-hidden">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#E9EDEF]" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    {currentUser.name ? currentUser.name[0].toUpperCase() : 'M'}
                  </span>
                )}
              </div>
            </button>

            <h1 className="text-[#E9EDEF]" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {activeTab === 'chats' ? 'WhatsApp' : 'Calls'}
            </h1>

            <div className="flex items-center gap-1">
              {activeTab === 'chats' && (
                <button
                  onClick={() => setShowNewChat(true)}
                  className="text-[#aebac1] hover:text-[#E9EDEF] p-2 rounded-full hover:bg-white/5 transition-colors"
                  title="New chat"
                >
                  <PenSquare size={18} />
                </button>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(v => !v)}
                  className={`p-2 rounded-full hover:bg-white/5 transition-colors ${showMenu ? 'text-[#E9EDEF] bg-white/5' : 'text-[#aebac1] hover:text-[#E9EDEF]'}`}
                >
                  <MoreVertical size={18} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-xl shadow-2xl overflow-hidden z-50 border border-[#2A3942]">
                    {menuItems.map(item => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        className="w-full text-left px-5 py-3.5 text-[#E9EDEF] hover:bg-[#2A3942] transition-colors"
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
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chats' && !showRequests && <ChatList />}
        {activeTab === 'chats' && showRequests && <MessageRequests />}
        {activeTab === 'calls' && <CallsTab />}
        {activeTab === 'settings' && <SettingsPage onSubPageChange={setSettingsSubPage} />}
      </div>

      {/* Bottom Nav */}
      <div className="flex-shrink-0 bg-[#202C33] border-t border-[#2A3942]">
        <div className="flex">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setShowRequests(false); }}
                className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
                  isActive ? 'text-[#00A884]' : 'text-[#8696A0] hover:text-[#aebac1]'
                }`}
              >
                <tab.icon size={22} />
                <span style={{ fontSize: '0.65rem', fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-[#00A884] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings subpage full-panel overlay */}
      <AnimatePresence>
        {settingsSubPage && (
          <motion.div
            key={settingsSubPage}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="absolute inset-0 z-30 bg-[#111B21] flex flex-col overflow-hidden"
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
            className="absolute inset-0 bg-[#111B21] flex flex-col z-40"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 bg-[#202C33] flex-shrink-0">
              <button onClick={resetNewChat} className="text-[#aebac1] hover:text-[#E9EDEF] p-1">
                <ArrowLeft size={20} />
              </button>
              <span className="text-[#E9EDEF]" style={{ fontSize: '1.05rem', fontWeight: 600 }}>New Chat</span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#2A3942] bg-[#202C33] flex-shrink-0">
              <button
                onClick={() => setNewChatTab('contacts')}
                className={`flex-1 py-3 text-center transition-colors ${newChatTab === 'contacts' ? 'text-[#00A884] border-b-2 border-[#00A884]' : 'text-[#8696A0]'}`}
                style={{ fontSize: '0.88rem', fontWeight: newChatTab === 'contacts' ? 600 : 400 }}
              >
                My Contacts
              </button>
              <button
                onClick={() => setNewChatTab('find-id')}
                className={`flex-1 py-3 text-center transition-colors flex items-center justify-center gap-1.5 ${newChatTab === 'find-id' ? 'text-[#00A884] border-b-2 border-[#00A884]' : 'text-[#8696A0]'}`}
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
                  <div className="flex items-center gap-2 bg-[#202C33] rounded-xl px-4 py-2">
                    <Search size={16} className="text-[#8696A0]" />
                    <input
                      type="text"
                      placeholder="Search contacts"
                      value={newChatSearch}
                      onChange={e => setNewChatSearch(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0]"
                      style={{ fontSize: '0.9rem' }}
                      autoFocus
                    />
                    {newChatSearch && (
                      <button onClick={() => setNewChatSearch('')}>
                        <X size={16} className="text-[#8696A0]" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => openChatWithContact(contact.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2A3942] transition-colors border-b border-[#2A3942]/30 text-left"
                    >
                      <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} isOnline={contact.isOnline} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>{contact.name}</p>
                        <p className="text-[#00A884]" style={{ fontSize: '0.75rem' }}>{contact.userId}</p>
                      </div>
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#8696A0]">
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
                  <div className="bg-[#1F2C34] border border-[#2A3942] rounded-xl px-4 py-3">
                    <p className="text-[#8696A0] mb-2" style={{ fontSize: '0.75rem' }}>Enter WhatsApp ID</p>
                    <div className="flex items-center gap-2">
                      <AtSign size={16} className="text-[#00A884] flex-shrink-0" />
                      <input
                        type="text"
                        value={idQuery}
                        onChange={e => { setIdQuery(e.target.value); setIdResult(null); setIdNotFound(false); }}
                        onKeyDown={e => e.key === 'Enter' && handleSearchId()}
                        placeholder="e.g. sarah.j"
                        className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0]"
                        style={{ fontSize: '1rem', fontWeight: 500 }}
                        autoFocus
                      />
                      {idQuery && (
                        <button onClick={() => { setIdQuery(''); setIdResult(null); setIdNotFound(false); }}>
                          <X size={15} className="text-[#8696A0]" />
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleSearchId}
                    disabled={!idQuery.trim()}
                    className={`w-full mt-3 py-2.5 rounded-full transition-colors flex items-center justify-center gap-2 ${idQuery.trim() ? 'bg-[#00A884] text-white hover:bg-[#06cf9c]' : 'bg-[#2A3942] text-[#8696A0]'}`}
                    style={{ fontWeight: 600, fontSize: '0.9rem' }}
                  >
                    <Search size={15} />
                    Search
                  </button>
                </div>

                {/* Hint — known IDs */}
                {!idResult && !idNotFound && (
                  <div className="px-4 flex-1 overflow-y-auto">
                    <p className="text-[#8696A0] mb-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                      Try these IDs
                    </p>
                    {[...contacts.filter(c => !c.isGroup), ...discoverableContacts].map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setIdQuery(c.userId.replace('@', '')); }}
                        className="w-full flex items-center gap-3 py-2 px-1 hover:bg-[#2A3942] rounded-lg transition-colors"
                      >
                        <Avatar src={c.avatar} name={c.name} color={c.avatarColor} size={36} />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[#E9EDEF]" style={{ fontSize: '0.88rem', fontWeight: 500 }}>{c.name}</p>
                        </div>
                        <span className="text-[#00A884]" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{c.userId}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Not found */}
                {idNotFound && (
                  <div className="flex flex-col items-center justify-center py-12 px-8 gap-3 text-center">
                    <div className="w-16 h-16 bg-[#2A3942] rounded-full flex items-center justify-center">
                      <AtSign size={28} className="text-[#8696A0]" />
                    </div>
                    <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>No user found</p>
                    <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>
                      No WhatsApp user with ID <strong className="text-[#E9EDEF]">@{idQuery.replace('@', '')}</strong> was found. Check the ID and try again.
                    </p>
                  </div>
                )}

                {/* Found result */}
                {idResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-4 flex-1 overflow-y-auto"
                  >
                    <p className="text-[#8696A0] mb-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                      Result
                    </p>
                    {/* Profile card */}
                    <div className="bg-[#1F2C34] border border-[#2A3942] rounded-2xl overflow-hidden">
                      <div className="flex flex-col items-center py-6 px-4 gap-3">
                        <Avatar src={idResult.avatar} name={idResult.name} color={idResult.avatarColor} size={80} isOnline={idResult.isOnline} />
                        <div className="text-center">
                          <p className="text-[#E9EDEF]" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{idResult.name}</p>
                          <p className="text-[#00A884]" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{idResult.userId}</p>
                          <p className="text-[#8696A0] mt-1" style={{ fontSize: '0.82rem' }}>{idResult.about}</p>
                          {idResult.isOnline && (
                            <p className="text-[#00A884] mt-1" style={{ fontSize: '0.75rem' }}>🟢 Online</p>
                          )}
                        </div>
                      </div>

                      {/* Action */}
                      <div className="px-4 pb-4">
                        {hasExistingChat(idResult.id) || isExistingContact(idResult.id) ? (
                          <button
                            onClick={() => openChatWithContact(idResult.id)}
                            className="w-full py-3 rounded-full bg-[#00A884] text-white flex items-center justify-center gap-2 hover:bg-[#06cf9c] transition-colors"
                            style={{ fontWeight: 600 }}
                          >
                            <MessageSquare size={17} />
                            Open Chat
                          </button>
                        ) : requestStatus(idResult.id) === 'pending' ? (
                          <div className="w-full py-3 rounded-full bg-[#2A3942] text-[#8696A0] flex items-center justify-center gap-2">
                            <Clock size={16} />
                            <span style={{ fontWeight: 500 }}>Request sent · waiting…</span>
                          </div>
                        ) : requestStatus(idResult.id) === 'accepted' ? (
                          <button
                            onClick={() => openChatWithContact(idResult.id)}
                            className="w-full py-3 rounded-full bg-[#00A884] text-white flex items-center justify-center gap-2 hover:bg-[#06cf9c] transition-colors"
                            style={{ fontWeight: 600 }}
                          >
                            <Check size={17} />
                            Open Chat
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSendRequest(idResult.id)}
                            className="w-full py-3 rounded-full bg-[#00A884] text-white flex items-center justify-center gap-2 hover:bg-[#06cf9c] active:scale-95 transition-all"
                            style={{ fontWeight: 600 }}
                          >
                            <UserPlus size={17} />
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
    </div>
  );
}