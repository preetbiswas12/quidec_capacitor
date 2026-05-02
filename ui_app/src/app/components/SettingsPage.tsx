import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  User, Bell, Lock, MessageSquare, Palette, HelpCircle, LogOut,
  ChevronRight, Star, Download, Globe, Smartphone, ArrowLeft,
  Edit3, Check, Mail, Eye, Trash2, AlertTriangle,
  Database, HardDrive, Volume2, VolumeX, Moon, AtSign, Copy, Camera,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

type SubPage =
  | null
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'chats'
  | 'appearance'
  | 'storage'
  | 'linked-devices'
  | 'starred'
  | 'help';

interface SettingsPageProps {
  onSubPageChange?: (page: string | null) => void;
  forcedSubPage?: string | null;
}

export default function SettingsPage({ onSubPageChange, forcedSubPage }: SettingsPageProps = {}) {
  const { currentUser, updateCurrentUser, logout, settings, updateSettings } = useApp();
  const [localSubPage, setLocalSubPage] = useState<SubPage>(null);
  const [editName, setEditName] = useState(currentUser.name);
  const [editAbout, setEditAbout] = useState(currentUser.about);
  const [editingName, setEditingName] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateCurrentUser({ avatar: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // If parent controls subpage (via forcedSubPage), use that; otherwise use local state
  const subPage: SubPage = (forcedSubPage as SubPage) ?? localSubPage;

  const go = (page: SubPage) => {
    if (onSubPageChange) {
      onSubPageChange(page);
    } else {
      setLocalSubPage(page);
    }
  };

  const back = () => {
    if (onSubPageChange) {
      onSubPageChange(null);
    } else {
      setLocalSubPage(null);
    }
  };

  const saveName = () => {
    if (editName.trim()) updateCurrentUser({ name: editName.trim() });
    setEditingName(false);
  };

  const saveAbout = () => {
    if (editAbout.trim()) updateCurrentUser({ about: editAbout.trim() });
    setEditingAbout(false);
  };

  const settingsItems = [
    { id: 'account', icon: User, label: 'Account', desc: 'Privacy, security, change email', color: '#2979ff' },
    { id: 'privacy', icon: Lock, label: 'Privacy', desc: 'Block contacts, disappearing messages', color: '#00897b' },
    { id: 'notifications', icon: Bell, label: 'Notifications', desc: 'Message, group & call tones', color: '#e91e63' },
    { id: 'chats', icon: MessageSquare, label: 'Chats', desc: 'Theme, wallpapers, chat history', color: '#43a047' },
    { id: 'appearance', icon: Palette, label: 'Appearance', desc: 'Theme, font size', color: '#7b1fa2' },
    { id: 'storage', icon: Download, label: 'Storage and Data', desc: 'Network usage, auto-download', color: '#ff8f00' },
    { id: 'linked-devices', icon: Smartphone, label: 'Linked Devices', desc: '1 device linked', color: '#6d4c41' },
    { id: 'starred', icon: Star, label: 'Starred Messages', desc: '', color: '#f9a825' },
    { id: 'help', icon: HelpCircle, label: 'Help', desc: 'FAQ, contact us, privacy policy', color: '#00acc1' },
  ] as const;

  // ─── Sub-pages ──────────────────────────────────────────────────────────────

  const renderSubPage = () => {
    switch (subPage) {
      // ── Account ──
      case 'account':
        return (
          <SubPageShell title="Account" onBack={back}>
            {/* Avatar change hero */}
            <div className="flex flex-col items-center py-8 bg-[#111B21] border-b border-[#2A3942]">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#202C33] flex-shrink-0">
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#00A884]/20 flex items-center justify-center">
                      <span className="text-[#00A884]" style={{ fontSize: '2rem', fontWeight: 700 }}>
                        {currentUser.name ? currentUser.name[0].toUpperCase() : '?'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-10 h-10 bg-[#00A884] rounded-full flex items-center justify-center border-[3px] border-[#111B21] hover:bg-[#06cf9c] transition-colors shadow-lg active:scale-95"
                >
                  <Camera size={18} className="text-white" />
                </button>
              </div>
              <p className="text-[#8696A0] mt-3" style={{ fontSize: '0.78rem' }}>
                Tap <span className="text-[#00A884]">📷</span> to change your profile photo
              </p>
            </div>

            {/* User ID card */}
            <div className="mx-4 mt-4 mb-2 bg-[#1F2C34] border border-[#2A3942] rounded-2xl px-4 py-4">
              <p className="text-[#00A884] mb-1" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your WhatsApp ID
              </p>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <AtSign size={18} className="text-[#00A884]" />
                  <span className="text-[#E9EDEF]" style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                    {currentUser.userId || '@user.0000'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentUser.userId || '').catch(() => {});
                    setIdCopied(true);
                    setTimeout(() => setIdCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 bg-[#00A884]/10 hover:bg-[#00A884]/20 text-[#00A884] rounded-full px-3 py-1.5 transition-colors"
                  style={{ fontSize: '0.78rem', fontWeight: 600 }}
                >
                  {idCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
              <p className="text-[#8696A0] mt-2" style={{ fontSize: '0.75rem' }}>
                Share this ID so others can find and message you on WhatsApp.
              </p>
            </div>

            <Section>
              <p className="text-[#00A884] px-4 pb-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>EMAIL ADDRESS</p>
              <Row
                icon={<Mail size={18} className="text-[#8696A0]" />}
                label={currentUser.email || 'Not set'}
                sub="Tap to change email"
              />
            </Section>
            <Section>
              <p className="text-[#00A884] px-4 pb-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>NAME</p>
              {editingName ? (
                <div className="px-4 py-3 flex items-center gap-3">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 bg-[#2A3942] text-[#E9EDEF] rounded-lg px-3 py-2 outline-none border border-[#00A884]"
                    style={{ fontSize: '0.95rem' }}
                    maxLength={25}
                    autoFocus
                  />
                  <button onClick={saveName} className="w-9 h-9 bg-[#00A884] rounded-full flex items-center justify-center">
                    <Check size={16} className="text-white" />
                  </button>
                </div>
              ) : (
                <Row
                  icon={<User size={18} className="text-[#8696A0]" />}
                  label={currentUser.name}
                  action={<Edit3 size={16} className="text-[#8696A0]" />}
                  onClick={() => { setEditName(currentUser.name); setEditingName(true); }}
                />
              )}
            </Section>
            <Section>
              <p className="text-[#00A884] px-4 pb-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>ABOUT</p>
              {editingAbout ? (
                <div className="px-4 py-3 flex items-center gap-3">
                  <input
                    value={editAbout}
                    onChange={e => setEditAbout(e.target.value)}
                    className="flex-1 bg-[#2A3942] text-[#E9EDEF] rounded-lg px-3 py-2 outline-none border border-[#00A884]"
                    style={{ fontSize: '0.95rem' }}
                    maxLength={139}
                    autoFocus
                  />
                  <button onClick={saveAbout} className="w-9 h-9 bg-[#00A884] rounded-full flex items-center justify-center">
                    <Check size={16} className="text-white" />
                  </button>
                </div>
              ) : (
                <Row
                  icon={<Edit3 size={18} className="text-[#8696A0]" />}
                  label={currentUser.about}
                  action={<Edit3 size={16} className="text-[#8696A0]" />}
                  onClick={() => { setEditAbout(currentUser.about); setEditingAbout(true); }}
                />
              )}
            </Section>
            <Section>
              <button
                onClick={logout}
                className="w-full flex items-center gap-4 px-4 py-3.5 text-red-400 hover:bg-[#2A3942] rounded-xl transition-colors"
              >
                <AlertTriangle size={18} />
                <span style={{ fontSize: '0.95rem' }}>Delete my account</span>
              </button>
            </Section>
          </SubPageShell>
        );

      // ── Privacy ──
      case 'privacy':
        return (
          <SubPageShell title="Privacy" onBack={back}>
            <Section label="WHO CAN SEE MY INFO">
              <OptionRow
                label="Last seen & online"
                value={settings.lastSeenVisibility === 'everyone' ? 'Everyone' : settings.lastSeenVisibility === 'contacts' ? 'My Contacts' : 'Nobody'}
                onClick={() => {
                  const next = settings.lastSeenVisibility === 'everyone' ? 'contacts' : settings.lastSeenVisibility === 'contacts' ? 'nobody' : 'everyone';
                  updateSettings({ lastSeenVisibility: next as any });
                }}
              />
              <OptionRow
                label="Profile photo"
                value={settings.profilePhotoVisibility === 'everyone' ? 'Everyone' : settings.profilePhotoVisibility === 'contacts' ? 'My Contacts' : 'Nobody'}
                onClick={() => {
                  const next = settings.profilePhotoVisibility === 'everyone' ? 'contacts' : settings.profilePhotoVisibility === 'contacts' ? 'nobody' : 'everyone';
                  updateSettings({ profilePhotoVisibility: next as any });
                }}
              />
            </Section>
            <Section label="MESSAGING">
              <ToggleRow
                icon={<Eye size={18} className="text-[#8696A0]" />}
                label="Read receipts"
                desc="When turned off, you won't send or receive read receipts."
                value={settings.readReceipts}
                onChange={v => updateSettings({ readReceipts: v })}
              />
            </Section>
            <Section label="SECURITY">
              <Row icon={<Lock size={18} className="text-[#8696A0]" />} label="Two-step verification" sub="Enabled" />
              <Row icon={<Smartphone size={18} className="text-[#8696A0]" />} label="Change passcode" />
            </Section>
          </SubPageShell>
        );

      // ── Notifications ──
      case 'notifications':
        return (
          <SubPageShell title="Notifications" onBack={back}>
            <Section label="MESSAGES">
              <ToggleRow
                icon={<Bell size={18} className="text-[#8696A0]" />}
                label="Message notifications"
                value={settings.notifications}
                onChange={v => updateSettings({ notifications: v })}
              />
              <Row icon={<Volume2 size={18} className="text-[#8696A0]" />} label="Notification tone" sub="Default" />
              <Row icon={<VolumeX size={18} className="text-[#8696A0]" />} label="Vibrate" sub="Default" />
            </Section>
            <Section label="GROUPS">
              <ToggleRow
                icon={<Bell size={18} className="text-[#8696A0]" />}
                label="Group notifications"
                value={settings.groupNotifications}
                onChange={v => updateSettings({ groupNotifications: v })}
              />
            </Section>
            <Section label="CALLS">
              <ToggleRow
                icon={<Bell size={18} className="text-[#8696A0]" />}
                label="Call notifications"
                value={settings.callNotifications}
                onChange={v => updateSettings({ callNotifications: v })}
              />
            </Section>
          </SubPageShell>
        );

      // ── Chats ──
      case 'chats':
        return (
          <SubPageShell title="Chats" onBack={back}>
            <Section label="DISPLAY">
              <ToggleRow
                icon={<MessageSquare size={18} className="text-[#8696A0]" />}
                label="Enter sends message"
                desc="Press Enter to send, Shift+Enter for new line"
                value={settings.enterSendsMessage}
                onChange={v => updateSettings({ enterSendsMessage: v })}
              />
            </Section>
            <Section label="CHAT HISTORY">
              <Row icon={<Database size={18} className="text-[#8696A0]" />} label="Export chat" />
              <button className="w-full flex items-center gap-4 px-4 py-3.5 text-red-400 hover:bg-[#2A3942] transition-colors">
                <Trash2 size={18} />
                <div className="text-left">
                  <p style={{ fontSize: '0.95rem' }}>Clear all chats</p>
                </div>
              </button>
            </Section>
          </SubPageShell>
        );

      // ── Appearance ──
      case 'appearance':
        return (
          <SubPageShell title="Appearance" onBack={back}>
            <Section label="THEME">
              <div className="px-4 py-3">
                <p className="text-[#E9EDEF] mb-3" style={{ fontSize: '0.95rem', fontWeight: 500 }}>App theme</p>
                <div className="flex gap-3">
                  {(['dark'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateSettings({ theme: t })}
                      className={`flex-1 py-3 rounded-xl border-2 transition-colors ${settings.theme === t ? 'border-[#00A884] bg-[#00A884]/10' : 'border-[#2A3942]'}`}
                    >
                      <Moon size={20} className="mx-auto text-[#E9EDEF] mb-1" />
                      <p className="text-[#E9EDEF] text-center" style={{ fontSize: '0.8rem' }}>Dark</p>
                    </button>
                  ))}
                </div>
              </div>
            </Section>
            <Section label="TEXT SIZE">
              <div className="px-4 py-3">
                <p className="text-[#8696A0] mb-3" style={{ fontSize: '0.82rem' }}>Font size</p>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => updateSettings({ fontSize: size })}
                      className={`flex-1 py-2.5 rounded-xl border-2 transition-colors capitalize ${settings.fontSize === size ? 'border-[#00A884] bg-[#00A884]/10 text-[#00A884]' : 'border-[#2A3942] text-[#8696A0]'}`}
                      style={{ fontSize: size === 'small' ? '0.75rem' : size === 'large' ? '1rem' : '0.875rem' }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <p className="text-[#E9EDEF] mt-4 text-center" style={{ fontSize: settings.fontSize === 'small' ? '0.8rem' : settings.fontSize === 'large' ? '1.05rem' : '0.9rem' }}>
                  This is how your messages will look.
                </p>
              </div>
            </Section>
          </SubPageShell>
        );

      // ── Storage ──
      case 'storage':
        return (
          <SubPageShell title="Storage and Data" onBack={back}>
            <Section>
              <div className="px-4 py-4">
                <p className="text-[#E9EDEF] mb-1" style={{ fontWeight: 600 }}>Storage usage</p>
                <div className="flex items-center gap-2 mb-3">
                  <HardDrive size={16} className="text-[#8696A0]" />
                  <span className="text-[#8696A0]" style={{ fontSize: '0.85rem' }}>1.2 GB used of 32 GB</span>
                </div>
                <div className="w-full h-2 bg-[#2A3942] rounded-full overflow-hidden">
                  <div className="h-full bg-[#00A884] rounded-full" style={{ width: '3.75%' }} />
                </div>
              </div>
            </Section>
            <Section label="NETWORK USAGE">
              <ToggleRow
                icon={<Download size={18} className="text-[#8696A0]" />}
                label="Auto-download media"
                desc="Automatically download photos and videos on Wi-Fi"
                value={settings.mediaAutoDownload}
                onChange={v => updateSettings({ mediaAutoDownload: v })}
              />
            </Section>
            <Section>
              <Row icon={<Trash2 size={18} className="text-[#8696A0]" />} label="Manage storage" />
            </Section>
          </SubPageShell>
        );

      // ── Linked Devices ──
      case 'linked-devices':
        return (
          <SubPageShell title="Linked Devices" onBack={back}>
            <div className="px-4 py-6 text-center">
              <div className="w-16 h-16 bg-[#00A884]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone size={28} className="text-[#00A884]" />
              </div>
              <p className="text-[#E9EDEF] mb-1" style={{ fontWeight: 600 }}>Link a device</p>
              <p className="text-[#8696A0]" style={{ fontSize: '0.85rem' }}>
                Use WhatsApp on other devices without keeping your phone online.
              </p>
            </div>
            <Section label="LINKED DEVICES (1)">
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2A3942] rounded-full flex items-center justify-center">
                  <Globe size={18} className="text-[#8696A0]" />
                </div>
                <div className="flex-1">
                  <p className="text-[#E9EDEF]" style={{ fontSize: '0.9rem', fontWeight: 500 }}>WhatsApp Web</p>
                  <p className="text-[#8696A0]" style={{ fontSize: '0.78rem' }}>Last active: Today</p>
                </div>
                <button className="text-red-400" style={{ fontSize: '0.82rem' }}>Log out</button>
              </div>
            </Section>
          </SubPageShell>
        );

      // ── Starred Messages ──
      case 'starred':
        return (
          <SubPageShell title="Starred Messages" onBack={back}>
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
              <div className="w-20 h-20 bg-[#f9a825]/10 rounded-full flex items-center justify-center">
                <Star size={36} className="text-[#f9a825]" />
              </div>
              <p className="text-[#E9EDEF]" style={{ fontWeight: 600 }}>No starred messages</p>
              <p className="text-[#8696A0]" style={{ fontSize: '0.85rem' }}>
                Star messages you want to find easily later. Hold a message and tap the ⭐ icon.
              </p>
            </div>
          </SubPageShell>
        );

      // ���─ Help ──
      case 'help':
        return (
          <SubPageShell title="Help" onBack={back}>
            <Section>
              <Row icon={<HelpCircle size={18} className="text-[#8696A0]" />} label="Help Centre" sub="Visit our Help Centre" />
              <Row icon={<Mail size={18} className="text-[#8696A0]" />} label="Contact us" sub="support@whatsapp.com" />
              <Row icon={<Lock size={18} className="text-[#8696A0]" />} label="Privacy policy" />
              <Row icon={<Globe size={18} className="text-[#8696A0]" />} label="Terms of Service" />
            </Section>
            <div className="px-4 py-6 text-center">
              <p className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>WhatsApp from Meta</p>
              <p className="text-[#8696A0]" style={{ fontSize: '0.75rem' }}>Version 2.25.1.1</p>
            </div>
          </SubPageShell>
        );

      default:
        return null;
    }
  };

  if (subPage) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {renderSubPage()}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto relative">
      {/* Hidden avatar input */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />

      {/* Profile section */}
      <div className="px-4 py-2 border-b border-[#2A3942]">
        {/* Use div instead of button to avoid nested-button DOM violation */}
        <div
          onClick={() => go('account')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && go('account')}
          className="w-full flex items-center gap-4 py-4 px-2 hover:bg-[#2A3942] rounded-xl cursor-pointer transition-colors group text-left"
        >
          {/* Avatar with camera overlay */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full overflow-hidden">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#00A884]/20 flex items-center justify-center">
                  <span className="text-[#00A884]" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {currentUser.name ? currentUser.name[0].toUpperCase() : '?'}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={e => { e.stopPropagation(); avatarInputRef.current?.click(); }}
              className="absolute bottom-0 right-0 w-6 h-6 bg-[#00A884] rounded-full flex items-center justify-center border-2 border-[#111B21] hover:bg-[#06cf9c] transition-colors active:scale-95"
            >
              <Camera size={11} className="text-white" />
            </button>
          </div>

          <div className="flex-1 min-w-0 text-left">
            <p className="text-[#E9EDEF]" style={{ fontSize: '1.05rem', fontWeight: 600 }}>{currentUser.name || 'Your Name'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <AtSign size={12} className="text-[#00A884] flex-shrink-0" />
              <p className="text-[#00A884]" style={{ fontSize: '0.78rem', fontWeight: 600 }}>{currentUser.userId || 'user.0000'}</p>
            </div>
            <p className="text-[#8696A0]" style={{ fontSize: '0.82rem' }}>{currentUser.about}</p>
          </div>
          <ChevronRight size={18} className="text-[#8696A0] group-hover:text-[#00A884] transition-colors flex-shrink-0" />
        </div>
      </div>

      {/* Settings items */}
      <div className="px-4 py-2">
        {settingsItems.map(item => (
          <button
            key={item.id}
            onClick={() => go(item.id as SubPage)}
            className="w-full flex items-center gap-4 py-3.5 px-2 rounded-xl hover:bg-[#2A3942] cursor-pointer transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.color}22` }}>
              <item.icon size={20} style={{ color: item.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>{item.label}</p>
              {item.desc && <p className="text-[#8696A0]" style={{ fontSize: '0.8rem' }}>{item.desc}</p>}
            </div>
            <ChevronRight size={16} className="text-[#8696A0] group-hover:text-[#00A884] transition-colors flex-shrink-0" />
          </button>
        ))}

        {/* Log out */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-4 py-3.5 px-2 rounded-xl hover:bg-[#2A3942] cursor-pointer transition-colors text-left mt-2 group"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500/10">
            <LogOut size={20} className="text-red-400" />
          </div>
          <span className="text-red-400" style={{ fontWeight: 500 }}>Log out</span>
        </button>

        <p className="text-center text-[#8696A0] py-6" style={{ fontSize: '0.75rem' }}>
          WhatsApp from Meta · Version 2.25.1.1
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function SubPageShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 bg-[#202C33] flex-shrink-0">
        <button onClick={onBack} className="text-[#aebac1] hover:text-[#E9EDEF] p-1 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <span className="text-[#E9EDEF]" style={{ fontWeight: 600, fontSize: '1.05rem' }}>{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Section({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      {label && (
        <p className="text-[#00A884] px-4 pt-4 pb-1" style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.3px' }}>
          {label}
        </p>
      )}
      <div className="bg-[#111B21]">{children}</div>
    </div>
  );
}

function Row({ icon, label, sub, action, onClick }: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  action?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-[#2A3942] transition-colors text-left"
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[#E9EDEF]" style={{ fontSize: '0.95rem' }}>{label}</p>
        {sub && <p className="text-[#8696A0]" style={{ fontSize: '0.78rem' }}>{sub}</p>}
      </div>
      {action || <ChevronRight size={16} className="text-[#8696A0] flex-shrink-0" />}
    </button>
  );
}

function OptionRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#2A3942] transition-colors"
    >
      <span className="text-[#E9EDEF]" style={{ fontSize: '0.95rem' }}>{label}</span>
      <span className="text-[#00A884]" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
    </button>
  );
}

function ToggleRow({ icon, label, desc, value, onChange }: {
  icon?: ReactNode;
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-[#2A3942] transition-colors text-left"
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[#E9EDEF]" style={{ fontSize: '0.95rem' }}>{label}</p>
        {desc && <p className="text-[#8696A0]" style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>{desc}</p>}
      </div>
      {/* Toggle pill */}
      <div className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-[#00A884]' : 'bg-[#2A3942]'}`}>
        <motion.div
          animate={{ x: value ? 24 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
        />
      </div>
    </button>
  );
}