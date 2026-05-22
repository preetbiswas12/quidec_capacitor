import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Phone, Video, MoreVertical, Smile, Paperclip,
  Mic, Send, CheckCheck, Check, Lock, FileText, Camera,
  X, Reply, Link, Image, MapPin, User, File,
  ExternalLink, ChevronDown, ChevronUp, Download, Share2, Save
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';
import ContactInfo from './ContactInfo';
import { loadMediaWithCache } from '../../utils/mediaUploadHandler';
import type { Message } from '../context/AppContext';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { validateMessage, messageLimiter } from '../../utils/validators';
import { mediaValidator } from '../../utils/mediaValidator';
import { messageQueue } from '../../utils/persistentMessageQueue';
import { idbPaginator } from '../../utils/idbPaginator';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🥰','😜','😭','🥺','🤔','👍','❤️','🔥','✨','🙏','✅'
];

export default function ChatWindow() {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    chats, contacts, messages, sendMessage, typingContacts,
    setActiveChatId, contactInfoOpen, setContactInfoOpen,
    replyTo, setReplyTo, reactToMessage, clearChat
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  
  // Message interaction state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const msgSearchRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const chat = chats.find(c => c.id === chatId);
  const contact = chat ? contacts.find(c => c.id === chat.contactId) : null;
  const chatMessages = chatId ? (messages[chatId] || []) : [];
  const isTyping = chatId ? typingContacts[chatId] : false;

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

  // Listen for message queue flush events (Priority 2: Message Queue)
  useEffect(() => {
    const handleQueueFlush = () => {
      const stats = messageQueue.getStats();
      setQueuedMessages(stats.totalMessages);
    };

    window.addEventListener('messageQueueFlush', handleQueueFlush);
    // Initial check
    const stats = messageQueue.getStats();
    setQueuedMessages(stats.totalMessages);

    return () => window.removeEventListener('messageQueueFlush', handleQueueFlush);
  }, []);

  // Priority 4: Infinite scroll for pagination (load older messages)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !chatId || !hasOlderMessages) return;

    const handleScroll = async () => {
      // Load older messages when user scrolls to top
      if (container.scrollTop < 100 && !isLoadingMessages) {
        setIsLoadingMessages(true);
        try {
          const oldestMessage = chatMessages[0];
          if (oldestMessage) {
            const beforeTimestamp = typeof oldestMessage.timestamp === 'number' 
              ? oldestMessage.timestamp 
              : new Date(oldestMessage.timestamp || Date.now()).getTime();
            
            const result = await idbPaginator.loadBefore(chatId, beforeTimestamp, 50);
            if (result.items.length < 50) {
              setHasOlderMessages(false);
            }
          }
        } catch (error) {
          console.error('Failed to load older messages:', error);
        } finally {
          setIsLoadingMessages(false);
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [chatId, hasOlderMessages, isLoadingMessages, chatMessages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
      if (activeMenuId) setActiveMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeMenuId]);

  useEffect(() => {
    if (showSearch) msgSearchRef.current?.focus();
  }, [showSearch]);

  const handleSend = async () => {
    if (!text.trim() || !chatId) return;
    
    setSendError(null);
    setIsLoading(true);
    
    try {
      // Validate message
      const validatedText = validateMessage(text.trim());
      
      // Check rate limit
      const userId = localStorage.getItem('userId') || 'unknown';
      await messageLimiter.checkLimit(userId);
      
      // Message is valid, send it
      const extra: Partial<Message> = replyTo
        ? { replyToId: replyTo.id, replyToContent: replyTo.content, replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
        : {};
      
      sendMessage(chatId, validatedText, 'text', extra);
      setText('');
      setReplyTo(null);
      setShowEmojiPicker(false);
      inputRef.current?.focus();
      
    } catch (error: any) {
      // Show error to user
      setSendError(error.message || 'Failed to send message');
      console.error('Error sending message:', error);
      
      // Clear error after 4 seconds
      setTimeout(() => setSendError(null), 4000);
    } finally {
      setIsLoading(false);
    }
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

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    try {
      // Priority 3: Media Validation - validate image before upload
      const validation = await mediaValidator.validateFile(file, 'image');
      if (!validation.valid) {
        setSendError(validation.error || 'Invalid image file');
        setTimeout(() => setSendError(null), 4000);
        return;
      }

      const uploadId = `upload_${Date.now()}`;
      const abortController = new AbortController();
      mediaValidator.registerUpload(uploadId, abortController, file.size);

      sendMessage(chatId, '', 'image', {}, file);
      setShowAttachSheet(false);
      e.target.value = '';
    } catch (error: any) {
      setSendError(error.message || 'Failed to process image');
      setTimeout(() => setSendError(null), 4000);
      console.error('Image processing error:', error);
    }
  };

  const handleDocumentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    try {
      // Priority 3: Media Validation - basic file size check for documents
      const maxFileSize = 100 * 1024 * 1024; // 100MB for documents
      if (file.size > maxFileSize) {
        setSendError(`File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB`);
        setTimeout(() => setSendError(null), 4000);
        return;
      }

      const uploadId = `upload_${Date.now()}`;
      const abortController = new AbortController();
      mediaValidator.registerUpload(uploadId, abortController, file.size);

      sendMessage(chatId, `📎 ${file.name}`, 'document', {});
      setShowAttachSheet(false);
      e.target.value = '';
    } catch (error: any) {
      setSendError(error.message || 'Failed to process document');
      setTimeout(() => setSendError(null), 4000);
      console.error('Document processing error:', error);
    }
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

  // ─── Native Actions ────────────────────────────────────────────────────────

  const handleShareMessage = async (msg: Message) => {
    try {
      await Share.share({
        title: 'Quidec Message',
        text: msg.content,
        url: msg.imageUrl ? msg.imageUrl : undefined,
        dialogTitle: 'Share with friends',
      });
    } catch (err) {
      console.error('Sharing failed:', err);
    }
    setActiveMenuId(null);
  };

  const handleSaveImage = async (url: string, filename: string = 'quidec_image.jpg') => {
    try {
      // url here is often a blob or dataURL in the preview
      const response = await fetch(url);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        await Filesystem.writeFile({
          path: filename,
          data: base64data.split(',')[1],
          directory: Directory.Documents,
        });
        alert('Image saved to Documents');
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setActiveMenuId(null);
  };

  if (!chat || !contact) {
    return (
      <div className="h-full bg-[#222E35] flex items-center justify-center">
        <p className="text-wa-text-muted">Chat not found</p>
      </div>
    );
  }

  const headerMenuItems = [
    { label: 'View contact', action: () => { setShowHeaderMenu(false); setContactInfoOpen(true); } },
    { label: 'Media, links and docs', action: () => { setShowHeaderMenu(false); setContactInfoOpen(true); } },
    { label: 'Search', action: () => openSearch() },
    { label: 'Mute notifications', action: () => { setShowHeaderMenu(false); alert('Notifications for this chat will be muted for 8 hours.'); } },
    { label: 'Clear chat', action: () => { setShowHeaderMenu(false); clearChat(chatId!); } },
  ];

  return (
    <div className="h-full relative flex flex-col bg-wa-chat overflow-hidden transition-colors duration-200">
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.ppt,.pptx,.zip" className="hidden" onChange={handleDocumentSelect} />

      {/* Action Menu / Reaction Picker Overlay */}
      <AnimatePresence>
        {activeMenuId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-black/20 backdrop-blur-[2px]"
              onClick={() => setActiveMenuId(null)}
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 10 }}
              className="absolute z-[101] bg-[#233138] rounded-2xl shadow-2xl p-2 min-w-[200px] border border-wa-border"
              style={{ 
                left: Math.min(menuPos.x, window.innerWidth - 220), 
                top: Math.min(menuPos.y, window.innerHeight - 300) 
              }}
            >
              {/* Reactions Row */}
              <div className="flex items-center gap-1.5 px-2 py-2 mb-2 border-b border-white/5 overflow-x-auto no-scrollbar">
                {EMOJI_LIST.map(e => (
                  <button 
                    key={e} 
                    onClick={() => { reactToMessage(chatId!, activeMenuId, e); setActiveMenuId(null); }}
                    className="text-2xl hover:scale-125 transition-transform p-1.5 active:scale-90"
                  >
                    {e}
                  </button>
                ))}
              </div>
              {/* Actions List */}
              <div className="flex flex-col">
                <button 
                  onClick={() => { 
                    const msg = chatMessages.find(m => m.id === activeMenuId);
                    if (msg) setReplyTo(msg);
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Reply size={18} className="text-wa-text-muted" /> Reply
                </button>
                <button 
                  onClick={() => {
                    const msg = chatMessages.find(m => m.id === activeMenuId);
                    if (msg) handleShareMessage(msg);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Share2 size={18} className="text-wa-text-muted" /> Share
                </button>
                <button 
                  onClick={() => {
                    const msg = chatMessages.find(m => m.id === activeMenuId);
                    if (msg?.imageUrl) handleSaveImage(msg.imageUrl);
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Save size={18} className="text-wa-text-muted" /> Save to Device
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(chatMessages.find(m => m.id === activeMenuId)?.content || '');
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium text-red-400"
                >
                  <Check size={18} /> Copy Text
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-black flex flex-col"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-black/60 flex-shrink-0">
              <button onClick={() => setLightboxImage(null)} className="text-white p-1 rounded-full hover:bg-white/10">
                <ArrowLeft size={22} />
              </button>
              <span className="text-white flex-1" style={{ fontWeight: 500 }}>Photo</span>
              <button onClick={() => handleSaveImage(lightboxImage!)} className="text-white p-1 rounded-full hover:bg-white/10">
                <Download size={20} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-2" onClick={() => setLightboxImage(null)}>
              <img src={lightboxImage} alt="fullscreen" className="max-w-full max-h-full rounded-lg" style={{ objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="bg-wa-header border-b border-wa-border flex-shrink-0 overflow-hidden pt-10"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button onClick={closeSearch} className="text-[#aebac1] p-1 flex-shrink-0"><ArrowLeft size={20} /></button>
                <input
                  ref={msgSearchRef} type="text" value={msgSearch} onChange={e => { setMsgSearch(e.target.value); setMsgSearchIndex(0); }}
                  placeholder="Search messages…" className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]" style={{ fontSize: '0.9rem' }}
                />
                {msgSearch && <span className="text-wa-text-muted flex-shrink-0" style={{ fontSize: '0.78rem' }}>{matchedMsgIds.length > 0 ? `${msgSearchIndex + 1}/${matchedMsgIds.length}` : '0/0'}</span>}
                <button onClick={() => navigateSearchResult(-1)} disabled={matchedMsgIds.length === 0} className="text-[#aebac1] p-1 disabled:opacity-30"><ChevronUp size={18} /></button>
                <button onClick={() => navigateSearchResult(1)} disabled={matchedMsgIds.length === 0} className="text-[#aebac1] p-1 disabled:opacity-30"><ChevronDown size={18} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 px-3 py-2.5 pt-10 bg-wa-header flex-shrink-0 border-b border-wa-border/10">
          <button onClick={handleBack} className="text-wa-header-icon hover:text-wa-primary p-1.5 rounded-full hover:bg-white/5"><ArrowLeft size={20} /></button>
          <button onClick={() => setContactInfoOpen(!contactInfoOpen)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={40} />
              {contact.isOnline && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-[#00A884] border-2 border-wa-header" />}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-wa-primary truncate" style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.2px' }}>{contact.name}</p>
              <AnimatePresence mode="wait">
                {isTyping ? <motion.p key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[#00A884] font-bold" style={{ fontSize: '0.78rem' }}>typing...</motion.p>
                : <motion.p key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-wa-text-muted" style={{ fontSize: '0.78rem' }}>{contact.isGroup ? `${contact.members?.length} members` : contact.isOnline ? 'online' : contact.lastSeen}</motion.p>}
              </AnimatePresence>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(`/call/video/${contact.id}`)} className="text-wa-header-icon hover:text-wa-primary p-2 rounded-full hover:bg-white/5 transition-colors"><Video size={20} /></button>
            <button onClick={() => navigate(`/call/voice/${contact.id}`)} className="text-wa-header-icon hover:text-wa-primary p-2 rounded-full hover:bg-white/5 transition-colors"><Phone size={20} /></button>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowHeaderMenu(v => !v)} className={`p-2 rounded-full hover:bg-white/5 transition-colors ${showHeaderMenu ? 'text-wa-primary bg-white/5' : 'text-wa-header-icon hover:text-wa-primary'}`}><MoreVertical size={20} /></button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-xl shadow-2xl overflow-hidden z-50 border border-wa-border">
                  {headerMenuItems.map(item => (
                    <button key={item.label} onClick={item.action} className="w-full text-left px-5 py-3.5 text-wa-primary hover:bg-[#2A3942] transition-colors" style={{ fontSize: '0.9rem' }}>{item.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto py-4 px-3 space-y-1"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`, backgroundColor: 'var(--wa-bg-main)' }}
          onClick={() => { setShowAttachSheet(false); setShowEmojiPicker(false); setShowHeaderMenu(false); }}
        >
          {chatMessages.map((msg, idx) => (
            <MessageBubble
              key={msg.id} message={msg} contact={contact} contacts={contacts}
              showAvatar={msg.senderId !== 'me' && msg.senderId !== 'system' && (idx === chatMessages.length - 1 || chatMessages[idx + 1]?.senderId !== msg.senderId)}
              showSenderName={!!contact.isGroup && msg.senderId !== 'me' && msg.senderId !== 'system' && (idx === 0 || chatMessages[idx - 1]?.senderId !== msg.senderId)}
              isGroup={contact.isGroup} onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
              isSearchHighlight={msgSearch.trim() !== '' && msg.content.toLowerCase().includes(msgSearch.toLowerCase())}
              isSearchActive={matchedMsgIds[msgSearchIndex] === msg.id} onImageClick={(url) => setLightboxImage(url)}
              onContextMenu={(e) => { e.preventDefault(); setMenuPos({ x: e.clientX, y: e.clientY }); setActiveMenuId(msg.id); }}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <AnimatePresence>
          {replyTo && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-wa-header border-t border-wa-border overflow-hidden flex-shrink-0">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-1 h-10 bg-[#00A884] rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#00A884]" style={{ fontSize: '0.78rem', fontWeight: 600 }}>{replyTo.senderId === 'me' ? 'You' : contact.name}</p>
                  <p className="text-wa-text-muted truncate" style={{ fontSize: '0.82rem' }}>{replyTo.type === 'link' ? '🔗 ' + (replyTo.linkUrl || replyTo.content) : replyTo.content}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-wa-text-muted hover:text-wa-primary p-1 flex-shrink-0"><X size={18} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-wa-header border-t border-wa-border flex-shrink-0 overflow-hidden">
              <div className="px-3 py-3"><div className="grid grid-cols-10 gap-1">{EMOJI_LIST.map(emoji => (
                <button key={emoji} onClick={() => appendEmoji(emoji)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-wa-secondary transition-colors active:scale-90" style={{ fontSize: '1.25rem' }}>{emoji}</button>
              ))}</div></div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAttachSheet && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="bg-wa-header border-t border-wa-border flex-shrink-0 overflow-hidden">
              {showLinkInput ? (
                <div className="px-4 py-4">
                  <div className="flex items-center gap-2 mb-3"><button onClick={() => setShowLinkInput(false)} className="text-wa-text-muted"><ArrowLeft size={18} /></button><span className="text-wa-primary" style={{ fontWeight: 600 }}>Share a Link</span></div>
                  <div className="flex items-center gap-2 bg-wa-secondary rounded-xl px-4 py-2.5"><Link size={16} className="text-wa-text-muted flex-shrink-0" /><input type="url" value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://example.com" className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]" style={{ fontSize: '0.9rem' }} autoFocus onKeyDown={e => e.key === 'Enter' && handleSendLink()} /></div>
                  <button onClick={handleSendLink} disabled={!linkInput.trim()} className={`w-full mt-3 rounded-full py-3 flex items-center justify-center gap-2 transition-colors ${linkInput.trim() ? 'bg-[#00A884] text-white' : 'bg-wa-secondary text-wa-text-muted'}`} style={{ fontWeight: 600 }}>Send Link <Send size={16} /></button>
                </div>
              ) : (
                <div className="px-4 py-4"><div className="grid grid-cols-4 gap-3">{[
                  { icon: File, label: 'Document', color: '#5c6bc0', onClick: () => docInputRef.current?.click() },
                  { icon: Image, label: 'Photos', color: '#e91e63', onClick: () => photoInputRef.current?.click() },
                  { icon: Camera, label: 'Camera', color: '#00897b', onClick: () => photoInputRef.current?.click() },
                  { icon: Link, label: 'Link', color: '#fb8c00', onClick: () => setShowLinkInput(true) },
                  { icon: User, label: 'Contact', color: '#43a047', onClick: () => alert('Contact sharing is coming soon!') },
                  { icon: MapPin, label: 'Location', color: '#e53935', onClick: () => alert('Location sharing is coming soon!') },
                ].map(item => (
                  <button key={item.label} onClick={item.onClick} className="flex flex-col items-center gap-2 py-2"><div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${item.color}22` }}><item.icon size={22} style={{ color: item.color }} /></div><span className="text-wa-text-muted" style={{ fontSize: '0.72rem' }}>{item.label}</span></button>
                ))}</div></div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 px-3 py-3 pb-8 bg-wa-header flex-shrink-0 border-t border-wa-border/5">
          {sendError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute bottom-full left-0 right-0 px-3 py-2 bg-red-600/90 text-white text-sm flex items-center justify-between"
            >
              <span>{sendError}</span>
              <button onClick={() => setSendError(null)} className="ml-2 text-white/80 hover:text-white">✕</button>
            </motion.div>
          )}
          <div className="flex items-end gap-2 flex-1 bg-wa-secondary/40 rounded-2xl px-3 py-2 border border-wa-border/5">
            <button onClick={() => { setShowEmojiPicker(v => !v); setShowAttachSheet(false); }} className={`transition-colors flex-shrink-0 mb-0.5 ${showEmojiPicker ? 'text-[#00A884]' : 'text-wa-header-icon hover:text-wa-primary'}`}><Smile size={22} /></button>
            <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Message" rows={1} className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/50 resize-none py-0.5 max-h-32 overflow-y-auto" style={{ fontSize: '0.95rem', lineHeight: '1.4' }} />
            {!text && <button onClick={() => { setShowAttachSheet(v => !v); setShowLinkInput(false); setShowEmojiPicker(false); }} className={`transition-colors flex-shrink-0 mb-0.5 ${showAttachSheet ? 'text-[#00A884]' : 'text-wa-header-icon hover:text-wa-primary'}`}><Paperclip size={22} /></button>}
            {!text && <button onClick={() => { setShowAttachSheet(true); setShowLinkInput(false); setShowEmojiPicker(false); }} className="text-wa-header-icon hover:text-wa-primary transition-colors flex-shrink-0 mb-0.5"><Camera size={22} /></button>}
          </div>
          <AnimatePresence mode="wait">
            {text ? <motion.button key="send" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} onClick={handleSend} disabled={isLoading} className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all shadow-md active:scale-90 ${isLoading ? 'bg-[#00A884]/50 cursor-not-allowed' : 'bg-[#00A884] hover:bg-[#06cf9c]'}`}><Send size={20} className="text-white ml-0.5" /></motion.button>
            : <motion.button key="mic" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="w-12 h-12 bg-[#00A884] rounded-full flex items-center justify-center flex-shrink-0 hover:bg-[#06cf9c] transition-all shadow-md active:scale-90"><Mic size={20} className="text-white" /></motion.button>}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {contactInfoOpen && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.25, ease: 'easeInOut' }} className="absolute inset-0 z-50 bg-wa-secondary">
            <ContactInfo contactId={contact.id} chatId={chatId!} onClose={() => setContactInfoOpen(false)} onSearchChat={openSearch} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, contact, contacts, showAvatar, showSenderName, isGroup, onReply, isSearchHighlight, isSearchActive, onImageClick, onContextMenu }: {
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
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const isMe = message.senderId === 'me';
  const isSystem = message.senderId === 'system';
  const senderContact = !isMe && !isSystem && isGroup ? contacts.find((c: any) => c.id === message.senderId) : null;
  const displayContact = senderContact || contact;

  const x = useMotionValue(0);
  const swipeOpacity = useTransform(x, [0, 60], [0, 1]);
  const swipeScale = useTransform(x, [0, 60], [0.5, 1]);
  const [swipeTriggered, setSwipeTriggered] = useState(false);

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x > 50 && !swipeTriggered) {
      setSwipeTriggered(true);
      onReply(message);
      if (navigator.vibrate) navigator.vibrate(40);
      setTimeout(() => setSwipeTriggered(false), 500);
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-start gap-1 bg-[#182229] rounded-lg px-3 py-2 max-w-xs">
          <Lock size={11} className="text-wa-text-muted mt-0.5 flex-shrink-0" />
          <p className="text-wa-text-muted text-center leading-snug" style={{ fontSize: '0.72rem' }}>{message.content}</p>
        </div>
      </div>
    );
  }

  const isImage = message.type === 'image';
  const isImageOnly = isImage && !message.content && !message.replyToContent && !showSenderName;

  return (
    <div 
      className={`flex items-end gap-1.5 mb-0.5 relative group ${isMe ? 'justify-end' : 'justify-start'}`}
      onContextMenu={onContextMenu}
    >
      {/* Swipe Reply Visual */}
      <motion.div 
        style={{ opacity: swipeOpacity, scale: swipeScale, x: 0 }}
        className="absolute left-[-40px] top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-wa-header"
      >
        <Reply size={16} className="text-[#00A884]" />
      </motion.div>

      {!isMe && isGroup && (
        <div className="w-7 flex-shrink-0 self-end mb-0.5">
          {showAvatar && <Avatar src={displayContact.avatar} name={displayContact.name} color={displayContact.avatarColor} size={28} />}
        </div>
      )}

      <motion.div
        id={`msg-${message.id}`}
        drag="x"
        dragConstraints={{ left: 0, right: 80 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileTap={{ scale: 0.995 }}
        className={`relative max-w-[85%] rounded-2xl shadow-sm transition-all ${isImageOnly ? 'p-0 overflow-hidden' : 'px-3 py-2'} ${isMe ? 'bg-wa-bubble-self text-wa-primary' : 'bg-wa-bubble-other text-wa-primary'} ${isSearchActive ? 'ring-2 ring-[#00A884]' : isSearchHighlight ? 'ring-1 ring-[#00A884]/40' : ''}`}
      >
        {!isImageOnly && (isMe ? <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[8px] border-l-transparent border-b-[8px] border-b-wa-bubble-self translate-x-[6px]" /> : <div className="absolute bottom-0 left-0 w-0 h-0 border-r-[8px] border-r-transparent border-b-[8px] border-b-wa-bubble-other -translate-x-[6px]" />)}
        
        {showSenderName && senderContact && <p style={{ fontSize: '0.78rem', fontWeight: 600, color: senderContact.avatarColor, marginBottom: '2px' }}>{senderContact.name}</p>}

        {message.replyToContent && (
          <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 border-[#00A884] ${isMe ? 'bg-[#00A884]/10' : 'bg-wa-secondary/40'}`}>
            <p className="text-[#00A884]" style={{ fontSize: '0.72rem', fontWeight: 600 }}>{message.replyToSender}</p>
            <p className="text-[#aebac1] truncate" style={{ fontSize: '0.78rem' }}>{message.replyToContent}</p>
          </div>
        )}

        {isImage && message.imageUrl && (
          <div className={`relative overflow-hidden ${isImageOnly ? (isMe ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm') : 'rounded-xl mt-0.5'}`} style={isImageOnly ? {} : { maxWidth: '240px' }} onClick={() => onImageClick?.(message.imageUrl!)}>
            <LocalMedia fileId={message.imageUrl} mediaType="image" senderId={message.senderId} chatId={message.chatId} isImageOnly={isImageOnly} message={message} isMe={isMe} />
          </div>
        )}
        
        {isImage && message.content && <p className="text-wa-primary leading-relaxed mt-1" style={{ fontSize: '0.9rem', paddingRight: '76px' }}>{message.content}</p>}

        {message.type === 'document' && (() => {
          const filename = message.content.replace('📎 ', '');
          return (
            <div className="flex items-center gap-3 py-0.5" style={{ minWidth: '200px', maxWidth: '260px' }}>
              <div className="w-10 h-10 bg-[#00A884]/20 rounded-xl flex items-center justify-center flex-shrink-0"><FileText size={20} className="text-[#00A884]" /></div>
              <div className="min-w-0 flex-1"><p className="text-wa-primary truncate" style={{ fontSize: '0.84rem', fontWeight: 500 }}>{filename}</p><p className="text-wa-text-muted mt-0.5" style={{ fontSize: '0.7rem' }}>TAP TO OPEN</p></div>
              <Download size={16} className="text-wa-text-muted" />
            </div>
          );
        })()}

        {message.type === 'link' && (
          <a href={message.linkUrl} target="_blank" rel="noopener noreferrer" className="block" onClick={e => e.stopPropagation()}>
            <div className={`rounded-lg overflow-hidden border ${isMe ? 'border-[#00A884]/30' : 'border-wa-border'}`}>
              <div className={`px-3 py-2 flex items-center gap-2 ${isMe ? 'bg-[#00A884]/10' : 'bg-wa-secondary/50'}`}><ExternalLink size={14} className="text-[#00A884]" /><div className="min-w-0"><p className="text-wa-primary truncate" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{message.linkTitle || message.linkUrl}</p><p className="text-wa-text-muted truncate" style={{ fontSize: '0.72rem' }}>{message.linkDomain || message.linkUrl}</p></div></div>
              <div className="px-3 py-1.5"><p className="text-[#53bdeb] truncate" style={{ fontSize: '0.78rem' }}>{message.linkUrl}</p></div>
            </div>
          </a>
        )}

        {message.type === 'text' && <p className="text-wa-primary leading-relaxed" style={{ fontSize: '0.9rem', paddingRight: '76px' }}>{message.content}</p>}

        {/* Reaction Display */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`absolute -bottom-3 ${isMe ? 'left-0' : 'right-0'} flex items-center gap-0.5 bg-[#233138] border border-wa-border rounded-full px-1.5 py-0.5 shadow-lg z-20`}>
            {message.reactions.map((r, i) => <span key={i} className="text-sm">{r.emoji}</span>)}
            {message.reactions.length > 1 && <span className="text-[10px] text-wa-text-muted font-bold ml-0.5">{message.reactions.length}</span>}
          </div>
        )}

        {/* Info row */}
        {!(isImage && !message.content) && (
          <div className={`flex items-center gap-1 whitespace-nowrap ${(message.type === 'document' || message.type === 'link') ? 'justify-end mt-1.5' : 'absolute bottom-1.5 right-2.5'}`}>
            <span className="text-wa-text-muted" style={{ fontSize: '0.65rem' }}>{message.timestamp}</span>
            {isMe && (
              <>
                {message.status === 'sent' && <Check size={13} className="text-wa-text-muted" />}
                {message.status === 'delivered' && <CheckCheck size={13} className="text-wa-text-muted" />}
                {message.status === 'read' && <CheckCheck size={13} className="text-[#53bdeb]" />}
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function LocalMedia({ fileId, mediaType, senderId, chatId, isImageOnly, message, isMe }: any) {
  const { currentUser } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileId) return;
    if (fileId.startsWith('data:') || fileId.startsWith('blob:')) { setUrl(fileId); setLoading(false); return; }
    const resolve = async () => {
      if (!currentUser) return;
      try {
        const otherParty = isMe ? chatId : senderId;
        const decryptedUrl = await loadMediaWithCache(fileId, mediaType, currentUser.userId, otherParty);
        setUrl(decryptedUrl);
      } catch (err) { console.warn('⚠️ Media resolution failed:', err); } finally { setLoading(false); }
    };
    resolve();
  }, [fileId, currentUser, isMe, chatId, senderId, mediaType]);

  if (loading) return <div className="w-full flex items-center justify-center bg-[#1F2C34]" style={{ height: '200px' }}><div className="w-8 h-8 rounded-full border-2 border-[#00A884] border-t-transparent animate-spin" /></div>;
  if (!url) return <div className="w-full flex flex-col items-center justify-center bg-[#1F2C34] gap-2" style={{ height: '200px' }}><Image size={32} className="text-[#8696A0]" /><p className="text-[#8696A0]" style={{ fontSize: '0.7rem' }}>Failed to load media</p></div>;

  return (
    <>
      <img src={url} alt="shared" className="w-full block" style={{ maxHeight: isImageOnly ? '320px' : '220px', minHeight: '120px', objectFit: 'cover', cursor: 'pointer' }} />
      {isImageOnly && (
        <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-0.5">
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.92)' }}>{message.timestamp}</span>
          {isMe && (
            <>
              {message.status === 'sent' && <Check size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
              {message.status === 'delivered' && <CheckCheck size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
              {message.status === 'read' && <CheckCheck size={11} className="text-[#53bdeb]" />}
            </>
          )}
        </div>
      )}
    </>
  );
}