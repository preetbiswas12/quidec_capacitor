# Fix: Presence RTDB Key Mismatch — Friend Never Sees "Online"

## Bug

`setUserOnline` and `listenToFriendsPresence` use **different RTDB paths**, so the friend's listener never receives the online status.

### The mismatch

| Operation | RTDB path | Key used |
|-----------|-----------|----------|
| `setUserOnline(uid, username)` | `presence/{displayName}` | `username` (2nd param = `currentUser?.name`, e.g. "Preet") |
| `setUserOffline(uid)` | `presence/{customHandle}` | `uid` (1st param = `currentUser.userId`, e.g. "preet.5815") |
| `listenToFriendsPresence` | `presence/{customHandle}` | `friendUid` (from friendships doc, e.g. "preet.5815") |

**Result:** Online writes to `presence/Preet` but listener reads `presence/preet.5815` → friend never sees "online". Offline writes to `presence/preet.5815` → friend sees "last seen".

### Caller (AppContext.tsx:1873)

```ts
presenceService.setUserOnline(uid, currentUser?.name || uid);
//  uid = currentUser.userId = custom handle (e.g. "preet.5815")
//  username = currentUser?.name = display name (e.g. "Preet Biswas")
```

## Fix (2 files)

### 1. `src/utils/services/presenceService.ts` — `setUserOnline`

Change RTDB path key from `username` to `uid`:

```ts
// BEFORE (broken):
const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(username)}`);

// AFTER (fixed):
const presenceRef = ref(realtimeDb, `presence/${sanitizePathComponent(uid)}`);
```

Also fix Firestore path from `username` to `uid`:

```ts
// BEFORE:
await setDoc(doc(db, 'users', username), { ... });

// AFTER:
await setDoc(doc(db, 'users', uid), { ... });
```

Keep `username` param for logging only. The RTDB and Firestore paths must use `uid` (custom handle) to match what `listenToFriendsPresence` reads.

### 2. No changes to caller or listener

- Caller `setUserOnline(uid, currentUser?.name || uid)` — no change needed
- `listenToFriendsPresence` — already correct (reads `presence/{customHandle}`)
- `setUserOffline(uid)` — already correct (writes `presence/{customHandle}`)

## Why this was invisible in logs

The console logs the user saw (`😴 App backgrounded >5s — marked offline` / `👁️ App foreground — marked online`) are from the user's OWN browser. They confirm the visibility handler fires correctly. But the friend's listener never receives the online update because the RTDB path is wrong.

## Validation

1. Open two browser sessions (User A and User B)
2. User A opens the app → User B should see "online" (currently broken, shows "last seen")
3. User A backgrounds tab → after 5s, User B should see "last seen HH:MM"
4. User A closes tab → User B should see "last seen HH:MM"
5. TypeScript: `npx tsc --noEmit`
6. Tests: `npx vitest run`
