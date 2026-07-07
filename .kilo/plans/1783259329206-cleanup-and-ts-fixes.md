# Remaining Cleanup & TS Fix Plan

## Scope
Address all remaining items: dead code removal, type fixes, pre-existing TS errors, and minor code quality issues.

---

## Task 1: Fix TS Error — `Uint8Array` not assignable to `BlobPart` (ChatWindow.tsx:1519)

**Problem:** `result.data` from `retrieveDecryptedMedia` returns `Uint8Array`, which TS strict mode says isn't a valid `BlobPart`.

**Fix:** Cast `result.data` to `ArrayBuffer` or wrap in `.buffer`:
```ts
const blob = new Blob([result.data.buffer], { type: mime });
```

**File:** `src/app/components/ChatWindow.tsx:1519`

---

## Task 2: Fix TS Error — `updateMessageStatus` returns `void` but is tested for truthiness (AppContext.tsx:1669)

**Problem:** `updateMessageStatus` in `sqliteMessageStore.ts:371` returns `Promise<void>`, but `AppContext.tsx:1669` does `if (changed)`.

**Fix:** Remove the truthiness check, or change to a fire-and-forget call. The simplest correct fix:
```ts
await updateMessageStatus(uid, receipt.conversationId, receipt.messageId, newStatus);
console.log(`💾 Receipt status saved to local .bin: ${receipt.messageId} → ${newStatus}`);
```

**File:** `src/app/context/AppContext.tsx:1668-1671`

---

## Task 3: Fix TS Errors — `.seconds` on `string` type (ChatWindow.tsx:163, 164, 1086)

**Problem:** `timestamp` can be a `string` (ISO date string), but the code accesses `.seconds` on it (Firestore Timestamp format). TS correctly flags `.seconds` doesn't exist on `string`.

**Fix:** Use a helper function for safe timestamp extraction, already partially exists as `toTimeStr()` at line 12. Create a `toMillis()` helper:
```ts
function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime();
}
```

Then replace:
- Line 162-165: `const beforeTimestamp = toMillis(oldestMessage.timestamp) || Date.now();`
- Line 1086: Use `toMillis(msg.timestamp) - toMillis(prevMsg.timestamp) < 60000`

**File:** `src/app/components/ChatWindow.tsx`

---

## Task 4: Remove Dead Code — `startVideoRecording` (ChatWindow.tsx:433-505)

**Problem:** `startVideoRecording` is never called from UI (replaced by camera gallery picker). It's dead code that references `isRecordingVideo`, recording refs, and creates `File` objects that go unused.

**Fix:** Delete the entire `startVideoRecording` function (lines 433-505). Keep `stopVideoRecording` (line 507-511) since it's still used by the audio recording UI stop button and `stopAudioRecording`.

**File:** `src/app/components/ChatWindow.tsx`

---

## Task 5: Clean Up `e.target.value = ''` Duplication (ChatWindow.tsx:360,365 and 383,388)

**Problem:** `e.target.value = ''` appears twice in both `handleDocumentSelect` and `handleVideoSelect` — once inside try and once after catch, meaning it always runs regardless of error.

**Fix:** Move `e.target.value = ''` to a `finally` block or single line after the try/catch:
```ts
// handleDocumentSelect
} catch (error: any) {
  setSendError(error.message || 'Failed to process document');
  setTimeout(() => setSendError(null), 4000);
}
e.target.value = '';
```
Already correct structure — just remove the duplicate inside try block (line 360) and catch block is separate. Actually, line 360 is inside the try block but before catch. The second `e.target.value = ''` at 365 is after catch. The intent is to always reset the input. The structure should be:
```ts
try {
  // ... validation, setPendingMedia
} catch (error) {
  // ...
} finally {
  e.target.value = '';
}
```

**File:** `src/app/components/ChatWindow.tsx`

---

## Task 6: Update `uploadMediaWithProgress` Type Signature (mediaUploadHandler.ts:39)

**Problem:** `mediaType` parameter is `'image' | 'video' | 'audio'` but `'document'` is passed via `as any` cast at the call site.

**Fix:** Add `'document'` to the union:
```ts
mediaType: 'image' | 'video' | 'audio' | 'document',
```

Then remove the `as any` cast at the call site in `ChatWindow.tsx` (find the exact line where `as any` is used).

**File:** `src/utils/mediaUploadHandler.ts:39`, `src/app/components/ChatWindow.tsx`

---

## Task 7: Remove Dead Video Recording Refs (Optional Cleanup)

After Task 4, check if any recording-related refs become exclusively used by audio recording (they're shared between video and audio). The refs `mediaRecorderRef`, `recordingStreamRef`, `recordedChunksRef`, `recordingTimerRef` are shared with audio recording — keep them. Only `isRecordingVideo` state would need checking.

**Decision:** Keep refs (shared with audio). `isRecordingVideo` state is still used by the UI (line 1037, 1041, 1044) so it stays.

---

## Validation

After all fixes:
1. Run `npx tsc --noEmit 2>&1 | Select-String "ChatWindow|AppContext|mediaUploadHandler"` — should return 0 errors
2. Run `npx vite build` — should succeed with no TS errors
3. Run encryption tests: `npx vitest run src/utils/__tests__/encryption.test.ts` — should remain 18/18

---

## Risk Assessment

- All changes are type-level fixes and dead code removal — no runtime behavior changes
- `toMillis()` helper is purely additive and replaces unsafe `.seconds` access
- `updateMessageStatus` truthiness removal is safe since the log was informational only
- `e.target.value = ''` consolidation is functionally equivalent
- Adding `'document'` to union type removes need for `as any` cast

## Order of Execution

1. Task 1 (Uint8Array cast) — smallest, isolated
2. Task 2 (void truthiness) — one-line fix
3. Task 3 (toMillis helper) — requires adding helper + updating 3 call sites
4. Task 6 (document type) — requires updating signature + call site
5. Task 5 (e.target.value) — mechanical cleanup
6. Task 4 (dead code removal) — largest deletion, depends on verifying no callers
7. Final validation (tsc + build + tests)
