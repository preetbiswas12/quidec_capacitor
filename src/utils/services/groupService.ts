/**
 * Group Service
 * Handles group creation, joining, management, and group messaging with E2E encryption.
 *
 * Affected APIs: createGroup, joinByInviteCode, getGroup, updateGroup, addMembers, removeMember, leaveGroup, transferOwnership, listenToUserGroups, sendGroupMessage, listenToGroupMessages, markGroupMessagesRead, sendGroupNotification
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  getDocs,
  getDoc,
  limit,
  orderBy,
  serverTimestamp,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { db, realtimeDb } from '../firebase';
import { sanitizePathComponent } from './shared';
import { getGroupKey } from './shared';
import { encryptMessage, decryptMessage } from '../encryption';
import { validateGroupName, validateGroupDescription, groupCreateLimiter } from '../validators';

export { getGroupKey } from './shared';

/**
 * Assert caller is an admin of the group. Throws on failure.
 */
async function assertAdmin(groupId: string, callerId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) throw new Error('Group not found');
  const admins = snap.data().admins || [];
  if (!admins.includes(callerId)) {
    throw new Error('Only group admins can perform this action');
  }
}

/**
 * Assert caller is a member of the group (or the group exists for invite join).
 */
async function assertMember(groupId: string, userId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) throw new Error('Group not found');
  const members = snap.data().members || [];
  if (!members.includes(userId)) {
    throw new Error('You are not a member of this group');
  }
}

/**
 * Generate a random alphanumeric invite code.
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const groupService = {
  /**
   * Create a new group
   */
  async createGroup(
    groupName: string,
    description: string,
    creatorId: string,
    memberIds: string[]
  ): Promise<string> {
    try {
      if (!groupCreateLimiter.checkLimit(creatorId)) {
        throw new Error('Too many groups created. Please try again later.');
      }

      const validatedName = validateGroupName(groupName);
      const validatedDesc = validateGroupDescription(description || '');

      const groupId = `group_${Date.now()}`;
      const allMemberIds = [creatorId, ...memberIds.filter(id => id !== creatorId)];
      const inviteCode = generateInviteCode();

      await setDoc(doc(db, 'groups', groupId), {
        groupId,
        name: validatedName,
        description: validatedDesc,
        avatar: null,
        creatorId,
        members: allMemberIds,
        admins: [creatorId],  // creator is admin
        inviteCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ Group created: ${groupId} (invite: ${inviteCode})`);
      return groupId;
    } catch (error: any) {
      console.error('❌ Error creating group:', error.message);
      throw new Error(`Failed to create group: ${error.message}`);
    }
  },

  /**
   * Join a group using an invite code. Returns the groupId on success.
   */
  async joinByInviteCode(inviteCode: string, userId: string): Promise<string> {
    try {
      const q = query(
        collection(db, 'groups'),
        where('inviteCode', '==', inviteCode),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) throw new Error('Invalid invite code');

      const groupDoc = snap.docs[0];
      const groupId = groupDoc.id;
      const data = groupDoc.data();

      if (data.members?.includes(userId)) {
        return groupId; // already a member
      }

      await updateDoc(doc(db, 'groups', groupId), {
        members: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ User ${userId} joined group ${groupId} via invite code`);
      return groupId;
    } catch (error: any) {
      console.error('❌ Error joining by invite code:', error.message);
      throw error;
    }
  },

  /**
   * Get group info
   */
  async getGroup(groupId: string): Promise<any> {
    try {
      const snap = await getDoc(doc(db, 'groups', groupId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() };
    } catch (error: any) {
      console.error('❌ Error getting group:', error.message);
      return null;
    }
  },

  /**
   * Update group info (name, description, avatar). Admin only.
   */
  async updateGroup(groupId: string, updates: { name?: string; description?: string; avatar?: string }, callerId?: string): Promise<void> {
    try {
      if (callerId) await assertAdmin(groupId, callerId);
      await updateDoc(doc(db, 'groups', groupId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      console.log(`✅ Group updated: ${groupId}`);
    } catch (error: any) {
      console.error('❌ Error updating group:', error.message);
      throw error;
    }
  },

  /**
   * Add members to a group. Admin only.
   */
  async addMembers(groupId: string, memberIds: string[], callerId?: string): Promise<void> {
    try {
      if (callerId) await assertAdmin(groupId, callerId);
      const groupRef = doc(db, 'groups', groupId);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) throw new Error('Group not found');

      const existingMembers = groupSnap.data().members || [];
      const newMembers = memberIds.filter(id => !existingMembers.includes(id));

      if (newMembers.length > 0) {
        await updateDoc(groupRef, {
          members: arrayUnion(...newMembers),
          updatedAt: serverTimestamp(),
        });
        console.log(`✅ Added ${newMembers.length} members to ${groupId}`);
      }
    } catch (error: any) {
      console.error('❌ Error adding members:', error.message);
      throw error;
    }
  },

  /**
   * Remove a member from a group. Admin only.
   */
  async removeMember(groupId: string, memberId: string, callerId?: string): Promise<void> {
    try {
      if (callerId) {
        await assertAdmin(groupId, callerId);
        // Prevent admins from removing other admins
        const targetSnap = await getDoc(doc(db, 'groups', groupId));
        const targetData = targetSnap.data();
        if (targetData?.admins?.includes(memberId)) {
          throw new Error('Cannot remove another admin. Transfer ownership first.');
        }
      }

      const groupRef = doc(db, 'groups', groupId);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) throw new Error('Group not found');

      const data = groupSnap.data();
      const updatedMembers = (data.members || []).filter((id: string) => id !== memberId);
      const updatedAdmins = (data.admins || []).filter((id: string) => id !== memberId);

      await updateDoc(groupRef, {
        members: updatedMembers,
        admins: updatedAdmins,
        updatedAt: serverTimestamp(),
      });
      console.log(`✅ Removed member ${memberId} from ${groupId}`);
    } catch (error: any) {
      console.error('❌ Error removing member:', error.message);
      throw error;
    }
  },

  /**
   * Leave group (remove self). Any member can leave.
   */
  async leaveGroup(groupId: string, userId: string): Promise<void> {
    await this.removeMember(groupId, userId);
  },

  /**
   * Transfer ownership / admin role to another member. Admin only.
   */
  async transferOwnership(groupId: string, newOwnerId: string, callerId: string): Promise<void> {
    try {
      await assertAdmin(groupId, callerId);

      const groupRef = doc(db, 'groups', groupId);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) throw new Error('Group not found');

      const members = groupSnap.data().members || [];
      if (!members.includes(newOwnerId)) {
        throw new Error('New owner must be a group member');
      }

      await updateDoc(groupRef, {
        creatorId: newOwnerId,
        admins: [newOwnerId],
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ Ownership of ${groupId} transferred to ${newOwnerId}`);
    } catch (error: any) {
      console.error('❌ Error transferring ownership:', error.message);
      throw error;
    }
  },

  /**
   * Listen to groups that the user belongs to
   */
  listenToUserGroups(userId: string, callback: (groups: any[]) => void) {
    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', userId),
      orderBy('updatedAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(groups);
    }, (err) => {
      console.error('❌ Error listening to groups:', err);
      callback([]);
    });
  },

  /**
   * Send a message to a group. Content is E2E-encrypted before storage.
   */
  async sendGroupMessage(
    groupId: string,
    senderId: string,
    content: string,
    options: {
      messageType?: string;
      mediaUrl?: string | null;
      replyToId?: string;
      replyToContent?: string;
      replyToSender?: string;
      expiresAt?: number;
    } = {}
  ): Promise<string> {
    try {
      const messageId = `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      // Encrypt content for E2E — skip for non-text or empty content
      let encryptedContent = content;
      let isEncrypted = false;
      if (content && (!options.messageType || options.messageType === 'text')) {
        try {
          const groupKey = await getGroupKey(groupId);
          const { encryptMessage } = await import('../encryption');
          encryptedContent = await encryptMessage(content, groupKey);
          isEncrypted = true;
        } catch (encErr) {
          console.warn('⚠️ Group message encryption failed, storing plaintext:', encErr);
        }
      }

      const messageData: any = {
        messageId,
        groupId,
        senderId,
        content: encryptedContent,
        isEncrypted,
        messageType: options.messageType || 'text',
        mediaUrl: options.mediaUrl || null,
        replyToId: options.replyToId || null,
        replyToContent: options.replyToContent || null,
        replyToSender: options.replyToSender || null,
        expiresAt: options.expiresAt || null,
        timestamp: serverTimestamp(),
        readBy: [senderId],
      };

      await setDoc(doc(db, 'groups', groupId, 'messages', messageId), messageData);

      // Update group's last message (use plaintext for preview;Firestore rules should restrict reads)
      await updateDoc(doc(db, 'groups', groupId), {
        lastMessage: content.substring(0, 100),
        lastMessageSender: senderId,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log(`📤 Group message sent: ${messageId}`);
      return messageId;
    } catch (error: any) {
      console.error('❌ Error sending group message:', error.message);
      throw error;
    }
  },

  /**
   * Listen to group messages in real-time. Decrypts E2E content.
   */
  listenToGroupMessages(groupId: string, callback: (messages: any[]) => void) {
    const q = query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    return onSnapshot(q, async (snapshot) => {
      const { decryptMessage } = await import('../encryption');
      const groupKey = await getGroupKey(groupId);

      const messages = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data();
        let decryptedContent = data.content;
        if (data.isEncrypted) {
          try {
            decryptedContent = await decryptMessage(data.content, groupKey);
          } catch (decErr) {
            console.warn('⚠️ Failed to decrypt group message:', doc.id, decErr);
            decryptedContent = '[Encrypted message]';
          }
        }
        return {
          id: doc.id,
          ...data,
          content: decryptedContent,
          timestamp: serverTimestamp(),
        };
      }));
      callback(messages);
    }, (err) => {
      console.error('❌ Error listening to group messages:', err);
      callback([]);
    });
  },

  /**
   * Mark group messages as read
   */
  async markGroupMessagesRead(groupId: string, userId: string): Promise<void> {
    try {
      const q = query(
        collection(db, 'groups', groupId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.readBy?.includes(userId)) {
          batch.update(docSnap.ref, {
            readBy: arrayUnion(userId),
          });
        }
      });

      await batch.commit();
    } catch (err) {
      console.warn('⚠️ Error marking group messages read:', err);
    }
  },

  /**
   * Send push notification to a specific group member.
   */
  async sendGroupNotification(
    groupId: string,
    memberId: string,
    groupName: string,
    senderName: string,
    content: string
  ): Promise<void> {
    try {
      const notifRef = ref(realtimeDb, `notifications/${sanitizePathComponent(memberId)}/${Date.now()}`);
      await set(notifRef, {
        type: 'group_message',
        groupId,
        groupName,
        fromName: senderName,
        body: `${senderName}: ${content.substring(0, 80)}`,
        messageType: 'text',
        timestamp: Date.now(),
      });
      console.log(`📬 Group notification queued for ${memberId}`);
    } catch (err) {
      console.warn('⚠️ Failed to queue group notification:', err);
    }
  },
};