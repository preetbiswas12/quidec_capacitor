# Media Upload/Receive — Final Fixes

## Status: Code changes done. 1 minor CSS fix + deployment needed.

## Root Causes (all fixed in code)
1. **Firestore named database "quidec" didn't exist** → all writes timed out, all reads got "Missing or insufficient permissions"
2. **Progress stuck at 30%** → Firestore writes were blocking the upload loop
3. **Video had green border** → `isVideoOnly` not defined at bubble level; video sent `'🎥 Video'` content

## Remaining Tasks

### Task 1: Fix video thumbnail `rounded-xl` bleed (minor CSS)
**File**: `src/app/components/ChatWindow.tsx` ~line 1732  
**Issue**: `<img>` and fallback `<div>` have hardcoded `rounded-xl`. When the bubble is `p-0` (video-only), this creates a visible gap between the image's `rounded-xl` and the bubble's `rounded-2xl`.  
**Fix**: Remove `rounded-xl` from the img/div inside LocalMedia for video — the parent bubble's `rounded-2xl` + `overflow-hidden` handles clipping.

### Task 2: Deploy Firestore rules to default database
The rules file (`firestore.rules`) has been updated but must be deployed:
```bash
firebase deploy --only firestore:rules
```

### Task 3: Verify Firestore database exists
In Firebase Console → Firestore Database → check if a database exists (should be `(default)` region). If no database exists, create one:
- Go to Firebase Console → Build → Firestore Database → Create database
- Choose production mode (rules handle security)
- Select region closest to users

### Task 4: Build and test
```bash
npm run build
npm run preview  # serves on :4173 and :4174
```
Test flow:
1. Send small image from browser A → verify it appears in chat A with circular progress completing
2. Check browser B → verify image loads (may take a few seconds for Firestore fire-and-forget writes to propagate)
3. Send video from browser A → verify video-only bubble has no green border, fills edge-to-edge
4. Check browser B → verify video thumbnail + play button, click opens lightbox player
5. Refresh both browsers → verify media persists (SQLite local storage)

## Files Changed This Session
- `src/utils/firebase.ts` — removed `'quidec'` database name
- `firebase.json` — removed `"database": "quidec"` from firestore section
- `src/utils/encryptedChunkedMedia.ts` — Firestore writes fire-and-forget + chunk progress callback
- `src/utils/mediaUploadHandler.ts` — per-chunk progress, removed coarse steps
- `src/app/components/ChatWindow.tsx` — `isVideoOnly`/`isMediaOnly`, empty video content, bubble padding fix, video border fix
