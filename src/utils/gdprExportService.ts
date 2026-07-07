import { doc, getDoc, collection, query, orderBy, limit as firestoreLimit, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { userService } from './services/userService';
import { callService } from './services/callService';
import { statusService } from './services/statusService';
import { conversationService } from './services/conversationService';
import { getPrivacySettings } from './privacySettingsManager';
import { getDeviceSessions } from './linkedDevicesManager';
import { loadAllChats, listLocalChatIds } from './sqliteMessageStore';
import { messageQueue } from './persistentMessageQueue';

interface GdprExportData {
  exportVersion: string;
  exportedAt: string;
  app: string;
  userId: string;
  profile: any;
  friendships: any;
  friendRequests: any[];
  conversations: any[];
  groups: any[];
  callHistory: any[];
  statuses: any[];
  privacySettings: any;
  blockedUsers: any;
  deviceSessions: any[];
  settings: any;
  localMessages: Record<string, any[]>;
  queuedMessages: any[];
}

export async function exportAllUserData(userId: string): Promise<GdprExportData> {
  const [profile, friendshipsDoc, conversations, callHistory, statuses, privacySettings, blockedUsers, deviceSessions] = await Promise.allSettled([
    userService.getUserProfile(userId),
    getDoc(doc(db, 'friendships', userId)),
    conversationService.getUserConversations(userId),
    callService.getCallHistory(userId, 500),
    statusService.getUserStatuses(userId),
    getPrivacySettings(userId),
    getDoc(doc(db, 'users', userId, 'settings', 'blocklist')),
    getDeviceSessions(userId),
  ]);

  let friendRequests: any[] = [];
  try {
    const requestsRef = collection(db, 'friendRequests');
    const q = query(
      requestsRef,
      orderBy('createdAt', 'desc'),
      firestoreLimit(200)
    );
    const snap = await getDocs(q);
    friendRequests = snap.docs
      .map(d => d.data())
      .filter((r: any) => r.fromUid === userId || r.toUid === userId);
  } catch {
    // ignore
  }

  let groups: any[] = [];
  try {
    const groupsRef = collection(db, 'groups');
    const snap = await getDocs(groupsRef);
    groups = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((g: any) => g.members?.includes(userId));
  } catch {
    // ignore
  }

  let settings: any = null;
  try {
    const settingsSnap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
    if (settingsSnap.exists()) {
      settings = settingsSnap.data();
    }
  } catch {
    // ignore
  }

  const localMessages: Record<string, any[]> = {};
  try {
    const chatIds = await listLocalChatIds(userId);
    if (chatIds.length > 0) {
      const allChats = await loadAllChats(userId, chatIds);
      Object.assign(localMessages, allChats);
    }
  } catch {
    // ignore
  }

  let queuedMessages: any[] = [];
  try {
    queuedMessages = messageQueue.getMessages();
  } catch {
    // ignore
  }

  return {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    app: 'Veill (Quidec)',
    userId,
    profile: profile.status === 'fulfilled' ? profile.value : null,
    friendships: friendshipsDoc.status === 'fulfilled' && friendshipsDoc.value.exists()
      ? friendshipsDoc.value.data()
      : null,
    friendRequests,
    conversations: conversations.status === 'fulfilled' ? conversations.value : [],
    groups,
    callHistory: callHistory.status === 'fulfilled' ? callHistory.value : [],
    statuses: statuses.status === 'fulfilled' ? statuses.value : [],
    privacySettings: privacySettings.status === 'fulfilled' ? privacySettings.value : null,
    blockedUsers: blockedUsers.status === 'fulfilled' && blockedUsers.value.exists()
      ? blockedUsers.value.data()
      : null,
    deviceSessions: deviceSessions.status === 'fulfilled' ? deviceSessions.value : [],
    settings,
    localMessages,
    queuedMessages,
  };
}

export function downloadGdprExport(data: GdprExportData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `veill_gdpr_export_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
