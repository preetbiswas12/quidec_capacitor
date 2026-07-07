import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  User, Bell, Lock, MessageSquare, Palette, HelpCircle, LogOut,
  ChevronRight, Star, Download, Globe, Smartphone, ArrowLeft,
  Edit3, Check, Mail, Eye, Trash2, AlertTriangle,
  Database, HardDrive, Volume2, VolumeX, Moon, Sun, AtSign, Copy, Camera, X,
  Shield, Phone, LogOut as LogOutIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';
import SecurityActionModal from './SecurityActionModal';
import services from '../../utils/firebaseServices';
import { userService } from '../../utils/services/userService';
import { auth } from '../../utils/firebase';
import {
  getPrivacySettings,
  updatePrivacySettings,
  getAccountSecuritySettings,
  updateAccountSecuritySettings,
  setTypingIndicator,
  setDisappearingMessages,
  blockUser,
  unblockUser,
  getBlockList,
  isUserBlocked,
  type PrivacySettings,
  type AccountSecuritySettings,
} from '../../utils/privacySettingsManager';
import {
  getDeviceSessions,
  listenToDeviceSessions,
  logoutDevice,
  logoutAllOtherDevices,
  getCurrentDevice,
  type DeviceSession,
} from '../../utils/linkedDevicesManager';
import { 
  updateNotificationChannel, 
  initializeNotificationChannels,
  getNotificationPermissionStatus,
  requestNotificationPermissions
} from '../../utils/notificationSettingsManager';
import { saveSettingsToNative, syncSettingsToFirebase } from '../../utils/settingsPersistence';
import { rotateKeyVersion } from '../../utils/encryption';
import { updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

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
  const navigate = useNavigate();
  const { currentUser, updateCurrentUser, updateUserEmail, logout, settings, updateSettings, clearAllChats, chats, starredMessages, contacts, setActiveChatId } = useApp();

  if (!currentUser) return null;

  // ─── State ────────────────────────────────────────────────────────────────
  const [localSubPage, setLocalSubPage] = useState<SubPage>(null);
  const [editName, setEditName] = useState(currentUser.name);
  const [editAbout, setEditAbout] = useState(currentUser.about);
  const [editingName, setEditingName] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Settings & Security State
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null);
  const [securitySettings, setSecuritySettings] = useState<AccountSecuritySettings | null>(null);
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');

  // Modal States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);

  // Security Action Modal States
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityModalConfig, setSecurityModalConfig] = useState<{
    title: string;
    message: string;
    email?: string;
    action: 'password' | 'email' | '2fa';
  }>({
    title: '',
    message: '',
    action: 'password',
  });

  // Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState(currentUser.email || '');
  const [blockUserId, setBlockUserId] = useState('');
  const [blockList, setBlockList] = useState<string[]>([]);

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notificationTone, setNotificationTone] = useState<string>(settings.notificationTone || 'default');
  const [vibrationType, setVibrationType] = useState<string>(settings.vibrationType || 'default');
  const [storageUsed, setStorageUsed] = useState<number>(0);
  const [storageTotal, setStorageTotal] = useState<number>(0);
  const [chatStorage, setChatStorage] = useState<Array<{ chatId: string; name: string; messageCount: number; sizeBytes: number }>>([]);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    // Load privacy settings
    getPrivacySettings(currentUser.userId).then(setPrivacySettings).catch(console.error);

    // Load security settings
    getAccountSecuritySettings(currentUser.userId).then(setSecuritySettings).catch(console.error);

    // Load current device ID
    getCurrentDevice().then(device => setCurrentDeviceId(device.id)).catch(console.error);

    // Load device sessions
    getDeviceSessions(currentUser.userId).then(setDeviceSessions).catch(console.error);

    // Listen to device sessions in real-time
    const unsubscribe = listenToDeviceSessions(currentUser.userId, (sessions: DeviceSession[]) => {
      setDeviceSessions(sessions);
    });

    // Load block list
    getBlockList(currentUser.userId).then(setBlockList).catch(console.error);

    return unsubscribe;
  }, [currentUser]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress image before storing to avoid oversized data URLs
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let w = img.width;
        let h = img.height;
        if (w > h) { if (w > MAX_SIZE) { h = Math.round(h * MAX_SIZE / w); w = MAX_SIZE; } }
        else { if (h > MAX_SIZE) { w = Math.round(w * MAX_SIZE / h); h = MAX_SIZE; } }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        updateCurrentUser({ avatar: compressed });
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!currentUser?.email) return;
    if (!currentPassword.trim()) {
      setError('Please enter your current password');
      return;
    }
    if (!newPassword.trim() || newPassword.trim().length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setError('New passwords do not match');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');

      // Reauthenticate with current password
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password in Firebase Auth
      await updatePassword(user, newPassword.trim());

      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('❌ Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect');
      } else {
        setError(err.message || 'Failed to change password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!currentUser?.email) return;
    if (!newEmail.trim() || newEmail.trim() === currentUser.email) {
      setError('Please enter a new email address different from your current one');
      return;
    }
    if (!currentPassword.trim()) {
      setError('Please enter your current password to confirm');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      // Reauthenticate with current password before allowing email change
      const credential = EmailAuthProvider.credential(user.email!, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Send verification to the NEW email address
      const result = await services.authService.sendEmailChangeVerification(newEmail.trim());

      // Show security action modal
      setSecurityModalConfig({
        title: 'Email Change Verification Sent',
        message: result.message,
        email: newEmail.trim(),
        action: 'email',
      });
      setSecurityModalOpen(true);

      // Close modal
      setShowEmailModal(false);
      setCurrentPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to send email verification');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockUser = async () => {
    if (!blockUserId.trim()) {
      setError('Please enter a user ID or email');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await blockUser(currentUser.userId, blockUserId);
      setBlockList(prev => [...prev, blockUserId]);
      setSuccess(`User blocked successfully`);
      setBlockUserId('');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to block user');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockUser = async (blockedUserId: string) => {
    try {
      setLoading(true);
      setError(null);
      await unblockUser(currentUser.userId, blockedUserId);
      setBlockList(prev => prev.filter(id => id !== blockedUserId));
      setSuccess(`User unblocked successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to unblock user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePrivacySetting = async (key: keyof PrivacySettings, value: any) => {
    try {
      setLoading(true);
      await updatePrivacySettings(currentUser.userId, { [key]: value } as any);
      setPrivacySettings(prev => ({ ...prev!, [key]: value }));
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update setting');
      setLoading(false);
    }
  };

  const handleLogoutDevice = async (deviceId: string) => {
    try {
      setLoading(true);
      setError(null);
      await logoutDevice(currentUser.userId, deviceId);
      setDeviceSessions(prev => prev.filter(d => d.id !== deviceId));
      setSuccess('Device logged out successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to logout device');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAllOtherDevices = async () => {
    if (!window.confirm('Are you sure? You will be logged out of all other devices.')) return;

    try {
      setLoading(true);
      setError(null);
      await logoutAllOtherDevices(currentUser.userId, currentDeviceId);
      setDeviceSessions(prev => prev.filter(d => d.id === currentDeviceId));
      setSuccess('All other devices logged out');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to logout other devices');
    } finally {
      setLoading(false);
    }
  };

  // If parent controls subpage (via forcedSubPage), use that; otherwise use local state
  const subPage: SubPage = (forcedSubPage as SubPage) ?? localSubPage;

  // ─── Load Storage Stats ─────────────────────────────────────────────────────
  useEffect(() => {
    if (subPage !== 'storage' || !currentUser) return;
    const loadStorage = async () => {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          setStorageUsed(est.usage || 0);
          setStorageTotal(est.quota || 0);
        }
        const { listLocalChatIds, loadMessages } = await import('../../utils/localMessageStore');
        const chatIds = await listLocalChatIds();
        const chatStats: Array<{ chatId: string; name: string; messageCount: number; sizeBytes: number }> = [];
        for (const cid of chatIds) {
          try {
            const msgs = await loadMessages(currentUser.userId, cid);
            const sizeBytes = msgs.reduce((sum, m) => sum + JSON.stringify(m).length, 0);
            const chat = chats.find(c => c.id === cid);
            const contact = chat ? contacts.find(ct => ct.id === chat.contactId) : null;
            chatStats.push({ chatId: cid, name: contact?.name || cid, messageCount: msgs.length, sizeBytes });
          } catch { /* skip failed chats */ }
        }
        chatStats.sort((a, b) => b.sizeBytes - a.sizeBytes);
        setChatStorage(chatStats);
      } catch (err) {
        console.warn('⚠️ Failed to load storage stats:', err);
      }
    };
    loadStorage();
  }, [subPage, currentUser]);

  const handleDeleteAccount = async () => {
    if (!window.confirm('WARNING: This will permanently delete your account, all messages, friendships, and data. This cannot be undone. Are you sure?')) return;
    
    const password = window.prompt('Please enter your password to confirm deletion:');
    if (!password) return;

    try {
      setLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Not authenticated');

      // Reauthenticate
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // 1. Delete user data from Firestore + RTDB (friendships, friend requests, presence)
      await userService.deleteUserAccount(currentUser.userId);
      
      // 2. Delete local message storage
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        // Remove SQLite database
        await Filesystem.deleteFile({ path: 'qchat_messages.db', directory: Directory.Data }).catch(() => {});
        // Remove binary chunk files
        const readdirResult = await Filesystem.readdir({ path: '', directory: Directory.Data });
        for (const file of readdirResult.files) {
          if (file.name.startsWith('qchat_') && file.name.endsWith('.bin')) {
            await Filesystem.deleteFile({ path: file.name, directory: Directory.Data }).catch(() => {});
          }
        }
        // Remove encrypted media chunks directory
        await Filesystem.deleteFile({ path: 'media', directory: Directory.Data }).catch(() => {});
      } catch {
        // Non-critical — local storage cleanup
      }

      // 3. Delete Auth User
      await user.delete();

      console.log('✅ Account deleted');
      logout();
    } catch (err: any) {
      setError(err.message || 'Failed to delete account. Check your password.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (updates: any) => {
    updateSettings(updates);
    
    // Sync with Native/Cloud
    try {
      await saveSettingsToNative(updates);
      if (currentUser) {
        await syncSettingsToFirebase(currentUser.userId, updates);
      }
    } catch (err) {
      console.warn('⚠️ Settings sync failed:', err);
    }

    // Handle Native Notification Channel Sync
    if (updates.notifications !== undefined) {
      const enabled = updates.notifications;
      await updateNotificationChannel('messages', { importance: enabled ? 'high' : 'low' });
      await updateNotificationChannel('calls', { importance: enabled ? 'max' : 'low' });
    }
  };

  const handleExportChats = async () => {
    try {
      setLoading(true);
      setError(null);
      const { loadMessages } = await import('../../utils/localMessageStore');
      const allChats: any = {};
      let exported = 0;
      let failed = 0;

      for (const chat of chats) {
        try {
          const msgs = await loadMessages(currentUser.userId, chat.id);
          const contact = contacts.find(c => c.id === chat.contactId);
          allChats[chat.id] = {
            contactName: contact?.name || chat.contactId,
            contactId: chat.contactId,
            messages: msgs
          };
          exported++;
        } catch {
          failed++;
          console.warn(`⚠️ Failed to export chat ${chat.id}`);
        }
      }

      if (exported === 0) {
        setError('No chats could be exported. Try again later.');
        return;
      }

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        app: 'Veill',
        chatCount: exported,
        failedChats: failed,
        chats: allChats
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quidec_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`Exported ${exported} chat${exported !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to export chats: ' + (err as any).message);
    } finally {
      setLoading(false);
    }
  };

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

  const saveName = async () => {
    if (editName.trim()) await updateCurrentUser({ name: editName.trim() });
    setEditingName(false);
  };

  const saveAbout = async () => {
    if (editAbout.trim()) await updateCurrentUser({ about: editAbout.trim() });
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
            <div className="flex flex-col items-center py-8 bg-wa-secondary border-b border-wa-border">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#202C33] flex-shrink-0">
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-wa-accent/20 flex items-center justify-center">
                      <span className="text-wa-accent" style={{ fontSize: '2rem', fontWeight: 700 }}>
                        {currentUser.name ? currentUser.name[0].toUpperCase() : '?'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  aria-label="Change profile photo"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-10 h-10 bg-wa-accent rounded-full flex items-center justify-center border-[3px] border-wa-main hover:bg-[#3b8eea] transition-colors shadow-lg active:scale-95"
                >
                  <Camera size={18} className="text-white" />
                </button>
              </div>
              <p className="text-wa-text-muted mt-3" style={{ fontSize: '0.78rem' }}>
                Tap <span className="text-wa-accent">📷</span> to change your profile photo
              </p>
            </div>

            {/* User ID - Sleek Handle Style */}
            <Section label="YOUR VEILL ID">
              <div className="px-4 py-3.5 flex items-center justify-between gap-4 group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-wa-accent/10 flex items-center justify-center flex-shrink-0 border border-wa-accent/20">
                    <AtSign size={18} className="text-wa-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-wa-primary font-bold" style={{ fontSize: '1rem', letterSpacing: '0.2px' }}>
                      {currentUser.userId || '@user.0000'}
                    </p>
                    <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>Your unique encrypted identity</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    aria-label={idCopied ? 'Copied' : 'Copy user ID'}
                    onClick={() => {
                      navigator.clipboard.writeText(currentUser.userId || '').catch(() => {});
                      setIdCopied(true);
                      setTimeout(() => setIdCopied(false), 2000);
                    }}
                    className="p-2 rounded-full hover:bg-wa-secondary text-wa-accent transition-colors"
                  >
                    {idCopied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
              </div>
            </Section>

            <Section>
              <p className="text-wa-accent px-4 pb-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>EMAIL ADDRESS</p>
              <Row
                icon={<Mail size={18} className="text-wa-text-muted" />}
                label={currentUser.email || 'Not set'}
                sub="Tap to change email"
                onClick={() => { setShowEmailModal(true); setError(null); }}
              />
            </Section>
            <Section>
              <p className="text-wa-accent px-4 pb-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>NAME</p>
              {editingName ? (
                <div className="px-4 py-3 flex items-center gap-3">
                   <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    aria-label="Edit display name"
                    className="flex-1 bg-wa-secondary text-wa-primary rounded-lg px-3 py-2 outline-none border border-wa-accent"
                    style={{ fontSize: '0.95rem' }}
                    maxLength={25}
                    autoFocus
                  />
                  <button aria-label="Save name" onClick={saveName} className="w-9 h-9 bg-wa-accent rounded-full flex items-center justify-center">
                    <Check size={16} className="text-white" />
                  </button>
                </div>
              ) : (
                <Row
                  icon={<User size={18} className="text-wa-text-muted" />}
                  label={currentUser.name}
                  action={<Edit3 size={16} className="text-wa-text-muted" />}
                  onClick={() => { setEditName(currentUser.name); setEditingName(true); }}
                />
              )}
            </Section>
            <Section>
              <p className="text-wa-accent px-4 pb-2" style={{ fontSize: '0.8rem', fontWeight: 600 }}>ABOUT</p>
              {editingAbout ? (
                <div className="px-4 py-3 flex items-center gap-3">
                   <input
                    value={editAbout}
                    onChange={e => setEditAbout(e.target.value)}
                    aria-label="Edit about"
                    className="flex-1 bg-wa-secondary text-wa-primary rounded-lg px-3 py-2 outline-none border border-wa-accent"
                    style={{ fontSize: '0.95rem' }}
                    maxLength={139}
                    autoFocus
                  />
                  <button aria-label="Save about" onClick={saveAbout} className="w-9 h-9 bg-wa-accent rounded-full flex items-center justify-center">
                    <Check size={16} className="text-white" />
                  </button>
                </div>
              ) : (
                <Row
                  icon={<Edit3 size={18} className="text-wa-text-muted" />}
                  label={currentUser.about}
                  action={<Edit3 size={16} className="text-wa-text-muted" />}
                  onClick={() => { setEditAbout(currentUser.about); setEditingAbout(true); }}
                />
              )}
            </Section>

            <Section>
            <div className="px-6 py-12 flex flex-col items-center gap-6 mt-4">
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    setError(null);
                    const { exportAllUserData, downloadGdprExport } = await import('../../utils/gdprExportService');
                    const data = await exportAllUserData(currentUser.userId);
                    downloadGdprExport(data);
                    setSuccess('Data export downloaded successfully');
                    setTimeout(() => setSuccess(null), 3000);
                  } catch (err) {
                    setError('Failed to export data: ' + (err as any).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-wa-accent hover:text-[#6BA3FF] transition-colors"
                style={{ fontWeight: 600, fontSize: '0.95rem' }}
              >
                <Download size={18} />
                <span>Export my data (GDPR)</span>
              </button>
              <button
                onClick={handleDeleteAccount}
                className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-400 transition-colors"
                style={{ fontWeight: 600, fontSize: '0.95rem' }}
              >
                <Trash2 size={18} />
                <span>Delete Account</span>
              </button>
              <div className="text-center opacity-30">
                <p className="text-wa-text-muted" style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>VEILL STABLE v1.0.0</p>
              </div>
            </div>
            </Section>
          </SubPageShell>
        );

      // ── Privacy ──
      case 'privacy':
        return (
          <SubPageShell title="Privacy" onBack={back}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
            {success && <SuccessAlert message={success} />}

            <Section label="WHO CAN SEE MY INFO">
              <OptionRow
                label="Last seen & online"
                value={privacySettings?.lastSeenVisibility === 'everyone' ? 'Everyone' : privacySettings?.lastSeenVisibility === 'contacts' ? 'My Contacts' : 'Nobody'}
                onClick={() => {
                  const current = privacySettings?.lastSeenVisibility || 'contacts';
                  const next = current === 'everyone' ? 'contacts' : current === 'contacts' ? 'nobody' : 'everyone';
                  handleUpdatePrivacySetting('lastSeenVisibility', next);
                }}
              />
              <OptionRow
                label="Profile photo"
                value={privacySettings?.profilePhotoVisibility === 'everyone' ? 'Everyone' : privacySettings?.profilePhotoVisibility === 'contacts' ? 'My Contacts' : 'Nobody'}
                onClick={() => {
                  const current = privacySettings?.profilePhotoVisibility || 'contacts';
                  const next = current === 'everyone' ? 'contacts' : current === 'contacts' ? 'nobody' : 'everyone';
                  handleUpdatePrivacySetting('profilePhotoVisibility', next);
                }}
              />
            </Section>

            <Section label="MESSAGING">
              <ToggleRow
                icon={<Eye size={18} className="text-wa-text-muted" />}
                label="Read receipts"
                desc="When turned off, you won't send or receive read receipts."
                value={privacySettings?.readReceipts ?? true}
                onChange={(v: boolean) => handleUpdatePrivacySetting('readReceipts', v)}
              />
              <ToggleRow
                icon={<Edit3 size={18} className="text-wa-text-muted" />}
                label="Typing indicator"
                desc="When turned off, others won't see when you're typing."
                value={privacySettings?.typingIndicator ?? true}
                onChange={(v: boolean) => handleUpdatePrivacySetting('typingIndicator', v)}
              />
            </Section>

            <Section label="DISAPPEARING MESSAGES">
              <OptionRow
                label="Default timer"
                desc="New chats will use this timer. Messages disappear after they're read."
                value={
                  !privacySettings?.disappearingMessages || !privacySettings?.defaultDisappearingTime || privacySettings.defaultDisappearingTime === 0
                    ? 'Off'
                    : privacySettings?.defaultDisappearingTime === 3600
                      ? '1 hour'
                      : privacySettings?.defaultDisappearingTime === 86400
                        ? '24 hours'
                        : privacySettings?.defaultDisappearingTime === 604800
                          ? '7 days'
                          : privacySettings?.defaultDisappearingTime === 7776000
                            ? '90 days'
                            : 'Off'
                }
                onClick={() => {
                  const options = [
                    { label: 'Off', value: 0 },
                    { label: '1 hour', value: 3600 },
                    { label: '24 hours', value: 86400 },
                    { label: '7 days', value: 604800 },
                    { label: '90 days', value: 7776000 },
                  ];
                  const currentVal = privacySettings?.defaultDisappearingTime || 0;
                  const currentIdx = options.findIndex(o => o.value === currentVal);
                  const nextOption = options[(currentIdx + 1) % options.length];
                  setDisappearingMessages(currentUser.userId, nextOption.value > 0, nextOption.value);
                  setPrivacySettings((prev: any) => ({
                    ...prev,
                    disappearingMessages: nextOption.value > 0,
                    defaultDisappearingTime: nextOption.value,
                  }));
                }}
              />
            </Section>

            <Section label="SECURITY">
              <Row
                icon={<Shield size={18} className="text-wa-text-muted" />}
                label="Change password"
                onClick={() => { setShowPasswordModal(true); setError(null); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              />
              <Row
                icon={<Mail size={18} className="text-wa-text-muted" />}
                label="Change email"
                sub={currentUser.email}
                onClick={handleChangeEmail}
              />
              <Row
                icon={<Lock size={18} className="text-wa-text-muted" />}
                label="Rotate encryption keys"
                sub="Start using a new key for future messages"
                onClick={async () => {
                  const newVersion = await rotateKeyVersion();
                  setSuccess(`Encryption keys rotated. Future messages will use key v${newVersion}.`);
                  setTimeout(() => setSuccess(null), 4000);
                }}
              />
            </Section>

            <Section label="BLOCKED CONTACTS">
              <button
                onClick={() => setShowBlockModal(true)}
                className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-wa-secondary/30 transition-colors text-left border-b border-wa-border/10"
              >
                <AlertTriangle size={18} className="text-red-400" />
                <div className="flex-1">
                  <p className="text-wa-primary" style={{ fontSize: '0.95rem', fontWeight: 500 }}>Manage blocked users</p>
                  <p className="text-wa-text-muted" style={{ fontSize: '0.82rem' }}>{blockList.length} user{blockList.length !== 1 ? 's' : ''} blocked</p>
                </div>
              </button>
              {blockList.length > 0 && (
                <div className="border-t border-wa-border/10">
                  {blockList.slice(0, 3).map(userId => (
                    <div key={userId} className="px-4 py-3 flex items-center justify-between border-b border-wa-border/10 last:border-0">
                      <p className="text-wa-primary text-sm">{userId}</p>
                      <button
                        onClick={() => handleUnblockUser(userId)}
                        className="text-wa-accent text-xs font-medium hover:underline"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                  {blockList.length > 3 && (
                    <div className="px-4 py-2 text-center text-wa-text-muted text-xs">+{blockList.length - 3} more</div>
                  )}
                </div>
              )}
            </Section>
          </SubPageShell>
        );

      // ── Notifications ──
      case 'notifications':
        return (
          <SubPageShell title="Notifications" onBack={back}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
            <Section label="MESSAGES">
              <ToggleRow
                icon={<Bell size={18} className="text-wa-text-muted" />}
                label="Message notifications"
                value={settings.notifications}
                onChange={(v: boolean) => handleUpdateSettings({ notifications: v })}
              />
              <Row 
                icon={<Volume2 size={18} className="text-wa-text-muted" />} 
                label="Notification tone" 
                sub={notificationTone || 'Default'}
                onClick={() => setShowNotificationModal(true)}
              />
              <Row 
                icon={<VolumeX size={18} className="text-wa-text-muted" />} 
                label="Vibration" 
                sub={vibrationType || 'Default'}
                onClick={() => setVibrationType(vibrationType === 'default' ? 'strong' : vibrationType === 'strong' ? 'light' : 'default')}
              />
            </Section>
            <Section label="GROUPS">
              <ToggleRow
                icon={<Bell size={18} className="text-wa-text-muted" />}
                label="Group notifications"
                value={settings.groupNotifications}
                onChange={(v: boolean) => handleUpdateSettings({ groupNotifications: v })}
              />
            </Section>
            <Section label="CALLS">
              <ToggleRow
                icon={<Phone size={18} className="text-wa-text-muted" />}
                label="Call notifications"
                value={settings.callNotifications}
                onChange={(v: boolean) => handleUpdateSettings({ callNotifications: v })}
              />
            </Section>
            <Section label="GLOBAL SETTINGS">
              <ToggleRow
                icon={settings.notifications ? <Volume2 size={18} className="text-wa-text-muted" /> : <VolumeX size={18} className="text-red-500" />}
                label="Mute all notifications"
                desc="Silence all incoming messages and call alerts"
                value={!settings.notifications}
                onChange={(v: boolean) => handleUpdateSettings({ notifications: !v })}
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
                icon={<MessageSquare size={18} className="text-wa-text-muted" />}
                label="Enter sends message"
                desc="Press Enter to send, Shift+Enter for new line"
                value={settings.enterSendsMessage}
                onChange={(v: boolean) => updateSettings({ enterSendsMessage: v })}
              />
            </Section>
            <Section label="CHAT HISTORY">
              <Row icon={<Database size={18} className="text-wa-text-muted" />} label="Export chat" onClick={handleExportChats} />
              <button 
                onClick={async () => {
                  await clearAllChats();
                  back();
                }}
                className="w-full flex items-center gap-4 px-4 py-3.5 text-red-400 hover:bg-wa-secondary/50 transition-colors"
              >
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
                <p className="text-wa-primary mb-3" style={{ fontSize: '0.95rem', fontWeight: 500 }}>App theme</p>
                <div className="flex gap-3">
                  {(['dark', 'light'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateSettings({ theme: t })}
                      className={`flex-1 py-3 rounded-xl border-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] ${
                        settings.theme === t 
                          ? 'border-wa-accent bg-wa-accent/10 ring-1 ring-wa-accent/20' 
                          : 'border-wa-border bg-wa-secondary/40'
                      }`}
                    >
                      <div className="flex flex-col items-center">
                        {t === 'dark' ? (
                          <Moon size={20} className={`mb-1.5 ${settings.theme === t ? 'text-wa-accent' : 'text-wa-text-muted'}`} />
                        ) : (
                          <Sun size={20} className={`mb-1.5 ${settings.theme === t ? 'text-wa-accent' : 'text-wa-text-muted'}`} />
                        )}
                        <p className={`font-medium ${settings.theme === t ? 'text-wa-accent' : 'text-wa-primary'}`} style={{ fontSize: '0.8rem' }}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Section>
            <Section label="TEXT SIZE">
              <div className="px-4 py-3">
                <p className="text-wa-text-muted mb-3" style={{ fontSize: '0.82rem' }}>Font size</p>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => updateSettings({ fontSize: size })}
                      className={`flex-1 py-2.5 rounded-xl border-2 transition-colors capitalize ${settings.fontSize === size ? 'border-wa-accent bg-wa-accent/10 text-wa-accent' : 'border-wa-border text-wa-text-muted'}`}
                      style={{ fontSize: size === 'small' ? '0.75rem' : size === 'large' ? '1rem' : '0.875rem' }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <p className="text-wa-primary mt-4 text-center" style={{ fontSize: settings.fontSize === 'small' ? '0.8rem' : settings.fontSize === 'large' ? '1.05rem' : '0.9rem' }}>
                  This is how your messages will look.
                </p>
              </div>
            </Section>
          </SubPageShell>
        );

      // ── Storage ──
      case 'storage':
        {
          const usedGB = storageTotal > 0 ? (storageUsed / (1024 ** 3)).toFixed(2) : '—';
          const totalGB = storageTotal > 0 ? (storageTotal / (1024 ** 3)).toFixed(1) : '—';
          const pct = storageTotal > 0 ? Math.min(100, (storageUsed / storageTotal) * 100) : 0;
          const formatSize = (bytes: number) => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
            if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
            return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
          };
          return (
            <SubPageShell title="Storage and Data" onBack={back}>
              <Section>
                <div className="px-4 py-4">
                  <p className="text-wa-primary mb-1" style={{ fontWeight: 600 }}>Storage usage</p>
                  <div className="flex items-center gap-2 mb-3">
                    <HardDrive size={16} className="text-wa-text-muted" />
                    <span className="text-wa-text-muted" style={{ fontSize: '0.85rem' }}>
                      {usedGB} GB used of {totalGB} GB
                    </span>
                  </div>
                  <div className="w-full h-2 bg-wa-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-wa-accent rounded-full transition-all" style={{ width: `${Math.max(0.5, pct)}%` }} />
                  </div>
                  <p className="text-wa-text-muted mt-2" style={{ fontSize: '0.72rem' }}>
                    {chatStorage.length} conversation{chatStorage.length !== 1 ? 's' : ''} stored locally
                  </p>
                </div>
              </Section>
              <Section label="NETWORK USAGE">
                <ToggleRow
                  icon={<Download size={18} className="text-wa-text-muted" />}
                  label="Auto-download media"
                  desc="Automatically download photos and videos on Wi-Fi"
                  value={settings.mediaAutoDownload}
                  onChange={(v: boolean) => updateSettings({ mediaAutoDownload: v })}
                />
              </Section>
              {chatStorage.length > 0 && (
                <Section label="PER-CHAT STORAGE">
                  {chatStorage.slice(0, 20).map(cs => (
                    <div key={cs.chatId} className="flex items-center gap-3 px-4 py-3 border-b border-wa-border/5 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-wa-primary truncate" style={{ fontSize: '0.9rem', fontWeight: 500 }}>{cs.name}</p>
                        <p className="text-wa-text-muted" style={{ fontSize: '0.72rem' }}>{cs.messageCount} messages · {formatSize(cs.sizeBytes)}</p>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
              <Section>
                <Row
                  icon={<Trash2 size={18} className="text-wa-text-muted" />}
                  label="Manage storage"
                  onClick={() => {
                    if (window.confirm('Clear all local chat data? This will remove all messages and media from this device. Your account will not be affected.')) {
                      clearAllChats().then(() => {
                        setChatStorage([]);
                        setStorageUsed(0);
                        setSuccess('All local data cleared');
                        setTimeout(() => setSuccess(null), 3000);
                      });
                    }
                  }}
                />
              </Section>
            </SubPageShell>
          );
        }

      // ── Linked Devices ──
      case 'linked-devices':
        return (
          <SubPageShell title="Linked Devices" onBack={back}>
            {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
            {success && <SuccessAlert message={success} />}
            
            {deviceSessions.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <div className="w-16 h-16 bg-wa-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone size={28} className="text-wa-accent" />
                </div>
                <p className="text-wa-primary mb-1" style={{ fontWeight: 600 }}>No devices linked</p>
                <p className="text-wa-text-muted" style={{ fontSize: '0.85rem' }}>
                  Your device will appear here once logged in.
                </p>
              </div>
            ) : (
              <>
                <Section label={`ACTIVE DEVICES (${deviceSessions.length})`}>
                  {deviceSessions.map(device => (
                    <div key={device.id} className="px-4 py-4 flex items-center gap-3 border-b border-wa-border/10 last:border-0 hover:bg-wa-secondary/20 transition-colors">
                      <div className={`w-10 h-10 ${device.isActive ? 'bg-wa-accent/10' : 'bg-wa-secondary'} rounded-full flex items-center justify-center`}>
                        {device.deviceType === 'mobile' ? (
                          <Smartphone size={18} className={device.isActive ? 'text-wa-accent' : 'text-wa-text-muted'} />
                        ) : (
                          <Globe size={18} className={device.isActive ? 'text-wa-accent' : 'text-wa-text-muted'} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-wa-primary" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                          {device.deviceName}
                        </p>
                        <p className="text-wa-text-muted" style={{ fontSize: '0.78rem' }}>
                          {device.isActive ? 'Active now' : `Last active: ${new Date((device.lastActivity as any)?.toDate?.() || device.lastActivity).toLocaleDateString()}`}
                          {device.id === currentDeviceId && ' (this device)'}
                        </p>
                      </div>
                      {device.id !== currentDeviceId && (
                        <button
                          onClick={() => handleLogoutDevice(device.id)}
                          disabled={loading}
                          className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 text-sm font-medium"
                        >
                          {loading ? 'Logging out...' : 'Log out'}
                        </button>
                      )}
                    </div>
                  ))}
                </Section>

                {deviceSessions.length > 1 && (
                  <Section>
                    <button
                      onClick={handleLogoutAllOtherDevices}
                      disabled={loading}
                      className="w-full px-4 py-3.5 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 text-left border-b border-wa-border/10"
                    >
                      <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>Log out all other devices</p>
                      <p className="text-wa-text-muted" style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                        You'll be logged out of all devices except this one
                      </p>
                    </button>
                  </Section>
                )}
              </>
            )}
          </SubPageShell>
        );

      // ── Starred Messages ──
      case 'starred':
        return (
          <SubPageShell title="Starred Messages" onBack={back}>
            {starredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
                <div className="w-20 h-20 bg-wa-star/10 rounded-full flex items-center justify-center">
                  <Star size={36} className="text-wa-star" />
                </div>
                <p className="text-wa-primary" style={{ fontWeight: 600 }}>No starred messages</p>
                <p className="text-wa-text-muted" style={{ fontSize: '0.85rem' }}>
                  Star messages you want to find easily later. Long-press a message and tap the ⭐ icon.
                </p>
              </div>
            ) : (
              <div className="flex flex-col py-2">
                {starredMessages.map(msg => {
                  const chat = chats.find(c => c.id === msg.chatId);
                  const contact = chat ? contacts.find(c => c.id === chat.contactId) : null;
                  const senderName = msg.senderId === 'me' ? 'You' : (contact?.name || 'Unknown');
                  const preview = msg.type === 'image' ? '📷 Photo' : msg.type === 'video' ? '🎥 Video' : msg.type === 'audio' ? '🎵 Audio' : msg.type === 'document' ? (msg.content || '📎 Document') : msg.content;
                  return (
                    <button
                      key={msg.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-wa-secondary/20 transition-colors text-left border-b border-wa-border/5"
                      onClick={() => {
                        if (chat) {
                          setActiveChatId(chat.id);
                          navigate(`/app/chat/${chat.id}`);
                        }
                      }}
                    >
                      <Avatar src={contact?.avatar} name={contact?.name || '?'} color={contact?.avatarColor || '#607D8B'} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-wa-primary truncate" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {contact?.name || 'Unknown'}
                          </p>
                          <span className="text-wa-text-muted flex-shrink-0" style={{ fontSize: '0.7rem' }}>
                            {formatStarredTime(msg.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Star size={11} className="text-wa-star fill-wa-star flex-shrink-0" />
                          <p className="text-wa-text-muted truncate" style={{ fontSize: '0.82rem' }}>
                            <span className="text-wa-text-muted/70">{senderName}: </span>{preview}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SubPageShell>
        );

      // ���─ Help ──
      case 'help':
        return (
          <SubPageShell title="Help" onBack={back}>
            <Section>
              <Row icon={<HelpCircle size={18} className="text-wa-text-muted" />} label="Help Centre" sub="Visit our Help Centre" onClick={() => window.open('https://quidec.io/help', '_blank', 'noopener,noreferrer')} />
              <Row icon={<Mail size={18} className="text-wa-text-muted" />} label="Contact us" sub="support@quidec.io" onClick={() => window.location.href = 'mailto:support@quidec.io'} />
              <Row icon={<Lock size={18} className="text-wa-text-muted" />} label="Privacy policy" onClick={() => navigate('/privacy')} />
              <Row icon={<Globe size={18} className="text-wa-text-muted" />} label="Terms of Service" onClick={() => navigate('/terms')} />
            </Section>
            <div className="px-4 py-6 text-center">
              <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>Veill</p>
              <p className="text-wa-text-muted" style={{ fontSize: '0.75rem' }}>Version 2.25.1.1</p>
            </div>
          </SubPageShell>
        );

      default:
        return null;
    }
  };

  const mainContent = subPage ? (
    <div className="flex flex-col h-full overflow-hidden">
      {renderSubPage()}
    </div>
  ) : (
    <div className="flex flex-col h-full overflow-y-auto relative bg-wa-main text-wa-primary transition-colors duration-200 no-scrollbar pb-10">
      {/* Hidden avatar input — capture attribute enables camera on Android */}
      <input ref={avatarInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAvatarSelect} />

      {/* Profile section - Sleek & Flat */}
      <div className="flex flex-col items-center pt-10 pb-8 flex-shrink-0 border-b border-wa-border/10 bg-transparent">
        <div className="relative group cursor-pointer" onClick={() => go('account')}>
          <div className="w-32 h-32 rounded-full p-1 border-2 border-wa-accent">
            <div className="w-full h-full rounded-full overflow-hidden border-2 border-wa-main group-hover:scale-[1.02] transition-transform duration-500 relative bg-wa-secondary/20">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-white/20" style={{ fontSize: '3rem', fontWeight: 800 }}>
                    {currentUser.name ? currentUser.name[0].toUpperCase() : '?'}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[2px]">
                <Camera size={28} />
                <span style={{ fontSize: '0.6rem', fontWeight: 700, marginTop: '4px' }}>EDIT PROFILE</span>
              </div>
            </div>
          </div>
          <button
            aria-label="Change profile photo"
            onClick={e => { e.stopPropagation(); avatarInputRef.current?.click(); }}
            className="absolute bottom-1 right-1 w-10 h-10 bg-wa-accent rounded-full flex items-center justify-center border-4 border-wa-main hover:bg-[#3b8eea] transition-all shadow-xl active:scale-90 text-white"
          >
            <Camera size={18} />
          </button>
        </div>

          <div className="mt-5 text-center px-6">
          <h2 className="text-wa-primary" style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.5px' }}>{currentUser.name || 'Set Name'}</h2>
          <div className="flex items-center justify-center gap-2 mt-1.5 bg-wa-accent/10 px-3 py-1 rounded-full border border-wa-accent/20">
            <AtSign size={13} className="text-wa-accent" />
            <span className="text-wa-accent truncate max-w-[180px]" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
              {currentUser.userId || 'user.0000'}
            </span>
          </div>
          <p className="text-wa-text-muted mt-3 italic" style={{ fontSize: '0.85rem' }}>"{currentUser.about || 'Available'}"</p>
        </div>
      </div>

      {/* Settings items */}
      <div className="px-4 py-2">
        {settingsItems.map(item => (
          <button
            key={item.id}
            onClick={() => go(item.id as SubPage)}
            className="w-full flex items-center gap-4 py-3.5 px-2 rounded-xl hover:bg-wa-secondary/50 cursor-pointer transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${item.color}22` }}>
              <item.icon size={20} style={{ color: item.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-wa-primary" style={{ fontWeight: 500 }}>{item.label}</p>
              {item.desc && <p className="text-wa-text-muted" style={{ fontSize: '0.8rem' }}>{item.desc}</p>}
            </div>
            <ChevronRight size={16} className="text-wa-text-muted group-hover:text-wa-accent transition-colors flex-shrink-0" />
          </button>
        ))}

        {/* Log out */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-4 py-3.5 px-2 rounded-xl hover:bg-wa-secondary/50 cursor-pointer transition-colors text-left mt-2 group"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500/10">
            <LogOut size={20} className="text-red-400" />
          </div>
          <span className="text-red-400" style={{ fontWeight: 500 }}>Log out</span>
        </button>

        <p className="text-center text-wa-text-muted py-6" style={{ fontSize: '0.75rem' }}>
          Veill · Version 2.25.1.1
        </p>

        {/* Developer Test Tools removed */}
      </div>

      {/* Modals */}

      {showEmailModal && (
        <Modal title="Change Email" onClose={() => { setShowEmailModal(false); setError(null); }}>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          <div className="space-y-4">
            <div>
              <label className="text-wa-text-muted text-sm">Current Email</label>
              <input
                type="email"
                value={currentUser.email || ''}
                disabled
                className="w-full mt-1 px-3 py-2 bg-wa-secondary text-wa-text-muted rounded-lg border border-wa-border opacity-60"
              />
            </div>
            <div>
              <label className="text-wa-text-muted text-sm">New Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="Enter new email"
                className="w-full mt-1 px-3 py-2 bg-wa-secondary text-wa-primary rounded-lg border border-wa-border outline-none focus:border-wa-accent"
              />
            </div>
            <div>
              <label className="text-wa-text-muted text-sm">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Confirm with your password"
                className="w-full mt-1 px-3 py-2 bg-wa-secondary text-wa-primary rounded-lg border border-wa-border outline-none focus:border-wa-accent"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEmailModal(false); setError(null); }}
                className="flex-1 py-2 text-wa-text-muted hover:bg-wa-secondary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeEmail}
                disabled={loading}
                className="flex-1 py-2 bg-wa-accent text-white rounded-lg hover:bg-[#3b8eea] transition-colors disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Email'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showPasswordModal && (
        <Modal title="Change Password" onClose={() => { setShowPasswordModal(false); setError(null); }}>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          <div className="space-y-4">
            <div>
              <label className="text-wa-text-muted text-sm">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full mt-1 px-3 py-2 bg-wa-secondary text-wa-primary rounded-lg border border-wa-border outline-none focus:border-wa-accent"
              />
            </div>
            <div>
              <label className="text-wa-text-muted text-sm">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full mt-1 px-3 py-2 bg-wa-secondary text-wa-primary rounded-lg border border-wa-border outline-none focus:border-wa-accent"
              />
            </div>
            <div>
              <label className="text-wa-text-muted text-sm">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full mt-1 px-3 py-2 bg-wa-secondary text-wa-primary rounded-lg border border-wa-border outline-none focus:border-wa-accent"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowPasswordModal(false); setError(null); }}
                className="flex-1 py-2 text-wa-text-muted hover:bg-wa-secondary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={loading}
                className="flex-1 py-2 bg-wa-accent text-white rounded-lg hover:bg-[#3b8eea] transition-colors disabled:opacity-50"
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showBlockModal && (
        <Modal title="Manage Blocked Users" onClose={() => setShowBlockModal(false)}>
          {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
          {success && <SuccessAlert message={success} />}
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={blockUserId}
                onChange={e => setBlockUserId(e.target.value)}
                placeholder="User ID or email to block"
                aria-label="User ID or email to block"
                className="flex-1 px-3 py-2 bg-wa-secondary text-wa-primary rounded-lg border border-wa-border outline-none focus:border-wa-accent"
              />
              <button
                onClick={handleBlockUser}
                disabled={loading || !blockUserId.trim()}
                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                Block
              </button>
            </div>

            {blockList.length > 0 && (
              <div className="mt-4 max-h-60 overflow-y-auto border border-wa-border rounded-lg">
                {blockList.map((userId, idx) => (
                  <div key={idx} className="px-3 py-2 flex items-center justify-between border-b border-wa-border/30 last:border-0 bg-wa-secondary/20">
                    <span className="text-sm text-wa-primary truncate">{userId}</span>
                    <button
                      onClick={() => handleUnblockUser(userId)}
                      disabled={loading}
                      className="text-xs text-wa-accent hover:underline disabled:opacity-50"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {showNotificationModal && (
        <Modal title="Notification Tone" onClose={() => setShowNotificationModal(false)}>
          <div className="space-y-1">
            {['Default', 'Aurora', 'Bamboo', 'Crystal', 'Glass', 'Joy'].map((tone) => {
              const isSelected = notificationTone.toLowerCase() === tone.toLowerCase();
              return (
                <div key={tone} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleUpdateSettings({ notificationTone: tone.toLowerCase() });
                      setNotificationTone(tone);
                      setShowNotificationModal(false);
                    }}
                    className="flex-1 flex items-center justify-between px-4 py-4 hover:bg-wa-secondary/50 rounded-xl transition-colors"
                  >
                    <span className={isSelected ? 'text-wa-accent font-bold' : 'text-wa-primary'}>
                      {tone}
                    </span>
                    {isSelected && <Check size={18} className="text-wa-accent" />}
                  </button>
                  <button
                    onClick={() => {
                      try {
                        const ctx = new AudioContext();
                        const frequencies: Record<string, number> = {
                          default: 440, aurora: 523, bamboo: 392, crystal: 659, glass: 587, joy: 784
                        };
                        const freq = frequencies[tone.toLowerCase()] || 440;
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'sine';
                        osc.frequency.value = freq;
                        gain.gain.value = 0.15;
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start();
                        osc.stop(ctx.currentTime + 0.3);
                      } catch { /* audio not supported */ }
                    }}
                    className="p-3 text-wa-text-muted hover:text-wa-accent hover:bg-wa-secondary/50 rounded-xl transition-colors"
                    title="Preview tone"
                  >
                    <Volume2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );

  return (
    <>
      {mainContent}
      {/* Security Action Modal - Always rendered regardless of subpage */}
      <SecurityActionModal
        isOpen={securityModalOpen}
        title={securityModalConfig.title}
        message={securityModalConfig.message}
        email={securityModalConfig.email}
        action={securityModalConfig.action}
        onClose={() => setSecurityModalOpen(false)}
      />
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function SubPageShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-wa-main">
      <div className="flex items-center gap-3 px-4 py-3 pt-10 bg-wa-header flex-shrink-0 border-b border-wa-border/50">
        <button onClick={onBack} className="text-wa-header-icon hover:text-wa-primary p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-wa-primary" style={{ fontWeight: 700, fontSize: '1.15rem' }}>{title}</h1>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Section({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      {label && (
        <p className="text-wa-text-muted px-4 pt-4 pb-2" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.5px' }}>
          {label}
        </p>
      )}
      <div className="bg-transparent">{children}</div>
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
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-wa-secondary/30 transition-colors text-left border-b border-wa-border/10 last:border-0 cursor-pointer"
    >
      {icon && <span className="flex-shrink-0 text-wa-text-muted">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-wa-primary" style={{ fontSize: '1rem', fontWeight: 500 }}>{label}</p>
        {sub && <p className="text-wa-text-muted mt-0.5" style={{ fontSize: '0.82rem' }}>{sub}</p>}
      </div>
      {action || <ChevronRight size={16} className="text-wa-border/40 flex-shrink-0" />}
    </button>
  );
}

function OptionRow({ label, desc, value, onClick }: { label: string; desc?: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-wa-secondary/50 transition-colors"
    >
      <div className="text-left">
        <span className="text-wa-primary" style={{ fontSize: '0.95rem' }}>{label}</span>
        {desc && <p className="text-wa-text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>{desc}</p>}
      </div>
      <span className="text-wa-accent flex-shrink-0 ml-3" style={{ fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
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
      role="switch"
      aria-checked={value}
      aria-label={`${label}: ${value ? 'on' : 'off'}`}
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-4 px-4 py-4 hover:bg-wa-secondary/30 transition-colors text-left border-b border-wa-border/10 last:border-0"
    >
      {icon && <span className="flex-shrink-0 text-wa-text-muted">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-wa-primary" style={{ fontSize: '1rem', fontWeight: 500 }}>{label}</p>
        {desc && <p className="text-wa-text-muted mt-1" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>{desc}</p>}
      </div>
      {/* Toggle pill */}
      <div className={`relative w-11 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-wa-accent/80' : 'bg-wa-secondary'}`}>
        <motion.div
          animate={{ x: value ? 24 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
        />
      </div>
    </button>
  );
}


// ─── Modal Components ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const modalTitleId = `modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50" role="dialog" aria-modal="true" aria-labelledby={modalTitleId} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full bg-wa-main rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id={modalTitleId} className="text-wa-primary font-bold text-lg">{title}</h2>
          <button
            aria-label="Close dialog"
            onClick={onClose}
            className="text-wa-text-muted hover:text-wa-primary p-2 -mr-2 rounded-full hover:bg-wa-secondary transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function ErrorAlert({ message, onClose }: { message: string; onClose?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-4 mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3"
    >
      <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
      <p className="text-red-400 text-sm flex-1">{message}</p>
      {onClose && (
        <button onClick={onClose} className="text-red-400/60 hover:text-red-400 ml-2">
          <X size={16} />
        </button>
      )}
    </motion.div>
  );
}

function SuccessAlert({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mx-4 mb-4 p-3 bg-wa-accent/10 border border-wa-accent/30 rounded-lg flex items-center gap-3"
    >
      <Check size={18} className="text-wa-accent flex-shrink-0" />
      <p className="text-wa-accent text-sm flex-1">{message}</p>
    </motion.div>
  );
}

function formatStarredTime(timestamp: string): string {
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