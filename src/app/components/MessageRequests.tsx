import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Check, X, MessageSquare, ShieldAlert, Send, Inbox } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router';
import Avatar from './Avatar';

function formatReqTime(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageRequests() {
  const navigate = useNavigate();
  const {
    chatRequests,
    acceptRequest,
    declineRequest,
    contacts,
    discoverableContacts,
    setShowRequests,
    setActiveChatId,
    chats,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');

  const allContacts = [...contacts, ...discoverableContacts];
  const getContact = (id: string) => allContacts.find(c => c.id === id);

  const incomingPending = chatRequests.filter(r => r.direction === 'incoming' && r.status === 'pending');
  const incomingHandled = chatRequests.filter(r => r.direction === 'incoming' && r.status !== 'pending');
  const outgoingPending = chatRequests.filter(r => r.direction === 'outgoing' && r.status === 'pending');
  const outgoingHandled = chatRequests.filter(r => r.direction === 'outgoing' && r.status !== 'pending');

  const handleAccept = async (requestId: string, contactId: string) => {
    const newChatId = await acceptRequest(requestId);
    setShowRequests(false);
    if (newChatId) {
      setTimeout(() => {
        setActiveChatId(newChatId);
        navigate(`/app/chat/${newChatId}`);
      }, 80);
    } else {
      const existingChat = chats.find(c => c.contactId === contactId);
      if (existingChat) {
        setActiveChatId(existingChat.id);
        navigate(`/app/chat/${existingChat.id}`);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-wa-main overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 pt-safe bg-wa-header flex-shrink-0 border-b border-wa-border/10">
        <button
          onClick={() => setShowRequests(false)}
          className="text-wa-header-icon hover:text-wa-primary p-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="text-wa-primary" style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            Message Requests
          </span>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="mx-4 mt-4 mb-3 bg-wa-secondary/20 rounded-2xl px-5 py-4 flex items-start gap-4 border border-wa-border/10">
        <ShieldAlert size={20} className="text-wa-text-muted flex-shrink-0 mt-0.5" />
        <p className="text-wa-text-muted leading-relaxed" style={{ fontSize: '0.85rem' }}>
          People outside your contacts can send you a request. <strong className="text-wa-primary">Accepting</strong> lets them message you. Declining removes the request.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mb-3 bg-wa-secondary/30 rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'incoming'
              ? 'bg-wa-accent text-white shadow-md'
              : 'text-wa-text-muted hover:text-wa-primary'
          }`}
        >
          <Inbox size={16} />
          Incoming
          {incomingPending.length > 0 && (
            <span className="bg-white/30 text-white rounded-full px-1.5 text-xs">{incomingPending.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'outgoing'
              ? 'bg-wa-accent text-white shadow-md'
              : 'text-wa-text-muted hover:text-wa-primary'
          }`}
        >
          <Send size={16} />
          Outgoing
          {outgoingPending.length > 0 && (
            <span className="bg-white/30 text-white rounded-full px-1.5 text-xs">{outgoingPending.length}</span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        {activeTab === 'incoming' ? (
          <>
            {/* Pending incoming */}
            {incomingPending.length > 0 && (
              <div>
                <p className="text-wa-accent px-5 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  PENDING
                </p>
                <AnimatePresence>
                  {incomingPending.map(req => {
                    const contact = getContact(req.contactId);
                    const fallback = { id: req.contactId, userId: req.contactId, name: req.contactId, avatar: null, avatarColor: '#4D91FB', initials: req.contactId[0]?.toUpperCase() || '?', isOnline: false, lastSeen: 'offline', about: '' };
                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.25 }}
                      >
                        <RequestCard
                          contact={contact || fallback}
                          previewMessage={req.previewMessage}
                          timestamp={req.timestamp}
                          onAccept={() => handleAccept(req.id, req.contactId)}
                          onDecline={() => declineRequest(req.id)}
                          showActions
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Empty incoming state */}
            {incomingPending.length === 0 && incomingHandled.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
                <div className="w-20 h-20 bg-wa-secondary/30 rounded-full flex items-center justify-center">
                  <Inbox size={36} className="text-wa-accent opacity-50" />
                </div>
                <div>
                  <p className="text-wa-primary font-bold" style={{ fontSize: '1.2rem' }}>No incoming requests</p>
                  <p className="text-wa-text-muted mt-2" style={{ fontSize: '0.9rem' }}>
                    When someone messages you using your Veill ID, requests will appear here.
                  </p>
                </div>
              </div>
            )}

            {/* Handled incoming */}
            {incomingHandled.length > 0 && (
              <div className="mt-4">
                <p className="text-wa-text-muted px-5 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  RECENTLY HANDLED
                </p>
                {incomingHandled.map(req => {
                  const contact = getContact(req.contactId);
                  const fallback = { name: req.contactId, avatar: null, avatarColor: '#4D91FB' };
                  const c = contact || fallback;
                  return (
                    <div key={req.id} className="flex items-center gap-4 px-5 py-4 border-b border-wa-border/5 last:border-0 opacity-60">
                      <Avatar src={c.avatar} name={c.name} color={c.avatarColor || '#4D91FB'} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="text-wa-primary" style={{ fontWeight: 600 }}>{c.name}</p>
                        <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>
                          {req.status === 'accepted' ? 'Accepted' : 'Declined'} · {formatReqTime(req.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Pending outgoing */}
            {outgoingPending.length > 0 && (
              <div>
                <p className="text-wa-accent px-5 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  PENDING
                </p>
                <AnimatePresence>
                  {outgoingPending.map(req => {
                    const contact = getContact(req.contactId);
                    return (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.25 }}
                      >
                        <RequestCard
                          contact={contact || { name: req.contactId, userId: req.contactId, avatar: null, avatarColor: '', initials: '?' }}
                          previewMessage={req.previewMessage}
                          timestamp={req.timestamp}
                          showActions={false}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Empty outgoing state */}
            {outgoingPending.length === 0 && outgoingHandled.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
                <div className="w-20 h-20 bg-wa-secondary/30 rounded-full flex items-center justify-center">
                  <Send size={36} className="text-wa-accent opacity-50" />
                </div>
                <div>
                  <p className="text-wa-primary font-bold" style={{ fontSize: '1.2rem' }}>No outgoing requests</p>
                  <p className="text-wa-text-muted mt-2" style={{ fontSize: '0.9rem' }}>
                    When you send a message request, it will appear here.
                  </p>
                </div>
              </div>
            )}

            {/* Handled outgoing */}
            {outgoingHandled.length > 0 && (
              <div className="mt-4">
                <p className="text-wa-text-muted px-5 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  RECENTLY HANDLED
                </p>
                {outgoingHandled.map(req => {
                  const contact = getContact(req.contactId);
                  return (
                    <div key={req.id} className="flex items-center gap-4 px-5 py-4 border-b border-wa-border/5 last:border-0 opacity-60">
                      <Avatar src={contact?.avatar} name={contact?.name || req.contactId} color={contact?.avatarColor || '#6b7280'} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="text-wa-primary" style={{ fontWeight: 600 }}>{contact?.name || req.contactId}</p>
                        <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>
                          {req.status === 'accepted' ? 'Accepted' : 'Declined'} · {formatReqTime(req.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RequestCard({
  contact,
  previewMessage,
  timestamp,
  onAccept,
  onDecline,
  showActions,
}: {
  contact: any;
  previewMessage: string;
  timestamp: string;
  onAccept?: () => void;
  onDecline?: () => void;
  showActions: boolean;
}) {
  return (
    <div className="px-5 py-6 border-b border-wa-border/10">
      <div className="flex items-center gap-4 mb-5">
        <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={56} />
        <div className="flex-1 min-w-0">
          <p className="text-wa-primary" style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.3px' }}>{contact.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-wa-accent font-bold" style={{ fontSize: '0.82rem' }}>@{contact.userId?.replace('@', '') || contact.id}</span>
            <span className="text-wa-text-muted" style={{ fontSize: '0.82rem' }}>· {formatReqTime(timestamp)}</span>
          </div>
        </div>
      </div>

      {previewMessage && (
        <div className="bg-wa-secondary/30 rounded-2xl px-4 py-4 mb-6 border border-wa-border/5">
          <p className="text-wa-accent font-bold mb-1.5" style={{ fontSize: '0.68rem', letterSpacing: '0.5px' }}>INITIAL MESSAGE</p>
          <p className="text-wa-primary leading-relaxed" style={{ fontSize: '0.95rem' }}>{previewMessage}</p>
        </div>
      )}

      {showActions && onAccept && onDecline && (
        <div className="flex gap-4">
          <button
            onClick={onDecline}
            className="flex-1 py-3.5 rounded-full border border-wa-border/20 text-wa-text-muted font-bold hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-95"
            style={{ fontSize: '0.9rem' }}
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3.5 rounded-full bg-wa-accent text-white font-bold shadow-lg hover:bg-[#06cf9c] transition-all active:scale-95"
            style={{ fontSize: '0.9rem' }}
          >
            Accept Request
          </button>
        </div>
      )}

      {!showActions && (
        <div className="flex items-center gap-2 text-wa-text-muted">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Waiting for response...</span>
        </div>
      )}
    </div>
  );
}
