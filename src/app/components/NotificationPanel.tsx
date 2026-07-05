import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';

interface NotificationItem {
  id: string;
  type: string;
  from?: string;
  fromName?: string;
  message?: string;
  body?: string;
  read?: boolean;
  createdAt?: any;
  timestamp?: number;
  groupId?: string;
  groupName?: string;
}

function timeAgo(timestamp: any): string {
  if (!timestamp) return '';
  const ms = timestamp?.seconds ? timestamp.seconds * 1000 : timestamp?.toDate?.()?.getTime?.() || Number(timestamp) || 0;
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export default function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { currentUser, setActiveChatId, chats } = useApp();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    let unsub: (() => void) | undefined;

    const setup = async () => {
      try {
        const { notificationService } = await import('../../utils/services/notificationService');
        unsub = notificationService.listenToUserNotifications(currentUser.userId, (notifs) => {
          setNotifications(notifs as NotificationItem[]);
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    };

    setup();
    return () => { unsub?.(); };
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const markAsRead = async (notifId: string) => {
    if (!currentUser) return;
    try {
      const { notificationService } = await import('../../utils/services/notificationService');
      await notificationService.markNotificationAsRead(currentUser.userId, notifId);
    } catch { /* non-critical */ }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    const unread = notifications.filter(n => !n.read);
    await Promise.allSettled(unread.map(n => markAsRead(n.id)));
  };

  const handleNotifClick = (notif: NotificationItem) => {
    markAsRead(notif.id);
    const chatId = notif.groupId || chats.find(c => c.contactId === notif.from)?.id || notif.from;
    if (chatId) {
      setActiveChatId(chatId);
    }
    onClose();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 top-full mt-1 w-80 bg-[#233138] rounded-xl shadow-2xl overflow-hidden z-50 border border-wa-border max-h-[70vh] flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-wa-border/30">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-wa-header-icon" />
          <span className="text-wa-primary font-semibold" style={{ fontSize: '0.9rem' }}>Notifications</span>
          {unreadCount > 0 && (
            <span className="bg-[#4d91fb] text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center" style={{ fontSize: '0.65rem' }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-[#4d91fb] hover:text-[#3b8eea] p-1 rounded transition-colors"
              title="Mark all as read"
            >
              <CheckCheck size={16} />
            </button>
          )}
          <button onClick={onClose} className="text-wa-text-muted hover:text-wa-primary p-1 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-wa-text-muted" style={{ fontSize: '0.85rem' }}>
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-wa-text-muted">
            <Bell size={32} className="opacity-30" />
            <p style={{ fontSize: '0.85rem' }}>No notifications yet</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleNotifClick(notif)}
              className={`w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-b border-wa-border/10 hover:bg-[#2A3942] ${!notif.read ? 'bg-[#4d91fb]/5' : ''}`}
            >
              <div className="relative mt-0.5">
                <div className="w-10 h-10 rounded-full bg-wa-secondary flex items-center justify-center overflow-hidden border border-wa-border/20">
                  <span className="text-wa-primary" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {notif.fromName?.[0]?.toUpperCase() || notif.groupName?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
                {!notif.read && (
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#4d91fb] rounded-full border-2 border-[#233138]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-wa-primary truncate" style={{ fontWeight: notif.read ? 400 : 600, fontSize: '0.85rem' }}>
                    {notif.fromName || notif.groupName || 'Unknown'}
                  </p>
                  <span className="text-wa-text-muted flex-shrink-0" style={{ fontSize: '0.7rem' }}>
                    {timeAgo(notif.createdAt || notif.timestamp)}
                  </span>
                </div>
                <p className="text-wa-text-muted truncate" style={{ fontSize: '0.8rem' }}>
                  {notif.body || notif.message || notif.type}
                </p>
              </div>
              {!notif.read && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                  className="text-[#4d91fb] hover:text-[#3b8eea] p-1 rounded mt-1 flex-shrink-0"
                  title="Mark as read"
                >
                  <Check size={14} />
                </button>
              )}
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}
