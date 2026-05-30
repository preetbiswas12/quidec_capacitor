import { useState } from 'react';
import { Phone, Video, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, ArrowLeft, Search, X, Copy, Check, Link } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function CallsTab() {
  const navigate = useNavigate();
  const { calls, contacts, chats, setActiveChatId } = useApp();
  const [showNewCallSheet, setShowNewCallSheet] = useState(false);
  const [showCallLinkBanner, setShowCallLinkBanner] = useState(false);
  const [callLinkCopied, setCallLinkCopied] = useState(false);
  const [newCallSearch, setNewCallSearch] = useState('');

  const getContact = (id: string) => contacts.find(c => c.id === id);

  const startCall = (contactId: string, type: 'voice' | 'video') => {
    console.log(`📞 Starting ${type} call with ${contactId}`);
    navigate(`/app/call/${type}/${contactId}`);
  };

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

  const fakeCallLink = 'https://call.whatsapp.com/voice/ThdnQ3BdxJy3mq';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fakeCallLink).catch(() => {});
    setCallLinkCopied(true);
    setTimeout(() => setCallLinkCopied(false), 2500);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto">
        {/* Calls banner removed per privacy/dev setting */}

        {/* Recent Calls */}
        <div className="pt-4 pb-20">
          <h3 className="text-[#4d91fb] px-4 mb-2" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            RECENT CALLS
          </h3>
          <div className="flex flex-col">
            {calls.map(call => {
              const contact = getContact(call.contactId);
              if (!contact) return null;
              return (
                <div
                  key={call.id}
                  className="flex items-center gap-4 px-4 py-4 hover:bg-wa-secondary/20 cursor-pointer transition-colors group border-b border-wa-border/10 last:border-0"
                  onClick={() => openChatWithContact(call.contactId)}
                >
                  <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={call.direction === 'missed' ? 'text-red-400' : 'text-wa-primary'}
                      style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.2px' }}
                    >
                      {contact.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CallDirectionIcon direction={call.direction} type={call.type} />
                      <span className="text-wa-text-muted" style={{ fontSize: '0.82rem' }}>
                        {call.timestamp}
                        {call.duration && ` · ${call.duration}`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); startCall(contact.id, call.type); }}
                    className="text-wa-header-icon p-2 rounded-full hover:bg-wa-secondary/30 opacity-100 hover:opacity-100 transition-all"
                    title={`Start ${call.type} call`}
                  >
                    {call.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FAB - disabled for now */}
      <div className="absolute bottom-6 right-6 z-10">
        <button
          onClick={() => setShowNewCallSheet(true)}
          className="w-14 h-14 rounded-full bg-[#4d91fb] flex items-center justify-center shadow-2xl hover:bg-[#3b8eea] transition-all active:scale-90"
        >
          <PhoneCall size={24} className="text-white" />
        </button>
      </div>

      {/* New call sheet (contact picker) */}
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
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredContacts.map(contact => (
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
                      className="w-10 h-10 rounded-full bg-[#4d91fb]/10 hover:bg-[#4d91fb]/20 flex items-center justify-center text-[#4d91fb] transition-colors"
                    >
                      <Phone size={18} />
                    </button>
                    <button
                      onClick={() => { setShowNewCallSheet(false); startCall(contact.id, 'video'); }}
                      className="w-10 h-10 rounded-full bg-[#00A884]/10 hover:bg-[#00A884]/20 flex items-center justify-center text-[#00A884] transition-colors"
                    >
                      <Video size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CallDirectionIcon({ direction, type }: { direction: string; type: string }) {
  const color = direction === 'missed' ? '#ef4444' : '#4d91fb';
  if (direction === 'incoming') return <PhoneIncoming size={13} style={{ color }} />;
  if (direction === 'outgoing') return <PhoneOutgoing size={13} style={{ color }} />;
  return <PhoneMissed size={13} style={{ color }} />;
}