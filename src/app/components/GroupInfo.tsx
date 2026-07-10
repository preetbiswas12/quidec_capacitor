import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  X, Search, Bell, Trash2, MessageSquare,
  FileText, ExternalLink, Download, Image as ImageIcon, Link as LinkIcon,
  Camera, Edit3, Check, ChevronRight, ShieldAlert, LogOut, UserPlus,
  Copy, Share2, ArrowLeft, Crown,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

type MediaTab = 'media' | 'docs' | 'links';

export default function GroupInfo() {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    contacts, messages, updateContact, updateGroupInfo,
    addGroupMembers, removeGroupMember, leaveGroup, transferOwnership,
    currentUser, groups, markGroupRead,
  } = useApp();

  const group = groups.find(g => g.groupId === groupId);
  const contact = contacts.find(c => c.id === groupId);

  const [isMuted, setIsMuted] = useState(false);
  const [mediaTab, setMediaTab] = useState<MediaTab>('media');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameEdit, setGroupNameEdit] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionEdit, setDescriptionEdit] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [showInviteCode, setShowInviteCode] = useState(false);
  const groupIconInputRef = useRef<HTMLInputElement>(null);

  if (!contact || !group) {
    return (
      <div className="h-full flex items-center justify-center bg-wa-main">
        <div className="text-center text-wa-text-muted">
          <p>Group not found</p>
          <button onClick={() => navigate('/app')} className="mt-4 text-wa-accent">Go back</button>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser && (group.admins || []).includes(currentUser.userId);
  const isCurrentUserAdmin = isAdmin;

  const handleGroupIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (isCurrentUserAdmin && currentUser) {
        updateGroupInfo(groupId!, { avatar: dataUrl }, currentUser.userId);
      }
      updateContact(groupId!, { avatar: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveGroupName = async () => {
    if (!groupNameEdit.trim()) { setEditingGroupName(false); return; }
    try {
      if (isCurrentUserAdmin && currentUser) {
        await updateGroupInfo(groupId!, { name: groupNameEdit.trim() }, currentUser.userId);
      }
      updateContact(groupId!, { name: groupNameEdit.trim() });
    } catch (err: any) {
      alert(err.message || 'Failed to update group');
    }
    setEditingGroupName(false);
  };

  const saveDescription = async () => {
    try {
      if (isCurrentUserAdmin && currentUser) {
        await updateGroupInfo(groupId!, { description: descriptionEdit.trim() }, currentUser.userId);
      }
      updateContact(groupId!, { about: descriptionEdit.trim() });
    } catch (err: any) {
      alert(err.message || 'Failed to update description');
    }
    setEditingDescription(false);
  };

  const copyInviteCode = () => {
    const code = group.inviteCode;
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success('Invite code copied!');
  };

  const shareInviteCode = async () => {
    const code = group.inviteCode;
    if (!code) return;
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: `Join ${group.name} on Veill`,
        text: `Join my Veill group "${group.name}" using code: ${code}`,
        dialogTitle: 'Invite to group',
      });
    } catch {
      copyInviteCode();
    }
  };

  // Pull real media/links/docs from this chat's messages
  const chatMessages = messages[groupId!] || [];
  const mediaMessages = chatMessages.filter(m => m.type === 'image' && (m as any).imageUrl);
  const docMessages   = chatMessages.filter(m => m.type === 'document');
  const linkMessages  = chatMessages.filter(m => m.type === 'link');
  const totalShared   = mediaMessages.length + docMessages.length + linkMessages.length;

  const tabDefs: { id: MediaTab; label: string; count: number }[] = [
    { id: 'media', label: 'Media', count: mediaMessages.length },
    { id: 'docs',  label: 'Docs',  count: docMessages.length },
    { id: 'links', label: 'Links', count: linkMessages.length },
  ];

  const openGroupChat = () => {
    setActiveChatInContext(groupId!);
    navigate(`/app/chat/${groupId}`);
  };

  return (
    <div className="h-full flex flex-col bg-wa-main overflow-y-auto no-scrollbar pb-12">
      {/* Hidden file input for group icon */}
      <input ref={groupIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleGroupIconSelect} />

      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-4 py-4 pt-safe bg-wa-header flex-shrink-0 border-b border-wa-border/10">
        <button
          onClick={() => navigate(-1)}
          className="text-wa-header-icon hover:text-wa-primary p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors"
        >
          <X size={20} />
        </button>
        <span className="text-wa-primary" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
          Group Info
        </span>
      </div>

      {/* ── Profile ── */}
      <div className="flex flex-col items-center py-10 px-6 bg-wa-header/20 border-b border-wa-border/10">
        <div className="relative group">
          <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={120} isOnline={false} />
          {isCurrentUserAdmin && (
            <>
              <button
                onClick={() => groupIconInputRef.current?.click()}
                className="absolute bottom-1 right-1 w-10 h-10 bg-wa-accent rounded-full flex items-center justify-center border-[3px] border-wa-main hover:bg-wa-accent/90 transition-all shadow-xl active:scale-90"
              >
                <Camera size={18} className="text-white" />
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center w-full">
          {editingGroupName ? (
            <div className="flex items-center justify-center gap-2">
              <input
                value={groupNameEdit}
                onChange={e => setGroupNameEdit(e.target.value)}
                className="bg-wa-secondary text-wa-primary rounded-lg px-3 py-1 outline-none border border-wa-accent text-center font-bold"
                style={{ fontSize: '1.2rem' }}
                maxLength={30}
                autoFocus
              />
              <button onClick={saveGroupName} className="w-8 h-8 bg-wa-accent rounded-full flex items-center justify-center">
                <Check size={14} className="text-white" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-wa-primary" style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
                {contact.name}
              </h2>
              {isCurrentUserAdmin && (
                <button onClick={() => { setGroupNameEdit(contact.name); setEditingGroupName(true); }} className="text-wa-text-muted hover:text-wa-primary p-1">
                  <Edit3 size={16} />
                </button>
              )}
            </div>
          )}
          <p className="text-wa-accent mt-1 font-bold" style={{ fontSize: '0.85rem' }}>
            {contact.members?.length} MEMBERS
            {isCurrentUserAdmin && <span className="ml-2 inline-flex items-center gap-1 text-wa-star"><Crown size={12} /> ADMIN</span>}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-8 mt-8 justify-center">
          <ActionButton icon={<MessageSquare size={24} />} label="Message" onClick={openGroupChat} />
        </div>
      </div>

      {/* ── About / Description ── */}
      <div className="px-5 py-6 border-b border-wa-border/10">
        {editingDescription ? (
          <div>
            <input
              value={descriptionEdit}
              onChange={e => setDescriptionEdit(e.target.value)}
              className="w-full bg-wa-secondary text-wa-primary rounded-lg px-3 py-2 outline-none border border-wa-accent"
              style={{ fontSize: '0.95rem' }}
              maxLength={100}
              autoFocus
              placeholder="Group description"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={saveDescription} className="px-4 py-1.5 bg-wa-accent text-white rounded-lg text-sm">Save</button>
              <button onClick={() => setEditingDescription(false)} className="px-4 py-1.5 bg-wa-secondary text-wa-text-muted rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-wa-accent" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                DESCRIPTION
              </p>
              {isCurrentUserAdmin && (
                <button onClick={() => { setDescriptionEdit(contact.about); setEditingDescription(true); }} className="text-wa-text-muted hover:text-wa-primary">
                  <Edit3 size={14} />
                </button>
              )}
            </div>
            <p className="text-wa-primary leading-relaxed" style={{ fontSize: '1rem' }}>{contact.about || 'No description provided.'}</p>
          </>
        )}
      </div>

      {/* ── Invite Code ── */}
      {group.inviteCode && (
        <div className="px-5 py-6 border-b border-wa-border/10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-wa-accent" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
              INVITE CODE
            </p>
            <button onClick={() => setShowInviteCode(v => !v)} className="text-wa-text-muted text-xs">
              {showInviteCode ? 'Hide' : 'Show'}
            </button>
          </div>
          {showInviteCode && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex items-center gap-2">
              <code className="flex-1 bg-wa-secondary rounded-lg px-4 py-3 text-wa-accent font-mono font-bold text-lg tracking-widest select-all">
                {group.inviteCode}
              </code>
              <button onClick={copyInviteCode} className="p-3 bg-wa-accent/10 text-wa-accent rounded-lg hover:bg-wa-accent/20 transition-colors" title="Copy code">
                <Copy size={18} />
              </button>
              <button onClick={shareInviteCode} className="p-3 bg-wa-accent/10 text-wa-accent rounded-lg hover:bg-wa-accent/20 transition-colors" title="Share code">
                <Share2 size={18} />
              </button>
            </motion.div>
          )}
          {!showInviteCode && (
            <p className="text-wa-text-muted text-sm">Tap "Show" to reveal the invite code</p>
          )}
        </div>
      )}

      {/* ── Group Members ── */}
      <div className="px-5 py-6 border-b border-wa-border/10">
        <div className="flex items-center justify-between mb-3">
          <p className="text-wa-accent" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {contact.members?.length || 0} MEMBERS
          </p>
          {isCurrentUserAdmin && (
            <button
              onClick={() => setShowAddMembers(true)}
              className="flex items-center gap-1 text-wa-accent text-sm font-medium"
            >
              <UserPlus size={14} />
              Add
            </button>
          )}
        </div>
        <div className="space-y-1">
          {contact.members?.map((memberId: string) => {
            const member = contacts.find(c => c.id === memberId);
            const isSelf = memberId === currentUser?.userId;
            const memberIsAdmin = (group.admins || []).includes(memberId);
            return (
              <div key={memberId} className="flex items-center gap-3 py-2">
                <Avatar src={member?.avatar || null} name={member?.name || 'Unknown'} color={member?.avatarColor || '#8696A0'} size={36} isOnline={member?.isOnline} />
                <div className="flex-1 min-w-0">
                  <p className="text-wa-primary text-sm font-medium truncate">
                    {member?.name || memberId}
                    {isSelf && <span className="text-wa-text-muted font-normal"> (You)</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    {member?.isOnline && <p className="text-wa-accent text-xs">online</p>}
                    {memberIsAdmin && <span className="inline-flex items-center gap-0.5 text-wa-star text-xs"><Crown size={10} /> admin</span>}
                  </div>
                </div>
                {/* Admin actions */}
                {isCurrentUserAdmin && !isSelf && (
                  <div className="flex items-center gap-1">
                    {!memberIsAdmin && contact.members!.length > 2 && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`Remove ${member?.name || memberId} from the group?`)) {
                            try {
                              if (currentUser) await removeGroupMember(groupId!, memberId, currentUser.userId);
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }
                        }}
                        className="text-wa-text-muted hover:text-red-400 p-1"
                        title="Remove from group"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {!memberIsAdmin && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`Make ${member?.name || memberId} an admin?`)) {
                            try {
                              if (currentUser) {
                                // Add to admins array via updateGroupInfo workaround — use direct Firestore
                                const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
                                const { db } = await import('../../utils/firebase');
                                await updateDoc(doc(db, 'groups', groupId!), { admins: arrayUnion(memberId) });
                              }
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }
                        }}
                        className="text-wa-text-muted hover:text-wa-star p-1"
                        title="Make admin"
                      >
                        <Crown size={16} />
                      </button>
                    )}
                    {memberIsAdmin && (
                      <button
                        onClick={async () => {
                          if (window.confirm(`Transfer ownership to ${member?.name || memberId}? You will lose admin rights.`)) {
                            try {
                              await transferOwnership(groupId!, memberId);
                              toast.success(`Ownership transferred to ${member?.name || memberId}`);
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }
                        }}
                        className="text-wa-text-muted hover:text-wa-accent p-1"
                        title="Transfer ownership"
                      >
                        <ArrowLeft size={16} className="rotate-180" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Add Members overlay ── */}
      {showAddMembers && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full bg-wa-main rounded-t-2xl p-4 max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-wa-primary font-bold">Add Members</h3>
              <button onClick={() => { setShowAddMembers(false); setAddMemberSearch(''); }} className="text-wa-text-muted p-1">
                <X size={20} />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-wa-header rounded-xl px-4 py-2 mb-3">
              <Search size={16} className="text-wa-text-muted" />
              <input
                type="text"
                value={addMemberSearch}
                onChange={e => setAddMemberSearch(e.target.value)}
                placeholder="Search contacts"
                className="flex-1 bg-transparent outline-none text-wa-primary placeholder-wa-text-muted"
                style={{ fontSize: '0.9rem' }}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {contacts
                .filter(c => !c.isGroup && !contact.members?.includes(c.id) && c.name.toLowerCase().includes(addMemberSearch.toLowerCase()))
                .map(c => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      try {
                        if (currentUser) await addGroupMembers(groupId!, [c.id], currentUser.userId);
                        setShowAddMembers(false);
                        setAddMemberSearch('');
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-2 py-3 hover:bg-wa-secondary/50 transition-colors text-left"
                  >
                    <Avatar src={c.avatar} name={c.name} color={c.avatarColor} size={40} isOnline={c.isOnline} />
                    <div className="flex-1 min-w-0">
                      <p className="text-wa-primary text-sm font-medium">{c.name}</p>
                      <p className="text-wa-text-muted text-xs">{c.userId}</p>
                    </div>
                    <UserPlus size={16} className="text-wa-accent" />
                  </button>
                ))}
              {contacts.filter(c => !c.isGroup && !contact.members?.includes(c.id)).length === 0 && (
                <div className="text-center py-8 text-wa-text-muted text-sm">
                  All contacts are already in this group
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Media, Docs & Links ── */}
      <div className="px-5 py-6 border-b border-wa-border/10">
        <button onClick={() => {}} className="w-full flex items-center justify-between mb-4">
          <p className="text-wa-primary" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Media, links and docs
          </p>
          <div className="flex items-center gap-1 text-wa-text-muted">
            <span style={{ fontSize: '0.9rem' }}>{totalShared}</span>
            <ChevronRight size={16} />
          </div>
        </button>

        {totalShared > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {mediaMessages.slice(0, 5).map(m => (
              <button
                key={m.id}
                className="w-20 h-20 rounded-xl overflow-hidden bg-wa-secondary/20 flex-shrink-0"
                onClick={() => setLightboxImage((m as any).imageUrl)}
              >
                <img src={(m as any).imageUrl} alt="media" className="w-full h-full object-cover" />
              </button>
            ))}
            {totalShared > 5 && (
              <div className="w-20 h-20 rounded-xl bg-wa-secondary/40 flex items-center justify-center text-wa-text-muted flex-shrink-0">
                +{totalShared - 5}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <div className="px-5 py-2">
        <div className="flex items-center justify-between py-4 border-b border-wa-border/10">
          <div className="flex items-center gap-4">
            <Bell size={20} className="text-wa-text-muted" />
            <span className="text-wa-primary font-medium">Mute notifications</span>
          </div>
          <div onClick={() => setIsMuted(!isMuted)} className={`relative w-11 h-5 rounded-full transition-colors cursor-pointer ${isMuted ? 'bg-wa-accent' : 'bg-wa-secondary'}`}>
            <motion.div animate={{ x: isMuted ? 24 : 2 }} className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm" />
          </div>
        </div>

        <div
          onClick={() => {
            toast.info(`Blocking ${contact.name}`, {
              description: 'You will no longer receive messages from this group.',
            });
          }}
          className="flex items-center gap-4 py-4 border-b border-wa-border/10 text-red-500 cursor-pointer hover:bg-wa-secondary/30 transition-colors"
        >
          <ShieldAlert size={20} />
          <span className="font-medium">Block group</span>
        </div>

        <div
          onClick={async () => {
            if (window.confirm('Are you sure you want to leave this group?')) {
              try {
                await leaveGroup(groupId!);
                navigate('/app');
              } catch (err: any) {
                alert(err.message);
              }
            }
          }}
          className="flex items-center gap-4 py-4 text-red-500 cursor-pointer hover:bg-wa-secondary/30 transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Leave Group</span>
        </div>
      </div>

      {/* ── Image Lightbox ── */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] bg-black flex flex-col" onClick={() => setLightboxImage(null)}>
            <div className="flex items-center gap-3 px-4 py-3 bg-black/60 flex-shrink-0 pt-safe">
              <button onClick={() => setLightboxImage(null)} className="text-white p-2"><X size={24} /></button>
              <span className="text-white flex-1 font-bold">PHOTO</span>
              <button onClick={e => { e.stopPropagation(); }} className="text-white p-2"><Download size={22} /></button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4"><img src={lightboxImage} alt="fullscreen" className="max-w-full max-h-full rounded-2xl shadow-2xl" style={{ objectFit: 'contain' }} onClick={e => e.stopPropagation()} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group active:opacity-60 transition-opacity">
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-wa-accent bg-wa-accent/10 border border-wa-accent/20 group-hover:bg-wa-accent/20 transition-colors">
        {icon}
      </div>
      <span className="text-wa-text-muted font-bold" style={{ fontSize: '0.72rem', letterSpacing: '0.3px' }}>{label.toUpperCase()}</span>
    </button>
  );
}

/** Helper to set active chat in context — imported from useApp but we need a lightweight version */
function setActiveChatInContext(chatId: string) {
  // This is a no-op placeholder — the actual context is set by ChatWindow on mount.
  // Navigation to /app/chat/:id will trigger ChatWindow which calls setActiveChatId.
}
