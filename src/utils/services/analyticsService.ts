/**
 * Analytics Service
 * Tracks user engagement metrics and statistics.
 *
 * Affected APIs: getChatStats, possibly others
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export const analyticsService = {
  /**
   * Get chat statistics for a user
   */
  async getChatStats(uid: string) {
    try {
      const conversationsRef = collection(db, 'conversations');
      const q = query(
        conversationsRef,
        where('participants', 'array-contains', uid),
      );

      const conversationsSnapshot = await getDocs(q);
      let totalMessages = 0;
      let unreadMessages = 0;

      for (const conversation of conversationsSnapshot.docs) {
        const conversationId = conversation.id;
        const messagesRef = collection(
          db,
          'conversations',
          conversationId,
          'messages',
        );
        const allMessages = await getDocs(messagesRef);
        const unreadMsgs = allMessages.docs.filter(
          (msg) => msg.data().toUid === uid && msg.data().status !== 'read'
        );

        totalMessages += allMessages.size;
        unreadMessages += unreadMsgs.length;
      }

      return {
        totalConversations: conversationsSnapshot.size,
        totalMessages,
        unreadMessages,
      };
    } catch (error: any) {
      console.error('❌ Error getting chat stats:', error.message);
      return { totalConversations: 0, totalMessages: 0, unreadMessages: 0 };
    }
  },
};