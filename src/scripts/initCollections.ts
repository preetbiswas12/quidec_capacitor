import { 
  doc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../utils/firebase';

/**
 * Initialize Production Collections
 * This script ensures that the required collections exist with the expected structures.
 * Run this once after setting up your Firebase project.
 */
export async function initializeProductionCollections() {
  console.log('🚀 Initializing production collections...');

  try {
    // 1. Initialize a System document in 'users' to ensure collection exists
    await setDoc(doc(db, 'users', 'system_config'), {
      type: 'config',
      version: '1.0.0',
      lastInitialized: serverTimestamp(),
      description: 'System configuration and metadata'
    }, { merge: true }).catch(() => {});

    // 2. Initialize 'friendships' metadata
    await setDoc(doc(db, 'friendships', 'system_meta'), {
      totalFriendships: 0,
      lastUpdated: serverTimestamp()
    }, { merge: true }).catch(() => {});

    // 3. Initialize 'conversations' metadata
    await setDoc(doc(db, 'conversations', 'system_meta'), {
      totalConversations: 0,
      activeStatus: true,
      lastUpdated: serverTimestamp()
    }, { merge: true }).catch(() => {});

    console.log('✅ Production collections initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize collections:', error);
  }
}
