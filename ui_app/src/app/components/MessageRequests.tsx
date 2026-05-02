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

  const handleAccept = (requestId: string, contactId: string) => {
    const newChatId = acceptRequest(requestId);

    setShowRequests(false);

    if (newChatId) {
      // Small delay to let state settle before navigating
      setTimeout(() => {
        setActiveChatId(newChatId);
        navigate(`/app/chat/${newChatId}`);
      }, 80);
    } else {
      // fallback: try to find an existing chat for this contact
      const existingChat = chats.find(c => c.contactId === contactId);
      if (existingChat) {
        setActiveChatId(existingChat.id);
        navigate(`/app/chat/${existingChat.id}`);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111B21] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 bg-[#202C33] flex-shrink-0">
        <button
          onClick={() => setShowRequests(false)}
          className="text-[#aebac1] hover:text-[#E9EDEF] p-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="text-[#E9EDEF]" style={{ fontSize: '1.05rem', fontWeight: 600 }}>
            Message Requests
          </span>
          {pending.length > 0 && (
            <p className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>
              {pending.length} pending request{pending.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Privacy notice */}
      <div className="mx-4 mt-4 mb-2 bg-[#1F2C34] rounded-xl px-4 py-3 flex items-start gap-3 border border-[#2A3942]">
        <ShieldAlert size={18} className="text-[#8696A0] flex-shrink-0 mt-0.5" />
        <p className="text-[#8696A0] leading-snug" style={{ fontSize: '0.78rem' }}>
          People outside your contacts can send you a request. Accepting lets them message you. Declining removes the request.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Pending requests */}
        {pending.length > 0 && (
          <div>
            <p className="text-[#00A884] px-4 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pending
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
            <div className="w-20 h-20 bg-[#00A884]/10 rounded-full flex items-center justify-center">
              <MessageSquare size={36} className="text-[#00A884]" />
            </div>
            <div>
              <p className="text-[#E9EDEF]" style={{ fontWeight: 600 }}>No message requests</p>
              <p className="text-[#8696A0] mt-1" style={{ fontSize: '0.85rem' }}>
                When someone messages you using your WhatsApp ID, requests will appear here.
              </p>
            </div>
          </div>
        )}

        {pending.length === 0 && handled.length > 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-8 text-center gap-2">
            <div className="w-14 h-14 bg-[#00A884]/10 rounded-full flex items-center justify-center mb-2">
              <Check size={28} className="text-[#00A884]" />
            </div>
            <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>All caught up!</p>
            <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>No pending requests right now.</p>
          </div>
        )}

        {/* Already handled */}
        {handled.length > 0 && (
          <div>
            <p className="text-[#8696A0] px-4 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Handled
            </p>
            {handled.map(req => {
              const contact = getContact(req.contactId);
              if (!contact) return null;
              return (
                <div key={req.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#2A3942]/30">
                  <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#8696A0]" style={{ fontWeight: 500 }}>{contact.name}</p>
                    <p className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>
                      {req.status === 'accepted' ? '✓ Accepted' : '✗ Declined'} · {req.timestamp}
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
    <div className="px-4 py-4 border-b border-[#2A3942]/30">
      {/* Profile row */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={52} isOnline={contact.isOnline} />
        <div className="flex-1 min-w-0">
          <p className="text-[#E9EDEF]" style={{ fontWeight: 600 }}>{contact.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[#00A884]" style={{ fontSize: '0.78rem', fontWeight: 500 }}>
              {contact.userId}
            </span>
            <span className="text-[#2A3942]">·</span>
            <span className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>{timestamp}</span>
          </div>
          <p className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>{contact.about}</p>
        </div>
      </div>

      {/* Message preview */}
      <div className="bg-[#1F2C34] rounded-xl px-3 py-2.5 mb-4 border border-[#2A3942]">
        <p className="text-[#8696A0]" style={{ fontSize: '0.72rem', marginBottom: 2 }}>Message preview</p>
        <p className="text-[#E9EDEF] leading-relaxed" style={{ fontSize: '0.88rem' }}>{previewMessage}</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onDecline}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full border border-[#2A3942] text-[#8696A0] hover:bg-[#2A3942] hover:text-red-400 transition-colors active:scale-95"
          style={{ fontWeight: 500, fontSize: '0.9rem' }}
        >
          <X size={16} />
          Decline
        </button>
        <button
          onClick={onAccept}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full bg-[#00A884] text-white hover:bg-[#06cf9c] transition-colors active:scale-95"
          style={{ fontWeight: 600, fontSize: '0.9rem' }}
        >
          <Check size={16} />
          Accept
        </button>
      </div>
    </div>
  );
}