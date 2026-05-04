# Testing Guide - Quidec P2P Chat App

## 🚀 **Quick Start**

### 1. **Start the Server**
```bash
cd server
npm install
npm run dev
# Output: 🚀 Signaling server running on port 3000
```

### 2. **Start the Frontend**
```bash
# In another terminal, from project root
npm run dev
# Output: Local: http://localhost:5173/
```

### 3. **Open Two Browser Tabs**
- Tab 1: `http://localhost:5173` → Register as `alice`
- Tab 2: `http://localhost:5173` → Register as `bob`

---

## ✅ **Test Cases**

### **TEST 1: Message Encryption (E2E)**

**Objective**: Verify messages are encrypted before transmission

**Steps**:
1. **Alice** sends message to Bob: "Hello Bob"
2. **Check Console** (Browser DevTools → Console)
   - Look for: `🔒 Encrypted message sent to bob`
3. **Network Tab** (DevTools → Network)
   - Filter WebSocket messages
   - Find message type: `"type":"message"`
   - Verify: `"encrypted":"<base64-blob>"` (NOT plaintext)
   - Verify: NO `"content":"Hello Bob"` visible
4. **Bob receives message**
   - Look for console log: `🔓 Message decrypted from alice`
   - Bob sees: "Hello Bob" (plaintext in UI)
5. **Verify Storage** (DevTools → Application → IndexedDB → quidec-app → messages)
   - Alice's sent message shows encrypted content
   - Bob's received message shows plaintext (decrypted after receive)

**Expected Results**:
- ✅ Alice sees `🔒 Encrypted message sent`
- ✅ Server sees only encrypted blob (Network tab shows base64)
- ✅ Bob sees `🔓 Message decrypted`
- ✅ IndexedDB stores encrypted messages

---

### **TEST 2: Voice Call (WebRTC)**

**Objective**: Verify real audio streaming P2P

**Setup**: Alice & Bob both registered and online

**Steps**:
1. **Alice** clicks call icon → selects Bob
2. **Check Console** in Alice's browser:
   - Look for: `🎤 Voice call initiated with bob`
   - Look for: `📡 WebRTC offer sent`
3. **Check Console** in Bob's browser:
   - Look for: `📡 Incoming call from alice`
   - Bob clicks "Accept"
4. **Monitor Connection**:
   - Alice console: Watch for `✅ Peer connection established`
   - Bob console: Same message
   - Look for ICE candidates: `🧊 ICE candidate added`
5. **Test Audio**:
   - Alice speaks
   - Bob should hear audio (if microphone permissions granted)
   - Alice sees green icon (microphone working)
6. **Test Mute Button**:
   - Alice clicks mute icon
   - Console shows: `🔇 Microphone muted`
   - Bob doesn't hear Alice

**Expected Results**:
- ✅ Both browsers show connection state
- ✅ Audio flows between browsers (P2P, no server)
- ✅ Mute button disables audio track
- ✅ No `received-offline` errors

---

### **TEST 3: Video Call (WebRTC)**

**Objective**: Verify real video streaming + controls

**Steps**:
1. **Alice** initiates video call to Bob
2. **Check Console**:
   - Look for: `🎥 Video call initiated`
   - Look for: `📹 Local video stream ready`
3. **Bob Accepts** → video elements populate
4. **Verify Video Elements**:
   - Alice's screen: 
     - Large video (Bob's remote stream)
     - Small muted video (Alice's own camera thumbnail)
   - Bob's screen:
     - Large video (Alice's remote stream)
     - Small muted video (Bob's own camera)
5. **Test Camera Toggle**:
   - Click camera icon → state changes
   - Console: `📹 Camera on` / `📷 Camera off`
   - Bob sees Alice's video disappear/appear
6. **Test Flip Camera**:
   - Click flip icon
   - `facingMode` switches: user ↔ environment
   - Video feed rotates/switches cameras

**Expected Results**:
- ✅ Both video elements render in real-time
- ✅ Camera controls work (toggle, flip)
- ✅ No central server processing video
- ✅ Smooth 30fps video (depends on network)

---

### **TEST 4: Friend Requests**

**Objective**: Verify friend request flow with local persistence

**Steps**:
1. **Alice** sends friend request to Bob
   - Click "+" → Search "bob" → Send request
   - Console: `📤 Friend request sent`
2. **Bob** receives notification
   - Notification popup: "alice wants to be friends"
   - Click "Accept"
3. **Verify Local Storage**:
   - DevTools → Application → IndexedDB → quidec-app → friend-requests
   - Bob's store shows: `{ relatedUser: "alice", type: "incoming" }`
   - After accepting: removed from "incoming", added to "friends" store
4. **Verify Both Sides**:
   - Alice's "Outgoing Requests" → bob removed
   - Alice's "Friends" list → bob added
   - Bob's "Friends" list → alice added

**Expected Results**:
- ✅ Request saved to IndexedDB before sending
- ✅ Accept updates both friends lists locally
- ✅ No server database (only WebSocket routing)

---

### **TEST 5: Offline Message Queuing**

**Objective**: Verify messages queue when recipient offline

**Steps**:
1. **Bob** goes offline (close browser tab)
2. **Alice** sends message: "Hi Bob"
   - Should NOT fail
   - UI shows message (optimistic)
   - Look for console warning: `⚠️ recipient-offline`
3. **Check IndexedDB** in Alice's browser:
   - Messages store shows the message (saved locally)
   - sync-queue store shows pending message
4. **Bob** comes back online (open browser again)
5. **Check Console** in Alice's browser:
   - Look for: `📤 Syncing pending messages`
   - Encrypted message resends to Bob
6. **Bob** receives message
   - `🔓 Message decrypted`
   - Message appears in chat

**Expected Results**:
- ✅ Message saved locally despite offline recipient
- ✅ Added to sync queue
- ✅ Resends when recipient comes online
- ✅ Still encrypted in transmission

---

### **TEST 6: Typing Indicators**

**Objective**: Verify real-time typing notifications

**Steps**:
1. **Alice** starts typing in chat box (don't send yet)
2. **Bob** sees: "alice is typing..." appear
3. **Alice** stops typing
4. **Bob** sees: typing indicator disappears
5. **Check Console**:
   - Alice: `📝 Typing indicator sent`
   - Bob: `📝 bob is typing...`

**Expected Results**:
- ✅ Shows typing in real-time
- ✅ Clears when user stops or sends
- ✅ Works via WebSocket (no polling)

---

### **TEST 7: Read Receipts**

**Objective**: Verify message read status

**Steps**:
1. **Alice** sends message to Bob
2. **Bob** reads message (opens chat with Alice)
3. **Check Console** in Bob's browser:
   - `✅ Message marked as read`
4. **Check Alice's chat**:
   - Message shows read status (double checkmark or indicator)
5. **IndexedDB** in Alice's browser:
   - Messages store shows `read: true`

**Expected Results**:
- ✅ Read status updates in real-time
- ✅ Visible in chat UI
- ✅ Persisted in IndexedDB

---

### **TEST 8: User Status Broadcast**

**Objective**: Verify online/offline status updates

**Steps**:
1. **Alice** and **Bob** both online
2. **Bob** closes tab → goes offline
3. **Alice's Friends List** → bob shows "offline"
4. **Check Console** in Alice's browser:
   - `👤 bob user-status: offline`
5. **Bob** opens browser again
6. **Alice's Friends List** → bob shows "online"

**Expected Results**:
- ✅ Status updates in real-time
- ✅ Visible in friends list
- ✅ Broadcast to all connected clients

---

## 🌐 **Server Deployment**

### **✅ Is the Server Deployable?**

**YES!** The server is now fully deployable:

```
✅ No database required (stateless)
✅ No external dependencies (Express, ws, dotenv only)
✅ No file storage needed
✅ Minimal RAM usage (~1MB base)
✅ Scales horizontally (each instance independent)
```

### **Deploy to Render (Free tier)**

1. **Push to GitHub**:
```bash
git add server/
git commit -m "Clean server for deployment"
git push origin main
```

2. **Create Render Service**:
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect GitHub repo
   - Settings:
     - Name: `quidec-server`
     - Root Directory: `server`
     - Build Command: `npm install`
     - Start Command: `npm start`
     - Environment: Add `PORT` (optional, defaults to 3000)

3. **Deploy**:
   - Click Deploy
   - Server URL: `wss://quidec-server.onrender.com`
   - Update `.env` in frontend with server URL

### **Deploy to Railway (Free tier)**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy
railway up
```

### **Deploy to Heroku (Paid)**

```bash
heroku create quidec-server
git subtree push --prefix server heroku main
```

### **Environment Variables**

```env
PORT=3000                    # Optional, defaults to 3000
NODE_ENV=production         # Optional
```

**That's it!** Server needs NO database, NO API keys, NO configuration.

---

## 🔍 **Debugging Tips**

### **Check Server Health**
```bash
curl http://localhost:3000/health
# Returns: {"status":"ok","uptime":123.45,"onlineUsers":2}
```

### **Monitor WebSocket**
DevTools → Network → Filter "WS" → Click connection → Messages tab
- See all WebSocket messages in real-time
- Check what's encrypted vs plaintext

### **View IndexedDB**
DevTools → Application → IndexedDB → quidec-app
- **auth**: Current user session
- **messages**: All encrypted chat messages
- **friends**: Friends list
- **friend-requests**: Incoming/outgoing requests
- **sync-queue**: Pending offline messages
- **media-metadata**: Media file references

### **Console Logs**
- 🔒 = Encryption
- 🔓 = Decryption
- 📡 = WebSocket messages
- 📤 = Sending
- 📥 = Receiving
- 🎤 = Audio call
- 🎥 = Video call
- 👤 = User status
- 📝 = Typing

---

## 🐛 **Common Issues**

| Issue | Cause | Fix |
|-------|-------|-----|
| "Connection refused" | Server not running | `cd server && npm run dev` |
| Messages not encrypted | Old code path | Hard refresh browser (Ctrl+Shift+R) |
| No video rendering | Camera permission denied | Check browser permissions |
| Peer connection fails | NAT/firewall blocking | Add TURN server credentials |
| Can't hear audio | Microphone not working | Check browser permissions & speaker settings |
| Messages won't send | WebSocket disconnected | Wait for reconnect (auto-exponential backoff) |

---

## ✨ **Next Steps After Testing**

- [ ] Add TURN server config (for NAT traversal)
- [ ] Configure FCM VAPID key (push notifications)
- [ ] Deploy server to production
- [ ] Build Android/iOS apps with Capacitor
- [ ] Add media sharing (images/documents)
- [ ] Implement group chat

