import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Video, MoreVertical, Smile, Paperclip,
  Mic, Send, CheckCheck, Check, Lock, FileText, Camera,
  X, Reply, Link, Image, MapPin, User, File, MessageSquare,
  ExternalLink, ChevronDown, ChevronUp, Download, Share2, Save, Star,
  Clock, Timer, Edit3, Trash2, Copy, Forward
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';

function toTimeStr(ts: any): string {
  if (!ts) return '';
  try {
    let date: Date;
    if (typeof ts?.toDate === 'function') {
      date = ts.toDate();
    } else if (typeof ts?.seconds === 'number') {
      date = new Date(ts.seconds * 1000);
    } else {
      date = new Date(ts);
    }
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime();
}
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';
import TypingDots from './TypingDots';
import ContactInfo from './ContactInfo';
import EmojiPicker from './EmojiPicker';
import { loadMediaWithCache } from '../../utils/mediaUploadHandler';
import type { Message } from '../context/AppContext';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { validateMessage, messageLimiter } from '../../utils/validators';
import { mediaValidator } from '../../utils/mediaValidator';
import { compressImage, formatBytes } from '../../utils/imageCompression';
import { messageQueue } from '../../utils/persistentMessageQueue';
import { sanitizeUrl } from '../../utils/sanitize';
import { toast } from 'sonner';
import { idbPaginator } from '../../utils/idbPaginator';
import { typingService } from '../../utils/firebaseServices';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🥰','😜','😭','🥺','🤔','👍','❤️','🔥','✨','🙏','✅'
];

const STICKER_CATEGORIES: Record<string, string[]> = {
  'Smileys': ['😀','😃','😄','😁','😆','🥹','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  'Gestures': ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟'],
  'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪳','🦟','🦗','🕷️','🐢','🐍','🦎','🦂'],
  'Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥖','🍞','🥨','🥯','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯'],
  'Activities': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','🎯','🪀','🪁','🎮','🕹️','🎲','🧩','🎭','🎨','🧵','🧶','🎪','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻'],
  'Objects': ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','💡','🔦','🕯️','🪔','💰','💵','💴','💶','💷','🪙','💸','💳','🧾','💹','✉️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮'],
};

const STICKER_SEND_LIST = Object.values(STICKER_CATEGORIES).flat();

export default function ChatWindow() {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    chats, contacts, messages, sendMessage, typingContacts, isOffline, isReconnecting, syncProgress,
    setActiveChatId, contactInfoOpen, setContactInfoOpen,
    replyTo, setReplyTo, reactToMessage, clearChat,
    deleteMessage, deleteMessageForMe, forwardMessages, addMessagesToChat, toggleStarMessage, editMessage, currentUser,
    setDisappearingTimer, isDisappearingActive, getDisappearingRemaining, disappearingTimers,
    markAsRead
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
  const [resolvedLightboxUrl, setResolvedLightboxUrl] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [resolvedLightboxVideoUrl, setResolvedLightboxVideoUrl] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ file: File; type: 'image' | 'video' | 'audio' | 'document'; previewUrl?: string } | null>(null);
  const [queuedMessages, setQueuedMessages] = useState(0);
  const [activeUploads, setActiveUploads] = useState<Array<{ uploadId: string; name: string; size: number; progress?: number }>>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [showTimerSheet, setShowTimerSheet] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showForwardSheet, setShowForwardSheet] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  
  // Message interaction state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const msgSearchRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const reactionEmojiInputRef = useRef<HTMLInputElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const chat = chats.find(c => c.id === chatId);
  const contact = chat ? contacts.find(c => c.id === chat.contactId) : null;
  const chatMessages = chatId ? (messages[chatId] || []) : [];
  const isTyping = chatId ? typingContacts[chatId] : false;

  const matchedMsgIds = msgSearch.trim()
    ? chatMessages
        .filter(m => m.content.toLowerCase().includes(msgSearch.toLowerCase()))
        .map(m => m.id)
    : [];

  // Use a ref for markAsRead to prevent infinite re-trigger of this effect
  const markAsReadRef = useRef(markAsRead);
  markAsReadRef.current = markAsRead;

  useEffect(() => {
    if (chatId) {
      setActiveChatId(chatId);
      markAsReadRef.current(chatId);
    }
    return () => {
      setActiveChatId(null);
      if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
      setPendingMedia(null);
    };
  }, [chatId]); // Removed markAsRead from deps — use ref instead

  useEffect(() => {
    if (!showSearch && isNearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping, showSearch, isNearBottom]);

  useEffect(() => {
    if (!lightboxImage) { setResolvedLightboxUrl(null); return; }
    if (lightboxImage.startsWith('blob:') || lightboxImage.startsWith('data:')) {
      setResolvedLightboxUrl(lightboxImage);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await loadMediaWithCache(lightboxImage, 'image', currentUser?.userId || '', contact?.id || '');
        if (!cancelled) setResolvedLightboxUrl(url);
      } catch {
        if (!cancelled) setResolvedLightboxUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [lightboxImage, currentUser, contact]);

  useEffect(() => {
    if (!lightboxVideo) { setResolvedLightboxVideoUrl(null); return; }
    if (lightboxVideo.startsWith('blob:') || lightboxVideo.startsWith('data:')) {
      setResolvedLightboxVideoUrl(lightboxVideo);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await loadMediaWithCache(lightboxVideo, 'video', currentUser?.userId || '', contact?.id || '');
        if (!cancelled) setResolvedLightboxVideoUrl(url);
      } catch {
        if (!cancelled) setResolvedLightboxVideoUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [lightboxVideo, currentUser, contact]);

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
            const beforeTimestamp = toMillis(oldestMessage.timestamp) || Date.now();

            const result = await idbPaginator.loadBefore(chatId, beforeTimestamp, 50);
            // Merge paginator results into messages state
            if (result.items && result.items.length > 0) {
              // Use context helper to merge older messages
              addMessagesToChat(chatId, result.items as any);
            }

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

  // Track scroll position for scroll-to-bottom FAB
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = container;
      setIsNearBottom(scrollHeight - scrollTop - clientHeight < 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

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
        ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
        : {};
      
      // Capture reply state before clearing (async gap)
      const replySnapshot = replyTo;
      setText('');
      setReplyTo(null);
      
      await sendMessage(chatId, validatedText, 'text', extra);
      setShowEmojiPicker(false);
      if (navigator.vibrate) navigator.vibrate(15);
      // Clear typing indicator on send
      if (contact?.isGroup) {
        typingService.setGroupTyping(chatId!, currentUser?.userId || '', false);
      } else {
        typingService.setTyping(currentUser?.userId || '', contact?.id || '', false);
      }
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

  const handleSendLink = async () => {
    if (!linkInput.trim() || !chatId) return;
    let url = linkInput.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const linkReplyExtra = replyTo
      ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
      : {};
    setReplyTo(null);

    // Try to fetch page metadata (title, description, image)
    let linkTitle = '';
    let linkDescription = '';
    const parsed = new URL(url);
    const domain = parsed.hostname.replace('www.', '');
    linkTitle = domain.charAt(0).toUpperCase() + domain.slice(1);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'text/html' },
        mode: 'cors',
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const html = await resp.text();
        // Extract og:title or <title>
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
        const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
        const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (ogTitle?.[1]) linkTitle = ogTitle[1].trim();
        else if (pageTitle?.[1]) linkTitle = pageTitle[1].trim();
        if (ogDesc?.[1]) linkDescription = ogDesc[1].trim();
      }
    } catch {
      // Fetch failed (CORS/network) — use domain-based fallback
    }

    await sendMessage(chatId, url, 'link', { linkUrl: url, linkTitle, linkDomain: domain, ...linkReplyExtra });
    setReplyTo(null);
    setLinkInput('');
    setShowLinkInput(false);
    setShowAttachSheet(false);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    if (file.type.startsWith('video/')) {
      const previewUrl = URL.createObjectURL(file);
      setPendingMedia({ file, type: 'video', previewUrl });
      setShowAttachSheet(false);
      e.target.value = '';
      return;
    }

    try {
      const validation = await mediaValidator.validateFile(file, 'image');
      if (!validation.valid) {
        setSendError(validation.error || 'Invalid image file');
        setTimeout(() => setSendError(null), 4000);
        return;
      }

      const compressedFile = await compressImage(file);
      if (compressedFile.size < file.size) {
        toast.info(`Image compressed: ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)}`);
      }

      const previewUrl = URL.createObjectURL(compressedFile);
      setPendingMedia({ file: compressedFile, type: 'image', previewUrl });
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
      const maxFileSize = 100 * 1024 * 1024;
      if (file.size > maxFileSize) {
        setSendError(`File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB`);
        setTimeout(() => setSendError(null), 4000);
        return;
      }

      setPendingMedia({ file, type: 'document' });
      setShowAttachSheet(false);
    } catch (error: any) {
      setSendError(error.message || 'Failed to process document');
      setTimeout(() => setSendError(null), 4000);
    }
    e.target.value = '';
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;

    try {
      const maxFileSize = 50 * 1024 * 1024;
      if (file.size > maxFileSize) {
        setSendError(`File too large. Maximum size is ${maxFileSize / 1024 / 1024}MB`);
        setTimeout(() => setSendError(null), 4000);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setPendingMedia({ file, type: 'video', previewUrl });
      setShowAttachSheet(false);
    } catch (error: any) {
      setSendError(error.message || 'Failed to process video');
      setTimeout(() => setSendError(null), 4000);
    }
    e.target.value = '';
  };

  const handleSendPendingMedia = async () => {
    if (!pendingMedia || !chatId) return;
    const { file, type } = pendingMedia;
    const uploadId = `upload_${Date.now()}`;
    const msgId = `msg-${Date.now()}`;

    const extra: Partial<Message> = replyTo
      ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
      : {};

    const previewUrl = pendingMedia.previewUrl;
    setPendingMedia(null);
    setReplyTo(null);

    const abortController = new AbortController();
    mediaValidator.registerUpload(uploadId, abortController, file.size);
    setActiveUploads(prev => [...prev, { uploadId, name: file.name, size: file.size }]);

    try {
      if (type === 'image') {
        await sendMessage(chatId, '', 'image', extra, file, { msgId, onUploadProgress: (p) => setUploadProgress(prev => ({ ...prev, [msgId]: p.percentComplete })) });
      } else if (type === 'video') {
        await sendMessage(chatId, '', 'video', extra, file, { msgId, onUploadProgress: (p) => setUploadProgress(prev => ({ ...prev, [msgId]: p.percentComplete })) });
      } else if (type === 'audio') {
        await sendMessage(chatId, '🎵 Audio', 'audio', extra, file, { msgId, onUploadProgress: (p) => setUploadProgress(prev => ({ ...prev, [msgId]: p.percentComplete })) });
      } else {
        await sendMessage(chatId, `📎 ${file.name}`, 'document', extra, file, { msgId, onUploadProgress: (p) => setUploadProgress(prev => ({ ...prev, [msgId]: p.percentComplete })) });
      }

      setUploadProgress(prev => { const n = { ...prev }; delete n[msgId]; return n; });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    } catch (err: any) {
      setSendError(err.message || 'Failed to send media');
      setTimeout(() => setSendError(null), 4000);
    } finally {
      try { mediaValidator.unregisterUpload(uploadId, file.size); } catch { /* ignore */ }
      setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
    }
  };

  const handleCancelPendingMedia = () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // ─── Audio Recording ──────────────────────────────────────────────────────

  const startAudioRecording = async () => {
    if (!chatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      recordingStreamRef.current = stream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        recordedChunksRef.current = [];
        stream.getTracks().forEach(t => t.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setIsRecordingAudio(false);
        setRecordingDuration(0);

        if (blob.size === 0) return;

        // @ts-expect-error — File constructor lib typings incomplete for Blob overload
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });

        const validation = await mediaValidator.validateFile(file, 'audio');
        if (!validation.valid) {
          setSendError(validation.error || 'Invalid audio');
          setTimeout(() => setSendError(null), 4000);
          return;
        }

        const previewUrl = URL.createObjectURL(blob);
        setPendingMedia({ file, type: 'audio', previewUrl });
      };

      mediaRecorder.start(1000);
      setIsRecordingAudio(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => {
          if (d >= 119) {
            // Auto-stop at 120s
            stopAudioRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);
      setShowAttachSheet(false);
    } catch (err: any) {
      console.error('❌ Audio recording failed:', err);
      setSendError('Microphone access denied. Please enable microphone permissions.');
      setTimeout(() => setSendError(null), 4000);
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const formatRecordingDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMsgId) {
        handleEditSend();
      } else {
        handleSend();
      }
    }
    if (e.key === 'Escape') {
      if (editingMsgId) {
        cancelEditing();
      } else if (isSelectionMode) {
        exitSelectionMode();
      } else {
        setReplyTo(null);
        setShowEmojiPicker(false);
      }
    }
  };

  const startEditing = (msgId: string) => {
    const msg = chatMessages.find(m => m.id === msgId);
    if (!msg) return;
    setEditingMsgId(msgId);
    setEditingText(msg.content);
    setText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    setShowAttachSheet(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setEditingMsgId(null);
    setEditingText('');
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMsgIds([]);
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMsgIds(prev => {
      if (prev.includes(msgId)) {
        const next = prev.filter(id => id !== msgId);
        if (next.length === 0) {
          setIsSelectionMode(false);
          return [];
        }
        return next;
      }
      return [...prev, msgId];
    });
  };

  const handleDeleteSelected = async () => {
    if (!chatId || selectedMsgIds.length === 0) return;
    const myId = currentUser?.userId || 'me';
    for (const msgId of selectedMsgIds) {
      const msg = chatMessages.find(m => m.id === msgId);
      if (msg && (msg.senderId === myId)) {
        await deleteMessage(chatId, msgId);
      } else {
        await deleteMessageForMe(chatId, msgId);
      }
    }
    exitSelectionMode();
  };

  const handleForwardSelected = async (targetChatId: string) => {
    if (selectedMsgIds.length === 0) return;
    const targetChat = chats.find(c => c.id === targetChatId);
    const targetContact = targetChat ? contacts.find(c => c.id === targetChat.contactId) : null;
    await forwardMessages(selectedMsgIds, targetChatId);
    toast.success(`Forwarded to ${targetContact?.name || 'chat'}`);
    setShowForwardSheet(false);
    exitSelectionMode();
  };

  const handleEditSend = async () => {
    if (!editingText.trim() || !chatId || !editingMsgId) return;
    await editMessage(chatId, editingMsgId, editingText.trim());
    setEditingMsgId(null);
    setEditingText('');
    inputRef.current?.focus();
  };

  const cancelUpload = (uploadId: string, size: number) => {
    try {
      mediaValidator.cancelUpload(uploadId);
      mediaValidator.unregisterUpload(uploadId, size);
    } catch (err) {
      console.warn('Cancel upload failed:', err);
    }
    setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
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
      let text: string;
      switch (msg.type) {
        case 'link':
          // For links, share a formatted preview: "Title\nDomain\nURL" instead of raw URL
          text = msg.linkTitle || msg.linkDomain
            ? `${msg.linkTitle || msg.linkUrl}\n${msg.linkDomain || ''}\n${msg.linkUrl || msg.content}`
            : msg.linkUrl || msg.content;
          break;
        case 'image':
          text = msg.content || '📷 Photo';
          break;
        case 'video':
          text = msg.content || '🎥 Video';
          break;
        case 'audio':
          text = msg.content || '🎵 Audio';
          break;
        case 'document':
          text = msg.content || '📎 Document';
          break;
        default:
          text = msg.content;
          break;
      }
      await Share.share({
        title: 'Veill Message',
        text,
        url: msg.type === 'link' ? msg.linkUrl || undefined : (msg.imageUrl ? msg.imageUrl : undefined),
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
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setActiveMenuId(null);
  };

  if (!chat || !contact) {
    return (
      <div className="h-full bg-wa-secondary flex items-center justify-center">
        <p className="text-wa-text-muted">Chat not found</p>
      </div>
    );
  }

  const disappearingActive = chatId ? isDisappearingActive(chatId) : false;

  const headerMenuItems = [
    ...(contact.isGroup
      ? [
          { label: 'Group info', action: () => { setShowHeaderMenu(false); navigate(`/app/group/${contact.id}`); } },
          { label: 'Exit group', action: () => { setShowHeaderMenu(false); navigate(`/app/group/${contact.id}`); } },
        ]
      : [
          { label: 'View contact', action: () => { setShowHeaderMenu(false); setContactInfoOpen(true); } },
          { label: 'Media, links and docs', action: () => { setShowHeaderMenu(false); setContactInfoOpen(true); } },
        ]),
    {
      label: disappearingActive ? '✓ Disappearing messages' : 'Disappearing messages',
      action: () => { setShowHeaderMenu(false); setShowTimerSheet(true); },
    },
    { label: 'Search', action: () => openSearch() },
    { label: 'Mute notifications', action: () => { setShowHeaderMenu(false); toast.success('Notifications muted for 8 hours'); } },
    { label: 'Clear chat', action: () => { setShowHeaderMenu(false); clearChat(chatId!); } },
  ];

  return (
    <div className="h-full relative flex flex-col bg-wa-chat overflow-hidden transition-colors duration-200">
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handlePhotoSelect} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.ppt,.pptx,.zip" className="hidden" onChange={handleDocumentSelect} />
      <input
        ref={reactionEmojiInputRef}
        type="text"
        inputMode="text"
        className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none"
        style={{ zIndex: -1 }}
        maxLength={1}
        onInput={(e) => {
          const val = (e.target as HTMLInputElement).value;
          if (val && activeMenuId) {
            reactToMessage(chatId!, activeMenuId, val);
            setActiveMenuId(null);
            setIsSelectionMode(false);
          }
          (e.target as HTMLInputElement).value = '';
        }}
      />

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
              className="absolute z-[101] bg-wa-menu-bg rounded-2xl shadow-2xl p-2 min-w-50 border border-wa-border"
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
                    onClick={() => { reactToMessage(chatId!, activeMenuId, e); setActiveMenuId(null); setIsSelectionMode(false); }}
                    className="text-2xl hover:scale-125 transition-transform p-1.5 active:scale-90"
                    aria-label={`React with ${e}`}
                  >
                    {e}
                  </button>
                ))}
                <button 
                  onClick={() => { reactionEmojiInputRef.current?.focus(); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all p-1 active:scale-90 shrink-0"
                  aria-label="Pick any emoji"
                >
                  <span className="text-lg leading-none">＋</span>
                </button>
              </div>
              {/* Actions List */}
              <div className="flex flex-col" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    const msg = chatMessages.find(m => m.id === activeMenuId);
                    if (msg) setReplyTo(msg);
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Reply size={18} className="text-wa-text-muted" /> Reply
                </button>
                {(() => {
                  const menuMsg = chatMessages.find(m => m.id === activeMenuId);
                  if (menuMsg?.senderId === 'me' && menuMsg?.type === 'text') {
                    return (
                      <button
                        role="menuitem"
                        onClick={() => {
                          if (menuMsg) startEditing(menuMsg.id);
                          setActiveMenuId(null);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                      >
                        <Edit3 size={18} className="text-wa-text-muted" /> Edit
                      </button>
                    );
                  }
                  return null;
                })()}
                <button
                  role="menuitem"
                  onClick={() => {
                    const msg = chatMessages.find(m => m.id === activeMenuId);
                    if (msg && chatId) toggleStarMessage(chatId, msg.id);
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Star size={18} className="text-wa-star" /> {chatMessages.find(m => m.id === activeMenuId)?.isStarred ? 'Unstar' : 'Star'}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    const msg = chatMessages.find(m => m.id === activeMenuId);
                    if (msg) handleShareMessage(msg);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Share2 size={18} className="text-wa-text-muted" /> Share
                </button>
                <button 
                  role="menuitem"
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
                  role="menuitem"
                  onClick={() => {
                    navigator.clipboard.writeText(chatMessages.find(m => m.id === activeMenuId)?.content || '');
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium"
                >
                  <Copy size={18} className="text-wa-text-muted" /> Copy Text
                </button>
                <button 
                  role="menuitem"
                  onClick={() => {
                    if (activeMenuId) {
                      setDeleteTargetId(activeMenuId);
                      setShowDeleteSheet(true);
                    }
                    setActiveMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium text-red-400"
                >
                  <Trash2 size={18} className="text-red-400" /> Delete
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
            className="absolute inset-0 z-200 bg-black flex flex-col"
            role="dialog" aria-modal="true" aria-label="Photo viewer"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-black/60 shrink-0">
              <button onClick={() => setLightboxImage(null)} className="text-white p-1 rounded-full hover:bg-white/10" aria-label="Close photo viewer">
                <ArrowLeft size={22} />
              </button>
              <span className="text-white flex-1" style={{ fontWeight: 500 }}>Photo</span>
              <button onClick={() => resolvedLightboxUrl && handleSaveImage(resolvedLightboxUrl)} className="text-white p-1 rounded-full hover:bg-white/10" aria-label="Download photo">
                <Download size={20} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-2" onClick={() => setLightboxImage(null)}>
              {resolvedLightboxUrl ? (
                <img src={resolvedLightboxUrl} alt="Full-screen photo preview" className="max-w-full max-h-full rounded-lg" style={{ objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
              ) : (
                <div className="flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" /></div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxVideo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-200 bg-black flex flex-col"
            role="dialog" aria-modal="true" aria-label="Video player"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-black/60 shrink-0">
              <button onClick={() => { setLightboxVideo(null); setResolvedLightboxVideoUrl(null); }} className="text-white p-1 rounded-full hover:bg-white/10" aria-label="Close video player">
                <ArrowLeft size={22} />
              </button>
              <span className="text-white flex-1" style={{ fontWeight: 500 }}>Video</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-2" onClick={() => { setLightboxVideo(null); setResolvedLightboxVideoUrl(null); }}>
              {resolvedLightboxVideoUrl ? (
                <video
                  src={resolvedLightboxVideoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-full rounded-lg"
                  style={{ objectFit: 'contain' }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <div className="flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" /></div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="bg-wa-header border-b border-wa-border shrink-0 overflow-hidden pt-safe"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <button onClick={closeSearch} className="text-[#aebac1] p-1 shrink-0 hover:text-wa-primary transition-colors duration-150" aria-label="Close search"><ArrowLeft size={20} /></button>
                <input
                  ref={msgSearchRef} type="text" value={msgSearch} onChange={e => { setMsgSearch(e.target.value); setMsgSearchIndex(0); }}
                  placeholder="Search messages…" className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]/50" style={{ fontSize: '0.88rem' }}
                  aria-label="Search messages"
                />
                {msgSearch && <span className="text-wa-text-muted shrink-0" style={{ fontSize: '0.75rem' }}>{matchedMsgIds.length > 0 ? `${msgSearchIndex + 1}/${matchedMsgIds.length}` : '0/0'}</span>}
                <button onClick={() => navigateSearchResult(-1)} disabled={matchedMsgIds.length === 0} className="text-[#aebac1] p-1 disabled:opacity-30 hover:text-wa-primary transition-colors duration-150" aria-label="Previous search result"><ChevronUp size={18} /></button>
                <button onClick={() => navigateSearchResult(1)} disabled={matchedMsgIds.length === 0} className="text-[#aebac1] p-1 disabled:opacity-30 hover:text-wa-primary transition-colors duration-150" aria-label="Next search result"><ChevronDown size={18} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-30 flex items-center gap-3 px-3 py-2.5 pt-safe bg-wa-header/95 backdrop-blur-md shrink-0 border-b border-wa-border/10">
          {isSelectionMode ? (
            <>
              <button onClick={exitSelectionMode} className="text-wa-header-icon hover:text-wa-primary p-1.5 rounded-full hover:bg-white/5 transition-colors duration-150" aria-label="Exit selection mode"><X size={20} /></button>
              <span className="text-wa-primary flex-1" style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedMsgIds.length} selected</span>
              <div className="flex items-center gap-1">
                <button onClick={handleDeleteSelected} disabled={selectedMsgIds.length === 0} className="p-2 rounded-full text-wa-header-icon hover:text-red-400 hover:bg-white/5 transition-colors duration-150 disabled:opacity-30" aria-label="Delete selected"><Trash2 size={20} /></button>
                <button onClick={() => setShowForwardSheet(true)} disabled={selectedMsgIds.length === 0} className="p-2 rounded-full text-wa-header-icon hover:text-wa-primary hover:bg-white/5 transition-colors duration-150 disabled:opacity-30" aria-label="Forward selected"><Forward size={20} /></button>
                <button onClick={() => {
                  if (!chatId) return;
                  const myId = currentUser?.userId || 'me';
                  const allMine = selectedMsgIds.every(id => chatMessages.find(m => m.id === id)?.senderId === myId);
                  if (allMine) {
                    selectedMsgIds.forEach(id => toggleStarMessage(chatId, id));
                  } else {
                    toast.info('Can only star your own messages');
                  }
                }} disabled={selectedMsgIds.length === 0} className="p-2 rounded-full text-wa-header-icon hover:text-wa-star hover:bg-white/5 transition-colors duration-150 disabled:opacity-30" aria-label="Star selected"><Star size={20} /></button>
                <button onClick={() => {
                  const text = selectedMsgIds.map(id => chatMessages.find(m => m.id === id)?.content || '').join('\n');
                  navigator.clipboard.writeText(text);
                  toast.success('Messages copied');
                }} disabled={selectedMsgIds.length === 0} className="p-2 rounded-full text-wa-header-icon hover:text-wa-primary hover:bg-white/5 transition-colors duration-150 disabled:opacity-30" aria-label="Copy selected"><Copy size={20} /></button>
              </div>
            </>
          ) : (
            <>
              <button onClick={handleBack} className="text-wa-header-icon hover:text-wa-primary p-1.5 rounded-full hover:bg-white/5 transition-colors duration-150" aria-label="Go back to chats"><ArrowLeft size={20} /></button>
          <button onClick={() => setContactInfoOpen(!contactInfoOpen)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity duration-150">
      <div className="relative w-fit">
              <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={40} />
              {contact.isOnline && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 20, stiffness: 400 }} className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-wa-accent border-2 border-wa-header" />}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-wa-primary truncate" style={{ fontWeight: 600, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{contact.name}</p>
              <AnimatePresence mode="wait">
                {isTyping ? <motion.p key="typing" initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }} className="text-wa-accent font-medium flex items-center gap-1" style={{ fontSize: '0.72rem' }}><TypingDots /></motion.p>
                : <motion.p key="status" initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.15 }} className="text-wa-text-muted" style={{ fontSize: '0.72rem' }}>{contact.isGroup ? `${contact.members?.length} members` : contact.isOnline ? 'online' : contact.lastSeen}</motion.p>}
              </AnimatePresence>
              {chatId && isDisappearingActive(chatId) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Timer size={11} className="text-wa-accent" />
                  <span className="text-wa-accent" style={{ fontSize: '0.65rem', fontWeight: 500 }}>Disappearing messages</span>
                </div>
              )}
            </div>
          </button>
          <div className="flex items-center gap-1">
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowHeaderMenu(v => !v)} className={`p-2 rounded-full hover:bg-white/5 transition-colors duration-150 ${showHeaderMenu ? 'text-wa-primary bg-white/5' : 'text-wa-header-icon hover:text-wa-primary'}`} aria-label="Chat options" aria-expanded={showHeaderMenu}><MoreVertical size={20} /></button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-wa-menu-bg/95 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden z-50 border border-wa-border/40">
                  {headerMenuItems.map(item => (
                    <button key={item.label} onClick={item.action} className="w-full text-left px-5 py-3 text-wa-primary hover:bg-wa-menu-hover transition-colors duration-150" style={{ fontSize: '0.85rem' }}>{item.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
            </>
          )}
        </div>

        {/* Offline indicator bar */}
        <AnimatePresence>
          {(isOffline || isReconnecting) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`border-b px-4 py-2 flex items-center gap-2 shrink-0 ${
                isReconnecting
                  ? 'bg-blue-500/15 border-blue-500/30'
                  : 'bg-amber-500/15 border-amber-500/30'
              }`}
              role="status" aria-live="polite"
            >
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                isReconnecting ? 'bg-blue-500' : 'bg-amber-500'
              }`} />
              <span className={isReconnecting ? 'text-blue-400' : 'text-amber-400'} style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                {isReconnecting
                  ? syncProgress
                    ? `Syncing... ${syncProgress.sent}/${syncProgress.total}`
                    : 'Reconnecting — syncing messages...'
                  : "You're offline — messages will be sent when you reconnect"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording indicator bar */}
        {isRecordingAudio && (
          <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-2 flex items-center gap-3 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 flex-1" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Recording audio — {formatRecordingDuration(recordingDuration)}
            </span>
            <button
              onClick={() => { stopAudioRecording(); }}
              className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 transition-colors"
            >
              Stop
            </button>
          </div>
        )}

        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden py-1 px-1 scrollbar-thin"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`, backgroundColor: 'var(--wa-bg-main)' }}
          onClick={() => { setShowAttachSheet(false); setShowEmojiPicker(false); setShowHeaderMenu(false); }}
        >
          {isLoadingMessages && (
            <div className="w-full flex items-center justify-center py-3">
              <div className="h-7 w-7 rounded-full border-[3px] border-t-transparent border-wa-border animate-spin" />
            </div>
          )}

          {chatMessages.length === 0 && !isLoadingMessages && contact && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-8 gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-wa-secondary/40 flex items-center justify-center">
                <MessageSquare size={30} className="text-wa-text-muted opacity-30" />
              </div>
              <div>
                <p className="text-wa-primary" style={{ fontSize: '1rem', fontWeight: 600 }}>
                  {contact.isGroup ? contact.name : `Start a conversation with ${contact.name}`}
                </p>
                <p className="text-wa-text-muted mt-1.5 leading-relaxed" style={{ fontSize: '0.82rem' }}>
                  {contact.isGroup
                    ? 'Send a message to start the group conversation.'
                    : `Say hello to ${contact.name}! Your messages are end-to-end encrypted.`}
                </p>
              </div>
            </div>
          )}

          {chatMessages.map((msg, idx) => {
            const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
            const showDateSep = !prevMsg || formatDateSep(prevMsg.timestamp) !== formatDateSep(msg.timestamp);
            const isConsecutive = !!(prevMsg && prevMsg.senderId === msg.senderId && !showDateSep &&
              (toMillis(msg.timestamp) - toMillis(prevMsg.timestamp)) < 60000);
            return (
              <React.Fragment key={msg.id}>
                {showDateSep && (
                  <div className="flex justify-center my-2.5">
                    <div className="bg-wa-date-bg/70 backdrop-blur-sm rounded-lg px-3 py-1 shadow-sm">
                      <span className="text-wa-text-muted" style={{ fontSize: '0.68rem', fontWeight: 500, letterSpacing: '0.3px' }}>{formatDateSep(msg.timestamp)}</span>
                    </div>
                  </div>
                )}
                <MessageBubble
                  message={msg} contact={contact} contacts={contacts}
                  showAvatar={msg.senderId !== 'me' && msg.senderId !== 'system' && (idx === chatMessages.length - 1 || chatMessages[idx + 1]?.senderId !== msg.senderId)}
                  showSenderName={!!contact.isGroup && msg.senderId !== 'me' && msg.senderId !== 'system' && (idx === 0 || chatMessages[idx - 1]?.senderId !== msg.senderId)}
                  isGroup={contact.isGroup} onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
                  isSearchHighlight={msgSearch.trim() !== '' && msg.content.toLowerCase().includes(msgSearch.toLowerCase())}
                  isSearchActive={matchedMsgIds[msgSearchIndex] === msg.id} onImageClick={(url) => setLightboxImage(url)}
                  onVideoClick={(url) => setLightboxVideo(url)}
                  onContextMenu={(e) => { e.preventDefault(); setMenuPos({ x: e.clientX, y: e.clientY }); setActiveMenuId(msg.id); }}
                  isConsecutive={isConsecutive}
                  uploadProgress={uploadProgress[msg.id]}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedMsgIds.includes(msg.id)}
                  onToggleSelection={() => toggleMessageSelection(msg.id)}
                  onLongPress={() => {
                    if (!isSelectionMode) {
                      setIsSelectionMode(true);
                      setSelectedMsgIds([msg.id]);
                    }
                  }}
                />
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />

          {/* Scroll-to-bottom FAB */}
          <AnimatePresence>
            {!isNearBottom && chatMessages.length > 0 && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  if (navigator.vibrate) navigator.vibrate(10);
                }}
                className="sticky bottom-2 ml-auto flex items-center justify-center w-10 h-10 rounded-full bg-wa-header shadow-lg border border-wa-border/20 z-30"
                aria-label="Scroll to bottom"
              >
                <ChevronDown size={20} className="text-wa-header-icon" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {replyTo && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="bg-wa-header border-t border-wa-border/10 overflow-hidden shrink-0">
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="w-0.5 h-9 bg-wa-accent rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-wa-accent font-semibold" style={{ fontSize: '0.72rem' }}>{replyTo.senderId === 'me' ? 'You' : contact.name}</p>
                  <p className="text-wa-text-muted truncate" style={{ fontSize: '0.78rem' }}>{getMessagePreview(replyTo)}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-wa-text-muted hover:text-wa-primary p-1.5 rounded-full hover:bg-wa-secondary/50 transition-colors duration-150 shrink-0" aria-label="Cancel reply"><X size={16} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="shrink-0 overflow-hidden">
              <EmojiPicker onSelect={(emoji) => { appendEmoji(emoji); }} onClose={() => setShowEmojiPicker(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showStickerPicker && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="shrink-0 overflow-hidden">
              <StickerPicker onSelect={(sticker) => {
                if (chatId) {
                  sendMessage(chatId, sticker, 'sticker');
                  setShowStickerPicker(false);
                }
              }} onClose={() => setShowStickerPicker(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAttachSheet && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 350 }} className="bg-wa-header border-t border-wa-border/10 shrink-0 overflow-hidden">
              {showLinkInput ? (
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-3"><button onClick={() => setShowLinkInput(false)} className="text-wa-text-muted hover:text-wa-primary transition-colors duration-150"><ArrowLeft size={18} /></button><span className="text-wa-primary font-semibold" style={{ fontSize: '0.9rem' }}>Share a Link</span></div>
                  <div className="flex items-center gap-2 bg-wa-secondary/60 rounded-xl px-3.5 py-2 border border-wa-border/5 transition-colors focus-within:border-wa-accent/25"><Link size={15} className="text-wa-text-muted shrink-0" /><input type="url" value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://example.com" className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]/50" style={{ fontSize: '0.88rem' }} autoFocus onKeyDown={e => e.key === 'Enter' && handleSendLink()} aria-label="Enter URL" /></div>
                  <button onClick={handleSendLink} disabled={!linkInput.trim()} className={`w-full mt-2.5 rounded-full py-2.5 flex items-center justify-center gap-2 transition-all duration-200 ${linkInput.trim() ? 'bg-wa-accent text-white shadow-sm shadow-wa-accent/20' : 'bg-wa-secondary/50 text-wa-text-muted'}`} style={{ fontWeight: 600, fontSize: '0.88rem' }}>Send Link <Send size={15} /></button>
                </div>
              ) : (
                <div className="px-4 py-4"><div className="grid grid-cols-4 gap-3">{[
                  { icon: File, label: 'Document', color: '#5c6bc0', onClick: () => docInputRef.current?.click() },
                  { icon: Image, label: 'Gallery', color: '#e91e63', onClick: () => photoInputRef.current?.click() },
                  { icon: Video, label: 'Video', color: '#d32f2f', onClick: () => videoInputRef.current?.click() },
                  { icon: Mic, label: 'Audio', color: '#ff8f00', onClick: () => startAudioRecording() },
                  { icon: Link, label: 'Link', color: '#fb8c00', onClick: () => setShowLinkInput(true) },
                  { icon: Smile, label: 'Sticker', color: '#00a884', onClick: () => { setShowStickerPicker(true); setShowAttachSheet(false); } },
                  { icon: User, label: 'Contact', color: '#43a047', onClick: () => toast('Contact sharing coming soon') },
                  { icon: MapPin, label: 'Location', color: '#e53935', onClick: () => toast('Location sharing coming soon') },
                ].map(item => (
                  <button key={item.label} onClick={item.onClick} className="flex flex-col items-center gap-2 py-2 rounded-xl hover:bg-wa-secondary/30 transition-all duration-150 active:scale-95"><div className="w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-150" style={{ backgroundColor: `${item.color}18` }}><item.icon size={21} style={{ color: item.color }} /></div><span className="text-wa-text-muted" style={{ fontSize: '0.7rem' }}>{item.label}</span></button>
                ))}</div></div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {activeUploads.length > 0 && (
          <div className="px-3 py-2 bg-wa-header border-t border-wa-border/5">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {activeUploads.map(u => (
                <div key={u.uploadId} className="flex items-center gap-2 bg-wa-secondary/40 text-wa-text-muted px-3 py-1.5 rounded-lg border border-wa-border/10">
                  <div className="w-6 h-6 relative shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="transform -rotate-90">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                      <circle
                        cx="12" cy="12" r="10" fill="none" stroke="var(--wa-accent, #00a884)" strokeWidth="2"
                        strokeDasharray={`${2 * Math.PI * 10}`}
                        strokeDashoffset={`${2 * Math.PI * 10 * (1 - (u.progress || 0) / 100)}`}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 truncate" style={{ fontSize: '0.78rem', maxWidth: 180 }}>{u.name}</div>
                  <button onClick={() => cancelUpload(u.uploadId, u.size)} className="text-wa-text-muted hover:text-red-400 p-0.5 transition-colors duration-150" aria-label="Cancel upload">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {editingMsgId && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="bg-wa-date-bg/80 border-t border-wa-accent/20 overflow-hidden shrink-0">
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="w-0.5 h-9 bg-wa-accent rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-wa-accent font-semibold" style={{ fontSize: '0.72rem' }}>Editing message</p>
                  <p className="text-wa-text-muted truncate" style={{ fontSize: '0.78rem' }}>{editingText}</p>
                </div>
                <button onClick={cancelEditing} className="text-wa-text-muted hover:text-wa-primary p-1.5 rounded-full hover:bg-wa-secondary/50 transition-colors duration-150 shrink-0" aria-label="Cancel editing"><X size={16} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pendingMedia && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="bg-wa-header border-t border-wa-border/10 overflow-hidden shrink-0">
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="w-0.5 h-9 bg-wa-accent rounded-full shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  {pendingMedia.previewUrl ? (
                    pendingMedia.type === 'image' ? (
                      <img src={pendingMedia.previewUrl} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
                    ) : pendingMedia.type === 'video' ? (
                      <video src={pendingMedia.previewUrl} className="w-12 h-12 rounded-lg object-cover" muted />
                    ) : pendingMedia.type === 'audio' ? (
                      <div className="w-12 h-12 rounded-lg bg-wa-accent/15 flex items-center justify-center"><Mic size={20} className="text-wa-accent" /></div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-wa-accent/15 flex items-center justify-center"><FileText size={20} className="text-wa-accent" /></div>
                    )
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-wa-accent/15 flex items-center justify-center"><FileText size={20} className="text-wa-accent" /></div>
                  )}
                  <div className="min-w-0">
                    <p className="text-wa-primary truncate font-medium" style={{ fontSize: '0.82rem' }}>
                      {pendingMedia.type === 'image' ? '📷 Photo' : pendingMedia.type === 'video' ? '🎥 Video' : pendingMedia.type === 'audio' ? '🎵 Audio' : `📎 ${pendingMedia.file.name}`}
                    </p>
                    <p className="text-wa-text-muted" style={{ fontSize: '0.7rem' }}>{formatBytes(pendingMedia.file.size)}</p>
                  </div>
                </div>
                <button onClick={handleCancelPendingMedia} className="text-wa-text-muted hover:text-wa-primary p-1.5 rounded-full hover:bg-wa-secondary/50 transition-colors duration-150 shrink-0" aria-label="Cancel"><X size={16} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isSelectionMode && <div className="relative flex items-end gap-2 px-3 py-2.5 bg-wa-header shrink-0 border-t border-wa-border/5">
          {sendError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute bottom-full left-0 right-0 px-3 py-2 bg-red-600/90 text-white text-sm flex items-center justify-between"
              role="alert" aria-live="assertive"
            >
              <span>{sendError}</span>
              <button onClick={() => setSendError(null)} className="ml-2 text-white/80 hover:text-white" aria-label="Dismiss error">✕</button>
            </motion.div>
          )}
          {queuedMessages > 0 && !sendError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute bottom-full left-0 right-0 px-3 py-2 bg-amber-600/90 text-white text-sm"
              role="status" aria-live="polite"
            >
              <span>{queuedMessages} message{queuedMessages > 1 ? 's' : ''} queued — will send when online</span>
            </motion.div>
          )}
          <div className="flex items-end gap-1.5 flex-1 bg-wa-secondary/50 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-wa-border/5 transition-all duration-200 focus-within:shadow-[0_0_0_1px_rgba(77,145,251,0.15)]">
            {!editingMsgId && <button onClick={() => { setShowEmojiPicker(v => !v); setShowAttachSheet(false); }} className={`transition-colors duration-150 shrink-0 mb-0.5 p-1 rounded-full hover:bg-wa-secondary/60 ${showEmojiPicker ? 'text-wa-accent' : 'text-wa-header-icon hover:text-wa-primary'}`} aria-label={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'} aria-expanded={showEmojiPicker}><Smile size={20} /></button>}
            <textarea
              ref={inputRef}
              value={editingMsgId ? editingText : text}
              onChange={e => {
                if (editingMsgId) {
                  setEditingText(e.target.value);
                } else {
                  setText(e.target.value);
                  if (contact?.isGroup) {
                    typingService.setGroupTyping(chatId!, currentUser?.userId || '', true);
                  } else {
                    typingService.setTyping(currentUser?.userId || '', contact?.id || '', true);
                  }
                }
              }}
              onBlur={() => {
                if (!editingMsgId) {
                  if (contact?.isGroup) {
                    typingService.setGroupTyping(chatId!, currentUser?.userId || '', false);
                  } else {
                    typingService.setTyping(currentUser?.userId || '', contact?.id || '', false);
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={editingMsgId ? 'Edit message' : 'Message'} rows={1}
              className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/40 resize-none py-0.5 max-h-32 overflow-y-auto"
              style={{ fontSize: '0.9rem', lineHeight: '1.4' }}
              aria-label="Type a message"
            />
            {!editingMsgId && !text && <button onClick={() => { setShowAttachSheet(v => !v); setShowLinkInput(false); setShowEmojiPicker(false); }} className={`transition-colors duration-150 shrink-0 p-1 rounded-full hover:bg-wa-secondary/60 ${showAttachSheet ? 'text-wa-accent' : 'text-wa-header-icon hover:text-wa-primary'}`} aria-label={showAttachSheet ? 'Close attachments' : 'Attach file'} aria-expanded={showAttachSheet}><Paperclip size={20} /></button>}
            {!editingMsgId && !text && <button onClick={() => { cameraInputRef.current?.click(); }} className="text-wa-header-icon hover:text-wa-primary transition-colors duration-150 shrink-0 p-1 rounded-full hover:bg-wa-secondary/60" aria-label="Take photo or record video"><Camera size={20} /></button>}
          </div>
          <AnimatePresence mode="wait">
            {editingMsgId ? (
              <motion.button key="confirm" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', damping: 20, stiffness: 400 }} onClick={handleEditSend} className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 shadow-[0_2px_8px_rgba(77,145,251,0.25)] active:scale-90 ${!editingText.trim() ? 'bg-wa-accent/40 cursor-not-allowed' : 'bg-wa-accent hover:bg-wa-accent/90'}`} disabled={!editingText.trim()} aria-label="Confirm edit"><Check size={20} className="text-white" /></motion.button>
            ) : pendingMedia ? <motion.button key="sendMedia" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', damping: 20, stiffness: 400 }} onClick={handleSendPendingMedia} disabled={isLoading} className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 shadow-[0_2px_8px_rgba(77,145,251,0.25)] active:scale-90 ${isLoading ? 'bg-wa-accent/40 cursor-not-allowed' : 'bg-wa-accent hover:bg-wa-accent/90'}`} aria-label="Send media"><Send size={18} className="text-white ml-0.5" /></motion.button>
            : text ? <motion.button key="send" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', damping: 20, stiffness: 400 }} onClick={handleSend} disabled={isLoading} className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 shadow-[0_2px_8px_rgba(77,145,251,0.25)] active:scale-90 ${isLoading ? 'bg-wa-accent/40 cursor-not-allowed' : 'bg-wa-accent hover:bg-wa-accent/90'}`} aria-label="Send message"><Send size={18} className="text-white ml-0.5" /></motion.button>
            : <motion.button key="mic" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', damping: 20, stiffness: 400 }} onClick={() => startAudioRecording()} className="w-11 h-11 bg-wa-accent rounded-full flex items-center justify-center shrink-0 hover:bg-wa-accent/90 transition-all duration-200 shadow-[0_2px_8px_rgba(77,145,251,0.25)] active:scale-90" aria-label="Record voice message"><Mic size={18} className="text-white" /></motion.button>}
          </AnimatePresence>
        </div>}
      </div>

      <AnimatePresence>
        {contactInfoOpen && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.25, ease: 'easeInOut' }} className="absolute inset-0 z-50 bg-wa-secondary">
            <ContactInfo contactId={contact.id} chatId={chatId!} onClose={() => setContactInfoOpen(false)} onSearchChat={openSearch} />
          </motion.div>
        )}

        {/* ── Disappearing Messages Timer Sheet ── */}
        {showTimerSheet && chatId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-end justify-center bg-black/40"
            onClick={() => setShowTimerSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full bg-wa-menu-bg rounded-t-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Timer size={20} className="text-wa-accent" />
                  <h3 className="text-wa-primary font-bold" style={{ fontSize: '1.1rem' }}>Disappearing messages</h3>
                </div>
                <button onClick={() => setShowTimerSheet(false)} className="text-wa-text-muted p-1" aria-label="Close disappearing messages settings"><X size={20} /></button>
              </div>
              <p className="text-wa-text-muted mb-4" style={{ fontSize: '0.85rem' }}>
                When enabled, new messages in this chat will disappear after the selected time.
              </p>
              {(() => {
                const currentTtl = disappearingTimers[chatId] || 0;
                return [
                  { label: 'Off', value: 0 },
                  { label: '1 hour', value: 3600 },
                  { label: '24 hours', value: 86400 },
                  { label: '7 days', value: 604800 },
                  { label: '90 days', value: 7776000 },
                ].map(option => {
                  const isSelected = option.value === currentTtl;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        if (chatId) setDisappearingTimer(chatId, option.value);
                        setShowTimerSheet(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl mb-1 transition-colors ${isSelected ? 'bg-wa-accent/15 text-wa-accent' : 'text-wa-primary hover:bg-wa-secondary/50'}`}
                    >
                      <span style={{ fontSize: '0.95rem', fontWeight: isSelected ? 600 : 400 }}>{option.label}</span>
                      {isSelected && <Check size={18} className="text-wa-accent" />}
                    </button>
                  );
                });
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Sheet ── */}
      <AnimatePresence>
        {showDeleteSheet && deleteTargetId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-end justify-center bg-black/40"
            onClick={() => { setShowDeleteSheet(false); setDeleteTargetId(null); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full bg-wa-menu-bg rounded-t-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Trash2 size={20} className="text-red-400" />
                  <h3 className="text-wa-primary font-bold" style={{ fontSize: '1.1rem' }}>Delete message?</h3>
                </div>
                <button onClick={() => { setShowDeleteSheet(false); setDeleteTargetId(null); }} className="text-wa-text-muted p-1" aria-label="Close"><X size={20} /></button>
              </div>
              {(() => {
                const targetMsg = chatMessages.find(m => m.id === deleteTargetId);
                const myId = currentUser?.userId || 'me';
                const isOwnMessage = targetMsg?.senderId === myId;
                return (
                  <>
                    {targetMsg && (
                      <p className="text-wa-text-muted mb-4 truncate" style={{ fontSize: '0.85rem' }}>
                        {targetMsg.content || (targetMsg.type === 'image' ? '📷 Photo' : targetMsg.type === 'video' ? '🎥 Video' : 'Message')}
                      </p>
                    )}
                    <button
                      onClick={() => {
                        if (chatId && deleteTargetId) deleteMessageForMe(chatId, deleteTargetId);
                        setShowDeleteSheet(false);
                        setDeleteTargetId(null);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl mb-1 text-wa-primary hover:bg-wa-secondary/50 transition-colors"
                    >
                      <span style={{ fontSize: '0.95rem' }}>Delete for me</span>
                      <Trash2 size={18} className="text-wa-text-muted" />
                    </button>
                    {isOwnMessage && (
                      <button
                        onClick={() => {
                          if (chatId && deleteTargetId) deleteMessage(chatId, deleteTargetId);
                          setShowDeleteSheet(false);
                          setDeleteTargetId(null);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl mb-1 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>Delete for everyone</span>
                        <Trash2 size={18} className="text-red-400" />
                      </button>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Forward Chat Picker Sheet ── */}
      <AnimatePresence>
        {showForwardSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-end justify-center bg-black/40"
            onClick={() => setShowForwardSheet(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full bg-wa-menu-bg rounded-t-2xl max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 pb-3">
                <div className="flex items-center gap-2">
                  <Forward size={20} className="text-wa-accent" />
                  <h3 className="text-wa-primary font-bold" style={{ fontSize: '1.1rem' }}>Forward to</h3>
                </div>
                <button onClick={() => setShowForwardSheet(false)} className="text-wa-text-muted p-1" aria-label="Close"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {chats.map(c => {
                  const cContact = contacts.find(ct => ct.id === c.contactId);
                  if (!cContact) return null;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleForwardSelected(c.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-wa-secondary/50 transition-colors"
                    >
                      <Avatar src={cContact.avatar} name={cContact.name} color={cContact.avatarColor} size={42} />
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-wa-primary truncate" style={{ fontSize: '0.92rem', fontWeight: 500 }}>{cContact.name}</p>
                        <p className="text-wa-text-muted truncate" style={{ fontSize: '0.75rem' }}>{c.lastMessage || 'Start conversation'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatDateSep(timestamp: any): string {
  let date: Date;
  if (typeof timestamp?.toDate === 'function') {
    date = timestamp.toDate();
  } else if (typeof timestamp?.seconds === 'number') {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86400000);

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, contact, contacts, showAvatar, showSenderName, isGroup, onReply, isSearchHighlight, isSearchActive, onImageClick, onVideoClick, onContextMenu, isConsecutive, uploadProgress, isSelectionMode, isSelected, onToggleSelection, onLongPress }: {
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
  onVideoClick?: (url: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isConsecutive?: boolean;
  uploadProgress?: number;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  onLongPress?: () => void;
}) {
  const { currentUser } = useApp();
  const isMe = message.senderId === 'me' || message.senderId === currentUser?.userId;
  const isSystem = message.senderId === 'system';
  const senderContact = !isMe && !isSystem && isGroup ? contacts.find((c: any) => c.id === message.senderId) : null;
  const displayContact = senderContact || contact;

  const x = useMotionValue(0);
  const swipeOpacity = useTransform(x, [0, 40], [0, 1]);
  const swipeScale = useTransform(x, [0, 40], [0.5, 1]);
  const rotateZ = useTransform(x, [0, 40], [0, 8]);
  const [swipeTriggered, setSwipeTriggered] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handlePointerDown = () => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress?.();
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x > 35 && !swipeTriggered) {
      setSwipeTriggered(true);
      onReply(message);
      if (navigator.vibrate) navigator.vibrate(40);
      setTimeout(() => setSwipeTriggered(false), 500);
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-start gap-1.5 bg-wa-date-bg/80 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm">
          <Lock size={10} className="text-wa-text-muted mt-0.5 shrink-0 opacity-70" />
          <p className="text-wa-text-muted text-center leading-snug" style={{ fontSize: '0.7rem' }}>{message.content}</p>
        </div>
      </div>
    );
  }

  const isImage = message.type === 'image';
  const isImageOnly = isImage && !message.content && !message.replyToContent && !showSenderName;
  const isVideoOnly = message.type === 'video' && !message.content && !message.replyToContent && !showSenderName;
  const isMediaOnly = isImageOnly || isVideoOnly;

  return (
    <div
      className={`flex items-end gap-1 ${isConsecutive ? 'mb-1' : 'mb-2'} relative group overflow-hidden ${isMe ? 'justify-end' : 'justify-start'}`}
      onContextMenu={onContextMenu}
    >
      {/* Swipe Reply Visual */}
      <motion.div
        style={{ opacity: swipeOpacity, scale: swipeScale, rotate: rotateZ }}
        className="absolute -left-8 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-wa-accent shadow-md"
      >
        <Reply size={14} className="text-white" />
      </motion.div>

      {isSelectionMode && (
        <div className="w-6 shrink-0 self-center flex items-center justify-center mb-1">
          <div
            onClick={(e) => { e.stopPropagation(); onToggleSelection?.(); }}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${isSelected ? 'bg-wa-accent border-wa-accent' : 'border-wa-text-muted/40'}`}
          >
            {isSelected && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}

      {!isMe && isGroup && (
        <div className="w-7 shrink-0 self-end mb-0.5">
          {showAvatar && <Avatar src={displayContact.avatar} name={displayContact.name} color={displayContact.avatarColor} size={28} />}
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
      <motion.div
        id={`msg-${message.id}`}
        drag={isSelectionMode ? false : "x"}
        dragConstraints={{ left: -60, right: 0 }}
        dragElastic={0.4}
        dragSnapToOrigin
        transition={{ type: 'spring', damping: 20, stiffness: 300, mass: 0.8 }}
        onDrag={isSelectionMode ? undefined : ((_: any, info: any) => x.set(info.offset.x))}
        onDragEnd={isSelectionMode ? undefined : handleDragEnd}
        onPointerDown={isSelectionMode ? undefined : handlePointerDown}
        onPointerUp={isSelectionMode ? undefined : handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={isSelectionMode ? (e) => { e.stopPropagation(); onToggleSelection?.(); } : undefined}
        initial={{ opacity: 0, x: isMe ? 40 : -40, scale: 0.92 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        whileTap={{ scale: 0.995 }}
        className={`relative rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-shadow duration-200 overflow-hidden break-words ${isMediaOnly ? 'p-0' : 'px-3 py-1.5'} ${isMe ? 'bg-wa-bubble-self text-wa-primary' : 'bg-wa-bubble-other text-wa-primary'} ${isSelected ? 'ring-2 ring-wa-accent bg-blue-500/10' : isSearchActive ? 'ring-2 ring-wa-accent' : isSearchHighlight ? 'ring-1 ring-wa-accent/40' : ''}`}
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        {!isMediaOnly && (isMe ? <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[7px] border-l-transparent border-b-[7px] border-b-wa-bubble-self translate-x-1.5" /> : <div className="absolute bottom-0 left-0 w-0 h-0 border-r-[7px] border-r-transparent border-b-[7px] border-b-wa-bubble-other -translate-x-1.5" />)}
        
        {showSenderName && senderContact && <p style={{ fontSize: '0.78rem', fontWeight: 600, color: senderContact.avatarColor, marginBottom: '2px' }}>{senderContact.name}</p>}

        {message.replyToId && (
          <div className={`mb-1 px-2 py-1.5 rounded-lg border-l-[2.5px] border-wa-accent ${isMe ? 'bg-wa-accent/10' : 'bg-wa-secondary/30'}`}>
            <p className="text-wa-accent font-semibold" style={{ fontSize: '0.7rem' }}>{message.replyToSender || 'Unknown'}</p>
            <p className="text-[#aebac1] truncate leading-snug" style={{ fontSize: '0.75rem' }}>{getReplyPreviewText(message)}</p>
          </div>
        )}

        {isImage && message.imageUrl && (
          <div className={`relative overflow-hidden ${isImageOnly ? (isMe ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm') : 'rounded-xl mt-0.5'}`} style={isImageOnly ? {} : { maxWidth: '240px' }} onClick={() => onImageClick?.(message.imageUrl!)}>
            <LocalMedia fileId={message.imageUrl} mediaType="image" senderId={message.senderId} contactId={contact.id} isImageOnly={isImageOnly} message={message} isMe={isMe} />
          </div>
        )}
        
        {isImage && message.content && <p className="text-wa-primary leading-relaxed mt-1" style={{ fontSize: '0.88rem', paddingRight: '68px' }}>{message.content}</p>}

        {message.type === 'document' && (() => {
          const filename = message.content.replace('📎 ', '');
          return (
            <div className="flex items-center gap-2.5 py-0.5 cursor-pointer group" style={{ minWidth: '200px', maxWidth: '260px' }} onClick={async (e) => {
              e.stopPropagation();
              if (!message.imageUrl || !currentUser) return;
              const target = e.currentTarget;
              const label = target.querySelector('.doc-label');
              if (label) label.textContent = 'Opening...';
              try {
                const otherParty = isMe ? contact.id : message.senderId;
                const { retrieveDecryptedMedia } = await import('../../utils/encryptedChunkedMedia');
                const result = await retrieveDecryptedMedia(message.imageUrl, currentUser.userId, otherParty);
                const ext = filename.split('.').pop()?.toLowerCase() || '';
                const mimeMap: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', zip: 'application/zip', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
                const mime = mimeMap[ext] || 'application/octet-stream';
                const blob = new Blob([result.data.buffer as ArrayBuffer], { type: mime });
                const url = URL.createObjectURL(blob);
                if (ext === 'pdf' || ext === 'txt') {
                  window.open(url, '_blank');
                } else {
                  const a = document.createElement('a');
                  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
                  setTimeout(() => a.remove(), 200);
                }
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              } catch (err) {
                console.warn('⚠️ Failed to open document:', err);
                if (label) label.textContent = 'Failed to open';
                setTimeout(() => { if (label) label.textContent = 'Tap to open'; }, 3000);
              }
            }}>
              <div className="w-10 h-10 bg-wa-accent/15 rounded-xl flex items-center justify-center shrink-0"><FileText size={18} className="text-wa-accent" /></div>
              <div className="min-w-0 flex-1"><p className="text-wa-primary truncate font-medium" style={{ fontSize: '0.82rem' }}>{filename}</p><p className="text-wa-text-muted mt-0.5 uppercase tracking-wide doc-label" style={{ fontSize: '0.65rem' }}>Tap to open</p></div>
              <Download size={15} className="text-wa-text-muted shrink-0" />
            </div>
          );
        })()}

        {message.type === 'video' && message.imageUrl && (
            <div className={`relative overflow-hidden ${isVideoOnly ? (isMe ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm') : 'rounded-xl mt-0.5'}`} style={isVideoOnly ? {} : { maxWidth: '240px' }} onClick={() => onVideoClick?.(message.imageUrl!)}>
              <LocalMedia fileId={message.imageUrl} mediaType="video" senderId={message.senderId} contactId={contact.id} isImageOnly={isVideoOnly} message={message} isMe={isMe} onVideoClick={onVideoClick} />
            </div>
        )}

        {message.type === 'video' && message.content && <p className="text-wa-primary leading-relaxed mt-1" style={{ fontSize: '0.88rem', paddingRight: '68px' }}>{message.content}</p>}

        {message.type === 'audio' && message.imageUrl && (
          <div className="flex items-center gap-2.5 py-1" style={{ minWidth: '200px', maxWidth: '260px' }}>
            <div className="w-10 h-10 bg-wa-accent/15 rounded-xl flex items-center justify-center shrink-0"><Mic size={18} className="text-wa-accent" /></div>
            <LocalMedia fileId={message.imageUrl} mediaType="audio" senderId={message.senderId} contactId={contact.id} isImageOnly={false} message={message} isMe={isMe} />
          </div>
        )}

        {message.type === 'audio' && message.content && <p className="text-wa-primary leading-relaxed mt-1" style={{ fontSize: '0.88rem', paddingRight: '68px' }}>{message.content}</p>}

        {message.type === 'sticker' && (
          <div className="flex items-center justify-center py-1">
            <span className="text-6xl leading-none select-none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>{message.content}</span>
          </div>
        )}

        {message.type === 'link' && (
          <a href={sanitizeUrl(message.linkUrl)} target="_blank" rel="noopener noreferrer" className="block" onClick={e => e.stopPropagation()}>
            <div className={`rounded-xl overflow-hidden border transition-colors duration-200 ${isMe ? 'border-wa-accent/25 hover:border-wa-accent/40' : 'border-wa-border/60 hover:border-wa-border'}`}>
              <div className={`px-3 py-2 flex items-center gap-2 ${isMe ? 'bg-wa-accent/8' : 'bg-wa-secondary/40'}`}><ExternalLink size={13} className="text-wa-accent shrink-0" /><div className="min-w-0"><p className="text-wa-primary truncate font-medium" style={{ fontSize: '0.82rem' }}>{message.linkTitle || message.linkUrl}</p><p className="text-wa-text-muted truncate" style={{ fontSize: '0.7rem' }}>{message.linkDomain || message.linkUrl}</p></div></div>
              <div className="px-3 py-1.5"><p className="text-wa-read truncate" style={{ fontSize: '0.75rem' }}>{message.linkUrl}</p></div>
            </div>
          </a>
        )}

        {message.type === 'text' && message.content !== '[Deleted]' && (
          <p className="text-wa-primary leading-relaxed" style={{ fontSize: '0.88rem', paddingRight: '68px' }}>
            {message.content}
            {message.isEdited && <span className="text-wa-text-muted ml-1 italic" style={{ fontSize: '0.72rem' }}>(edited)</span>}
          </p>
        )}

        {message.content === '[Deleted]' && (
          <p className="text-wa-text-muted italic leading-relaxed" style={{ fontSize: '0.85rem' }}>{message.content}</p>
        )}

        {/* Reaction Display */}

        {/* Info row */}
        {!(isMediaOnly) && message.content !== '[Deleted]' && (
          <div className={`flex items-center gap-1 whitespace-nowrap justify-end ${(!isMediaOnly && message.type !== 'document' && message.type !== 'link') ? 'mt-0.5' : ''}`}>
            <span className="text-wa-text-muted" style={{ fontSize: '0.62rem' }}>{toTimeStr(message.timestamp)}</span>
            {isMe && (
              <>
                {message.status === 'sent' && <Check size={12} className="text-wa-text-muted" />}
                {message.status === 'delivered' && <CheckCheck size={12} className="text-wa-text-muted" />}
                {message.status === 'read' && <CheckCheck size={12} className="text-wa-read" />}
              </>
            )}
            {message.isStarred && <Star size={11} className="text-wa-star fill-wa-star" />}
          </div>
        )}

        {uploadProgress !== undefined && uploadProgress < 100 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl z-10">
            <div className="relative w-14 h-14">
              <svg width="56" height="56" viewBox="0 0 56 56" className="transform -rotate-90">
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                <circle
                  cx="28" cy="28" r="24" fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - uploadProgress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-semibold" style={{ fontSize: '0.7rem' }}>{Math.round(uploadProgress)}%</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Reaction bubble — WhatsApp-style */}
      {message.reactions && message.reactions.length > 0 && (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} -mt-1 mb-0.5`}>
          <div className="flex items-center bg-wa-menu-bg border border-wa-border/40 rounded-full px-2 py-0.5 shadow-sm">
            {message.reactions.map((r, i) => <span key={i} className="text-base leading-none">{r.emoji}</span>)}
            {message.reactions.length > 1 && <span className="text-[10px] text-wa-text-muted font-bold ml-1">{message.reactions.length}</span>}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Reply Preview Helpers ────────────────────────────────────────────────────

/** Get a human-readable preview string for a message (used in reply previews) */
export function getMessagePreview(msg: Message): string {
  switch (msg.type) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎵 Audio';
    case 'document':
      return msg.content || '📎 Document';
    case 'link':
      return '🔗 ' + (msg.linkTitle || msg.linkUrl || msg.content);
    case 'text':
    default:
      return msg.content || '';
  }
}

/** Get preview text for a reply-quoted message (from stored reply metadata) */
export function getReplyPreviewText(message: Message): string {
  // If we have the full reply content, use type-aware formatting
  if (message.replyToContent) {
    switch (message.type) {
      case 'image':
        return '📷 Photo';
      case 'video':
        return '🎥 Video';
      case 'audio':
        return '🎵 Audio';
      case 'document':
        return message.replyToContent || '📎 Document';
      case 'link':
        return '🔗 ' + message.replyToContent;
      default:
        return message.replyToContent;
    }
  }
  // Fallback: derive from the replyToId presence
  return 'Message';
}

function LocalMedia({ fileId, mediaType, senderId, contactId, isImageOnly, message, isMe, onVideoClick }: any) {
  const { currentUser } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;
    if (fileId.startsWith('data:') || fileId.startsWith('blob:')) { setUrl(fileId); setLoading(false); return; }
    let cancelled = false;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2500;
    const resolve = async (attempt = 0) => {
      if (!currentUser || cancelled) return;
      const otherParty = (isMe || senderId === currentUser.userId) ? contactId : senderId;
      try {
        const decryptedUrl = await loadMediaWithCache(fileId, mediaType, currentUser.userId, otherParty);
        if (!cancelled) setUrl(decryptedUrl);

        // Trigger Cloudinary cleanup after successful local cache
        if (message.totalChunks && message.totalChunks > 0) {
          import('../../utils/chunkRelayCleanup').then(({ confirmAndCleanup }) => {
            confirmAndCleanup(fileId, message.totalChunks, currentUser.userId).catch(() => {});
          }).catch(() => {});
        }
      } catch (err) {
        // Race condition: sender's Cloudinary upload may not have completed yet.
        // Retry after a short delay to wait for upload propagation.
        if (attempt < MAX_RETRIES && !cancelled) {
          console.log(`🔄 Media not available yet (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`);
          setTimeout(() => resolve(attempt + 1), RETRY_DELAY_MS);
          return; // Don't setLoading(false) yet — still retrying
        }
        console.warn('⚠️ Media resolution failed after retries:', err);
      } finally { if (!cancelled) setLoading(false); }
    };
    resolve();
    return () => { cancelled = true; };
  }, [fileId, currentUser, isMe, contactId, senderId, mediaType]);

  useEffect(() => {
    if (mediaType !== 'video' || !url) return;
    let cancelled = false;
    try {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.preload = 'metadata';
      video.currentTime = 0.1;
      video.onloadeddata = () => {
        if (cancelled) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            if (!cancelled) setThumbnailUrl(dataUrl);
          }
        } catch { /* thumbnail extraction failed, show placeholder */ }
      };
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [url, mediaType]);

  if (loading) return <div className="w-full flex items-center justify-center bg-wa-secondary" style={{ height: '200px' }}><div className="w-8 h-8 rounded-full border-2 border-wa-accent border-t-transparent animate-spin" /></div>;
  if (!url) return <div className="w-full flex flex-col items-center justify-center bg-wa-secondary gap-2" style={{ height: '200px' }}><Image size={32} className="text-wa-text-muted" /><p className="text-wa-text-muted" style={{ fontSize: '0.7rem' }}>Failed to load media</p></div>;

  return (
    <>
      {mediaType === 'video' ? (
        <div className="relative cursor-pointer" onClick={() => onVideoClick?.(url)}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="Video" className="w-full block" style={{ maxHeight: '320px', minHeight: '120px', objectFit: 'cover', backgroundColor: '#000' }} />
          ) : (
            <div className="w-full flex items-center justify-center bg-black" style={{ height: '200px' }}>
              <Video size={32} className="text-white/50" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <div className="w-0 h-0 border-l-[18px] border-l-white border-t-[11px] border-t-transparent border-b-[11px] border-b-transparent ml-1.5" />
            </div>
          </div>
          <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-0.5">
            <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.92)' }}>{toTimeStr(message.timestamp)}</span>
            {isMe && (
              <>
                {message.status === 'sent' && <Check size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
                {message.status === 'delivered' && <CheckCheck size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
                {message.status === 'read' && <CheckCheck size={11} className="text-wa-read" />}
              </>
            )}
          </div>
        </div>
      ) : mediaType === 'audio' ? (
        <audio src={url} controls preload="metadata" className="w-full" style={{ height: '36px' }} />
      ) : (
        <img src={url} alt="Shared image" className="w-full block" style={{ maxHeight: isImageOnly ? '320px' : '220px', minHeight: '120px', objectFit: 'cover', cursor: 'pointer' }} />
      )}
      {isImageOnly && mediaType !== 'video' && mediaType !== 'audio' && (
        <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-0.5">
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.92)' }}>{toTimeStr(message.timestamp)}</span>
          {isMe && (
            <>
              {message.status === 'sent' && <Check size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
              {message.status === 'delivered' && <CheckCheck size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />}
              {message.status === 'read' && <CheckCheck size={11} className="text-wa-read" />}
            </>
          )}
        </div>
      )}

    </>
  );
}

// ─── StickerPicker ────────────────────────────────────────────────────────────

function StickerPicker({ onSelect, onClose }: { onSelect: (sticker: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState(Object.keys(STICKER_CATEGORIES)[0]);
  const categories = Object.keys(STICKER_CATEGORIES);

  return (
    <div className="bg-wa-header border-t border-wa-border/10">
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="text-wa-primary font-semibold" style={{ fontSize: '0.9rem' }}>Stickers</h3>
        <button onClick={onClose} className="text-wa-text-muted hover:text-wa-primary p-1 rounded-full transition-colors duration-150" aria-label="Close sticker picker"><X size={18} /></button>
      </div>
      <div className="flex gap-1 px-3 pb-2 overflow-x-auto no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-150 ${activeCategory === cat ? 'bg-wa-accent text-white font-semibold' : 'bg-wa-secondary/50 text-wa-text-muted hover:bg-wa-secondary/80'}`}
            style={{ fontSize: '0.72rem' }}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="px-3 pb-3 h-48 overflow-y-auto">
        <div className="grid grid-cols-6 gap-1">
          {STICKER_CATEGORIES[activeCategory]?.map((sticker, i) => (
            <button
              key={`${activeCategory}-${i}`}
              onClick={() => onSelect(sticker)}
              className="w-full aspect-square flex items-center justify-center text-3xl rounded-xl hover:bg-wa-secondary/40 active:scale-90 transition-all duration-150"
            >
              {sticker}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}