# Firebase Migration - Quick Reference Guide

## Summary of Changes

All server-side logic has been migrated from a Node.js/Express server to **Firebase**. The app is now 100% Firebase-based.

### What Was Deleted
- ❌ `/server` folder (Express, WebSocket server)
- ❌ MongoDB collections
- ❌ Custom signaling server

### What Was Added
- ✅ `src/utils/firebaseServices.ts` - Complete Firebase backend API
- ✅ `src/utils/cloudFunctions.ts` - Cloud Functions for backend logic
- ✅ `src/utils/firestore.rules` - Security rules
- ✅ Firestore database with collections
- ✅ Realtime Database for presence & typing
- ✅ Firebase Cloud Messaging for push notifications

---

## Key Features Implemented

### 1. Authentication
- Email/Password registration & login
- Auto-persistence
- Session management
- Profile management

### 2. Online Status & Presence
- Real-time online/offline tracking
- Last seen timestamp
- Broadcast status to all friends
- Auto-update on page visibility change

### 3. Message Delivery Status (Ticks)
- 📤 **Single Tick** (sent): Message sent to Firebase
- 📨 **Double Tick** (delivered): Message received by recipient
- 👀 **Double Blue Tick** (read): Message read by recipient

### 4. Push Notifications
- FCM setup for Android/iOS
- Foreground notifications while app is open
- Background notifications while app is closed
- Local notifications
- In-app notification center

### 5. Friend Requests
- Send/receive friend requests
- Accept/reject requests
- Auto-notification on request
- Auto-notification when accepted
- Friend list management

### 6. Typing Indicators
- Real-time typing status
- Display "User is typing..." while typing
- Auto-clear after inactivity

### 7. Message History
- Persistent conversation storage
- Pagination support (load more)
- Auto-cleanup of old messages (90+ days)
- Media support with encryption

### 8. User Blocking
- Block/unblock users
- Blocked users can't send messages

---

## Firebase Services API Reference

### Import
```typescript
import {
  authService,
  presenceService,
  messageService,
  typingService,
  friendRequestService,
  notificationService,
  userService,
  conversationService,
  analyticsService,
} from '@/utils/firebaseServices';
```

### Authentication Service

```typescript
// Register new user
await authService.registerUser(email, username, password);

// Login
await authService.loginUser(email, password);

// Logout
await authService.logoutUser();

// Get current user
const user = await authService.getCurrentUser();

// Listen to auth state changes
const unsubscribe = authService.onAuthStateChange((user) => {
  console.log('User:', user);
});
```

### Presence Service

```typescript
// Set user online
await presenceService.setUserOnline(uid, username);

// Set user offline
await presenceService.setUserOffline(uid);

// Listen to specific user's presence
const unsubscribe = presenceService.listenToUserPresence(uid, (isOnline, lastSeen) => {
  console.log(`User is ${isOnline ? 'online' : 'offline'}`);
});

// Listen to all friends' presence
const unsubscribe = presenceService.listenToFriendsPresence(uid, (friendsStatus) => {
  console.log(friendsStatus); // { uid1: { online: true, lastSeen: ... }, ... }
});

// Get online users
const onlineUsers = await presenceService.getOnlineUsers();
```

### Message Service

```typescript
// Send message
const result = await messageService.sendMessage(fromUid, toUid, 'Hello!', mediaUrl?);
// Returns: { success: true, messageId, status: 'sent' }

// Mark message as delivered (double tick)
await messageService.markMessageDelivered(conversationId, messageId, toUid);

// Mark message as read (double blue tick)
await messageService.markMessageRead(conversationId, messageId, readerUid);

// Mark all messages as read
await messageService.markAllMessagesAsRead(conversationId, readerUid, senderUid);

// Listen to messages in real-time
const unsubscribe = messageService.listenToMessages(fromUid, toUid, (messages) => {
  console.log(messages);
  // [{ id, messageId, fromUid, toUid, content, status, timestamp, ... }, ...]
});

// Get conversation history
const messages = await messageService.getConversationHistory(fromUid, toUid, pageSize);

// Delete message
await messageService.deleteMessage(conversationId, messageId);
```

### Typing Service

```typescript
// Set typing status
await typingService.setTyping(fromUid, toUid, true);  // User is typing
await typingService.setTyping(fromUid, toUid, false); // User stopped typing

// Listen to typing status
const unsubscribe = typingService.listenToTyping(fromUid, toUid, (typingStatus) => {
  console.log(typingStatus); // { [uid]: true/false, ... }
});
```

### Friend Request Service

```typescript
// Send friend request
const result = await friendRequestService.sendFriendRequest(fromUid, toUid);
// Returns: { success: true, requestId }

// Accept friend request
await friendRequestService.acceptFriendRequest(requestId, fromUid, toUid);

// Reject friend request
await friendRequestService.rejectFriendRequest(requestId, toUid);

// Get pending requests
const requests = await friendRequestService.getPendingRequests(uid);

// Listen to pending requests
const unsubscribe = friendRequestService.listenToPendingRequests(uid, (requests) => {
  console.log(requests);
  // [{ id, fromUid, fromUsername, status: 'pending', ... }, ...]
});

// Remove friend
await friendRequestService.removeFriend(uid1, uid2);

// Get friend list
const friends = await friendRequestService.getFriendsList(uid);
// [{ uid, username, email, isOnline, lastSeen, ... }, ...]
```

### Notification Service

```typescript
// Request FCM permission and get token
const token = await notificationService.requestFCMPermission(uid);

// Listen to foreground notifications
const unsubscribe = notificationService.listenToNotifications((notification) => {
  console.log('Notification:', notification);
  // { title, body, data }
});

// Send local notification
await notificationService.sendLocalNotification('Title', {
  body: 'Message',
  tag: 'notification-tag',
});

// Listen to user notifications from Firestore
const unsubscribe = notificationService.listenToUserNotifications(uid, (notifications) => {
  console.log(notifications);
  // [{ id, type, message, read, createdAt, ... }, ...]
});

// Mark notification as read
await notificationService.markNotificationAsRead(uid, notificationId);
```

### User Service

```typescript
// Get user profile
const user = await userService.getUserProfile(uid);
// { uid, username, email, photoURL, isOnline, lastSeen, ... }

// Update user profile
await userService.updateUserProfile(uid, { displayName: 'New Name', photoURL: 'url' });

// Search users
const results = await userService.searchUsers('search term', currentUid);

// Get user by username
const user = await userService.getUserByUsername('username');

// Delete user account
await userService.deleteUserAccount(uid);
```

### Conversation Service

```typescript
// Get all conversations for user
const conversations = await conversationService.getUserConversations(uid);

// Listen to conversations in real-time
const unsubscribe = conversationService.listenToUserConversations(uid, (conversations) => {
  console.log(conversations);
  // [{ id, participants, lastMessage, lastMessageTime, ... }, ...]
});

// Delete conversation
await conversationService.deleteConversation(conversationId);
```

### Analytics Service

```typescript
// Get chat statistics
const stats = await analyticsService.getChatStats(uid);
// { totalConversations, totalMessages, unreadMessages }
```

---

## Component Integration Examples

### Chat Component

```typescript
import { messageService, typingService } from '@/utils/firebaseServices';

export function ChatComponent({ fromUid, toUid, friendName }) {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState({});
  const [inputValue, setInputValue] = useState('');

  // Load messages
  useEffect(() => {
    const unsubscribe = messageService.listenToMessages(fromUid, toUid, (msgs) => {
      setMessages(msgs);
      
      // Mark all as read
      msgs.forEach((msg) => {
        if (msg.toUid === fromUid && msg.status !== 'read') {
          messageService.markMessageRead('conv_id', msg.messageId, fromUid);
        }
      });
    });
    return unsubscribe;
  }, [fromUid, toUid]);

  // Listen to typing
  useEffect(() => {
    const unsubscribe = typingService.listenToTyping(fromUid, toUid, (typing) => {
      setIsTyping(typing);
    });
    return unsubscribe;
  }, [fromUid, toUid]);

  // Send message
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    
    await typingService.setTyping(fromUid, toUid, false);
    await messageService.sendMessage(fromUid, toUid, inputValue);
    setInputValue('');
  };

  // Handle typing indicator
  const handleInputChange = async (value) => {
    setInputValue(value);
    const isTyping = value.length > 0;
    await typingService.setTyping(fromUid, toUid, isTyping);
  };

  return (
    <div className="chat">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.messageId} className="message">
            <p>{msg.content}</p>
            <span className="status">
              {msg.status === 'sent' && '📤'}
              {msg.status === 'delivered' && '📨'}
              {msg.status === 'read' && '👀'}
            </span>
          </div>
        ))}
      </div>

      {Object.values(isTyping).some((t) => t) && (
        <div className="typing-indicator">{friendName} is typing...</div>
      )}

      <div className="input">
        <input
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Type a message..."
        />
        <button onClick={handleSendMessage}>Send</button>
      </div>
    </div>
  );
}
```

### Friend Requests Component

```typescript
import { friendRequestService } from '@/utils/firebaseServices';

export function FriendRequestsComponent({ currentUid }) {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const unsubscribe = friendRequestService.listenToPendingRequests(
      currentUid,
      (reqs) => setRequests(reqs)
    );
    return unsubscribe;
  }, [currentUid]);

  const handleAccept = async (requestId, fromUid) => {
    await friendRequestService.acceptFriendRequest(requestId, fromUid, currentUid);
  };

  const handleReject = async (requestId) => {
    await friendRequestService.rejectFriendRequest(requestId, currentUid);
  };

  return (
    <div className="requests">
      {requests.map((req) => (
        <div key={req.id} className="request">
          <p>{req.fromUsername} sent you a friend request</p>
          <button onClick={() => handleAccept(req.id, req.fromUid)}>Accept</button>
          <button onClick={() => handleReject(req.id)}>Reject</button>
        </div>
      ))}
    </div>
  );
}
```

### Online Friends Component

```typescript
import { presenceService, userService } from '@/utils/firebaseServices';

export function OnlineFriendsComponent({ currentUid }) {
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    const unsubscribe = presenceService.listenToFriendsPresence(
      currentUid,
      (friendsStatus) => {
        setFriends(
          Object.entries(friendsStatus).map(([uid, data]) => ({
            uid,
            ...data,
          }))
        );
      }
    );
    return unsubscribe;
  }, [currentUid]);

  return (
    <div className="friends">
      {friends
        .filter((f) => f.online)
        .map((friend) => (
          <div key={friend.uid} className="friend online">
            <div className="status-indicator"></div>
            <p>{friend.username}</p>
          </div>
        ))}
    </div>
  );
}
```

---

## Environment Variables

```bash
# .env or .env.local

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com

# Push Notifications
REACT_APP_VAPID_KEY=your_vapid_key
```

---

## Common Tasks

### Check if User is Online
```typescript
const unsubscribe = presenceService.listenToUserPresence(uid, (isOnline) => {
  console.log(isOnline ? 'Online' : 'Offline');
});
```

### Get Unread Message Count
```typescript
const stats = await analyticsService.getChatStats(uid);
console.log(`Unread: ${stats.unreadMessages}`);
```

### Search for Users
```typescript
const results = await userService.searchUsers('john', currentUid);
results.forEach((user) => {
  console.log(`${user.username} - ${user.email}`);
});
```

### Listen to New Messages Only
```typescript
messageService.listenToMessages(fromUid, toUid, (messages) => {
  const newMessages = messages.filter((m) => m.status === 'sent');
  console.log('New messages:', newMessages);
});
```

### Auto-send Message When User Comes Online
```typescript
presenceService.listenToUserPresence(uid, async (isOnline) => {
  if (isOnline) {
    await messageService.sendMessage(currentUid, uid, 'Hey! You\'re online!');
  }
});
```

---

## Important Notes

1. **Firestore is a NoSQL database** - Structure your queries accordingly
2. **Real-time listeners consume bandwidth** - Unsubscribe when not needed
3. **Cloud Functions are stateless** - Store state in Firestore/Realtime DB
4. **Security rules are essential** - Deploy production rules before going live
5. **FCM requires HTTPS** - Test notifications with HTTPS URLs
6. **Realtime Database pricing differs** - Monitor usage in Firebase Console

---

## Debugging Tips

### Check Firestore Rules
```typescript
// If queries return empty, check rules
db.collection('collection').get()
  .then(snapshot => console.log('Docs:', snapshot.size))
  .catch(error => console.error('Rule error:', error.message));
```

### Monitor Real-time Database
```typescript
// Check presence updates
db.ref('presence').on('value', (snapshot) => {
  console.log('Presence:', snapshot.val());
});
```

### View Function Logs
```bash
firebase functions:log --lines=50
```

### Check Message Status
```typescript
db.collection('conversations').doc(convId)
  .collection('messages').doc(msgId).get()
  .then(doc => console.log('Status:', doc.data().status));
```

---

## Performance Tips

1. Use pagination for messages: `getConversationHistory(uid1, uid2, 50)`
2. Unsubscribe from unused listeners
3. Use indexes for complex queries
4. Batch write operations
5. Cache user profiles locally
6. Debounce typing indicators (500ms)
7. Cleanup old messages with Cloud Functions

---

## Support

For issues, check:
- Firebase Console → Logs
- Browser Console → Errors
- Firebase CLI → `firebase functions:log`
- Firestore Rules → Simulator
