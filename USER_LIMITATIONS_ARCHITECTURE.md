# 👥 USER LIMITATIONS & ARCHITECTURAL CONSTRAINTS

**Purpose**: Understand who can use this app and what conversations are supported  
**Status**: Critical for product decisions

---

## ✅ WHAT THIS APP SUPPORTS

### 1:1 Conversations (2 People Only)
```
User A ←→ User B

✅ Message encryption: Both users derive same key from their IDs
✅ Conversation ID: Deterministic hash of sorted [uid1, uid2]
✅ Voice calls: WebRTC peer-to-peer
✅ Video calls: WebRTC peer-to-peer
✅ Message history: All encrypted in Firestore
✅ Presence: Online/offline status
✅ Typing indicators: Works perfectly
✅ Read receipts: Single/double/blue ticks
```

**Architecture**:
```typescript
// Conversation ID for User A → User B
const conversationId = `${min(uidA, uidB)}_${max(uidA, uidB)}`;
// Result: Always "uidA_uidB" (same for both users)

// Encryption key for all messages in this conversation
const key = deriveKey(`${uidA}|${uidB}|e2e-chat`);
// Result: Both users compute identical key (deterministic)
```

---

## ❌ WHAT THIS APP DOES NOT SUPPORT

### Group Conversations (3+ People)
```
User A
  ├─ User B  ← Works (1:1)
  ├─ User C  ← Would break!
  └─ User D  ← Would break!

❌ Conversation ID formula breaks with 3+ people
❌ Encryption key derivation assumes 2 people only
❌ WebRTC not designed for 3+ (peer-to-peer only)
❌ UI assumes sender + recipient (not "recipient1, recipient2, recipient3")
❌ Firestore schema uses conversationId as hard constraint
```

**Why It Breaks**:

```typescript
// Problem 1: Conversation ID
const uidA = 'alice';
const uidB = 'bob';
const uidC = 'charlie';

// Current approach for 2 people:
const convo2 = `${min(uidA, uidB)}_${max(uidA, uidB)}`; // "alice_bob" ✅

// For 3 people, what should it be?
// Option 1: `alice_bob_charlie` - But what's the sort order?
// Option 2: UUID - But how do members discover it?
// Option 3: Hash of all members - Changes if someone leaves
// ❌ No clear solution!

// Problem 2: Encryption key
const key2 = deriveKey(`${uidA}|${uidB}|e2e-chat`); // 2 people ✅

// For 3 people:
const key3 = deriveKey(`${uidA}|${uidB}|${uidC}|e2e-chat`);
// ❌ What if Charlie joins later? All old messages use old key
// ❌ What if Charlie leaves? Need to rotate everyone's key
// ❌ Group key management is COMPLEX (not implemented)
```

### Group Calls (3+ People)
```
❌ PeerJS designed for 2-person calls only
❌ WebRTC peer-to-peer doesn't scale to 3+
❌ Would need SFU (Selective Forwarding Unit) server
❌ No server-side audio/video mixing implemented
❌ No conference bridge
```

### Broadcast Messages
```
❌ No concept of "broadcast" or "channels"
❌ Messages always to 1 specific person
❌ No group settings or permissions
```

### Anything Multi-User
```
❌ Group settings (can't change group name, icon)
❌ Group members list (would be in messages, not separate)
❌ Add/remove members (not implemented)
❌ Admin roles (not applicable for 1:1)
❌ Member permissions (not applicable for 1:1)
```

---

## 📊 COMPARISON TABLE

| Feature | 1:1 | 3 People | 10 People | 100 People |
|---------|-----|----------|-----------|------------|
| Messages | ✅ | ❌ | ❌ | ❌ |
| Voice calls | ✅ | ❌ | ❌ | ❌ |
| Video calls | ✅ | ❌ | ❌ | ❌ |
| Typing indicators | ✅ | ❌ | ❌ | ❌ |
| Read receipts | ✅ | ❌ | ❌ | ❌ |
| Presence | ✅ | ❌ | ❌ | ❌ |
| E2E encryption | ✅ | ❌* | ❌* | ❌* |

*Could be implemented but requires major refactor

---

## 🔍 EVIDENCE: DESIGN IS DELIBERATELY 1:1 ONLY

### 1. Conversation ID Generation
```typescript
// File: src/utils/encryption.js
export async function getConversationKey(user1, user2) {
  // Only accepts 2 parameters
  // Will fail if you try: getConversationKey(user1, user2, user3)
  
  const [userA, userB] = [user1, user2].sort();
  const cacheKey = `${userA}:${userB}`;
  
  // Hardcoded for 2 users!
  const sharedSeed = `${userA}|${userB}|e2e-chat`;
  const key = await deriveKey(sharedSeed);
  
  return key;
}
```

### 2. Firestore Schema
```typescript
// Conversations are keyed by: conversationId
// conversationId is: uid1_uid2 (2 people)

// Schema:
/conversations/{uid1_uid2}/messages/{messageId}

// ❌ No `participants: []` array
// ❌ Conversation ID is function of 2 UIDs only
// ❌ Can't represent 3+ people

// Sample doc:
{
  conversationId: "alice123_bob456",  // ← Hardcoded 2 people
  messages: {
    msg1: { content: "...", senderId: "alice123", ... },
    msg2: { content: "...", senderId: "bob456", ... }
  }
}
```

### 3. Message Structure
```typescript
export interface EncryptedMessageRecord {
  messageId: string;
  senderId: string;          // Single sender
  recipientId: string;       // Single recipient ← Only 1!
  conversationId: string;    // uid1_uid2
  content: string;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';  // ← Works for 1:1
  // No `recipientIds: []` array for multiple recipients
}
```

### 4. Message Status (Read Receipts)
```typescript
// Message status is: 'sent' | 'delivered' | 'read'
// This works perfectly for 1:1:
// - Alice sends message
// - Status: 'sent' (on server)
// - Bob receives: status becomes 'delivered'
// - Bob reads: status becomes 'read'

// For 3 people:
// - Alice sends to Bob & Charlie
// - Bob reads: Status becomes 'read'?
// - Charlie hasn't read: Status should still be 'delivered'?
// ❌ Single status field doesn't work for 3+ people
// Need: readBy: [bob, charlie], deliveredTo: [], etc.
```

### 5. Voice Calls
```typescript
// File: src/app/components/VoiceCallScreen.tsx
export default function VoiceCallScreen() {
  const { id: contactId } = useParams();  // ← Single contact
  
  // PeerJS connection:
  const peerConnection = createPeerConnection({
    iceServers: [...],
    // ← Built for 2-person peer-to-peer
  });
  
  // No mention of multiple peers
  // No array of contacts
}

// WebRTC design assumes:
// Peer A ←→ Peer B (direct connection)
// ❌ No support for Peer A ←→ Peer B ←→ Peer C
```

### 6. UI Component Names
```typescript
// Chat components are named for 1:1:
<ChatWindow />         // ← Single chat
<ContactInfo />        // ← Single contact
<VoiceCallScreen />    // ← Voice with 1 person
<VideoCallScreen />    // ← Video with 1 person

// No group equivalents:
// ❌ <GroupChatWindow />
// ❌ <GroupInfo />
// ❌ <GroupCallScreen />
```

---

## 🎯 PRODUCT POSITIONING

### Current: "Personal Encrypted Messenger"
```
✅ Perfect for: 1-to-1 private conversations
✅ Use case: Friends, couples, close connections
✅ Strength: End-to-end encryption, no middle person
✅ Simplicity: No group management complexity
✅ Privacy: Only 2 people can ever see messages
```

### NOT: "Group Chat Platform"
```
❌ Can't do: Multiple people in one conversation
❌ Can't do: Team collaboration
❌ Can't do: Public channels
❌ Can't do: Community groups
```

---

## 🚨 WHAT HAPPENS IF 3+ PEOPLE TRY TO USE IT

### Scenario: Alice, Bob, Charlie want to chat

**Step 1: Create conversation**
```typescript
// Alice and Bob chat: works fine
conversationId = "alice_bob";
key = deriveKey("alice|bob|e2e-chat");

// Alice now wants to add Charlie
// ❌ System doesn't support this

// If developer tries to force it:
conversationId = "alice_bob_charlie";  // ← Problem: ambiguous!
key = deriveKey("alice|bob|charlie|e2e-chat");  // ← Different key!
```

**Step 2: Existing messages**
```typescript
// Old messages in "alice_bob" encrypted with:
// key_old = deriveKey("alice|bob|e2e-chat");

// New group needs new conversation ID:
// conversationId = "alice_bob_charlie"
// key_new = deriveKey("alice|bob|charlie|e2e-chat");

// ❌ key_old ≠ key_new
// ❌ Charlie can't decrypt old alice-bob messages
// ❌ Alice can't decrypt group messages with old key

// Result: BROKEN ENCRYPTION
```

**Step 3: Read receipts fail**
```typescript
// Message sent to "bob" and "charlie"
// Message status field:
{
  messageId: "msg1",
  status: "delivered",  // ← Delivered to who? Bob? Charlie? Both?
  // No way to track individual receipt
}

// ❌ Can't tell: "Bob read, Charlie hasn't"
```

**Step 4: Calls fail**
```typescript
// WebRTC setup for 2 people:
const peerConnection = new RTCPeerConnection();
peerConnection.addTrack(audioTrack);
// ← Only works for 1 other person (Bob)

// For 3 people (Alice, Bob, Charlie):
// ❌ Can't set up 2 P2P connections simultaneously
// ❌ Charlie can't hear both Alice and Bob
// ❌ Audio mixing not implemented
// ❌ No SFU server to relay audio
```

---

## 💡 IS THIS A PROBLEM?

### Option 1: YES - Limit product to 1:1 only (Current Status)
```
✅ Honest: Be clear "Personal Messenger, 1-to-1 only"
✅ Focused: Perfect execution for 1-to-1 use case
✅ Simple: No group management complexity
✅ Secure: All participants only 1 other person
❌ Market: Can't compete with Telegram, Signal, WhatsApp
```

### Option 2: NO - Plan 2-person limit as MVP, groups later
```
✅ Market: Can expand to groups in future
✅ Growth: Bigger addressable market
❌ Work: Requires 40+ hour refactor when adding groups
❌ Risk: Architecture decisions now limit group support later
```

### Option 3: MAYBE - Reconsider group chat support now
```
✅ Forward: No architectural debt
❌ Effort: Need 40+ hours before MVP
❌ Risk: Over-engineering for unknown feature
❌ Timeline: Delayed MVP launch by 2+ weeks
```

---

## ✅ RECOMMENDATION

**For MVP Launch (Next 2-3 weeks)**:
1. **Officially position as "Personal Messenger"**
2. **Document: "1-to-1 conversations only"**
3. **Add validation to prevent 3+ people**:
   ```typescript
   export function validateConversation(participants: string[]) {
     if (participants.length !== 2) {
       throw new Error('This app only supports 1-to-1 conversations');
     }
   }
   ```
4. **Focus on 1-to-1 perfection** (instead of spreading thin)

**For Future (Post-MVP, after validating product-market fit)**:
1. Research group chat demand
2. If YES → Plan 40-hour refactor for group support
3. If NO → Stay focused on 1-to-1 excellence
4. Alternative: Recommend users create separate 1-to-1 conversations

---

## 📋 QUICK ANSWER SUMMARY

| Question | Answer |
|----------|--------|
| **Supports 2-person chats?** | ✅ Yes, fully |
| **Supports 3-person chats?** | ❌ No, architectural limit |
| **Supports group chats (10+)?** | ❌ No, architectural limit |
| **Can be upgraded to groups?** | ✅ Yes, but 40+ hour refactor |
| **Currently designed for?** | Personal 1-to-1 messaging |
| **Is this intentional?** | ✅ Yes, by design |
| **Should this change for MVP?** | ❌ No, keep 1-to-1 focused |

---

**Decision**: Keep as 1-to-1 only for MVP. Groups as future feature if demand exists.

