# Quick Start Testing Guide - Phase 1 Web Integration

## Prerequisites
- Node.js v22.0.0+
- pnpm v9.0.0+
- Chrome or Edge browser (Firefox has IndexedDB inspection limitations)
- Two separate browser windows or tabs (for testing messaging)

---

## Step 1: Start the Development Server

```bash
cd c:\Users\preet\Downloads\quide_dev\quidec_capacitor
pnpm dev
```

**Expected Output**:
```
VITE v6.4.2  ready in 123 ms
➜  Local:   http://localhost:5173/
➜  press h to show help
```

**In Browser**: Navigate to `http://localhost:5173`

---

## Step 2: Login with Test Account

1. Click **"Sign Up"** or use existing account credentials
2. Create account: 
   - Email: `test1@quidec.dev`
   - Password: (set your own)
   - Username: `TestUser1`
3. Click **"Sign In"**

**Expected**: App loads dashboard with empty chat list

---

## Test 1: Error Monitoring (Sentry) ✅

### Test 1.1: Login Tracking
1. **Open DevTools**: F12 → Console tab
2. **Action**: Already logged in from Step 2
3. **Verification**:
   - Check Sentry dashboard (if configured with DSN)
   - Look for breadcrumb: "User logged in successfully"
   - User context should show in Sentry

**Success Criteria**: ✅ User context is set after login

### Test 1.2: Perform Actions & Check Breadcrumbs
1. **Send a text message**:
   - Click on a chat (or create new chat first)
   - Type: "Test message"
   - Press Send
   
2. **Check breadcrumbs in Sentry**:
   - Go to Sentry dashboard
   - Find the user's session
   - Look for breadcrumb entries

**Success Criteria**: ✅ Actions appear as breadcrumbs in Sentry

### Test 1.3: Logout & Clear Context
1. **Click Menu** (hamburger icon)
2. **Select "Logout"**
3. **Check console** for no errors
4. **Verify**: User context cleared in Sentry

**Success Criteria**: ✅ Logout succeeds, no errors in console

---

## Test 2: Message Queue (Offline Persistence) ✅

### Test 2.1: Queue Indicator
1. **Open DevTools**: F12 → Network tab
2. **Throttle Connection**: 
   - Click throttle dropdown (by default it says "No throttling")
   - Select "Slow 3G" or "Offline"
3. **Send Message**:
   - Type a message in chat
   - Press Send
4. **Observe**:
   - Message appears in chat window (optimistic update)
   - Check console for queue event
   - Message should retry when connection restored

**Success Criteria**: ✅ Message queued and retried

### Test 2.2: Check Queue Statistics
1. **Open DevTools**: F12 → Console
2. **Run in Console**:
   ```javascript
   // Import and check the queue
   import { messageQueue } from './src/utils/persistentMessageQueue.ts'
   console.log(messageQueue.getStats())
   ```
3. **Expected Output**:
   ```javascript
   {
     totalMessages: 1,
     byConversation: { "chat_id": 1 },
     byStatus: { "pending": 1 },
     oldestMessage: {...},
     oldestExpiry: 1704067200000
   }
   ```

**Success Criteria**: ✅ Queue shows pending messages

### Test 2.3: Restore Connection
1. **Remove Throttle**: 
   - Network tab → Back to "No throttling"
2. **Observe**:
   - Console should show queue flush event
   - Message should be retried and sent successfully
   - Queue count should return to 0

**Success Criteria**: ✅ Message sent when connection restored

---

## Test 3: Media Validation (DoS Protection) ✅

### Test 3.1: Upload Valid Image
1. **Click Attach** (📎 icon)
2. **Select "Camera"** (or **"Gallery"**)
3. **Select small image** (< 10MB, < 8000x8000 pixels)
4. **Observe**:
   - Image should upload successfully
   - Thumbnail should appear in chat
   - No error message

**Success Criteria**: ✅ Valid image accepted

### Test 3.2: Reject Oversized Image
1. **Prepare test file**:
   - Create a 15MB image file (or use existing large file)
   - Or take a screenshot and resize to > 8000x8000 pixels
2. **Click Attach → Gallery**
3. **Select oversized image**
4. **Observe**:
   - Error toast appears: "File too large. Maximum size is 10MB"
   - Image is NOT uploaded
   - Error disappears after 4 seconds

**Success Criteria**: ✅ Oversized image rejected with error message

### Test 3.3: Upload Document
1. **Click Attach → "Files"**
2. **Select any PDF or document** (< 100MB)
3. **Observe**:
   - File should upload successfully
   - Document icon (📎) with filename appears in chat
   - No error

**Success Criteria**: ✅ Valid document accepted

### Test 3.4: Reject Oversized Document
1. **Prepare large file** (> 100MB)
2. **Click Attach → "Files"**
3. **Select oversized file**
4. **Observe**:
   - Error toast: "File too large. Maximum size is 100MB"
   - File is NOT uploaded

**Success Criteria**: ✅ Oversized document rejected with error message

---

## Test 4: Pagination (Infinite Scroll) ✅

### Test 4.1: Load Older Messages
1. **Create test conversation**:
   - Send 50+ messages to create history
   - Can do this quickly by typing same message multiple times

2. **Scroll to Top**:
   - Open chat with 50+ messages
   - Scroll all the way to the top
   - Observe console for breadcrumb: "Loaded X older messages"

3. **Verify Scroll**:
   - App should load previous 50 messages
   - Scroll position should maintain
   - No jank or freezing

**Success Criteria**: ✅ Older messages load smoothly on scroll

### Test 4.2: Check IndexedDB Storage
1. **Open DevTools**: F12 → Application tab
2. **Navigate**: Application → IndexedDB → Expand
3. **Look for**:
   - Database: `quidec_messageCache`
   - Object stores: `messages` with index `conversationTimestamp`
4. **Verify**:
   - Can see stored messages
   - Messages have conversationId + timestamp index
   - Count matches expected

**Success Criteria**: ✅ IndexedDB has messages properly indexed

### Test 4.3: Large Conversation Performance
1. **Create 500+ messages** (optional, can simulate with dev tools)
2. **Scroll through messages**:
   - Scroll down quickly
   - Scroll to top quickly
   - Observe frame rate
3. **Check Performance**:
   - DevTools → Performance tab
   - Should maintain 60 FPS (smooth scrolling)
   - No memory leaks or janky behavior

**Success Criteria**: ✅ Smooth scrolling performance

### Test 4.4: Search in Paginated Content
1. **Create 100+ messages**
2. **Use Search** (Ctrl+F in chat):
   - Search for a keyword
   - Check if search works on loaded messages
   - Verify search results

**Success Criteria**: ✅ Search works on paginated messages

---

## Test 5: End-to-End Two-User Testing

### Setup
1. **Window 1**: Logged in as TestUser1 (from Step 2)
2. **Window 2**: 
   - Open new browser tab: `http://localhost:5173`
   - Sign up as TestUser2
   - Login

### Test 5.1: Two-Way Messaging
1. **Window 1**: Create new chat with TestUser2
2. **Window 2**: Observe new chat notification
3. **Window 2**: Send message to TestUser1
4. **Window 1**: 
   - Observe message appears
   - Check breadcrumb in Sentry
   - Check for queue event if offline

**Success Criteria**: ✅ Messages sync between windows

### Test 5.2: Media Sharing
1. **Window 1**: Send image to TestUser2
2. **Window 2**: Observe image appears with thumbnail
3. **Window 2**: Click image to view full size

**Success Criteria**: ✅ Media uploads and displays

### Test 5.3: Offline Queue with Two Users
1. **Window 1**: Throttle to "Offline"
2. **Window 1**: Send 3-5 messages
3. **Window 2**: Messages NOT yet received
4. **Window 1**: Restore connection
5. **Window 2**: All messages arrive

**Success Criteria**: ✅ Queue resends on reconnect

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot find module" errors | Run `pnpm install` again |
| Port 5173 already in use | Change port: `pnpm dev -- --port 5174` |
| Sentry DSN not configured | Set in `.env` file: `VITE_SENTRY_DSN=your_dsn` |
| IndexedDB not showing | Use Chrome/Edge (Firefox has limitations) |
| Messages not queuing | Check Network tab → Throttle is active |
| Image upload fails | Verify file is < 10MB and < 8000x8000px |
| Scroll jumps on pagination | Check scroll position calculation in code |

---

## Success Checklist

- [ ] ✅ Test 1.1: Login tracking works
- [ ] ✅ Test 1.2: Breadcrumbs appear in Sentry
- [ ] ✅ Test 1.3: Logout clears context
- [ ] ✅ Test 2.1: Message queued when offline
- [ ] ✅ Test 2.2: Queue stats show pending messages
- [ ] ✅ Test 2.3: Messages retry on reconnect
- [ ] ✅ Test 3.1: Valid images accepted
- [ ] ✅ Test 3.2: Oversized images rejected
- [ ] ✅ Test 3.3: Valid documents accepted
- [ ] ✅ Test 3.4: Oversized documents rejected
- [ ] ✅ Test 4.1: Older messages load on scroll
- [ ] ✅ Test 4.2: IndexedDB storage verified
- [ ] ✅ Test 4.3: Smooth performance maintained
- [ ] ✅ Test 4.4: Search works on paginated messages
- [ ] ✅ Test 5.1: Two-way messaging works
- [ ] ✅ Test 5.2: Media sharing works
- [ ] ✅ Test 5.3: Offline queue syncs correctly

---

## Performance Benchmarks to Monitor

| Feature | Expected | Target |
|---------|----------|--------|
| **Message Send Latency** | < 1s (online) | Good |
| **Queue Flush Interval** | 30 seconds | Configured |
| **Pagination Load Time** | < 500ms for 50 messages | Good |
| **Scroll FPS** | 60 FPS | Smooth |
| **Max Concurrent Uploads** | 3 | Configured |
| **IndexedDB Capacity** | 5000 messages | Tested |
| **App Startup Time** | < 3 seconds | Good |

---

## Next Steps After Testing

1. ✅ Document any failures or unexpected behavior
2. ✅ Test on Android device (after APK build fixed)
3. ✅ Test on iOS device (after sync to iOS)
4. ✅ Monitor Sentry dashboard for production errors
5. ✅ Check performance metrics on real devices
6. ✅ Prepare for production deployment

---

**Testing Duration**: ~2-3 hours for complete coverage  
**Difficulty Level**: Beginner-friendly with step-by-step guidance  
**Last Updated**: 2025  
**Status**: Ready for testing
