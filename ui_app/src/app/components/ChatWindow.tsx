import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Phone, Video, MoreVertical, Smile, Paperclip,
  Mic, Send, CheckCheck, Check, Lock, FileText, Camera,
  X, Reply, Link, Image, MapPin, User, File,
  ExternalLink, ChevronDown, ChevronUp, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';
import ContactInfo from './ContactInfo';
import type { Message } from '../data/mockData';

const EMOJI_LIST = [
  '😀','😂','🤣','😊','😍','🥰','😘','😎','🤩','😜',
  '😭','😢','😤','😡','🥺','😱','🤔','🙄','😴','🤗',
  '👍','👎','👏','🙌','🤝','👋','❤️','🔥','✨','🎉',
  '😋','🥳','😇','🤓','cox','🫠','🥹','😬','🤭','😶',
  '💯','🎊','🫶','💪','🙏','✅','⭐','🌹','🎵','🍕',
];

export default function ChatWindow() {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    chats, contacts, messages, sendMessage, typingContacts,
    setActiveChatId, contactInfoOpen, setContactInfoOpen,
    replyTo, setReplyTo,
  } = useApp();

  const [text, setText] = useState('');
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchIndex, setMsgSearchIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const msgSearchRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const chat = chats.find(c => c.id === chatId);
  const contact = chat ? contacts.find(c => c.id === chat.contactId) : null;
  const chatMessages = chatId ? (messages[chatId] || []) : [];
  const isTyping = chatId ? typingContacts[chatId] : false;

  // Filtered messages for in-chat search
  const matchedMsgIds = msgSearch.trim()
    ? chatMessages
        .filter(m => m.content.toLowerCase().includes(msgSearch.toLowerCase()))
        .map(m => m.id)
    : [];

  useEffect(() => {
    if (chatId) setActiveChatId(chatId);
    return () => setActiveChatId(null);
  }, [chatId]);

  useEffect(() => {
    if (!showSearch) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping, showSearch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (showSearch) msgSearchRef.current?.focus();
  }, [showSearch]);

  const handleSend = () => {
    if (!text.trim() || !chatId) return;
    const extra: Partial<Message> = replyTo
      ? { replyToId: replyTo.id, replyToContent: replyTo.content, replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
      : {};
    sendMessage(chatId, text.trim(), 'text', extra);
    setText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleSendLink = () => {
    if (!linkInput.trim() || !chatId) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace('www.', '');
      const title = domain.charAt(0).toUpperCase() + domain.slice(1);
      sendMessage(chatId, url, 'link', { linkUrl: url, linkTitle: title, linkDomain: domain });
    } catch {
      sendMessage(chatId, url, 'link', { linkUrl: url, linkTitle: url, linkDomain: url });
    }
    setLinkInput('');
    setShowLinkInput(false);
    setShowAttachSheet(false);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      sendMessage(chatId, '', 'image', { imageUrl: dataUrl });
    };
    reader.readAsDataURL(file);
    setShowAttachSheet(false);
    e.target.value = '';
  };

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;
    sendMessage(chatId, `📎 ${file.name}`, 'document', {});
    setShowAttachSheet(false);
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setReplyTo(null); setShowEmojiPicker(false); }
  };

  const handleBack = () => {
    setActiveChatId(null);
    setContactInfoOpen(false);
    setReplyTo(null);
    navigate('/app');
  };

  const appendEmoji = (emoji: string) => {
    setText(t => t + emoji);
    inputRef.current?.focus();
  };

  const openSearch = () => {
    setContactInfoOpen(false);
    setShowHeaderMenu(false);
    setShowSearch(true);
  };

  const closeSearch = () => {
    setShowSearch(false);
    setMsgSearch('');
    setMsgSearchIndex(0);
  };

  const navigateSearchResult = (dir: 1 | -1) => {
    if (matchedMsgIds.length === 0) return;
    setMsgSearchIndex(i => {
      const next = (i + dir + matchedMsgIds.length) % matchedMsgIds.length;
      const el = document.getElementById(`msg-${matchedMsgIds[next]}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return next;
    });
  };

  if (!chat || !contact) {
    return (
      <div className="h-full bg-[#222E35] flex items-center justify-center">
        <p className="text-[#8696A0]">Chat not found</p>
      </div>
    );
  }

  const headerMenuItems = [
    { label: 'View contact', action: () => { setShowHeaderMenu(false); setContactInfoOpen(true); } },
    { label: 'Media, links and docs', action: () => { setShowHeaderMenu(false); setContactInfoOpen(true); } },
    { label: 'Search', action: () => openSearch() },
    { label: 'Mute notifications', action: () => setShowHeaderMenu(false) },
    { label: 'Clear chat', action: () => setShowHeaderMenu(false) },
  ];

  return (
    <div className="h-full relative flex flex-col bg-[#0B141A] overflow-hidden">
      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.ppt,.pptx,.zip" className="hidden" onChange={handleDocumentSelect} />

      {/* Image Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-black flex flex-col"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-black/60 flex-shrink-0">
              <button onClick={() => setLightboxImage(null)} className="text-white p-1 rounded-full hover:bg-white/10">
                <ArrowLeft size={22} />
              </button>
              <span className="text-white flex-1" style={{ fontWeight: 500 }}>Photo</span>
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = lightboxImage;
                  a.download = 'photo.jpg';
                  a.click();
                }}
                className="text-white p-1 rounded-full hover:bg-white/10"
              >
                <Download size={20} />
              </button>
            </div>
            <div
              className="flex-1 flex items-center justify-center p-2"
              onClick={() => setLightboxImage(null)}
            >
              <img
                src={lightboxImage}
                alt="fullscreen"
                className="max-w-full max-h-full rounded-lg"
                style={{ objectFit: 'contain' }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">

        {/* In-chat search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#202C33] border-b border-[#2A3942] flex-shrink-0 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button onClick={closeSearch} className="text-[#aebac1] p-1 flex-shrink-0">
                  <ArrowLeft size={20} />
                </button>
                <input
                  ref={msgSearchRef}
                  type="text"
                  value={msgSearch}
                  onChange={e => { setMsgSearch(e.target.value); setMsgSearchIndex(0); }}
                  placeholder="Search messages…"
                  className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0]"
                  style={{ fontSize: '0.9rem' }}
                />
                {msgSearch && (
                  <span className="text-[#8696A0] flex-shrink-0" style={{ fontSize: '0.78rem' }}>
                    {matchedMsgIds.length > 0 ? `${msgSearchIndex + 1}/${matchedMsgIds.length}` : '0/0'}
                  </span>
                )}
                <button
                  onClick={() => navigateSearchResult(-1)}
                  disabled={matchedMsgIds.length === 0}
                  className="text-[#aebac1] p-1 disabled:opacity-30"
                >
                  <ChevronUp size={18} />
                </button>
                <button
                  onClick={() => navigateSearchResult(1)}
                  disabled={matchedMsgIds.length === 0}
                  className="text-[#aebac1] p-1 disabled:opacity-30"
                >
                  <ChevronDown size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-[#202C33] flex-shrink-0 border-b border-[#2A3942]">
          <button onClick={handleBack} className="text-[#aebac1] hover:text-[#E9EDEF] p-1.5 rounded-full hover:bg-white/5">
            <ArrowLeft size={20} />
          </button>

          <button
            onClick={() => setContactInfoOpen(!contactInfoOpen)}
            className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="relative">
              <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={40} />
              {contact.isOnline && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#00A884] border-2 border-[#202C33]"
                />
              )}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[#E9EDEF] truncate" style={{ fontWeight: 600, fontSize: '0.95rem' }}>{contact.name}</p>
              <AnimatePresence mode="wait">
                {isTyping ? (
                  <motion.p key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[#00A884]" style={{ fontSize: '0.78rem' }}>
                    typing...
                  </motion.p>
                ) : (
                  <motion.p key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[#8696A0]" style={{ fontSize: '0.78rem' }}>
                    {contact.isGroup ? `${contact.members?.length} members` : contact.isOnline ? '🟢 online' : contact.lastSeen}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </button>

          <div className="flex items-center gap-1">
            <button onClick={() => navigate(`/call/video/${contact.id}`)} className="text-[#aebac1] hover:text-[#E9EDEF] p-2 rounded-full hover:bg-white/5 transition-colors">
              <Video size={20} />
            </button>
            <button onClick={() => navigate(`/call/voice/${contact.id}`)} className="text-[#aebac1] hover:text-[#E9EDEF] p-2 rounded-full hover:bg-white/5 transition-colors">
              <Phone size={20} />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowHeaderMenu(v => !v)}
                className={`p-2 rounded-full hover:bg-white/5 transition-colors ${showHeaderMenu ? 'text-[#E9EDEF] bg-white/5' : 'text-[#aebac1] hover:text-[#E9EDEF]'}`}
              >
                <MoreVertical size={20} />
              </button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-xl shadow-2xl overflow-hidden z-50 border border-[#2A3942]">
                  {headerMenuItems.map(item => (
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

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto py-4 px-3 space-y-1"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
            backgroundColor: '#0B141A',
          }}
          onClick={() => { setShowAttachSheet(false); setShowEmojiPicker(false); setShowHeaderMenu(false); }}
        >
          {chatMessages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              contact={contact}
              contacts={contacts}
              showAvatar={
                msg.senderId !== 'me' && msg.senderId !== 'system' &&
                (idx === chatMessages.length - 1 || chatMessages[idx + 1]?.senderId !== msg.senderId)
              }
              showSenderName={
                !!contact.isGroup && msg.senderId !== 'me' && msg.senderId !== 'system' &&
                (idx === 0 || chatMessages[idx - 1]?.senderId !== msg.senderId)
              }
              isGroup={contact.isGroup}
              onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
              isSearchHighlight={msgSearch.trim() !== '' && msg.content.toLowerCase().includes(msgSearch.toLowerCase())}
              isSearchActive={matchedMsgIds[msgSearchIndex] === msg.id}
              onImageClick={(url) => setLightboxImage(url)}
            />
          ))}

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="flex items-end gap-2"
              >
                <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={28} />
                <div className="bg-[#202C33] rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-2 h-2 rounded-full bg-[#8696A0]"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Preview Banner */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#202C33] border-t border-[#2A3942] overflow-hidden flex-shrink-0"
            >
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-1 h-10 bg-[#00A884] rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#00A884]" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                    {replyTo.senderId === 'me' ? 'You' : contact.name}
                  </p>
                  <p className="text-[#8696A0] truncate" style={{ fontSize: '0.82rem' }}>
                    {replyTo.type === 'link' ? '🔗 ' + (replyTo.linkUrl || replyTo.content) : replyTo.content}
                  </p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-[#8696A0] hover:text-[#E9EDEF] p-1 flex-shrink-0">
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emoji Picker */}
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#1F2C34] border-t border-[#2A3942] flex-shrink-0 overflow-hidden"
            >
              <div className="px-3 py-3">
                <div className="grid grid-cols-10 gap-1">
                  {EMOJI_LIST.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => appendEmoji(emoji)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A3942] transition-colors active:scale-90"
                      style={{ fontSize: '1.25rem' }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachment Sheet */}
        <AnimatePresence>
          {showAttachSheet && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="bg-[#202C33] border-t border-[#2A3942] flex-shrink-0 overflow-hidden"
            >
              {showLinkInput ? (
                <div className="px-4 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => setShowLinkInput(false)} className="text-[#8696A0]"><ArrowLeft size={18} /></button>
                    <span className="text-[#E9EDEF]" style={{ fontWeight: 600 }}>Share a Link</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#2A3942] rounded-xl px-4 py-2.5">
                    <Link size={16} className="text-[#8696A0] flex-shrink-0" />
                    <input
                      type="url"
                      value={linkInput}
                      onChange={e => setLinkInput(e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0]"
                      style={{ fontSize: '0.9rem' }}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSendLink()}
                    />
                  </div>
                  <button
                    onClick={handleSendLink}
                    disabled={!linkInput.trim()}
                    className={`w-full mt-3 rounded-full py-3 flex items-center justify-center gap-2 transition-colors ${linkInput.trim() ? 'bg-[#00A884] text-white' : 'bg-[#2A3942] text-[#8696A0]'}`}
                    style={{ fontWeight: 600 }}
                  >
                    Send Link <Send size={16} />
                  </button>
                </div>
              ) : (
                <div className="px-4 py-4">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { icon: File, label: 'Document', color: '#5c6bc0', onClick: () => docInputRef.current?.click() },
                      { icon: Image, label: 'Photos', color: '#e91e63', onClick: () => photoInputRef.current?.click() },
                      { icon: Camera, label: 'Camera', color: '#00897b', onClick: () => photoInputRef.current?.click() },
                      { icon: Link, label: 'Link', color: '#fb8c00', onClick: () => setShowLinkInput(true) },
                      { icon: User, label: 'Contact', color: '#43a047', onClick: () => {} },
                      { icon: MapPin, label: 'Location', color: '#e53935', onClick: () => {} },
                    ].map(item => (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        className="flex flex-col items-center gap-2 py-2"
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${item.color}22` }}>
                          <item.icon size={22} style={{ color: item.color }} />
                        </div>
                        <span className="text-[#8696A0]" style={{ fontSize: '0.72rem' }}>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input bar */}
        <div className="flex items-end gap-2 px-3 py-3 bg-[#202C33] flex-shrink-0">
          <div className="flex items-end gap-2 flex-1 bg-[#2A3942] rounded-2xl px-3 py-2">
            <button
              onClick={() => { setShowEmojiPicker(v => !v); setShowAttachSheet(false); }}
              className={`transition-colors flex-shrink-0 mb-0.5 ${showEmojiPicker ? 'text-[#00A884]' : 'text-[#8696A0] hover:text-[#E9EDEF]'}`}
            >
              <Smile size={22} />
            </button>
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              rows={1}
              className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0] resize-none py-0.5 max-h-32 overflow-y-auto"
              style={{ fontSize: '0.95rem', lineHeight: '1.4' }}
            />
            {!text && (
              <button
                onClick={() => { setShowAttachSheet(v => !v); setShowLinkInput(false); setShowEmojiPicker(false); }}
                className={`transition-colors flex-shrink-0 mb-0.5 ${showAttachSheet ? 'text-[#00A884]' : 'text-[#8696A0] hover:text-[#E9EDEF]'}`}
              >
                <Paperclip size={22} />
              </button>
            )}
            {!text && (
              <button
                onClick={() => { setShowAttachSheet(true); setShowLinkInput(false); setShowEmojiPicker(false); }}
                className="text-[#8696A0] hover:text-[#E9EDEF] transition-colors flex-shrink-0 mb-0.5"
              >
                <Camera size={22} />
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {text ? (
              <motion.button
                key="send"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                onClick={handleSend}
                className="w-12 h-12 bg-[#00A884] rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[#06cf9c] transition-colors active:scale-95"
              >
                <Send size={20} className="text-white ml-0.5" />
              </motion.button>
            ) : (
              <motion.button
                key="mic"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="w-12 h-12 bg-[#00A884] rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[#06cf9c] transition-colors active:scale-95"
              >
                <Mic size={20} className="text-white" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Contact Info Panel — full-screen slide-over */}
      <AnimatePresence>
        {contactInfoOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="absolute inset-0 z-50 bg-[#111B21]"
          >
            <ContactInfo
              contactId={contact.id}
              chatId={chatId!}
              onClose={() => setContactInfoOpen(false)}
              onSearchChat={openSearch}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, contact, contacts, showAvatar, showSenderName, isGroup, onReply, isSearchHighlight, isSearchActive, onImageClick }: {
  message: Message;
  contact: any;
  contacts: any[];
  showAvatar: boolean;
  showSenderName?: boolean;
  isGroup?: boolean;
  onReply: (msg: Message) => void;
  isSearchHighlight?: boolean;
  isSearchActive?: boolean;
  onImageClick?: (url: string) => void;
}) {
  const isMe = message.senderId === 'me';
  const isSystem = message.senderId === 'system';

  // For group chats, look up the actual sender
  const senderContact = !isMe && !isSystem && isGroup
    ? contacts.find((c: any) => c.id === message.senderId)
    : null;
  const displayContact = senderContact || contact;

  const touchStartX = useRef(0);
  const [swipeX, setSwipeX] = useState(0);
  const [triggered, setTriggered] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setTriggered(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff > 0 && diff < 80) {
      setSwipeX(diff);
      if (diff >= 55 && !triggered) {
        setTriggered(true);
        onReply(message);
        if (navigator.vibrate) navigator.vibrate(40);
      }
    } else if (diff <= 0) {
      setSwipeX(0);
    }
  };

  const handleTouchEnd = () => {
    setSwipeX(0);
    setTimeout(() => setTriggered(false), 300);
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-start gap-1 bg-[#182229] rounded-lg px-3 py-2 max-w-xs">
          <Lock size={11} className="text-[#8696A0] mt-0.5 flex-shrink-0" />
          <p className="text-[#8696A0] text-center leading-snug" style={{ fontSize: '0.72rem' }}>{message.content}</p>
        </div>
      </div>
    );
  }

  const isDocument = message.type === 'document';
  const isLink = message.type === 'link';
  const isImage = message.type === 'image';

  // Image-only = no caption, no reply quote, no group sender name shown
  const isImageOnly = isImage && !message.content && !message.replyToContent && !showSenderName;

  return (
    <motion.div
      id={`msg-${message.id}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex items-end gap-1.5 mb-0.5 relative ${isMe ? 'justify-end' : 'justify-start'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe reply icon */}
      <AnimatePresence>
        {swipeX > 15 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: Math.min(swipeX / 55, 1), scale: Math.min(swipeX / 40, 1) }}
            exit={{ opacity: 0, scale: 0.5 }}
            className={`absolute ${isMe ? 'left-2' : 'right-2'} flex items-center justify-center w-8 h-8 rounded-full bg-[#2A3942]`}
            style={{ zIndex: 5 }}
          >
            <Reply size={14} className="text-[#00A884]" />
          </motion.div>
        )}
      </AnimatePresence>

      {!isMe && isGroup && (
        <div className="w-7 flex-shrink-0 self-end mb-0.5">
          {showAvatar && (
            <Avatar
              src={displayContact.avatar}
              name={displayContact.name}
              color={displayContact.avatarColor}
              size={28}
            />
          )}
        </div>
      )}

      <motion.div
        animate={{ x: swipeX }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        className={`relative max-w-[80%] rounded-2xl shadow-sm transition-all ${
          isImageOnly ? 'p-0 overflow-hidden' : 'px-3 py-2'
        } ${
          isMe ? 'bg-[#005C4B] rounded-br-sm' : 'bg-[#202C33] rounded-bl-sm'
        } ${isSearchActive ? 'ring-2 ring-[#00A884]' : isSearchHighlight ? 'ring-1 ring-[#00A884]/40' : ''}`}
        style={{ wordBreak: 'break-word' }}
      >
        {/* Tail — only when not image-only (tail overlaps the image otherwise) */}
        {!isImageOnly && (isMe ? (
          <div className="absolute bottom-0 right-0 w-0 h-0" style={{ borderLeft: '8px solid transparent', borderBottom: `8px solid ${isMe ? '#005C4B' : '#202C33'}`, transform: 'translateX(6px)' }} />
        ) : (
          <div className="absolute bottom-0 left-0 w-0 h-0" style={{ borderRight: '8px solid transparent', borderBottom: '8px solid #202C33', transform: 'translateX(-6px)' }} />
        ))}

        {/* Group sender name */}
        {showSenderName && senderContact && (
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: senderContact.avatarColor, marginBottom: '2px' }}>
            {senderContact.name}
          </p>
        )}

        {/* Reply quote */}
        {message.replyToContent && (
          <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 border-[#00A884] ${isMe ? 'bg-[#00A884]/10' : 'bg-[#111B21]/40'}`}>
            <p className="text-[#00A884]" style={{ fontSize: '0.72rem', fontWeight: 600 }}>{message.replyToSender}</p>
            <p className="text-[#aebac1] truncate" style={{ fontSize: '0.78rem' }}>{message.replyToContent}</p>
          </div>
        )}

        {/* Image */}
        {isImage && message.imageUrl && (
          <div
            className={`relative overflow-hidden ${
              isImageOnly
                ? (isMe ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm')
                : 'rounded-xl mt-0.5'
            }`}
            style={isImageOnly ? {} : { maxWidth: '220px' }}
            onClick={() => onImageClick?.(message.imageUrl!)}
          >
            <img
              src={message.imageUrl}
              alt="shared"
              className="w-full block"
              style={{
                maxHeight: isImageOnly ? '320px' : '220px',
                minHeight: '120px',
                objectFit: 'cover',
                cursor: 'pointer',
                display: 'block',
              }}
            />
            {/* Timestamp overlay for image-only messages */}
            {isImageOnly && (
              <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-0.5">
                <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap' }}>{message.timestamp}</span>
                {isMe && (
                  <>
                    {message.status === 'sent' && <Check size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
                    {message.status === 'delivered' && <CheckCheck size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
                    {message.status === 'read' && <CheckCheck size={11} className="text-[#53bdeb]" />}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {/* Image caption */}
        {isImage && message.content && (
          <p className="text-[#E9EDEF] leading-relaxed mt-1" style={{ fontSize: '0.9rem', paddingRight: '76px' }}>
            {message.content}
          </p>
        )}

        {/* Document */}
        {isDocument && (() => {
          const filename = message.content.replace('📎 ', '');
          const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() || 'FILE' : 'FILE';
          return (
            <div className="flex items-center gap-3 py-0.5" style={{ minWidth: '190px', maxWidth: '240px' }}>
              <div className="w-10 h-10 bg-[#00A884]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText size={20} className="text-[#00A884]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[#E9EDEF]" style={{ fontSize: '0.84rem', fontWeight: 500, wordBreak: 'break-all', lineHeight: 1.3 }}>
                  {filename}
                </p>
                <p className="text-[#8696A0] mt-0.5" style={{ fontSize: '0.7rem' }}>
                  {ext} · Tap to open
                </p>
              </div>
              <Download size={16} className="text-[#8696A0] flex-shrink-0" />
            </div>
          );
        })()}

        {/* Link */}
        {isLink && (
          <a href={message.linkUrl} target="_blank" rel="noopener noreferrer" className="block" onClick={e => e.stopPropagation()}>
            <div className={`rounded-lg overflow-hidden border ${isMe ? 'border-[#00A884]/30' : 'border-[#2A3942]'}`}>
              <div className={`px-3 py-2 flex items-center gap-2 ${isMe ? 'bg-[#00A884]/10' : 'bg-[#111B21]/50'}`}>
                <ExternalLink size={14} className="text-[#00A884] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[#E9EDEF] truncate" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{message.linkTitle || message.linkUrl}</p>
                  <p className="text-[#8696A0] truncate" style={{ fontSize: '0.72rem' }}>{message.linkDomain || message.linkUrl}</p>
                </div>
              </div>
              <div className="px-3 py-1.5">
                <p className="text-[#53bdeb] truncate" style={{ fontSize: '0.78rem' }}>{message.linkUrl}</p>
              </div>
            </div>
          </a>
        )}

        {/* Plain text */}
        {!isDocument && !isLink && !isImage && (
          <p className="text-[#E9EDEF] leading-relaxed" style={{ fontSize: '0.9rem', paddingRight: '76px' }}>
            {message.content}
          </p>
        )}

        {/* Timestamp + status — NOT rendered for image-only (uses overlay above) */}
        {!(isImage && !message.content) && (
          <div className={`flex items-center gap-1 whitespace-nowrap ${
            isDocument || isLink
              ? 'justify-end mt-1.5'
              : 'absolute bottom-1.5 right-2.5'
          }`}>
            <span className="text-[#8696A0]" style={{ fontSize: '0.65rem' }}>{message.timestamp}</span>
            {isMe && (
              <>
                {message.status === 'sent' && <Check size={13} className="text-[#8696A0]" />}
                {message.status === 'delivered' && <CheckCheck size={13} className="text-[#8696A0]" />}
                {message.status === 'read' && <CheckCheck size={13} className="text-[#53bdeb]" />}
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}