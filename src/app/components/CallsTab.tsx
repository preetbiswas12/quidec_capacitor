import { useState, useEffect } from 'react';
import { Phone, Video, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, ArrowLeft, Search, X, Trash2, PhoneOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function CallsTab() {
  const navigate = useNavigate();
  const {
    calls, contacts, chats, currentUser,
    activeIncomingCall, clearIncomingCall, saveCallRecord, clearAllCalls,
    setActiveChatId,
  } = useApp();
  const [showNewCallSheet, setShowNewCallSheet] = useState(false);
  const [newCallSearch, setNewCallSearch] = useState('');
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  const getContact = (id: string) => contacts.find(c => c.id === id);

  // ─── Start a call (voice or video) ───
  const startCall = (contactId: string, type: 'voice' | 'video') => {
    if (!currentUser) return;
    const contact = getContact(contactId);
    if (!contact) return;

    // Save outgoing call record
    saveCallRecord(contactId, type, 'outgoing').catch(() => {});

    // Navigate to the call screen
    navigate(`/call/${type}/${contactId}`);
  };

  // ─── Accept incoming call ───
  const handleAcceptCall = () => {
    if (!activeIncomingCall) return;
    const call = activeIncomingCall;
    clearIncomingCall();
    saveCallRecord(call.contactId, call.type, 'incoming').catch(() => {});
    navigate(`/call/${call.type}/${call.contactId}?received=true`);
  };

  // ─── Reject / dismiss incoming call ───
  const handleRejectCall = () => {
    if (!activeIncomingCall) return;
    saveCallRecord(activeIncomingCall.contactId, activeIncomingCall.type, 'missed').catch(() => {});
    clearIncomingCall();
  };

  // ─── Open chat from call history ───
  const openChatWithContact = (contactId: string) => {
    const chat = chats.find(c => c.contactId === contactId);
    if (chat) {
      setActiveChatId(chat.id);
      navigate(`/app/chat/${chat.id}`);
    }
  };

  const nonGroupContacts = contacts.filter(c => !c.isGroup);
  const filteredContacts = newCallSearch
    ? nonGroupContacts.filter(c => c.name.toLowerCase().includes(newCallSearch.toLowerCase()))
    : nonGroupContacts;

  // Group calls by contact for the history view
  const callsByContact = new Map<string, typeof calls>();
  for (const call of calls) {
    const existing = callsByContact.get(call.contactId) || [];
    existing.push(call);
    callsByContact.set(call.contactId, existing);
  }

  // Sort groups: most recent first
  const sortedGroups = [...callsByContact.entries()].sort((a, b) => {
    const aLatest = Math.max(...a[1].map(c => new Date(c.timestamp).getTime()));
    const bLatest = Math.max(...b[1].map(c => new Date(c.timestamp).getTime()));
    return bLatest - aLatest;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto">
        {/* ── Incoming Call Banner ── */}
        <AnimatePresence>
          {activeIncomingCall && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-wa-accent overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    {activeIncomingCall.type === 'video' ? (
                      <Video size={18} className="text-white" />
                    ) : (
                      <Phone size={18} className="text-white" />
                    )}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Incoming {activeIncomingCall.type} call</p>
                    <p className="text-white/70 text-xs">
                      {getContact(activeIncomingCall.contactId)?.name || 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRejectCall}
                    className="w-9 h-9 rounded-full bg-red-500/80 flex items-center justify-center hover:bg-red-600 transition-colors"
                    title="Decline"
                  >
                    <PhoneOff size={16} className="text-white" />
                  </button>
                  <button
                    onClick={handleAcceptCall}
                    className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                    title="Accept"
                  >
                    <Phone size={16} className="text-white" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Call History ── */}
        <div className="pt-4 pb-20">
          <div className="flex items-center justify-between px-4 mb-2">
            <h3 className="text-wa-accent" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              RECENT CALLS
            </h3>
            {calls.length > 0 && (
              <button
                onClick={clearAllCalls}
                className="text-wa-text-muted hover:text-red-400 p-1.5 rounded-full hover:bg-wa-secondary/30 transition-colors"
                title="Clear call history"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {sortedGroups.length > 0 ? (
            <div className="flex flex-col">
              {sortedGroups.map(([contactId, contactCalls]) => {
                const contact = getContact(contactId);
                if (!contact) return null;
                const latestCall = contactCalls[0];
                const callCount = contactCalls.length;
                const isExpanded = expandedContact === contactId;
                const missedCount = contactCalls.filter(c => c.direction === 'missed').length;
                return (
                  <div key={contactId} className="border-b border-wa-border/10 last:border-0">
                    {/* Main row — always visible */}
                    <div
                      className="flex items-center gap-4 px-4 py-4 hover:bg-wa-secondary/20 cursor-pointer transition-colors group"
                      onClick={() => setExpandedContact(isExpanded ? null : contactId)}
                    >
                      <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={missedCount > 0 ? 'text-red-400' : 'text-wa-primary'}
                            style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.2px' }}
                          >
                            {contact.name}
                          </p>
                          {callCount > 1 && (
                            <span className="text-wa-accent bg-wa-accent/10 rounded-full px-1.5 py-0.5" style={{ fontSize: '0.65rem', fontWeight: 700 }}>
                              {callCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <CallDirectionIcon direction={latestCall.direction} type={latestCall.type} />
                          <span className="text-wa-text-muted" style={{ fontSize: '0.82rem' }}>
                            {formatCallTime(latestCall.timestamp)}
                            {latestCall.duration && ` · ${latestCall.duration}`}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); startCall(contact.id, latestCall.type); }}
                        className="text-wa-accent p-2 rounded-full hover:bg-wa-accent/10 transition-colors"
                        title={`Start ${latestCall.type} call`}
                      >
                        {latestCall.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
                      </button>
                    </div>

                    {/* Expanded call list */}
                    <AnimatePresence>
                      {isExpanded && callCount > 1 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden bg-wa-secondary/5"
                        >
                          {contactCalls.map((call, idx) => (
                            <div
                              key={call.id}
                              className="flex items-center gap-3 px-4 py-2.5 pl-16 hover:bg-wa-secondary/10 cursor-pointer transition-colors"
                              onClick={() => startCall(contact.id, call.type)}
                            >
                              <CallDirectionIcon direction={call.direction} type={call.type} />
                              <div className="flex-1 min-w-0">
                                <span className="text-wa-text-muted" style={{ fontSize: '0.8rem' }}>
                                  {call.direction === 'incoming' ? 'Incoming' : call.direction === 'outgoing' ? 'Outgoing' : 'Missed'}
                                  {call.duration && ` · ${call.duration}`}
                                </span>
                              </div>
                              <span className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>
                                {formatCallTime(call.timestamp)}
                              </span>
                            </div>
                          ))}
                          <div
                            className="px-4 py-2 pl-16 border-t border-wa-border/5 hover:bg-wa-secondary/10 cursor-pointer"
                            onClick={() => openChatWithContact(contactId)}
                          >
                            <span className="text-wa-accent" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              Message {contact.name}
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 px-8 gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-wa-secondary/50 flex items-center justify-center border border-wa-border/20">
                <PhoneCall size={28} className="text-wa-text-muted opacity-50" />
              </div>
              <p className="text-wa-primary" style={{ fontSize: '1rem', fontWeight: 600 }}>No recent calls</p>
              <p className="text-wa-text-muted" style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
                Tap the call button below to start a voice or video call with your contacts.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── FAB ── */}
      <div className="absolute bottom-24 right-6 z-10">
        <button
          onClick={() => setShowNewCallSheet(true)}
          className="w-14 h-14 rounded-full bg-wa-accent flex items-center justify-center shadow-2xl hover:bg-wa-accent/90 transition-all active:scale-90"
        >
          <PhoneCall size={24} className="text-white" />
        </button>
      </div>

      {/* ── New Call Sheet (contact picker) ── */}
      <AnimatePresence>
        {showNewCallSheet && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="absolute inset-0 bg-wa-main flex flex-col z-20"
          >
            <div className="flex items-center gap-3 px-4 py-4 pt-10 bg-wa-header flex-shrink-0 border-b border-wa-border/10">
              <button
                onClick={() => { setShowNewCallSheet(false); setNewCallSearch(''); }}
                className="text-wa-header-icon hover:text-wa-primary p-1"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="text-wa-primary" style={{ fontSize: '1.05rem', fontWeight: 700 }}>New Call</span>
            </div>

            <div className="px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-3 bg-wa-secondary/30 rounded-2xl px-4 py-2.5 border border-wa-border/5">
                <Search size={18} className="text-wa-text-muted flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search contacts"
                  value={newCallSearch}
                  onChange={e => setNewCallSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted/50 font-medium"
                  style={{ fontSize: '0.95rem' }}
                  autoFocus
                />
                {newCallSearch && (
                  <button onClick={() => setNewCallSearch('')}>
                    <X size={16} className="text-wa-text-muted" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredContacts.length > 0 ? (
                filteredContacts.map(contact => (
                  <div key={contact.id} className="flex items-center gap-4 px-4 py-4 hover:bg-wa-secondary/20 transition-colors border-b border-wa-border/10">
                    <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} isOnline={contact.isOnline} />
                    <div className="flex-1 min-w-0">
                      <p className="text-wa-primary" style={{ fontWeight: 700, fontSize: '1rem' }}>{contact.name}</p>
                      <p className="text-wa-text-muted" style={{ fontSize: '0.82rem' }}>
                        {contact.isOnline ? 'online' : contact.lastSeen}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowNewCallSheet(false); startCall(contact.id, 'voice'); }}
                        className="w-10 h-10 rounded-full bg-wa-accent/10 hover:bg-wa-accent/20 flex items-center justify-center text-wa-accent transition-colors"
                        title="Voice call"
                      >
                        <Phone size={18} />
                      </button>
                      <button
                        onClick={() => { setShowNewCallSheet(false); startCall(contact.id, 'video'); }}
                        className="w-10 h-10 rounded-full bg-wa-accent/10 hover:bg-wa-accent/20 flex items-center justify-center text-wa-accent transition-colors"
                        title="Video call"
                      >
                        <Video size={18} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-8 gap-3 text-center">
                  <Search size={32} className="text-wa-text-muted opacity-30" />
                  <p className="text-wa-text-muted" style={{ fontSize: '0.9rem' }}>No contacts found</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Call Direction Icon ── */
function CallDirectionIcon({ direction, type }: { direction: string; type: string }) {
  const color = direction === 'missed' ? '#ef4444' : direction === 'incoming' ? '#4D91FB' : '#4d91fb';
  if (direction === 'incoming') return <PhoneIncoming size={13} style={{ color }} />;
  if (direction === 'outgoing') return <PhoneOutgoing size={13} style={{ color }} />;
  return <PhoneMissed size={13} style={{ color }} />;
}

/* ── Format call timestamp ── */
function formatCallTime(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
