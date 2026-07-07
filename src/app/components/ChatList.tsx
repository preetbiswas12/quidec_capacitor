import { useState, useRef } from 'react';
import { Search, Archive, X, Timer } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';
import TypingDots from './TypingDots';
import SkeletonChatRow from './SkeletonChatRow';

export default function ChatList() {
  const navigate = useNavigate();
  const {
    chats, contacts, activeChatId, setActiveChatId,
    typingContacts, searchQuery, setSearchQuery,
    chatFilter, setChatFilter,
    isDisappearingActive,
    chatsLoaded,
  } = useApp();

  const getContact = (id: string) => contacts.find(c => c.id === id);

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (chatListRef.current && chatListRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === 0) return;
    const distance = e.touches[0].clientY - touchStartY.current;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, 80));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      setIsRefreshing(true);
      if (navigator.vibrate) navigator.vibrate(10);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      setPullDistance(0);
    }
    touchStartY.current = 0;
  };

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
    if (navigator.vibrate) navigator.vibrate(10);
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
      <div className="px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3 bg-wa-secondary/50 rounded-xl px-3.5 py-2 border border-wa-border/5 transition-colors focus-within:border-wa-accent/30 focus-within:bg-wa-secondary/70">
          <Search size={16} className="text-wa-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search conversations"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/40 font-medium"
            style={{ fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      {!searchQuery && (
        <div className="flex gap-2 px-4 pb-2.5 flex-shrink-0">
          {filterTabs.map(tab => {
            const isActive = chatFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setChatFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all duration-200 ease-out active:scale-95 ${
                  isActive
                    ? 'bg-wa-accent/15 text-wa-accent shadow-sm'
                    : 'bg-wa-secondary/60 text-wa-text-muted hover:bg-wa-secondary/80'
                }`}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-bold ${isActive ? 'bg-wa-accent text-white' : 'bg-wa-border text-wa-text-muted'}`}
                    style={{ fontSize: '0.63rem', minWidth: 18, textAlign: 'center' }}
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
      <div
        ref={chatListRef}
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div className="flex justify-center py-2 overflow-hidden" style={{ height: isRefreshing ? 40 : pullDistance * 0.6 }}>
            <div
              className={`w-6 h-6 border-2 border-wa-accent border-t-transparent rounded-full ${isRefreshing ? 'animate-spin' : ''}`}
              style={!isRefreshing ? { transform: `rotate(${pullDistance * 3}deg)` } : undefined}
            />
          </div>
        )}

        {/* Archive row */}
        {!searchQuery && chatFilter === 'all' && (
          <div
            onClick={() => toast.info('Archived chats', { description: 'Archived chats feature coming soon!' })}
            className="flex items-center gap-4 px-4 py-3 hover:bg-wa-secondary/15 cursor-pointer transition-all duration-200 border-b border-wa-border/8 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-full bg-wa-secondary/70 flex items-center justify-center">
              <Archive size={18} className="text-wa-text-muted" />
            </div>
            <div className="flex-1">
              <span className="text-wa-primary font-medium" style={{ fontSize: '0.93rem' }}>Archived</span>
            </div>
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
            isDisappearing={isDisappearingActive(chat.id)}
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
            isDisappearing={isDisappearingActive(chat.id)}
          />
        ))}

        {applyFilter([...pinnedChats, ...regularChats]).length === 0 && !searchQuery && !chatsLoaded && (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonChatRow key={`skeleton-${i}`} />
            ))}
          </>
        )}

        {applyFilter([...pinnedChats, ...regularChats]).length === 0 && chatsLoaded && (
          <div className="flex flex-col items-center justify-center py-20 text-wa-text-muted gap-3">
            <Search size={36} className="opacity-20" />
            <p style={{ fontSize: '0.88rem' }}>
              {searchQuery ? `No results for "${searchQuery}"` : chatFilter === 'all' ? 'No chats yet' : `No ${chatFilter} chats`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat, contact, isActive, isTyping, onOpen, isPinned, isDisappearing }: {
  chat: any;
  contact: any;
  isActive: boolean;
  isTyping: boolean;
  onOpen: () => void;
  isPinned?: boolean;
  isDisappearing?: boolean;
}) {
  if (!contact) return null;
  const lastMsg = chat.lastMessage;
  const isMe = !chat.lastMessageSender;
  const timeStr = typeof chat.lastMessageTime === 'string'
    ? chat.lastMessageTime
    : chat.lastMessageTime?.seconds
      ? new Date(chat.lastMessageTime.seconds * 1000).toLocaleTimeString()
      : '';

  return (
    <div
      onClick={onOpen}
      className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all duration-200 ease-out border-b border-wa-border/8 active:scale-[0.98] ${isActive ? 'bg-wa-secondary/50' : 'hover:bg-wa-secondary/20'}`}
    >
      <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={50} isOnline={contact.isOnline} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-wa-primary truncate flex-1 min-w-0" style={{ fontWeight: 500, fontSize: '0.93rem' }}>{contact.name}</span>
          <span
            className={`flex-shrink-0 ${chat.unreadCount > 0 ? 'text-wa-accent' : 'text-wa-text-muted'}`}
            style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
          >
            {timeStr}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isMe && !isTyping && lastMsg && (
              <svg width="16" height="11" viewBox="0 0 16 11" fill="none" className="flex-shrink-0 opacity-80">
                <path d="M1 5.5L5.5 10L15 1" stroke="#53bdeb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5.5L9.5 10L15 4" stroke="#53bdeb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {isTyping ? (
              <span className="text-wa-accent font-medium flex items-center gap-1" style={{ fontSize: '0.8rem' }}><TypingDots size="sm" /></span>
            ) : (
              <span className="text-wa-text-muted truncate" style={{ fontSize: '0.8rem' }}>
                {chat.lastMessageSender && <span className="text-wa-text-secondary">{chat.lastMessageSender}: </span>}
                {lastMsg}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            {chat.isMuted && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8696A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            )}
            {isDisappearing && (
              <Timer size={13} className="text-wa-accent" />
            )}
            {isPinned && !chat.unreadCount && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#8696A0">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
              </svg>
            )}
            {chat.unreadCount > 0 && (
              <span
                className={`rounded-full flex items-center justify-center text-white font-bold ${chat.isMuted ? 'bg-wa-text-muted' : 'bg-wa-accent'}`}
                style={{ minWidth: 20, height: 20, fontSize: '0.68rem', padding: '0 5px' }}
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