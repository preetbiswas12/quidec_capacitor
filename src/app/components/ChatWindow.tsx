import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, Video, MoreVertical, Smile, Paperclip,
  Mic, Send, CheckCheck, Check, Lock, FileText, Camera,
  X, Reply, Link, Image, MapPin, User, File, MessageSquare,
  ExternalLink, ChevronDown, ChevronUp, Download, Share2, Save, Star,
  Clock, Timer, Edit3, Trash2
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
import { compressImage, formatBytes } from '../../utils/imageCompression';
import { messageQueue } from '../../utils/persistentMessageQueue';
import { sanitizeUrl } from '../../utils/sanitize';
import { toast } from 'sonner';
import { idbPaginator } from '../../utils/idbPaginator';
import { typingService } from '../../utils/firebaseServices';

const EMOJI_LIST = [
  '😀','😂','😊','😍','🥰','😜','😭','🥺','🤔','👍','❤️','🔥','✨','🙏','✅'
];

export default function ChatWindow() {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    chats, contacts, messages, sendMessage, typingContacts, isOffline, isReconnecting, syncProgress,
    setActiveChatId, contactInfoOpen, setContactInfoOpen,
    replyTo, setReplyTo, reactToMessage, clearChat,
    deleteMessage, addMessagesToChat, toggleStarMessage, editMessage, currentUser,
    setDisappearingTimer, isDisappearingActive, getDisappearingRemaining, disappearingTimers
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
  const [activeUploads, setActiveUploads] = useState<Array<{ uploadId: string; name: string; size: number }>>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [showTimerSheet, setShowTimerSheet] = useState(false);
  
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
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
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
      
      await sendMessage(chatId, validatedText, 'text', extra);
      setText('');
      setReplyTo(null);
      setShowEmojiPicker(false);
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

    try {
      // Priority 3: Media Validation - validate image before upload
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

      const uploadId = `upload_${Date.now()}`;
      const abortController = new AbortController();
      mediaValidator.registerUpload(uploadId, abortController, compressedFile.size);
      setActiveUploads(prev => [...prev, { uploadId, name: compressedFile.name, size: compressedFile.size }]);

      try {
        const imageExtra: Partial<Message> = replyTo
          ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
          : {};
        await sendMessage(chatId, '', 'image', imageExtra, compressedFile);
      } finally {
        try {
          mediaValidator.unregisterUpload(uploadId, compressedFile.size);
        } catch (err) {
          console.warn('Failed to unregister upload:', err);
        }
        setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
      }

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
      setActiveUploads(prev => [...prev, { uploadId, name: file.name, size: file.size }]);

      try {
        const docExtra: Partial<Message> = replyTo
          ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
          : {};
        await sendMessage(chatId, `📎 ${file.name}`, 'document', docExtra, file);
      } finally {
        try {
          mediaValidator.unregisterUpload(uploadId, file.size);
        } catch (err) {
          console.warn('Failed to unregister upload:', err);
        }
        setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
      }

      setShowAttachSheet(false);
      e.target.value = '';
    } catch (error: any) {
      setSendError(error.message || 'Failed to process document');
      setTimeout(() => setSendError(null), 4000);
      console.error('Document processing error:', error);
    }
  };

  // ─── Video Recording ──────────────────────────────────────────────────────

  const startVideoRecording = async () => {
    if (!chatId) return;
    try {
      // Request camera + microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      recordingStreamRef.current = stream;
      recordedChunksRef.current = [];

      let mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }
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
        setIsRecordingVideo(false);
        setRecordingDuration(0);

        if (blob.size === 0) return;

        // @ts-ignore — File constructor 3-arg overload exists in all target browsers but TS DOM lib lacks it
        const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });

        // Validate
        const validation = await mediaValidator.validateFile(file, 'video');
        if (!validation.valid) {
          setSendError(validation.error || 'Invalid video');
          setTimeout(() => setSendError(null), 4000);
          return;
        }

        const uploadId = `upload_${Date.now()}`;
        const abortController = new AbortController();
        mediaValidator.registerUpload(uploadId, abortController, file.size);
        setActiveUploads(prev => [...prev, { uploadId, name: file.name, size: file.size }]);

        try {
          const videoExtra: Partial<Message> = replyTo
            ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
            : {};
          await sendMessage(chatId, '🎥 Video', 'video', videoExtra, file);
          setShowAttachSheet(false);
        } catch (err: any) {
          setSendError(err.message || 'Failed to send video');
          setTimeout(() => setSendError(null), 4000);
        } finally {
          try { mediaValidator.unregisterUpload(uploadId, file.size); } catch { /* ignore */ }
          setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
        }
      };

      mediaRecorder.start(1000);
      setIsRecordingVideo(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => {
          if (d >= 59) {
            // Auto-stop at 60s
            stopVideoRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);
      setShowAttachSheet(false);
    } catch (err: any) {
      console.error('❌ Video recording failed:', err);
      setSendError('Camera access denied. Please enable camera permissions.');
      setTimeout(() => setSendError(null), 4000);
    }
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

        // @ts-ignore — File constructor 3-arg overload exists in all target browsers but TS DOM lib lacks it
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });

        const validation = await mediaValidator.validateFile(file, 'audio');
        if (!validation.valid) {
          setSendError(validation.error || 'Invalid audio');
          setTimeout(() => setSendError(null), 4000);
          return;
        }

        const uploadId = `upload_${Date.now()}`;
        const abortController = new AbortController();
        mediaValidator.registerUpload(uploadId, abortController, file.size);
        setActiveUploads(prev => [...prev, { uploadId, name: file.name, size: file.size }]);

        try {
          const audioExtra: Partial<Message> = replyTo
            ? { replyToId: replyTo.id, replyToContent: getMessagePreview(replyTo), replyToSender: replyTo.senderId === 'me' ? 'You' : contact?.name }
            : {};
          await sendMessage(chatId, '🎵 Audio', 'audio', audioExtra, file);
          setShowAttachSheet(false);
        } catch (err: any) {
          setSendError(err.message || 'Failed to send audio');
          setTimeout(() => setSendError(null), 4000);
        } finally {
          try { mediaValidator.unregisterUpload(uploadId, file.size); } catch { /* ignore */ }
          setActiveUploads(prev => prev.filter(u => u.uploadId !== uploadId));
        }
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
    { label: 'Mute notifications', action: () => { setShowHeaderMenu(false); alert('Notifications for this chat will be muted for 8 hours.'); } },
    { label: 'Clear chat', action: () => { setShowHeaderMenu(false); clearChat(chatId!); } },
  ];

  return (
    <div className="h-full relative flex flex-col bg-wa-chat overflow-hidden transition-colors duration-200">
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.ppt,.pptx,.zip" className="hidden" onChange={handleDocumentSelect} />

      {/* Action Menu / Reaction Picker Overlay */}
      <AnimatePresence>
        {activeMenuId && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-100 bg-black/20 backdrop-blur-[2px]"
              onClick={() => setActiveMenuId(null)}
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 10 }}
              className="absolute z-101 bg-[#233138] rounded-2xl shadow-2xl p-2 min-w-50 border border-wa-border"
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
                    aria-label={`React with ${e}`}
                  >
                    {e}
                  </button>
                ))}
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
                  <Star size={18} className="text-[#f9a825]" /> {chatMessages.find(m => m.id === activeMenuId)?.isStarred ? 'Unstar' : 'Star'}
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
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium text-red-400"
                >
                  <Check size={18} /> Copy Text
                </button>
                {(() => {
                  const activeMsg = chatMessages.find(m => m.id === activeMenuId);
                  if (activeMsg?.senderId === 'me') {
                    return (
                      <button
                        role="menuitem"
                        onClick={() => {
                          if (chatId && activeMenuId) deleteMessage(chatId, activeMenuId);
                          setActiveMenuId(null);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-wa-primary text-sm font-medium text-red-400"
                      >
                        <Trash2 size={18} className="text-red-400" /> Delete
                      </button>
                    );
                  }
                  return null;
                })()}
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
              <button onClick={() => handleSaveImage(lightboxImage!)} className="text-white p-1 rounded-full hover:bg-white/10" aria-label="Download photo">
                <Download size={20} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-2" onClick={() => setLightboxImage(null)}>
              <img src={lightboxImage} alt="Full-screen photo preview" className="max-w-full max-h-full rounded-lg" style={{ objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="bg-wa-header border-b border-wa-border shrink-0 overflow-hidden pt-10"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button onClick={closeSearch} className="text-[#aebac1] p-1 shrink-0" aria-label="Close search"><ArrowLeft size={20} /></button>
                <input
                  ref={msgSearchRef} type="text" value={msgSearch} onChange={e => { setMsgSearch(e.target.value); setMsgSearchIndex(0); }}
                  placeholder="Search messages…" className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]" style={{ fontSize: '0.9rem' }}
                  aria-label="Search messages"
                />
                {msgSearch && <span className="text-wa-text-muted shrink-0" style={{ fontSize: '0.78rem' }}>{matchedMsgIds.length > 0 ? `${msgSearchIndex + 1}/${matchedMsgIds.length}` : '0/0'}</span>}
                <button onClick={() => navigateSearchResult(-1)} disabled={matchedMsgIds.length === 0} className="text-[#aebac1] p-1 disabled:opacity-30" aria-label="Previous search result"><ChevronUp size={18} /></button>
                <button onClick={() => navigateSearchResult(1)} disabled={matchedMsgIds.length === 0} className="text-[#aebac1] p-1 disabled:opacity-30" aria-label="Next search result"><ChevronDown size={18} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 px-3 py-2.5 pt-10 bg-wa-header shrink-0 border-b border-wa-border/10">
          <button onClick={handleBack} className="text-wa-header-icon hover:text-wa-primary p-1.5 rounded-full hover:bg-white/5" aria-label="Go back to chats"><ArrowLeft size={20} /></button>
          <button onClick={() => setContactInfoOpen(!contactInfoOpen)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={40} />
              {contact.isOnline && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-[#4d91fb] border-2 border-wa-header" />}
            </div>
            <div className="min-w-0 text-left">
              <p className="text-wa-primary truncate" style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.2px' }}>{contact.name}</p>
              <AnimatePresence mode="wait">
                {isTyping ? <motion.p key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[#4d91fb] font-bold" style={{ fontSize: '0.78rem' }}>typing...</motion.p>
                : <motion.p key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-wa-text-muted" style={{ fontSize: '0.78rem' }}>{contact.isGroup ? `${contact.members?.length} members` : contact.isOnline ? 'online' : contact.lastSeen}</motion.p>}
              </AnimatePresence>
              {chatId && isDisappearingActive(chatId) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Timer size={12} className="text-[#4d91fb]" />
                  <span className="text-[#4d91fb]" style={{ fontSize: '0.7rem', fontWeight: 600 }}>Disappearing messages</span>
                </div>
              )}
            </div>
          </button>
          <div className="flex items-center gap-1">
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowHeaderMenu(v => !v)} className={`p-2 rounded-full hover:bg-white/5 transition-colors ${showHeaderMenu ? 'text-wa-primary bg-white/5' : 'text-wa-header-icon hover:text-wa-primary'}`} aria-label="Chat options" aria-expanded={showHeaderMenu}><MoreVertical size={20} /></button>
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
        {(isRecordingVideo || isRecordingAudio) && (
          <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-2 flex items-center gap-3 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 flex-1" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {isRecordingVideo ? 'Recording video' : 'Recording audio'} — {formatRecordingDuration(recordingDuration)}
            </span>
            <button
              onClick={() => { stopVideoRecording(); stopAudioRecording(); }}
              className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 transition-colors"
            >
              Stop
            </button>
          </div>
        )}

        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto py-4 px-3"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E")`, backgroundColor: 'var(--wa-bg-main)' }}
          onClick={() => { setShowAttachSheet(false); setShowEmojiPicker(false); setShowHeaderMenu(false); }}
        >
          {isLoadingMessages && (
            <div className="w-full flex items-center justify-center py-2">
              <div className="h-8 w-8 rounded-full border-4 border-t-transparent border-wa-border animate-spin" />
            </div>
          )}

          {chatMessages.length === 0 && !isLoadingMessages && contact && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-8 gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-wa-secondary/40 flex items-center justify-center">
                <MessageSquare size={36} className="text-wa-text-muted opacity-40" />
              </div>
              <div>
                <p className="text-wa-primary" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {contact.isGroup ? contact.name : `Start a conversation with ${contact.name}`}
                </p>
                <p className="text-wa-text-muted mt-2" style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
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
              (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 60000);
            return (
              <React.Fragment key={msg.id}>
                {showDateSep && (
                  <div className="flex justify-center my-3">
                    <div className="bg-[#182229] rounded-lg px-3 py-1 shadow-sm">
                      <span className="text-wa-text-muted" style={{ fontSize: '0.72rem', fontWeight: 500 }}>{formatDateSep(msg.timestamp)}</span>
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
                  onContextMenu={(e) => { e.preventDefault(); setMenuPos({ x: e.clientX, y: e.clientY }); setActiveMenuId(msg.id); }}
                  isConsecutive={isConsecutive}
                />
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <AnimatePresence>
          {replyTo && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-wa-header border-t border-wa-border overflow-hidden shrink-0">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-1 h-10 bg-[#4d91fb] rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#4d91fb]" style={{ fontSize: '0.78rem', fontWeight: 600 }}>{replyTo.senderId === 'me' ? 'You' : contact.name}</p>
                  <p className="text-wa-text-muted truncate" style={{ fontSize: '0.82rem' }}>{getMessagePreview(replyTo)}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-wa-text-muted hover:text-wa-primary p-1 shrink-0" aria-label="Cancel reply"><X size={18} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-wa-header border-t border-wa-border shrink-0 overflow-hidden">
              <div className="px-3 py-3"><div className="grid grid-cols-10 gap-1">{EMOJI_LIST.map(emoji => (
                <button key={emoji} onClick={() => appendEmoji(emoji)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-wa-secondary transition-colors active:scale-90" style={{ fontSize: '1.25rem' }}>{emoji}</button>
              ))}</div></div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAttachSheet && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="bg-wa-header border-t border-wa-border shrink-0 overflow-hidden">
              {showLinkInput ? (
                <div className="px-4 py-4">
                  <div className="flex items-center gap-2 mb-3"><button onClick={() => setShowLinkInput(false)} className="text-wa-text-muted"><ArrowLeft size={18} /></button><span className="text-wa-primary" style={{ fontWeight: 600 }}>Share a Link</span></div>
                  <div className="flex items-center gap-2 bg-wa-secondary rounded-xl px-4 py-2.5"><Link size={16} className="text-wa-text-muted shrink-0" /><input type="url" value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://example.com" className="flex-1 bg-transparent outline-none text-wa-primary placeholder-[#8696A0]" style={{ fontSize: '0.9rem' }} autoFocus onKeyDown={e => e.key === 'Enter' && handleSendLink()} aria-label="Enter URL" /></div>
                  <button onClick={handleSendLink} disabled={!linkInput.trim()} className={`w-full mt-3 rounded-full py-3 flex items-center justify-center gap-2 transition-colors ${linkInput.trim() ? 'bg-[#4d91fb] text-white' : 'bg-wa-secondary text-wa-text-muted'}`} style={{ fontWeight: 600 }}>Send Link <Send size={16} /></button>
                </div>
              ) : (
                <div className="px-4 py-4"><div className="grid grid-cols-4 gap-3">{[
                  { icon: File, label: 'Document', color: '#5c6bc0', onClick: () => docInputRef.current?.click() },
                  { icon: Image, label: 'Gallery', color: '#e91e63', onClick: () => photoInputRef.current?.click() },
                  { icon: Camera, label: 'Camera', color: '#00897b', onClick: () => cameraInputRef.current?.click() },
                  { icon: Video, label: 'Video', color: '#d32f2f', onClick: () => startVideoRecording() },
                  { icon: Mic, label: 'Audio', color: '#ff8f00', onClick: () => startAudioRecording() },
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

        {activeUploads.length > 0 && (
          <div className="px-3 py-2 bg-wa-header border-t border-wa-border/5">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {activeUploads.map(u => (
                <div key={u.uploadId} className="flex items-center gap-2 bg-[#11161a] text-wa-text-muted px-3 py-2 rounded-md border border-wa-border/20">
                  <div className="min-w-0 truncate text-sm" style={{ maxWidth: 200 }}>{u.name}</div>
                  <button onClick={() => cancelUpload(u.uploadId, u.size)} className="text-wa-text-muted hover:text-wa-primary p-1" aria-label="Cancel upload">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {editingMsgId && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-[#182229] border-t border-[#4d91fb]/30 overflow-hidden shrink-0">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-1 h-10 bg-[#4d91fb] rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#4d91fb]" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Editing message</p>
                  <p className="text-wa-text-muted truncate" style={{ fontSize: '0.82rem' }}>{editingText}</p>
                </div>
                <button onClick={cancelEditing} className="text-wa-text-muted hover:text-wa-primary p-1 shrink-0" aria-label="Cancel editing"><X size={18} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 px-3 py-3 bg-wa-header shrink-0 border-t border-wa-border/5">
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
          <div className="flex items-end gap-2 flex-1 bg-wa-secondary/40 rounded-2xl px-3 py-2 border border-wa-border/5">
            {!editingMsgId && <button onClick={() => { setShowEmojiPicker(v => !v); setShowAttachSheet(false); }} className={`transition-colors shrink-0 mb-0.5 ${showEmojiPicker ? 'text-[#4d91fb]' : 'text-wa-header-icon hover:text-wa-primary'}`} aria-label={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'} aria-expanded={showEmojiPicker}><Smile size={22} /></button>}
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
              className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/50 resize-none py-0.5 max-h-32 overflow-y-auto"
              style={{ fontSize: '0.95rem', lineHeight: '1.4' }}
              aria-label="Type a message"
            />
            {!editingMsgId && !text && <button onClick={() => { setShowAttachSheet(v => !v); setShowLinkInput(false); setShowEmojiPicker(false); }} className={`transition-colors shrink-0 mb-0.5 ${showAttachSheet ? 'text-[#4d91fb]' : 'text-wa-header-icon hover:text-wa-primary'}`} aria-label={showAttachSheet ? 'Close attachments' : 'Attach file'} aria-expanded={showAttachSheet}><Paperclip size={22} /></button>}
            {!editingMsgId && !text && <button onClick={() => { setShowAttachSheet(true); setShowLinkInput(false); setShowEmojiPicker(false); }} className="text-wa-header-icon hover:text-wa-primary transition-colors shrink-0 mb-0.5" aria-label="Take photo or record video"><Camera size={22} /></button>}
          </div>
          <AnimatePresence mode="wait">
            {editingMsgId ? (
              <motion.button key="confirm" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} onClick={handleEditSend} className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all shadow-md active:scale-90 ${!editingText.trim() ? 'bg-[#4d91fb]/50 cursor-not-allowed' : 'bg-[#4d91fb] hover:bg-[#3b8eea]'}`} disabled={!editingText.trim()} aria-label="Confirm edit"><Check size={22} className="text-white" /></motion.button>
            ) : text ? <motion.button key="send" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} onClick={handleSend} disabled={isLoading} className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all shadow-md active:scale-90 ${isLoading ? 'bg-[#4d91fb]/50 cursor-not-allowed' : 'bg-[#4d91fb] hover:bg-[#3b8eea]'}`} aria-label="Send message"><Send size={20} className="text-white ml-0.5" /></motion.button>
            : <motion.button key="mic" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} onClick={() => startAudioRecording()} className="w-12 h-12 bg-[#4d91fb] rounded-full flex items-center justify-center shrink-0 hover:bg-[#3b8eea] transition-all shadow-md active:scale-90" aria-label="Record voice message"><Mic size={20} className="text-white" /></motion.button>}
          </AnimatePresence>
        </div>
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
              className="w-full bg-[#233138] rounded-t-2xl p-5 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Timer size={20} className="text-[#4d91fb]" />
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
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl mb-1 transition-colors ${isSelected ? 'bg-[#4d91fb]/15 text-[#4d91fb]' : 'text-wa-primary hover:bg-wa-secondary/50'}`}
                    >
                      <span style={{ fontSize: '0.95rem', fontWeight: isSelected ? 600 : 400 }}>{option.label}</span>
                      {isSelected && <Check size={18} className="text-[#4d91fb]" />}
                    </button>
                  );
                });
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Date Separator ─────────────────────────────────────────────────────────

function formatDateSep(timestamp: string): string {
  const date = new Date(timestamp);
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

function MessageBubble({ message, contact, contacts, showAvatar, showSenderName, isGroup, onReply, isSearchHighlight, isSearchActive, onImageClick, onContextMenu, isConsecutive }: {
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
  isConsecutive?: boolean;
}) {
  const isMe = message.senderId === 'me';
  const isSystem = message.senderId === 'system';
  const senderContact = !isMe && !isSystem && isGroup ? contacts.find((c: any) => c.id === message.senderId) : null;
  const displayContact = senderContact || contact;

  const x = useMotionValue(0);
  const swipeOpacity = useTransform(x, [0, 40], [0, 1]);
  const swipeScale = useTransform(x, [0, 40], [0.5, 1]);
  const rotateZ = useTransform(x, [0, 40], [0, 8]);
  const [swipeTriggered, setSwipeTriggered] = useState(false);

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
      <div className="flex justify-center my-3">
        <div className="flex items-start gap-1 bg-[#182229] rounded-lg px-3 py-2 max-w-xs">
          <Lock size={11} className="text-wa-text-muted mt-0.5 shrink-0" />
          <p className="text-wa-text-muted text-center leading-snug" style={{ fontSize: '0.72rem' }}>{message.content}</p>
        </div>
      </div>
    );
  }

  const isImage = message.type === 'image';
  const isImageOnly = isImage && !message.content && !message.replyToContent && !showSenderName;

  return (
    <div
      className={`flex items-end gap-1.5 ${isConsecutive ? 'mb-0' : 'mb-0.5'} relative group ${isMe ? 'justify-end' : 'justify-start'}`}
      onContextMenu={onContextMenu}
    >
      {/* Swipe Reply Visual */}
      <motion.div
        style={{ opacity: swipeOpacity, scale: swipeScale, rotate: rotateZ }}
        className="absolute -left-8 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-full bg-[#4d91fb]"
      >
        <Reply size={14} className="text-white" />
      </motion.div>

      {!isMe && isGroup && (
        <div className="w-7 shrink-0 self-end mb-0.5">
          {showAvatar && <Avatar src={displayContact.avatar} name={displayContact.name} color={displayContact.avatarColor} size={28} />}
        </div>
      )}

      <motion.div
        id={`msg-${message.id}`}
        drag="x"
        dragConstraints={{ left: 0, right: 60 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        style={{ x }}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileTap={{ scale: 0.995 }}
        className={`relative max-w-[85%] rounded-2xl shadow-sm transition-all ${isImageOnly ? 'p-0 overflow-hidden' : 'px-3 py-2'} ${isMe ? 'bg-wa-bubble-self text-wa-primary' : 'bg-wa-bubble-other text-wa-primary'} ${isSearchActive ? 'ring-2 ring-[#4d91fb]' : isSearchHighlight ? 'ring-1 ring-[#4d91fb]/40' : ''}`}
      >
        {!isImageOnly && (isMe ? <div className="absolute bottom-0 right-0 w-0 h-0 border-l-8 border-l-transparent border-b-8 border-b-wa-bubble-self translate-x-1.5" /> : <div className="absolute bottom-0 left-0 w-0 h-0 border-r-8 border-r-transparent border-b-8 border-b-wa-bubble-other -translate-x-1.5" />)}
        
        {showSenderName && senderContact && <p style={{ fontSize: '0.78rem', fontWeight: 600, color: senderContact.avatarColor, marginBottom: '2px' }}>{senderContact.name}</p>}

        {message.replyToId && (
          <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 border-[#4d91fb] ${isMe ? 'bg-[#4d91fb]/10' : 'bg-wa-secondary/40'}`}>
            <p className="text-[#4d91fb]" style={{ fontSize: '0.72rem', fontWeight: 600 }}>{message.replyToSender || 'Unknown'}</p>
            <p className="text-[#aebac1] truncate" style={{ fontSize: '0.78rem' }}>{getReplyPreviewText(message)}</p>
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
              <div className="w-10 h-10 bg-[#4d91fb]/20 rounded-xl flex items-center justify-center shrink-0"><FileText size={20} className="text-[#4d91fb]" /></div>
              <div className="min-w-0 flex-1"><p className="text-wa-primary truncate" style={{ fontSize: '0.84rem', fontWeight: 500 }}>{filename}</p><p className="text-wa-text-muted mt-0.5" style={{ fontSize: '0.7rem' }}>TAP TO OPEN</p></div>
              <Download size={16} className="text-wa-text-muted" />
            </div>
          );
        })()}

        {message.type === 'link' && (
          <a href={sanitizeUrl(message.linkUrl)} target="_blank" rel="noopener noreferrer" className="block" onClick={e => e.stopPropagation()}>
            <div className={`rounded-lg overflow-hidden border ${isMe ? 'border-[#4d91fb]/30' : 'border-wa-border'}`}>
              <div className={`px-3 py-2 flex items-center gap-2 ${isMe ? 'bg-[#4d91fb]/10' : 'bg-wa-secondary/50'}`}><ExternalLink size={14} className="text-[#4d91fb]" /><div className="min-w-0"><p className="text-wa-primary truncate" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{message.linkTitle || message.linkUrl}</p><p className="text-wa-text-muted truncate" style={{ fontSize: '0.72rem' }}>{message.linkDomain || message.linkUrl}</p></div></div>
              <div className="px-3 py-1.5"><p className="text-[#53bdeb] truncate" style={{ fontSize: '0.78rem' }}>{message.linkUrl}</p></div>
            </div>
          </a>
        )}

        {message.type === 'text' && (
          <p className="text-wa-primary leading-relaxed" style={{ fontSize: '0.9rem', paddingRight: '76px' }}>
            {message.content}
            {message.isEdited && <span className="text-wa-text-muted ml-1" style={{ fontSize: '0.75rem' }}>(edited)</span>}
          </p>
        )}

        {message.content === '[Deleted]' && (
          <p className="text-wa-text-muted italic leading-relaxed" style={{ fontSize: '0.85rem' }}>{message.content}</p>
        )}

        {/* Reaction Display */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`absolute -bottom-3 ${isMe ? 'left-0' : 'right-0'} flex items-center gap-0.5 bg-[#233138] border border-wa-border rounded-full px-1.5 py-0.5 shadow-lg z-20`}>
            {message.reactions.map((r, i) => <span key={i} className="text-sm">{r.emoji}</span>)}
            {message.reactions.length > 1 && <span className="text-[10px] text-wa-text-muted font-bold ml-0.5">{message.reactions.length}</span>}
          </div>
        )}

        {/* Info row */}
        {!(isImage && !message.content) && message.content !== '[Deleted]' && (
          <div className={`flex items-center gap-1 whitespace-nowrap ${(message.type === 'document' || message.type === 'link') ? 'justify-end mt-1.5' : 'absolute bottom-1.5 right-2.5'}`}>
            <span className="text-wa-text-muted" style={{ fontSize: '0.65rem' }}>{message.timestamp}</span>
            {isMe && (
              <>
                {message.status === 'sent' && <Check size={13} className="text-wa-text-muted" />}
                {message.status === 'delivered' && <CheckCheck size={13} className="text-wa-text-muted" />}
                {message.status === 'read' && <CheckCheck size={13} className="text-[#53bdeb]" />}
              </>
            )}
            {message.isStarred && <Star size={12} className="text-[#f9a825] fill-[#f9a825]" />}
          </div>
        )}
      </motion.div>
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

function LocalMedia({ fileId, mediaType, senderId, chatId, isImageOnly, message, isMe }: any) {
  const { currentUser } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fileId) return;
    if (fileId.startsWith('data:') || fileId.startsWith('blob:')) { setUrl(fileId); setLoading(false); return; }
    let cancelled = false;
    const resolve = async () => {
      if (!currentUser) return;
      try {
        const otherParty = isMe ? chatId : senderId;
        const decryptedUrl = await loadMediaWithCache(fileId, mediaType, currentUser.userId, otherParty);
        if (!cancelled) setUrl(decryptedUrl);
      } catch (err) { console.warn('⚠️ Media resolution failed:', err); } finally { if (!cancelled) setLoading(false); }
    };
    resolve();
    return () => { cancelled = true; };
  }, [fileId, currentUser, isMe, chatId, senderId, mediaType]);

  if (loading) return <div className="w-full flex items-center justify-center bg-[#1F2C34]" style={{ height: '200px' }}><div className="w-8 h-8 rounded-full border-2 border-[#4d91fb] border-t-transparent animate-spin" /></div>;
  if (!url) return <div className="w-full flex flex-col items-center justify-center bg-[#1F2C34] gap-2" style={{ height: '200px' }}><Image size={32} className="text-[#8696A0]" /><p className="text-[#8696A0]" style={{ fontSize: '0.7rem' }}>Failed to load media</p></div>;

  return (
    <>
      <img src={url} alt="Shared image" className="w-full block" style={{ maxHeight: isImageOnly ? '320px' : '220px', minHeight: '120px', objectFit: 'cover', cursor: 'pointer' }} />
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