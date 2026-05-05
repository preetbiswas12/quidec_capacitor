import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import * as ed from '@noble/ed25519';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Minimal in-memory maps for stateless operation
const userConnections = new Map();     // username -> ws (active connections)
const userPublicKeys = new Map();      // username -> public key (hex)
const sessionUsernames = new Set();    // Track taken usernames in this session

app.use(cors());
app.use(express.json());

// Generate ephemeral user id (not persisted)
function generateEphemeralId() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Generate unique username if taken
function generateUniqueUsername(baseUsername) {
  if (!usernameStore.has(baseUsername)) {
    return baseUsername;
  }
  // Append random suffix
  const suffix = Math.floor(Math.random() * 10000);
  return `${baseUsername}_${suffix}`;
}

// Lightweight register endpoint with Ed25519 signature verification
app.post('/api/register', (req, res) => {
  try {
    const { username, password, publicKey, signature } = req.body || {};
    
    if (!username || !publicKey || !signature) {
      return res.status(400).json({ error: 'username, publicKey, and signature required' });
    }

    // Verify Ed25519 signature
    try {
      const isValid = ed.verify(
        Buffer.from(signature, 'hex'),
        username,
        Buffer.from(publicKey, 'hex')
      );

      if (!isValid) {
        return res.status(401).json({ error: 'invalid-signature' });
      }
    } catch (err) {
      return res.status(401).json({ error: 'signature-verification-failed' });
    }

    // Generate unique username if taken
    const finalUsername = generateUniqueUsername(username);
    const userId = generateEphemeralId();

    // Store username and public key
    usernameStore.set(finalUsername, {
      publicKey,
      createdAt: new Date().toISOString(),
    });
    userPublicKeys.set(finalUsername, publicKey);

    console.log(`✅ User registered: ${finalUsername}`);
    return res.json({
      success: true,
      username: finalUsername,
      userId,
      publicKey,
    });
  } catch (err) {
    console.error('❌ Registration error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Lightweight login endpoint with Ed25519 signature verification
app.post('/api/login', (req, res) => {
  try {
    const { username, password, publicKey, signature } = req.body || {};

    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    // If signature provided, verify it
    if (signature && publicKey) {
      try {
        const isValid = ed.verify(
          Buffer.from(signature, 'hex'),
          username,
          Buffer.from(publicKey, 'hex')
        );

        if (!isValid) {
          return res.status(401).json({ error: 'invalid-signature' });
        }

        // Verify public key matches registered key
        const storedKey = userPublicKeys.get(username);
        if (storedKey && storedKey !== publicKey) {
          return res.status(401).json({ error: 'public-key-mismatch' });
        }
      } catch (err) {
        return res.status(401).json({ error: 'signature-verification-failed' });
      }
    }

    const userId = generateEphemeralId();
    console.log(`✅ User logged in: ${username}`);
    return res.json({
      success: true,
      username,
      userId,
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', online: userConnections.size, timestamp: new Date() });
});

// Utility: safe send
function safeSend(ws, obj) {
  try {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  } catch (e) {
    // ignore
  }
}

// Broadcast user status to all connected clients
function broadcastUserStatus(username, online) {
  const msg = { type: 'user-status', username, online, timestamp: new Date() };
  for (const [, client] of userConnections) {
    safeSend(client, msg);
  }
}

// WebSocket signaling handling
wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (err) {
      return;
    }

    const { type } = message || {};

    if (type === 'auth') {
      const { username, publicKey, signature } = message;
      
      if (!username) {
        safeSend(ws, { type: 'error', message: 'username required' });
        return;
      }

      // If signature provided, verify Ed25519 signature
      if (signature && publicKey) {
        try {
          const isValid = ed.verify(
            Buffer.from(signature, 'hex'),
            username,
            Buffer.from(publicKey, 'hex')
          );

          if (!isValid) {
            safeSend(ws, { type: 'error', message: 'invalid-signature' });
            return;
          }

          // Store public key for this session
          userPublicKeys.set(username, publicKey);
        } catch (err) {
          console.error('❌ Signature verification error:', err);
          safeSend(ws, { type: 'error', message: 'signature-verification-failed' });
          return;
        }
      }

      currentUser = username;
      userConnections.set(username, ws);
      broadcastUserStatus(username, true);
      console.log(`🔐 User authenticated: ${username}`);
      return;
    }

    if (type === 'get-online') {
      const onlineUsers = Array.from(userConnections.keys());
      safeSend(ws, { type: 'online-users', users: onlineUsers });
      return;
    }

    // Signaling messages forwarded to specific recipient (including chat messages and call signaling)
    const routingTypes = new Set(['webrtc-offer', 'webrtc-answer', 'webrtc-candidate', 'signal', 'typing', 'message', 'friend-response']);
    if (routingTypes.has(type)) {
      const to = message.to;
      if (!to) return;
      const dest = userConnections.get(to);
      if (dest) {
        safeSend(dest, { ...message, from: currentUser });
      } else {
        // Optionally notify sender that recipient is offline
        safeSend(ws, { type: 'error', message: 'recipient-offline', to });
      }
      return;
    }

    // Generic ping/pong
    if (type === 'ping') {
      safeSend(ws, { type: 'pong', ts: Date.now() });
      return;
    }
  });

  ws.on('close', () => {
    if (currentUser) {
      userConnections.delete(currentUser);
      broadcastUserStatus(currentUser, false);
    }
  });

  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`)
  console.log(`📡 WebSocket: ws://localhost:${PORT}`)
  console.log(`🔗 REST: http://localhost:${PORT}`)
})

// Health check endpoint (minimal, no DB access)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    onlineUsers: userConnections.size,
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/friend-requests/outgoing/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const sentTo = await friendRequestsCollection.find({
      $or: [
        { 'requests.sender': username },
        { 'requests': username }
      ]
    }).toArray();
    
    const outgoing = sentTo.map(doc => {
      const userRequest = doc.requests.find(r => {
        if (typeof r === 'string') return r === username;
        return r.sender === username;
      });
      
      return {
        recipient: doc.toUser,
        sentAt: (typeof userRequest === 'object' ? userRequest?.sentAt : null) || new Date(),
      };
    });
    
    res.json({ outgoing, count: outgoing.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/friends/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const userFriends = await friendshipsCollection.findOne({ username });
    const friends = userFriends?.friends || [];
    
    const friendsData = friends.map((friend) => ({
      username: friend,
      online: userConnections.has(friend),
      lastSeen: lastSeen.get(friend) || new Date(),
    }));
    
    res.json({ friends: friendsData, count: friendsData.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST endpoint to send friend request (HTTP - for Electron app)
app.post('/api/friend-requests/send', async (req, res) => {
  try {
    console.log('\n========== 📤 FRIEND REQUEST (HTTP POST) ==========');
    const { from, to, toUserId } = req.body;
    
    console.log('Request body:', { from, to, toUserId });

    if (!from) {
      return res.status(400).json({ error: 'Missing "from" field' });
    }

    if (!to && !toUserId) {
      return res.status(400).json({ error: 'Missing "to" or "toUserId" field' });
    }

    // Use the input (either 'to' for username or 'toUserId' for 8-digit ID)
    const input = to || toUserId;
    console.log(`✅ Input: "${input}" (type: ${toUserId ? '8-digit ID' : 'username'})`);

    // Validate sender exists
    const senderUser = await usersCollection.findOne({ username: from });
    if (!senderUser) {
      console.log(`❌ Sender ${from} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Sender ${from} found`);

    // Resolve 8-digit ID to username if needed
    let toUsername = input;
    if (toUserId) {
      console.log(`🔍 Resolving 8-digit ID: ${toUserId}`);
      const recipientUser = await usersCollection.findOne({ userId: toUserId });
      if (!recipientUser) {
        console.log(`❌ User with ID ${toUserId} not found`);
        return res.status(404).json({ error: `User with ID ${toUserId} not found` });
      }
      toUsername = recipientUser.username;
      console.log(`✅ Resolved ID to username: ${toUsername}`);
    }

    // Prevent self-requests
    if (from === toUsername) {
      console.log(`❌ Cannot send request to yourself`);
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    }

    // Check if already friends
    const friendship = await friendshipsCollection.findOne({ username: from });
    if (friendship?.friends?.includes(toUsername)) {
      console.log(`❌ Already friends with ${toUsername}`);
      return res.status(400).json({ error: 'Already friends with this user' });
    }

    console.log(`✅ Not already friends`);

    // Check if request already exists
    const existingRequest = await friendRequestsCollection.findOne({
      toUser: toUsername,
      'requests.sender': from,
    });

    if (existingRequest) {
      console.log(`❌ Request already exists from ${from} to ${toUsername}`);
      return res.status(400).json({ error: 'Request already sent' });
    }

    // Create the request
    console.log(`📝 Creating friend request from ${from} to ${toUsername}`);
    const result = await friendRequestsCollection.updateOne(
      { toUser: toUsername },
      {
        $push: {
          requests: {
            sender: from,
            sentAt: new Date(),
          },
        },
      },
      { upsert: true }
    );

    console.log(`✅ Request created. Modified count:`, result.modifiedCount || result.upsertedCount);

    // Notify recipient if online
    const recipientWs = userConnections.get(toUsername);
    if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
      console.log(`📢 Recipient ${toUsername} is online, sending notification...`);
      recipientWs.send(JSON.stringify({
        type: 'friend-request-incoming',
        from,
      }));
      console.log(`✅ Notification sent`);
    } else {
      console.log(`⚠️ Recipient ${toUsername} is offline`);
    }

    console.log('========== ✅ SUCCESS ==========\n');
    res.json({ success: true, message: 'Friend request sent' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Migrate old string requests to new object format
app.post('/api/debug/migrate-requests', async (req, res) => {
  try {
    const allRequests = await friendRequestsCollection.find({}).toArray();
    let migratedCount = 0;
    
    for (const doc of allRequests) {
      const migratedRequests = doc.requests.map(req => {
        if (typeof req === 'string') {
          migratedCount++;
          return { sender: req, sentAt: new Date() };
        }
        return req;
      });
      
      await friendRequestsCollection.updateOne(
        { _id: doc._id },
        { $set: { requests: migratedRequests } }
      );
    }
    
    res.json({ 
      message: `Migrated ${migratedCount} requests to new format`,
      totalDocuments: allRequests.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/online-users', (req, res) => {
  const onlineUsers = Array.from(userConnections.keys());
  res.json({ onlineUsers });
});

// Message HTTP endpoints (fallback for WebSocket issues on Render)
app.post('/api/messages/send', async (req, res) => {
  try {
    const { from, to, content } = req.body;
    
    if (!from || !to || !content) {
      return res.status(400).json({ error: 'from, to, and content required' });
    }
    
    const conversationKey = [from, to].sort().join('-');
    const messageObj = {
      conversationKey,
      from,
      to,
      content,
      timestamp: new Date(),
      read: false,
      readAt: null,
    };
    
    // Save to MongoDB
    const result = await chatHistoryCollection.insertOne(messageObj);
    
    console.log(`💬 Message saved: ${from} → ${to}`);
    
    // Try to send via WebSocket if recipient is online
    const toUser = userConnections.get(to);
    if (toUser && toUser.readyState === WebSocket.OPEN) {
      toUser.send(JSON.stringify({
        type: 'message',
        from,
        content,
        timestamp: messageObj.timestamp,
        read: false,
        messageId: result.insertedId?.toString(),
      }));
      console.log(`✓ WebSocket: Sent to ${to}`);
    } else {
      console.log(`⚠ ${to} is offline, message will be retrieved on next poll`);
    }
    
    res.json({ 
      success: true, 
      messageId: result.insertedId?.toString(),
      timestamp: messageObj.timestamp 
    });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages for a conversation
app.get('/api/messages/:username/:withUser', async (req, res) => {
  try {
    const { username, withUser } = req.params;
    const conversationKey = [username, withUser].sort().join('-');
    
    const messages = await chatHistoryCollection
      .find({ conversationKey })
      .sort({ timestamp: 1 })
      .toArray();
    
    // Ensure all messages have proper structure
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      messageId: msg._id,
      conversationKey: msg.conversationKey,
      from: msg.from,
      to: msg.to,
      content: msg.content,
      timestamp: msg.timestamp,
      read: msg.read || false,
      readAt: msg.readAt || null,
      readBy: msg.readBy || null,
    }));
    
    console.log(`📬 Fetched ${formattedMessages.length} messages for ${username} ↔ ${withUser}`);
    console.log(`   Sample msg: read=${formattedMessages[0]?.read}, readAt=${formattedMessages[0]?.readAt}`);
    
    res.json({ messages: formattedMessages, count: formattedMessages.length });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Mark message as read
app.post('/api/messages/read', async (req, res) => {
  try {
    const { messageId, readBy } = req.body;
    
    if (!messageId || !readBy) {
      return res.status(400).json({ error: 'messageId and readBy required' });
    }
    
    const { ObjectId } = require('mongodb');
    const readTimestamp = new Date();
    
    // Update message status
    const result = await chatHistoryCollection.updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { read: true, readAt: readTimestamp, readBy } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✓ Message ${messageId} marked as read by ${readBy}`);
      
      // Get the message to find sender
      const message = await chatHistoryCollection.findOne({ _id: new ObjectId(messageId) });
      if (message) {
        // Try to notify sender via WebSocket
        const senderConn = userConnections.get(message.from);
        if (senderConn && senderConn.readyState === WebSocket.OPEN) {
          senderConn.send(JSON.stringify({
            type: 'read-receipt',
            messageId: messageId,
            readBy,
            readAt: readTimestamp,
          }));
          console.log(`✓ WebSocket: Sent read receipt to ${message.from}`);
        }
      }
    }
    
    res.json({ success: result.modifiedCount > 0 });
  } catch (err) {
    console.error('Error marking message as read:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Get unread messages for a user (for notifications)
app.get('/api/messages/unread/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const unreadMessages = await chatHistoryCollection
      .find({ to: username, read: false })
      .sort({ timestamp: -1 })
      .toArray();
    
    res.json({ unreadMessages, count: unreadMessages.length });
  } catch (err) {
    console.error('Error fetching unread messages:', err);
    res.status(500).json({ error: 'Failed to fetch unread messages' });
  }
});

// Clear chat history (HTTP endpoint)
app.post('/api/messages/clear', async (req, res) => {
  try {
    const { username, withUser } = req.body;
    
    if (!username || !withUser) {
      return res.status(400).json({ error: 'username and withUser required' });
    }
    
    const conversationKey = [username, withUser].sort().join('-');
    
    // Delete all messages in this conversation from MongoDB
    const result = await chatHistoryCollection.deleteMany({ conversationKey });
    
    console.log(`🗑️ Cleared chat between ${username} and ${withUser}: deleted ${result.deletedCount} messages`);
    
    // Try to notify the other user via WebSocket if online
    const otherUser = userConnections.get(withUser);
    if (otherUser && otherUser.readyState === WebSocket.OPEN) {
      otherUser.send(JSON.stringify({
        type: 'clear-chat',
        from: username,
        to: withUser,
      }));
      console.log(`✓ WebSocket: Notified ${withUser} about cleared chat`);
    }
    
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount,
      message: `Cleared ${result.deletedCount} messages from chat with ${withUser}`
    });
  } catch (err) {
    console.error('Error clearing chat:', err);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
});

// Health check endpoint for Render
app.get('/health', async (req, res) => {
  try {
    // Test MongoDB connection
    await db.admin().ping();
    
    res.json({ 
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
      mongodb: 'connected',
      onlineUsers: userConnections.size
    });
  } catch (err) {
    res.status(503).json({ 
      status: 'error',
      timestamp: new Date(),
      uptime: process.uptime(),
      mongodb: 'disconnected',
      error: err.message
    });
  }
});

// WebSocket handling
wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'auth':
          currentUser = message.username;
          userConnections.set(currentUser, ws);
          lastSeen.set(currentUser, new Date());
          broadcastUserStatus(currentUser, true);
          console.log(`✅ User ${currentUser} authenticated`);
          
          // Send pending and outgoing requests immediately after auth is set
          // Use process.nextTick to ensure currentUser is set
          process.nextTick(() => {
            sendPendingRequests(currentUser, ws);
            sendOutgoingRequests(currentUser, ws);
          });
          break;

        case 'message':
          handleChatMessage(message);
          break;

        case 'typing':
          broadcastTypingStatus(message.from, message.to, message.typing);
          break;

        case 'friend-request':
          // Handle both 'to' (username) and 'toUserId' (8-digit ID)
          const recipientInput = message.to || message.toUserId;
          handleFriendRequest(message.from, recipientInput, ws, currentUser);
          break;

        case 'friend-response':
          handleFriendResponse(message.from, message.to, message.accept, ws, currentUser);
          break;

        case 'cancel-friend-request':
          handleCancelFriendRequest(message.from, message.to, ws, currentUser);
          break;

        case 'get-friends':
          sendFriendsList(currentUser, ws);
          break;

        case 'get-chat-history':
          sendChatHistory(currentUser, message.with, ws);
          break;

        case 'clear-chat':
          handleClearChat(message.from, message.to);
          break;

        case 'get-online':
          sendOnlineUsers(ws);
          break;

        case 'get-pending':
          console.log(`📨 get-pending received. currentUser:`, currentUser);
          if (!currentUser) {
            console.log('❌ get-pending received BEFORE auth, ignoring');
            break;
          }
          sendPendingRequests(currentUser, ws);
          break;

        case 'get-outgoing':
          console.log(`📨 get-outgoing received. currentUser:`, currentUser);
          if (!currentUser) {
            console.log('❌ get-outgoing received BEFORE auth, ignoring');
            break;
          }
          sendOutgoingRequests(currentUser, ws);
          break;

        case 'mark-read':
          handleMarkRead(message.messageId, message.to);
          break;

        case 'window-visibility':
          // Broadcast window visibility status to all connected users
          console.log(`👁️ Window visibility update from ${message.from}:`, message.visible ? 'shown' : 'hidden');
          broadcastWindowVisibility(message.from, message.visible, message.timestamp);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    if (currentUser) {
      userConnections.delete(currentUser);
      lastSeen.set(currentUser, new Date());
      broadcastUserStatus(currentUser, false);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function handleChatMessage(message) {
  const { from, to, content } = message;
  
  // Create conversation key (sorted so same conversation has same key)
  const conversationKey = [from, to].sort().join('-');
  
  // Save message to MongoDB
  const messageObj = {
    conversationKey,
    from,
    to,
    content,
    timestamp: new Date(),
    read: false,
    readAt: null,
  };
  
  chatHistoryCollection.insertOne(messageObj).catch(err => {
    console.error('Error saving message:', err);
  });
  
  // Send to recipient if online
  const toUser = userConnections.get(to);
  if (toUser) {
    toUser.send(JSON.stringify({
      type: 'message',
      from,
      content,
      timestamp: messageObj.timestamp,
      read: false,
      readAt: null,
      messageId: messageObj._id?.toString(),
    }));
  }
}

function broadcastTypingStatus(from, to, typing) {
  const toUser = userConnections.get(to);

  if (toUser) {
    toUser.send(JSON.stringify({
      type: 'typing',
      from,
      typing,
    }));
  }
}

async function handleFriendRequest(from, to, ws, currentUser) {
  try {
    console.log(`\n========== 📤 FRIEND REQUEST (WebSocket) ==========`);
    console.log(`FROM: ${from}`);
    console.log(`TO (received): ${to}`);
    
    // Validate sender
    if (!currentUser || currentUser !== from) {
      console.log(`❌ Unauthorized: currentUser (${currentUser}) != from (${from})`);
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      return;
    }
    
    const senderUser = await usersCollection.findOne({ username: from });
    if (!senderUser) {
      console.log(`❌ Sender ${from} not found`);
      ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
      return;
    }
    
    // 'to' might be an 8-digit ID, try to resolve it to username
    let toUsername = to;
    
    // Check if 'to' looks like an ID (8 digits)
    if (/^\d{8}$/.test(to)) {
      console.log(`🔍 Resolving 8-digit ID: ${to}`);
      const user = await usersCollection.findOne({ userId: to });
      if (!user) {
        console.log(`❌ User ID ${to} not found`);
        ws.send(JSON.stringify({ type: 'error', message: `User with ID ${to} not found` }));
        return;
      }
      toUsername = user.username;
      console.log(`✅ Resolved ID ${to} → username: ${toUsername}`);
    } else {
      console.log(`📝 Input is username: ${to}`);
    }
    
    // Prevent self-requests
    if (from === toUsername) {
      console.log(`❌ Cannot send friend request to yourself`);
      ws.send(JSON.stringify({ type: 'error', message: 'Cannot send request to yourself' }));
      return;
    }
    
    // Check if already friends
    const friendship = await friendshipsCollection.findOne({ username: from });
    if (friendship?.friends?.includes(toUsername)) {
      console.log(`❌ Already friends with ${toUsername}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Already friends with this user' }));
      return;
    }

    console.log(`✅ Ready to send request to ${toUsername}`);
    
    // Check if request already exists
    const existingRequest = await friendRequestsCollection.findOne({ toUser: toUsername, 'requests.sender': from });
    if (existingRequest) {
      console.log(`❌ Request already sent to ${toUsername}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Request already sent' }));
      return;
    }

    const timestamp = new Date();
    const requestObj = { sender: from, sentAt: timestamp };
    
    // Store request with full details
    console.log(`💾 Saving to database...`);
    const result = await friendRequestsCollection.updateOne(
      { toUser: toUsername },
      { $push: { requests: requestObj } },
      { upsert: true }
    );
    
    console.log(`✅ Stored request in DB (modified: ${result.modifiedCount}, upserted: ${result.upsertedId ? 'yes' : 'no'})`);

    // Notify sender
    ws.send(JSON.stringify({
      type: 'request-sent',
      to: toUsername,
      status: 'pending',
      sentAt: timestamp,
      message: `Friend request sent to ${toUsername}`,
    }));
    console.log(`📤 Notified sender: ${from}`);

    // Send to recipient if online
    const toUserConn = userConnections.get(toUsername);
    if (toUserConn && toUserConn.readyState === 1) {
      toUserConn.send(JSON.stringify({
        type: 'incoming-request',
        from,
        fromId: senderUser.userId,
        sentAt: timestamp,
      }));
      console.log(`📬 Notified recipient: ${toUsername} (online)`);
    } else {
      console.log(`⏳ Recipient ${toUsername} is offline (will see on next login)`);
    }
    
    console.log(`========== ✅ SUCCESS ==========\n`);
  } catch (err) {
    console.error(`❌ Error in handleFriendRequest:`, err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to send request' }));
  }
}

function handleFriendResponse(from, to, accept, ws, currentUser) {
  try {
    // Validate authorization
    if (!currentUser || currentUser !== from) {
      console.log(`❌ Unauthorized: currentUser (${currentUser}) != from (${from})`);
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      return;
    }
    
    console.log(`\n=== FRIEND RESPONSE ===`);
    console.log(`Recipient: ${from}, Sender: ${to}, Accept: ${accept}`);
    
    // Remove from pending requests
    friendRequestsCollection.updateOne(
      { toUser: from },
      { $pull: { 'requests': { sender: to } } }
    ).then(removeResult => {
      console.log(`✓ Removed request from pending:`, {matched: removeResult.matchedCount, modified: removeResult.modifiedCount});
    }).catch(err => {
      console.error('Error removing friend request:', err);
    });

    if (accept) {
      console.log(`✓ Request accepted - adding to friends`);
      
      // Add to friends in MongoDB (both directions)
      friendshipsCollection.updateOne(
        { username: from },
        { $addToSet: { friends: to } },
        { upsert: true }
      ).catch(err => {
        console.error('Error adding friend:', err);
      });

      friendshipsCollection.updateOne(
        { username: to },
        { $addToSet: { friends: from } },
        { upsert: true }
      ).catch(err => {
        console.error('Error adding friend:', err);
      });

      // Notify both users
      const fromUser = userConnections.get(from);
      const toUser = userConnections.get(to);

      const responseMessage = JSON.stringify({
        type: 'friend-added',
        friendUsername: to,
        status: 'accepted',
        addedAt: new Date(),
      });

      if (fromUser) {
        fromUser.send(responseMessage);
        console.log(`✓ Notified ${from}: friendship accepted`);
      }

      if (toUser) {
        toUser.send(JSON.stringify({
          type: 'friend-added',
          friendUsername: from,
          status: 'accepted',
          addedAt: new Date(),
        }));
        console.log(`✓ Notified ${to}: friendship accepted`);
      }

      console.log(`✅ ${from} and ${to} are now friends\n`);
    } else {
      console.log(`✓ Request declined`);
      
      // Notify sender that request was declined
      const toUser = userConnections.get(to);
      if (toUser) {
        toUser.send(JSON.stringify({
          type: 'request-declined',
          declinedBy: from,
          declinedAt: new Date(),
        }));
        console.log(`✓ Notified ${to}: request declined by ${from}`);
      }

      console.log(`✅ ${from} declined friend request from ${to}\n`);
    }
  } catch (err) {
    console.error('❌ Error in handleFriendResponse:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to respond to request' }));
  }
}

async function handleCancelFriendRequest(from, to, ws, currentUser) {
  try {
    // Validate authorization
    if (!currentUser || currentUser !== from) {
      console.log(`❌ Unauthorized: currentUser (${currentUser}) != from (${from})`);
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      return;
    }
    
    console.log(`\n=== CANCEL FRIEND REQUEST ===`);
    console.log(`Sender: ${from}, Target: ${to}`);
    
    // Resolve ID to username if needed
    let toUsername = to;
    if (/^\d{8}$/.test(to)) {
      const user = await usersCollection.findOne({ userId: to });
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
        return;
      }
      toUsername = user.username;
    }
    
    // Remove the pending request
    const result = await friendRequestsCollection.updateOne(
      { toUser: toUsername },
      { $pull: { 'requests': { sender: from } } }
    );
    
    if (result.modifiedCount === 0) {
      console.log(`❌ No pending request found`);
      ws.send(JSON.stringify({ type: 'error', message: 'No pending request to cancel' }));
      return;
    }
    
    console.log(`✓ Request cancelled`);
    
    // Notify sender
    ws.send(JSON.stringify({
      type: 'request-cancelled',
      to: toUsername,
      cancelledAt: new Date(),
      message: `Friend request to ${toUsername} cancelled`,
    }));
    
    // Notify recipient if online
    const toUserConn = userConnections.get(toUsername);
    if (toUserConn && toUserConn.readyState === 1) {
      toUserConn.send(JSON.stringify({
        type: 'request-cancelled-notification',
        from,
        cancelledAt: new Date(),
      }));
      console.log(`✓ Notified ${toUsername}: request cancelled by ${from}`);
    }
    
    console.log(`✅ Request cancelled: ${from} → ${toUsername}\n`);
  } catch (err) {
    console.error('❌ Error in handleCancelFriendRequest:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to cancel request' }));
  }
}

function handleMarkRead(messageId, to) {
  const readTimestamp = new Date();
  
  try {
    chatHistoryCollection.updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { read: true, readAt: readTimestamp } }
    ).then(() => {
      // Get the message to find the sender
      chatHistoryCollection.findOne({ _id: new ObjectId(messageId) }).then(msg => {
        if (msg) {
          const senderConnection = userConnections.get(msg.from);
          if (senderConnection) {
            senderConnection.send(JSON.stringify({
              type: 'read-receipt',
              messageId: messageId.toString(),
              readBy: to,
              readAt: readTimestamp,
            }));
          }
        }
      });
    }).catch(err => {
      console.error('Error marking message as read:', err);
    });
  } catch (err) {
    console.error('Error in handleMarkRead:', err);
  }
}

async function sendFriendsList(username, ws) {
  try {
    const userFriends = await friendshipsCollection.findOne({ username });
    const friends = userFriends?.friends || [];
    
    const friendsData = friends.map((friend) => ({
      username: friend,
      online: userConnections.has(friend),
      lastSeen: lastSeen.get(friend) || new Date(),
    }));

    ws.send(JSON.stringify({
      type: 'friends-list',
      friends: friendsData,
    }));
  } catch (err) {
    console.error('Error getting friends list:', err);
  }
}

function sendOnlineUsers(ws) {
  const onlineUsers = Array.from(userConnections.keys());
  ws.send(JSON.stringify({
    type: 'online-users',
    users: onlineUsers,
  }));
}

async function sendPendingRequests(username, ws) {
  try {
    console.log(`\n=== SEND INCOMING REQUESTS FOR: ${username} ===`);
    
    const requestsDoc = await friendRequestsCollection.findOne({ toUser: username });
    console.log(`Query: {toUser: "${username}"}`);
    console.log(`Result:`, requestsDoc);
    
    // Normalize requests to consistent format (handle both old string format and new object format)
    const requests = (requestsDoc?.requests || []).map(req => {
      if (typeof req === 'string') {
        // Legacy format: just username string
        return { sender: req, sentAt: new Date() };
      } else if (req.sender) {
        // New Discord-like format: {sender, sentAt}
        return { sender: req.sender, sentAt: req.sentAt || new Date() };
      }
      return req;
    });
    
    console.log(`📥 Sending incoming requests to ${username}:`, requests);
    
    const message = JSON.stringify({
      type: 'pending-requests',
      requests: requests,
      count: requests.length,
    });
    
    console.log(`WebSocket readyState: ${ws.readyState} (1=OPEN, 2=CLOSING, 3=CLOSED)`);
    ws.send(message);
    
    console.log(`✅ Sent to client: ${message}\n`);
  } catch (err) {
    console.error('Error getting pending requests:', err);
  }
}

async function sendOutgoingRequests(username, ws) {
  try {
    console.log(`\n=== SEND OUTGOING REQUESTS FROM: ${username} ===`);
    
    // Find all documents where this user sent requests
    // Handle both old format (string) and new format (object with sender field)
    const sentTo = await friendRequestsCollection.find({
      $or: [
        { 'requests.sender': username },  // New object format
        { 'requests': username }          // Old string format (backward compatibility)
      ]
    }).toArray();
    
    console.log(`Found ${sentTo.length} documents with requests from ${username}`);
    
    // Extract outgoing requests with timestamps
    const outgoing = sentTo.map(doc => {
      // Find requests sent by this user (handle both formats)
      const userRequest = doc.requests.find(r => {
        if (typeof r === 'string') return r === username;
        return r.sender === username;
      });
      
      return {
        recipient: doc.toUser,
        sentAt: (typeof userRequest === 'object' ? userRequest?.sentAt : null) || new Date(),
      };
    });
    
    console.log(`📤 Sending outgoing requests from ${username}:`, outgoing);
    
    const message = JSON.stringify({
      type: 'outgoing-requests',
      outgoing: outgoing,
      count: outgoing.length,
    });
    
    console.log(`WebSocket readyState: ${ws.readyState} (1=OPEN, 2=CLOSING, 3=CLOSED)`);
    ws.send(message);
    
    console.log(`✅ Sent to client: ${message}\n`);
  } catch (err) {
    console.error('Error getting outgoing requests:', err);
  }
}

async function sendChatHistory(username, withUser, ws) {
  try {
    const conversationKey = [username, withUser].sort().join('-');
    const messages = await chatHistoryCollection
      .find({ conversationKey })
      .sort({ timestamp: 1 })
      .toArray();

    ws.send(JSON.stringify({
      type: 'chat-history',
      messages: messages,
      with: withUser,
    }));
  } catch (err) {
    console.error('Error getting chat history:', err);
  }
}

function handleClearChat(from, to) {
  const conversationKey = [from, to].sort().join('-');
  
  // Delete the chat history from MongoDB
  chatHistoryCollection.deleteMany({ conversationKey }).catch(err => {
    console.error('Error clearing chat:', err);
  });

  // Notify both users to clear their screens
  const fromUser = userConnections.get(from);
  const toUser = userConnections.get(to);

  const clearMessage = JSON.stringify({
    type: 'clear-chat',
    from,
    to,
  });

  if (fromUser && fromUser.readyState === WebSocket.OPEN) {
    fromUser.send(clearMessage);
  }

  if (toUser && toUser.readyState === WebSocket.OPEN) {
    toUser.send(clearMessage);
  }

  console.log(`Chat between ${from} and ${to} cleared`);
}

function broadcastUserStatus(username, online) {
  const timestamp = new Date();
  const message = JSON.stringify({
    type: 'user-status',
    username,
    online,
    lastSeen: timestamp,
    timestamp: timestamp,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  
  if (!online) {
    console.log(`⏱️ ${username} last seen at ${timestamp.toISOString()}`);
  }
}

function broadcastWindowVisibility(username, visible, timestamp) {
  const message = JSON.stringify({
    type: 'window-visibility',
    username,
    visible,
    timestamp: timestamp || new Date(),
  });

  console.log(`📢 Broadcasting window visibility to all clients:`, { username, visible });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

server.listen(PORT, () => {
  console.log(`🚀 Free Cluely Server running on http://localhost:${PORT}`);
  console.log(`🔧 Version: ${new Date().toISOString()}`);
});

// Connect to MongoDB on startup
connectMongoDB().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await mongoClient.close();
  process.exit(0);
});