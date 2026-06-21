import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Check, X, MessageSquare, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router';
import Avatar from './Avatar';

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

  const allContacts = [...contacts, ...discoverableContacts];
  const getContact = (id: string) => allContacts.find(c => c.id === id);

  const pending = chatRequests.filter(r => r.direction === 'incoming' && r.status === 'pending');
  const handled = chatRequests.filter(r => r.direction === 'incoming' && r.status !== 'pending');

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
      <div className="flex items-center gap-3 px-4 py-4 pt-10 bg-wa-header flex-shrink-0 border-b border-wa-border/10">
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
          {pending.length > 0 && (
            <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>
              {pending.length} pending request{pending.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Privacy notice - integrated */}
      <div className="mx-4 mt-6 mb-4 bg-wa-secondary/20 rounded-2xl px-5 py-4 flex items-start gap-4 border border-wa-border/10">
        <ShieldAlert size={20} className="text-wa-text-muted flex-shrink-0 mt-0.5" />
        <p className="text-wa-text-muted leading-relaxed" style={{ fontSize: '0.85rem' }}>
          People outside your contacts can send you a request. <strong className="text-wa-primary">Accepting</strong> lets them message you. Declining removes the request.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        {/* Pending requests */}
        {pending.length > 0 && (
          <div>
            <p className="text-[#4D91FB] px-5 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              PENDING
            </p>
            <AnimatePresence>
              {pending.map(req => {
                const contact = getContact(req.contactId);
                if (!contact) return null;
                return (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.25 }}
                  >
                    <RequestCard
                      contact={contact}
                      previewMessage={req.previewMessage}
                      timestamp={req.timestamp}
                      onAccept={() => handleAccept(req.id, req.contactId)}
                      onDecline={() => declineRequest(req.id)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Empty pending state */}
        {pending.length === 0 && handled.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
            <div className="w-20 h-20 bg-wa-secondary/30 rounded-full flex items-center justify-center">
              <MessageSquare size={36} className="text-[#4D91FB] opacity-50" />
            </div>
            <div>
              <p className="text-wa-primary font-bold" style={{ fontSize: '1.2rem' }}>No requests</p>
              <p className="text-wa-text-muted mt-2" style={{ fontSize: '0.9rem' }}>
                When someone messages you using your Quidec ID, requests will appear here.
              </p>
            </div>
          </div>
        )}

        {/* Handled */}
        {handled.length > 0 && (
          <div className="mt-8">
            <p className="text-wa-text-muted px-5 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              RECENTLY HANDLED
            </p>
            {handled.map(req => {
              const contact = getContact(req.contactId);
              if (!contact) return null;
              return (
                <div key={req.id} className="flex items-center gap-4 px-5 py-4 border-b border-wa-border/5 last:border-0 opacity-60">
                  <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="text-wa-primary" style={{ fontWeight: 600 }}>{contact.name}</p>
                    <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>
                      {req.status === 'accepted' ? 'Accepted' : 'Declined'} · {req.timestamp}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
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
}: {
  contact: any;
  previewMessage: string;
  timestamp: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="px-5 py-6 border-b border-wa-border/10">
      <div className="flex items-center gap-4 mb-5">
        <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={56} />
        <div className="flex-1 min-w-0">
          <p className="text-wa-primary" style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.3px' }}>{contact.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[#4D91FB] font-bold" style={{ fontSize: '0.82rem' }}>@{contact.userId.replace('@', '')}</span>
            <span className="text-wa-text-muted" style={{ fontSize: '0.82rem' }}>· {timestamp}</span>
          </div>
        </div>
      </div>

      <div className="bg-wa-secondary/30 rounded-2xl px-4 py-4 mb-6 border border-wa-border/5">
        <p className="text-[#4D91FB] font-bold mb-1.5" style={{ fontSize: '0.68rem', letterSpacing: '0.5px' }}>INITIAL MESSAGE</p>
        <p className="text-wa-primary leading-relaxed" style={{ fontSize: '0.95rem' }}>{previewMessage}</p>
      </div>

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
          className="flex-1 py-3.5 rounded-full bg-[#4D91FB] text-white font-bold shadow-lg hover:bg-[#06cf9c] transition-all active:scale-95"
          style={{ fontSize: '0.9rem' }}
        >
          Accept Request
        </button>
      </div>
    </div>
  );
}