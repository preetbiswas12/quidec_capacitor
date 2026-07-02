/**
 * Conversation Service
 * Handles conversation creation, listing, and metadata updates.
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getConversationId } from './shared';

export const conversationService = {
  /**
   * Get all conversations for a user
   */
  async getUserConversations(uid: string) {
    try {
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', uid),
        orderBy('lastMessageTime', 'desc'),
      );

      const snapshot = await getDocs(q);
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return conversations;
    } catch (error: any) {
      console.error('❌ Error getting user conversations:', error.message);
      return [];
    }
  },

  /**
   * Listen to conversations in real-time
   */
  listenToUserConversations(uid: string, callback: (conversations: any[]) => void) {
    const conversationsRef = collection(db, 'conversations');
    const q = query(
      conversationsRef,
      where('participants', 'array-contains', uid),
      orderBy('lastMessageTime', 'desc'),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(conversations);
    });

    return unsubscribe;
  },

  /**
   * Create a new 1-on-1 conversation between two users.
   * Uses a deterministic ID (sorted uid1_uid2) so both users get the same document.
   * Returns the conversationId.
   */
  async createConversation(uid1: string, uid2: string): Promise<string> {
    try {
      const conversationId = getConversationId(uid1, uid2);
      const convRef = doc(db, 'conversations', conversationId);
      const existing = await getDoc(convRef);
      if (existing.exists()) {
        console.log(`ℹ️ Conversation already exists: ${conversationId}`);
        return conversationId;
      }
      await setDoc(convRef, {
        participants: [uid1, uid2],
        createdAt: serverTimestamp(),
        lastMessageTime: serverTimestamp(),
        lastMessage: '',
        lastMessageSender: '',
        type: 'direct',
      });
      console.log(`✅ Conversation created: ${conversationId}`);
      return conversationId;
    } catch (error: any) {
      console.error('❌ Error creating conversation:', error.message);
      throw error;
    }
  },

  /**
   * Update conversation metadata (last message, timestamp)
   */
  async updateConversationMetadata(
    fromUid: string,
    toUid: string,
    conversationId: string,
    lastMessage: string
  ) {
    try {
      const convRef = doc(db, 'conversations', conversationId);

      await updateDoc(convRef, {
        lastMessage,
        lastMessageTime: serverTimestamp(),
        participants: [fromUid, toUid],
        updatedAt: serverTimestamp(),
      }).catch(async () => {
        // If document doesn't exist, create it
        await setDoc(convRef, {
          conversationId,
          participants: [fromUid, toUid],
          lastMessage,
          lastMessageTime: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      });
    } catch (error: any) {
      console.error('❌ Error updating conversation metadata:', error.message);
    }
  },

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string) {
    try {
      // Get all messages in the conversation
      const messagesRef = collection(
        db,
        'conversations',
        conversationId,
        'messages',
      );
      const messagesSnapshot = await getDocs(messagesRef);

      // Delete all messages
      const batch = writeBatch(db);
      messagesSnapshot.forEach((doc) => batch.delete(doc.ref));

      // Delete conversation document
      batch.delete(doc(db, 'conversations', conversationId));

      await batch.commit();
      console.log(`✅ Conversation deleted`);
    } catch (error: any) {
      console.error('❌ Error deleting conversation:', error.message);
    }
  },
};