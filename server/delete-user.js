import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/free-cluely';

async function deleteUser(username) {
  const mongoClient = new MongoClient(MONGO_URI);
  
  try {
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = mongoClient.db('free-cluely');
    const usersCollection = db.collection('users');
    const friendshipsCollection = db.collection('friendships');
    const chatHistoryCollection = db.collection('chatHistory');
    const friendRequestsCollection = db.collection('friendRequests');
    
    console.log(`\n🗑️  Deleting user: ${username}`);
    
    // Get user info before deletion
    const user = await usersCollection.findOne({ username });
    if (!user) {
      console.log(`❌ User '${username}' not found`);
      return;
    }
    
    console.log(`📋 User found:`, user);
    
    // 1. Delete from users collection
    const deleteResult = await usersCollection.deleteOne({ username });
    console.log(`✅ Deleted user from users collection: ${deleteResult.deletedCount} document`);
    
    // 2. Delete from friendships collection
    const friendshipDeleteResult = await friendshipsCollection.deleteOne({ username });
    console.log(`✅ Deleted friendships entry: ${friendshipDeleteResult.deletedCount} document`);
    
    // 3. Remove user from other users' friend lists
    const friendListUpdateResult = await friendshipsCollection.updateMany(
      { friends: username },
      { $pull: { friends: username } }
    );
    console.log(`✅ Removed from ${friendListUpdateResult.modifiedCount} other users' friend lists`);
    
    // 4. Delete chat history where user is sender or recipient
    const chatDeleteResult = await chatHistoryCollection.deleteMany({
      $or: [
        { 'messages.sender': username },
        { conversationKey: { $regex: username } }
      ]
    });
    console.log(`✅ Deleted chat history: ${chatDeleteResult.deletedCount} documents`);
    
    // 5. Delete friend requests sent by user
    const outgoingRequestsDelete = await friendRequestsCollection.updateMany(
      {},
      { $pull: { requests: { sender: username } } }
    );
    console.log(`✅ Removed outgoing friend requests from ${outgoingRequestsDelete.modifiedCount} documents`);
    
    // 6. Delete friend requests sent to user
    const incomingRequestsDelete = await friendRequestsCollection.deleteOne({ toUser: username });
    console.log(`✅ Deleted incoming friend requests document: ${incomingRequestsDelete.deletedCount} document`);
    
    console.log(`\n✅ Successfully deleted user '${username}' and all associated data`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoClient.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the delete function
const usernameToDelete = 'test1';
deleteUser(usernameToDelete);
