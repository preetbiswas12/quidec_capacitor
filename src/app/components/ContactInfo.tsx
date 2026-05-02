import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  X, Phone, Video, Search, Bell, Trash2, MessageSquare,
  FileText, ExternalLink, Download, Image as ImageIcon, Link as LinkIcon,
  Camera, Edit3, Check,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

interface Props {
  contactId: string;
  chatId: string;
  onClose: () => void;
  onSearchChat?: () => void;
}

type MediaTab = 'media' | 'docs' | 'links';

export default function ContactInfo({ contactId, chatId, onClose, onSearchChat }: Props) {
  const navigate = useNavigate();
  const { contacts, messages, updateContact } = useApp();
  const contact = contacts.find(c => c.id === contactId);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaTab, setMediaTab] = useState<MediaTab>('media');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameEdit, setGroupNameEdit] = useState('');
  const groupIconInputRef = useRef<HTMLInputElement>(null);

  if (!contact) return null;

  const handleGroupIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateContact(contactId, { avatar: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveGroupName = () => {
    if (groupNameEdit.trim()) updateContact(contactId, { name: groupNameEdit.trim() });
    setEditingGroupName(false);
  };

  // Pull real media/links/docs from this chat's messages
  const chatMessages = messages[chatId] || [];
  const mediaMessages = chatMessages.filter(m => m.type === 'image' && (m as any).imageUrl);
  const docMessages   = chatMessages.filter(m => m.type === 'document');
  const linkMessages  = chatMessages.filter(m => m.type === 'link');
  const totalShared   = mediaMessages.length + docMessages.length + linkMessages.length;

  const startCall = (type: 'voice' | 'video') => navigate(`/call/${type}/${contactId}`);

  const tabDefs: { id: MediaTab; label: string; count: number }[] = [
    { id: 'media', label: 'Media', count: mediaMessages.length },
    { id: 'docs',  label: 'Docs',  count: docMessages.length },
    { id: 'links', label: 'Links', count: linkMessages.length },
  ];

  return (
    <div className="h-full flex flex-col bg-[#111B21] overflow-y-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 py-4 bg-[#202C33] flex-shrink-0">
        <button
          onClick={onClose}
          className="text-[#aebac1] hover:text-[#E9EDEF] p-1 rounded-full hover:bg-white/5 transition-colors"
        >
          <X size={20} />
        </button>
        <span className="text-[#E9EDEF]" style={{ fontWeight: 600, fontSize: '1rem' }}>
          {contact.isGroup ? 'Group info' : 'Contact info'}
        </span>
      </div>

      {/* ── Profile ── */}
      <div className="flex flex-col items-center py-8 px-6 bg-[#111B21] gap-3">

        {/* Avatar with optional camera overlay for groups */}
        <div className="relative">
          <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={100} isOnline={!contact.isGroup && contact.isOnline} />
          {contact.isGroup && (
            <>
              <input ref={groupIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleGroupIconSelect} />
              <button
                onClick={() => groupIconInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 bg-[#00A884] rounded-full flex items-center justify-center border-[3px] border-[#111B21] hover:bg-[#06cf9c] transition-colors shadow-lg active:scale-95"
              >
                <Camera size={16} className="text-white" />
              </button>
            </>
          )}
        </div>

        {/* Name — editable for groups */}
        {contact.isGroup && editingGroupName ? (
          <div className="flex items-center gap-2 w-full justify-center mt-1">
            <input
              value={groupNameEdit}
              onChange={e => setGroupNameEdit(e.target.value)}
              className="bg-[#2A3942] text-[#E9EDEF] rounded-xl px-4 py-2 outline-none border-2 border-[#00A884] text-center"
              style={{ fontSize: '1.15rem', fontWeight: 600, maxWidth: '220px' }}
              maxLength={25}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') saveGroupName();
                if (e.key === 'Escape') setEditingGroupName(false);
              }}
            />
            <button
              onClick={saveGroupName}
              className="w-10 h-10 bg-[#00A884] rounded-full flex items-center justify-center flex-shrink-0 active:scale-95"
            >
              <Check size={18} className="text-white" />
            </button>
          </div>
        ) : (
          <div className="text-center">
            <button
              onClick={() => contact.isGroup ? (setGroupNameEdit(contact.name), setEditingGroupName(true)) : undefined}
              className={`flex items-center gap-1.5 justify-center ${contact.isGroup ? 'group' : ''}`}
            >
              <h2 className="text-[#E9EDEF]" style={{ fontSize: '1.3rem', fontWeight: 600 }}>
                {contact.name}
              </h2>
              {contact.isGroup && (
                <Edit3 size={15} className="text-[#8696A0] group-hover:text-[#00A884] transition-colors mt-0.5 flex-shrink-0" />
              )}
            </button>
            {!contact.isGroup && (
              <p className="text-[#8696A0] mt-1" style={{ fontSize: '0.875rem' }}>{contact.phone}</p>
            )}
            {contact.isGroup && (
              <p className="text-[#8696A0] mt-1" style={{ fontSize: '0.875rem' }}>
                {contact.members?.length} members · Tap name to edit
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mt-2 flex-wrap justify-center">
          {!contact.isGroup && (
            <>
              <ActionButton icon={<MessageSquare size={20} />} label="Message" onClick={onClose} />
              <ActionButton icon={<Phone size={20} />} label="Voice" onClick={() => startCall('voice')} />
              <ActionButton icon={<Video size={20} />} label="Video" onClick={() => startCall('video')} />
            </>
          )}
          <ActionButton
            icon={<Search size={20} />}
            label="Search"
            onClick={() => { onClose(); onSearchChat?.(); }}
          />
        </div>
      </div>

      {/* ── About / Group description ── */}
      <InfoSection>
        <p className="text-[#00A884] mb-1.5" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {contact.isGroup ? 'Description' : 'About'}
        </p>
        <p className="text-[#E9EDEF]" style={{ fontSize: '0.95rem' }}>{contact.about}</p>
        {!contact.isGroup && (
          <p className="text-[#8696A0] mt-1" style={{ fontSize: '0.78rem' }}>
            {contact.isOnline ? 'Online' : contact.lastSeen}
          </p>
        )}
      </InfoSection>

      {/* ── Media, Docs & Links (tabbed) ── */}
      <InfoSection>
        <p className="text-[#E9EDEF] mb-3" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Media, links and docs
        </p>

        {totalShared === 0 ? (
          <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>
            No media, links or docs shared yet
          </p>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex border-b border-[#2A3942] mb-3">
              {tabDefs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMediaTab(tab.id)}
                  className={`flex-1 pb-2.5 flex items-center justify-center gap-1.5 relative transition-colors ${
                    mediaTab === tab.id ? 'text-[#00A884]' : 'text-[#8696A0] hover:text-[#aebac1]'
                  }`}
                  style={{ fontSize: '0.85rem', fontWeight: mediaTab === tab.id ? 600 : 400 }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 ${
                        mediaTab === tab.id ? 'bg-[#00A884]/20 text-[#00A884]' : 'bg-[#2A3942] text-[#8696A0]'
                      }`}
                      style={{ fontSize: '0.65rem', fontWeight: 700 }}
                    >
                      {tab.count}
                    </span>
                  )}
                  {mediaTab === tab.id && (
                    <motion.div
                      layoutId="mediaTabBar"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00A884] rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* ── Media tab ── */}
            <AnimatePresence mode="wait">
              {mediaTab === 'media' && (
                <motion.div
                  key="media"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {mediaMessages.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2">
                      <ImageIcon size={36} className="text-[#2A3942]" />
                      <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>No media shared yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      {mediaMessages.map(m => (
                        <button
                          key={m.id}
                          className="aspect-square rounded-lg overflow-hidden bg-[#2A3942] active:opacity-80"
                          onClick={() => setLightboxImage((m as any).imageUrl)}
                        >
                          <img
                            src={(m as any).imageUrl}
                            alt="media"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Docs tab ── */}
              {mediaTab === 'docs' && (
                <motion.div
                  key="docs"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {docMessages.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2">
                      <FileText size={36} className="text-[#2A3942]" />
                      <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>No documents shared yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docMessages.map(m => {
                        const filename = m.content.replace('📎 ', '');
                        const ext = filename.includes('.')
                          ? filename.split('.').pop()?.toUpperCase() || 'FILE'
                          : 'FILE';
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 bg-[#2A3942] rounded-xl px-3 py-2.5 active:opacity-80"
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#00A884]/20 flex items-center justify-center flex-shrink-0">
                              <FileText size={18} className="text-[#00A884]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[#E9EDEF]" style={{ fontSize: '0.82rem', fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.3 }}>
                                {filename}
                              </p>
                              <p className="text-[#8696A0] mt-0.5" style={{ fontSize: '0.7rem' }}>
                                {ext} · {m.timestamp}
                              </p>
                            </div>
                            <Download size={16} className="text-[#8696A0] flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Links tab ── */}
              {mediaTab === 'links' && (
                <motion.div
                  key="links"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {linkMessages.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-2">
                      <LinkIcon size={36} className="text-[#2A3942]" />
                      <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>No links shared yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkMessages.map(m => (
                        <a
                          key={m.id}
                          href={m.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 bg-[#2A3942] rounded-xl px-3 py-2.5 active:opacity-80"
                        >
                          <div className="w-10 h-10 rounded-xl bg-[#53bdeb]/15 flex items-center justify-center flex-shrink-0">
                            <ExternalLink size={17} className="text-[#53bdeb]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[#E9EDEF] truncate" style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                              {m.linkTitle || m.linkUrl}
                            </p>
                            <p className="text-[#53bdeb] truncate mt-0.5" style={{ fontSize: '0.7rem' }}>
                              {m.linkDomain || m.linkUrl}
                            </p>
                          </div>
                          <ExternalLink size={13} className="text-[#8696A0] flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </InfoSection>

      {/* ── Notifications toggle ── */}
      <InfoSection>
        <button onClick={() => setIsMuted(v => !v)} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={18} className={isMuted ? 'text-[#00A884]' : 'text-[#8696A0]'} />
            <div className="text-left">
              <span className="text-[#E9EDEF]">Mute notifications</span>
              {isMuted && <p className="text-[#00A884]" style={{ fontSize: '0.75rem' }}>Muted</p>}
            </div>
          </div>
          <div className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${isMuted ? 'bg-[#00A884]' : 'bg-[#2A3942]'}`}>
            <motion.div
              animate={{ x: isMuted ? 23 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
            />
          </div>
        </button>
      </InfoSection>

      {/* ── Group members ── */}
      {contact.isGroup && contact.members && (
        <InfoSection>
          <p className="text-[#00A884] mb-3" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {contact.members.length} Members
          </p>
          <div className="space-y-2">
            {contact.members.map(memberId => {
              if (memberId === 'me') return (
                <div key="me" className="flex items-center gap-3 py-1">
                  <div className="w-10 h-10 rounded-full bg-[#00A884]/20 flex items-center justify-center">
                    <span className="text-[#00A884]" style={{ fontSize: '0.85rem', fontWeight: 600 }}>ME</span>
                  </div>
                  <div>
                    <p className="text-[#E9EDEF]" style={{ fontSize: '0.9rem' }}>You</p>
                    <p className="text-[#00A884]" style={{ fontSize: '0.75rem' }}>Group admin</p>
                  </div>
                </div>
              );
              const m = contacts.find(c => c.id === memberId);
              if (!m) return null;
              return (
                <div key={memberId} className="flex items-center gap-3 py-1">
                  <Avatar src={m.avatar} name={m.name} color={m.avatarColor} size={40} isOnline={m.isOnline} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[#E9EDEF]" style={{ fontSize: '0.9rem' }}>{m.name}</p>
                    <p className="text-[#8696A0] truncate" style={{ fontSize: '0.75rem' }}>{m.about}</p>
                  </div>
                  {m.isOnline && (
                    <span className="w-2 h-2 rounded-full bg-[#00A884] flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </InfoSection>
      )}

      {/* ── Danger zone ── */}
      <div className="px-4 py-2 space-y-1 mb-8">
        <button
          onClick={onClose}
          className="w-full flex items-center gap-3 py-3.5 px-2 rounded-xl hover:bg-[#2A3942] text-red-400 transition-colors"
        >
          <Trash2 size={18} />
          <span style={{ fontSize: '0.95rem' }}>Delete chat</span>
        </button>
        {!contact.isGroup && (
          <button className="w-full flex items-center gap-3 py-3.5 px-2 rounded-xl hover:bg-[#2A3942] text-red-400 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <span style={{ fontSize: '0.95rem' }}>Block {contact.name}</span>
          </button>
        )}
      </div>

      {/* ── Image Lightbox ── */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black flex flex-col"
            onClick={() => setLightboxImage(null)}
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-black/60 flex-shrink-0">
              <button
                onClick={() => setLightboxImage(null)}
                className="text-white p-1 rounded-full hover:bg-white/10"
              >
                <X size={22} />
              </button>
              <span className="text-white flex-1" style={{ fontWeight: 500 }}>Photo</span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  const a = document.createElement('a');
                  a.href = lightboxImage!;
                  a.download = 'photo.jpg';
                  a.click();
                }}
                className="text-white p-1 rounded-full hover:bg-white/10"
              >
                <Download size={20} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-3">
              <img
                src={lightboxImage}
                alt="fullscreen"
                className="max-w-full max-h-full rounded-xl"
                style={{ objectFit: 'contain' }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoSection({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-[#2A3942]">
      {children}
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 bg-[#202C33] hover:bg-[#2A3942] rounded-xl px-5 py-3 transition-colors active:scale-95"
    >
      <span className="text-[#00A884]">{icon}</span>
      <span className="text-[#8696A0]" style={{ fontSize: '0.72rem' }}>{label}</span>
    </button>
  );
}