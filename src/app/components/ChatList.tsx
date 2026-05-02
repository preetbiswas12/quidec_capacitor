import { Search, Archive, X, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function ChatList() {
  const navigate = useNavigate();
  const {
    chats, contacts, activeChatId, setActiveChatId,
    typingContacts, searchQuery, setSearchQuery,
    chatFilter, setChatFilter,
    pendingIncomingCount, setShowRequests,
  } = useApp();

  const getContact = (id: string) => contacts.find(c => c.id === id);

  const pinnedChats = chats.filter(c => c.isPinned);
  const regularChats = chats.filter(c => !c.isPinned);

  const applyFilter = (arr: typeof chats) => {
    let filtered = arr;
    if (chatFilter === 'unread') filtered = filtered.filter(c => c.unreadCount > 0);
    if (chatFilter === 'groups') filtered = filtered.filter(c => {
      const contact = getContact(c.contactId);
      return contact?.isGroup;
    });
    if (!searchQuery) return filtered;
    return filtered.filter(chat => {
      const contact = getContact(chat.contactId);
      return (
        contact?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  };

  const openChat = (chatId: string) => {
    setActiveChatId(chatId);
    navigate(`/app/chat/${chatId}`);
  };

  const totalUnread = chats.reduce((sum, c) => sum + c.unreadCount, 0);
  const unreadGroups = chats.filter(c => {
    const contact = getContact(c.contactId);
    return contact?.isGroup && c.unreadCount > 0;
  }).length;

  const filterTabs = [
    { id: 'all' as const, label: 'All' },
    { id: 'unread' as const, label: 'Unread', badge: totalUnread },
    { id: 'groups' as const, label: 'Groups', badge: unreadGroups || undefined },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[#202C33] rounded-xl px-4 py-2">
          <Search size={16} className="text-[#8696A0] flex-shrink-0" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0]"
            style={{ fontSize: '0.9rem' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={16} className="text-[#8696A0]" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      {!searchQuery && (
        <div className="flex gap-2 px-3 pb-2 flex-shrink-0">
          {filterTabs.map(tab => {
            const isActive = chatFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setChatFilter(tab.id)}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition-colors ${
                  isActive
                    ? 'bg-[#00A884]/15 text-[#00A884]'
                    : 'bg-[#202C33] text-[#8696A0] hover:bg-[#2A3942]'
                }`}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: isActive ? 500 : 400 }}>{tab.label}</span>
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 ${isActive ? 'bg-[#00A884] text-white' : 'bg-[#2A3942] text-[#8696A0]'}`}
                    style={{ fontSize: '0.65rem', fontWeight: 700, minWidth: 18, textAlign: 'center' }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {/* Message Requests banner */}
        {!searchQuery && pendingIncomingCount > 0 && (
          <button
            onClick={() => setShowRequests(true)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2A3942] transition-colors border-b border-[#2A3942]/50"
          >
            <div className="w-12 h-12 rounded-full bg-[#00A884]/20 flex items-center justify-center">
              <MessageSquare size={20} className="text-[#00A884]" />
            </div>
            <div className="flex-1 text-left">
              <span className="text-[#00A884]" style={{ fontWeight: 500 }}>Message Requests</span>
              <p className="text-[#8696A0]" style={{ fontSize: '0.78rem' }}>
                {pendingIncomingCount} pending request{pendingIncomingCount !== 1 ? 's' : ''}
              </p>
            </div>
            <span
              className="bg-[#00A884] text-white rounded-full flex items-center justify-center"
              style={{ minWidth: 22, height: 22, fontSize: '0.72rem', fontWeight: 700, padding: '0 5px' }}
            >
              {pendingIncomingCount}
            </span>
          </button>
        )}

        {/* Archive row — only show in "all" filter and no search */}
        {!searchQuery && chatFilter === 'all' && (
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#2A3942] cursor-pointer transition-colors border-b border-[#2A3942]/50">
            <div className="w-12 h-12 rounded-full bg-[#2A3942] flex items-center justify-center">
              <Archive size={20} className="text-[#00A884]" />
            </div>
            <div className="flex-1">
              <span className="text-[#00A884]" style={{ fontWeight: 500 }}>Archived</span>
            </div>
            <span className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>0</span>
          </div>
        )}

        {/* Pinned chats */}
        {chatFilter === 'all' && !searchQuery && applyFilter(pinnedChats).map(chat => (
          <ChatRow
            key={chat.id}
            chat={chat}
            contact={getContact(chat.contactId)!}
            isActive={activeChatId === chat.id}
            isTyping={typingContacts[chat.id]}
            onOpen={() => openChat(chat.id)}
            isPinned
          />
        ))}

        {/* Regular / filtered chats */}
        {applyFilter(
          chatFilter === 'all' && !searchQuery ? regularChats : [...pinnedChats, ...regularChats]
        ).map(chat => (
          <ChatRow
            key={chat.id}
            chat={chat}
            contact={getContact(chat.contactId)!}
            isActive={activeChatId === chat.id}
            isTyping={typingContacts[chat.id]}
            onOpen={() => openChat(chat.id)}
          />
        ))}

        {applyFilter([...pinnedChats, ...regularChats]).length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-[#8696A0] gap-3">
            <Search size={40} className="opacity-30" />
            <p style={{ fontSize: '0.95rem' }}>
              {searchQuery ? `No results for "${searchQuery}"` : `No ${chatFilter} chats`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat, contact, isActive, isTyping, onOpen, isPinned }: {
  chat: any;
  contact: any;
  isActive: boolean;
  isTyping: boolean;
  onOpen: () => void;
  isPinned?: boolean;
}) {
  if (!contact) return null;
  const lastMsg = chat.lastMessage;
  const isMe = !chat.lastMessageSender;

  return (
    <div
      onClick={onOpen}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-[#2A3942]/30 ${isActive ? 'bg-[#2A3942]' : 'hover:bg-[#2A3942]'}`}
    >
      <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={52} isOnline={contact.isOnline} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[#E9EDEF] truncate flex-1 min-w-0" style={{ fontWeight: 500, fontSize: '0.95rem' }}>{contact.name}</span>
          <span
            className={`flex-shrink-0 ${chat.unreadCount > 0 ? 'text-[#00A884]' : 'text-[#8696A0]'}`}
            style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
          >
            {chat.lastMessageTime}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isMe && !isTyping && (
              <svg width="14" height="14" viewBox="0 0 16 11" fill="none" className="flex-shrink-0">
                <path d="M1 5.5L5.5 10L15 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5.5L9.5 10L15 4" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {isTyping ? (
              <span className="text-[#00A884]" style={{ fontSize: '0.82rem' }}>typing...</span>
            ) : (
              <span className="text-[#8696A0] truncate" style={{ fontSize: '0.82rem' }}>
                {chat.lastMessageSender && <span>{chat.lastMessageSender}: </span>}
                {lastMsg}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {chat.isMuted && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8696A0" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            )}
            {isPinned && !chat.unreadCount && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#8696A0">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
              </svg>
            )}
            {chat.unreadCount > 0 && (
              <span
                className={`rounded-full flex items-center justify-center text-white ${chat.isMuted ? 'bg-[#8696A0]' : 'bg-[#00A884]'}`}
                style={{ minWidth: 20, height: 20, fontSize: '0.7rem', fontWeight: 700, padding: '0 5px' }}
              >
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}