# Cloudinary Relay + Tick Fixes Plan

## Overview

Replace Firestore `mediaChunks` with Cloudinary as a temporary relay for encrypted media chunks. Chunks are permanently deleted from Cloudinary after the recipient downloads + caches them locally. Also fix the double-tick and blue-tick bugs.

## Architecture

```
SENDER                           CLOUDINARY                      RECIPIENT
  │                                  │                               │
  ├─ Encrypt + chunk media ──────────┤                               │
  ├─ Upload chunks to Cloudinary ───►│                               │
  ├─ Send message via RTDB pipe ───────────────────────────────────► │
  ├─ Single tick (SENT)              │                               │
  │                                  │    ◄── Recipient comes online │
  │                                  │    ◄── Delivery receipt       │
  ├─ Double gray tick (DELIVERED)    │                               │
  │                                  │    ◄── Recipient opens chat   │
  │                                  │    ◄── Read receipt           │
  ├─ Double blue tick (READ)         │                               │
  │                                  │    ◄── Recipient views media  │
  │                                  │ ◄── Download chunks           │
  │                                  │    Decrypt + cache in SQLite  │
  │                                  │ ◄── PERMANENT DELETE ─────────┤
  │                                  │    (after SQLite confirms)    │
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage backend | Cloudinary (free tier: 25GB) | No card required, generous free tier |
| What's uploaded | Encrypted + hashed chunks only | No raw media on Cloudinary |
| Delete trigger | Recipient caches chunks in SQLite | Confirmed download |
| No auto-TTL | Chunks stay forever if recipient offline | User preference |
| Sender delete | Delete from Cloudinary too | Cleanup on message delete |
| Group chats | Included | Both 1-to-1 and group |
| Chunk size | 128KB (unchanged) | Fits Cloudinary limits |

## Files to Modify

### 1. NEW: `src/utils/cloudinaryRelay.ts`
Cloudinary upload/delete API wrapper.

```
- configureCloudinary(cloudName, uploadPreset)
- uploadChunkToCloudinary(chunkBase64, fileId, chunkIndex) → publicId
- deleteChunksFromCloudinary(fileIds: string[]) → void
- deleteAllChunksForFile(fileId, totalChunks) → void
```

**Cloudinary upload strategy:**
- Upload as raw file (not image/video) — Cloudinary won't process/transcode
- Folder: `quidec-relay/{fileId}/`
- Public ID: `chunk_{index}`
- Resource type: `raw`
- Use unsigned upload preset (no API secret exposed to client)

**Cloudinary delete:**
- DELETE `https://api.cloudinary.com/v1_1/{cloud_name}/resources/raw/upload/quidec-relay/{fileId}/chunk_{index}`
- Batch delete via `delete_by_prefix` for all chunks of a file
- Must use signed API calls for delete → server-side proxy OR Cloudinary signed upload

**Security concern:** Cloudinary API secret cannot be exposed to the client. Options:
- Use Cloudinary unsigned upload preset for uploads (client-side)
- For deletes: use a small serverless function (Cloudflare Worker / Firebase Cloud Function) that holds the API secret
- OR use Cloudinary's "signed URL" approach with a TTL

**Recommended approach:** 
- Uploads: Unsigned upload preset (client-side, no secret needed)
- Deletes: Firebase Cloud Function with Cloudinary API secret stored as environment variable. Client calls the CF, CF deletes from Cloudinary.

### 2. MODIFY: `src/utils/encryptedChunkedMedia.ts`
Change `saveEncryptedMediaChunks()` to upload to Cloudinary instead of Firestore.

Current flow (line 197-218):
```js
// Write to Firestore
setDoc(chunkDocRef, firestorePayload).catch(...)
```

New flow:
```js
// Upload to Cloudinary instead
const publicId = await uploadChunkToCloudinary(encryptedChunkBase64, fileId, i);
```

Change `retrieveDecryptedMediaWithKey()` to fetch from Cloudinary instead of Firestore.

Current flow (line 356-363):
```js
// Fallback Firestore
const chunkDoc = await getDoc(doc(db, 'mediaChunks', `${fileId}_chunk_${i}`));
chunkData = chunkDoc.data().data;
```

New flow:
```js
// Fetch from Cloudinary
chunkData = await fetchChunkFromCloudinary(fileId, i);
```

### 3. NEW: `src/utils/chunkRelayCleanup.ts`
Handles post-download cleanup.

```
- confirmAndCleanup(fileId, totalChunks, recipientId) → void
  - Verifies chunks exist in local SQLite
  - Calls Cloudinary delete (via CF or direct)
  - Returns success/failure
```

### 4. MODIFY: `src/app/components/ChatWindow.tsx` — `LocalMedia` component
After media is successfully loaded + displayed, trigger cleanup.

Current flow (line 1681-1695):
```js
useEffect(() => {
  loadMediaWithCache(fileId, ...).then(url => setUrl(url));
}, [fileId]);
```

New flow:
```js
useEffect(() => {
  loadMediaWithCache(fileId, ...).then(url => {
    setUrl(url);
    // Trigger Cloudinary cleanup after successful load
    confirmAndCleanup(fileId, totalChunks, currentUser.userId).catch(() => {});
  });
}, [fileId]);
```

### 5. MODIFY: `src/utils/services/messageService.ts` — Message deletion
When sender deletes a message that has media, also clean up Cloudinary chunks.

In `deleteMessage()` or wherever message deletion happens:
- Extract fileId from message metadata
- Call `deleteAllChunksForFile(fileId, totalChunks)`

### 6. NEW: Firebase Cloud Function for Cloudinary delete
A small CF that holds the Cloudinary API secret and performs signed delete operations.

```
functions/cloudinaryDelete.ts
- HTTP trigger (callable function)
- Receives { fileId, totalChunks }
- Deletes all chunks from Cloudinary
- Returns success/failure
```

### 7. MODIFY: `src/utils/services/messageService.ts` — Fix double-tick bug
**Bug:** Double ticks appear when recipient is offline.

Root cause investigation needed. The delivery receipt should only fire when the recipient's RTDB listener picks up the message. If the recipient is offline, the listener isn't active, so no receipt should fire.

Possible causes to check:
- Message being written to both sender AND recipient's local state simultaneously
- Status being set to 'delivered' during `recordMessage()` instead of waiting for receipt
- `mapFirestoreMessage` or `listenToIncomingMessages` firing on the sender's own device

**Fix approach:** Audit `recordMessage()` to ensure status is only set to SENT, never DELIVERED. Delivery status should ONLY come from `listenToReceipts()` callback.

### 8. MODIFY: Blue tick (read receipt) investigation
**Bug:** Blue ticks not appearing.

Investigation needed:
- Check if `markAllMessagesAsRead()` is actually firing
- Check if `listenToReceipts()` is correctly listening for 'read' type
- Check if the read receipt RTDB path matches

## Cloudinary Setup (Manual — User must do)

1. Create free Cloudinary account at cloudinary.com
2. Go to Settings → Upload → Add upload preset
   - Name: `quidec-relay`
   - Signing mode: **Unsigned**
   - Folder: `quidec-relay`
3. Note the Cloud Name and Upload Preset from dashboard
4. For deletes: deploy the Firebase CF (holds API secret)

## Implementation Order

1. **Fix double-tick bug** (no dependencies, quick fix)
2. **Fix blue-tick bug** (no dependencies, quick fix)
3. **Create `cloudinaryRelay.ts`** (upload + delete API)
4. **Modify `encryptedChunkedMedia.ts`** (switch Firestore → Cloudinary)
5. **Create `chunkRelayCleanup.ts`** (post-download cleanup)
6. **Modify `LocalMedia` in ChatWindow.tsx** (trigger cleanup after display)
7. **Create Firebase CF for delete** (server-side, holds API secret)
8. **Modify message deletion** (cleanup on delete)

## Risks

| Risk | Mitigation |
|------|------------|
| Cloudinary free tier exceeded (25GB) | Monitor usage; chunks are ephemeral so should stay low |
| Cloudinary outage = media unavailable | Sender still has local SQLite copy; can re-upload |
| Delete CF fails silently | Retry logic; worst case chunks expire via Cloudinary lifecycle |
| Recipient offline indefinitely | Chunks stay on Cloudinary (user's preference); manual cleanup possible |
| API secret leaked | Stored only in CF environment vars, never in client code |
| unsigned upload preset abused | Set upload preset to only accept raw files, set folder limits |

## Validation

1. Send image in 1-to-1 chat → verify chunks on Cloudinary → verify single tick
2. Recipient comes online → verify double gray tick → verify chunks downloaded → verify blue tick → verify chunks DELETED from Cloudinary
3. Send video in group chat → verify all recipients download → verify cleanup after last recipient
4. Delete message before delivery → verify Cloudinary cleanup
5. Recipient offline → verify chunks stay on Cloudinary → verify they appear when recipient comes online
6. Test with both browser tabs (online) and mobile device (toggle data off/on)
