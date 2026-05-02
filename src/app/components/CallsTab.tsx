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
    if (type === 'voice') navigate(`/call/voice/${contactId}`);
    else navigate(`/call/video/${contactId}`);
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

  const handleCreateCallLink = () => {
    setShowCallLinkBanner(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto">
        {/* Create call link */}
        <div className="px-4 py-3 border-b border-[#2A3942]">
          <button
            onClick={handleCreateCallLink}
            className="w-full flex items-center gap-4 py-2 px-2 rounded-lg hover:bg-[#2A3942] cursor-pointer transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-[#00A884]/20 flex items-center justify-center flex-shrink-0">
              <Link size={20} className="text-[#00A884]" />
            </div>
            <div className="text-left">
              <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>Create call link</p>
              <p className="text-[#8696A0]" style={{ fontSize: '0.8rem' }}>Share a link for your WhatsApp call</p>
            </div>
          </button>
        </div>

        {/* Call link banner */}
        <AnimatePresence>
          {showCallLinkBanner && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-4 my-3 bg-[#1F2C34] rounded-xl p-4 border border-[#2A3942]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[#E9EDEF]" style={{ fontWeight: 600, fontSize: '0.9rem' }}>Your call link</p>
                  <button onClick={() => setShowCallLinkBanner(false)} className="text-[#8696A0]">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-[#53bdeb] mb-3 break-all" style={{ fontSize: '0.78rem' }}>{fakeCallLink}</p>
                <button
                  onClick={handleCopyLink}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-colors ${callLinkCopied ? 'bg-[#00A884]/20 text-[#00A884]' : 'bg-[#00A884] text-white hover:bg-[#06cf9c]'}`}
                  style={{ fontWeight: 600, fontSize: '0.9rem' }}
                >
                  {callLinkCopied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy link</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent Calls */}
        <div className="px-4 py-3">
          <h3 className="text-[#8696A0] mb-2 px-1" style={{ fontSize: '0.8rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Recent
          </h3>
          <div className="space-y-1">
            {calls.map(call => {
              const contact = getContact(call.contactId);
              if (!contact) return null;
              return (
                <div
                  key={call.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#2A3942] cursor-pointer transition-colors group"
                  onClick={() => openChatWithContact(call.contactId)}
                >
                  <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={call.direction === 'missed' ? 'text-red-400' : 'text-[#E9EDEF]'}
                      style={{ fontWeight: 500 }}
                    >
                      {contact.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <CallDirectionIcon direction={call.direction} type={call.type} />
                      <span className="text-[#8696A0]" style={{ fontSize: '0.8rem' }}>
                        {call.timestamp}
                        {call.duration && ` · ${call.duration}`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); startCall(contact.id, call.type); }}
                    className="text-[#00A884] hover:text-[#00cf9d] transition-colors p-2 rounded-full hover:bg-[#00A884]/10"
                  >
                    {call.type === 'video' ? <Video size={20} /> : <Phone size={20} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FAB — new call */}
      <div className="absolute bottom-4 right-4 z-10">
        <button
          onClick={() => setShowNewCallSheet(true)}
          className="w-14 h-14 rounded-full bg-[#00A884] flex items-center justify-center shadow-lg hover:bg-[#06cf9c] transition-colors active:scale-95"
        >
          <PhoneCall size={24} className="text-white" />
        </button>
      </div>

      {/* New call sheet (contact picker) */}
      <AnimatePresence>
        {showNewCallSheet && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-0 bg-[#111B21] flex flex-col z-20"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 bg-[#202C33] flex-shrink-0">
              <button
                onClick={() => { setShowNewCallSheet(false); setNewCallSearch(''); }}
                className="text-[#aebac1] hover:text-[#E9EDEF] p-1"
              >
                <ArrowLeft size={20} />
              </button>
              <span className="text-[#E9EDEF]" style={{ fontSize: '1.05rem', fontWeight: 600 }}>New Call</span>
            </div>

            {/* Search */}
            <div className="px-3 py-2 flex-shrink-0">
              <div className="flex items-center gap-2 bg-[#202C33] rounded-xl px-4 py-2">
                <Search size={16} className="text-[#8696A0]" />
                <input
                  type="text"
                  placeholder="Search contacts"
                  value={newCallSearch}
                  onChange={e => setNewCallSearch(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[#E9EDEF] placeholder-[#8696A0]"
                  style={{ fontSize: '0.9rem' }}
                  autoFocus
                />
                {newCallSearch && (
                  <button onClick={() => setNewCallSearch('')}><X size={16} className="text-[#8696A0]" /></button>
                )}
              </div>
            </div>

            {/* Contacts list */}
            <div className="flex-1 overflow-y-auto">
              {filteredContacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#2A3942] transition-colors border-b border-[#2A3942]/30">
                  <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} isOnline={contact.isOnline} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>{contact.name}</p>
                    <p className="text-[#8696A0]" style={{ fontSize: '0.78rem' }}>
                      {contact.isOnline ? '🟢 online' : contact.lastSeen}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setShowNewCallSheet(false); startCall(contact.id, 'voice'); }}
                      className="w-10 h-10 rounded-full bg-[#00A884]/10 hover:bg-[#00A884]/20 flex items-center justify-center text-[#00A884] transition-colors"
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
              {filteredContacts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#8696A0]">
                  <Search size={32} className="opacity-30" />
                  <p style={{ fontSize: '0.9rem' }}>No contacts found</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CallDirectionIcon({ direction, type }: { direction: string; type: string }) {
  const color = direction === 'missed' ? '#ef4444' : '#00A884';
  if (direction === 'incoming') return <PhoneIncoming size={13} style={{ color }} />;
  if (direction === 'outgoing') return <PhoneOutgoing size={13} style={{ color }} />;
  return <PhoneMissed size={13} style={{ color }} />;
}