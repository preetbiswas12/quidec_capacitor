# FCM Notifications + Read Receipts + Data Retention Plan

## Context

The app's messaging infrastructure is nearly complete. This plan addresses the remaining gaps:

- **FCM push notifications** already work for both 1:1 and group messages via the Render relay — but the notification click doesn't navigate to the conversation
- **Read receipts** (WhatsApp-style ticks) are fully implemented via RTDB transient pipes — but there's a tick regression bug where status can downgrade on reconnect
- **Data accumulates** without cleanup (call logs, notifications, sessions) since Cloud Functions require Blaze plan — client-side cleanup is needed
- The user is on **Spark (free) plan** — no Cloud Functions, no app/play store submission

---

## Part 1: Fix Tick Regression Bug

**Problem:** When a user goes offline→online, pending receipts can downgrade a message's status from "read" (blue tick) back to "delivered" (gray double tick).

### Fix 1: `src/app/context/AppContext.tsx:1498-1510`

Add status priority guard — only upgrade, never downgrade:

```ts
const STATUS_PRIORITY: Record<string, number> = { sent: 0, delivered: 1, read: 2 };

// In the setMessages callback inside listenToReceipts:
msg.id === receipt.messageId
  ? { ...msg, status: (STATUS_PRIORITY[newStatus] ?? 0) > (STATUS_PRIORITY[msg.status] ?? 0) ? newStatus : msg.status }
  : msg
```

### Fix 2: `src/utils/localMessageStore.ts`

In `updateMessageStatus()`, add the same guard — only update if the new status has higher priority than the current one.

---

## Part 2: Client-Side Data Retention

Since Cloud Functions require Blaze plan, all cleanup runs client-side on app startup.

### New file: `src/utils/services/dataRetention.ts`

```ts
export const dataRetention = {
  /** Delete call logs older than 90 days */
  async cleanupOldCallHistory(uid: string): Promise<number>;

  /** Delete notifications older than 30 days */
  async cleanupOldNotifications(uid: string): Promise<number>;

  /** Delete device sessions with expired expiresAt or inactive >30 days */
  async cleanupStaleSessions(uid: string): Promise<number>;

  /** Delete rejected/expired friend requests older than 30 days */
  async cleanupStaleFriendRequests(uid: string): Promise<number>;
};
```

### Retention Rules

| Data | Retention | Firestore Path | Query |
|------|-----------|----------------|-------|
| Call logs >90 days | 90 days | `users/{uid}/callHistory` | `timestamp < 90d ago` |
| Notifications >30 days | 30 days | `users/{uid}/notifications` | `createdAt < 30d ago` |
| Device sessions expired | 30 days | `users/{uid}/deviceSessions` | `expiresAt <= now` |
| Friend requests rejected >30d | 30 days | `friendRequests` | `status in [rejected, expired]` + `updatedAt < 30d ago` |

**Already exists (no changes needed):**
- `statusService.deleteExpiredStatuses(uid)` — stories >24h
- `messageService.cleanupDeliveryPipe(uid)` — RTDB delivery nodes >24h

### Trigger: App Startup

**File: `src/app/context/AppContext.tsx`**

After auth completes, call cleanup functions (non-blocking, fire-and-forget):

```ts
dataRetention.cleanupOldCallHistory(uid);
dataRetention.cleanupOldNotifications(uid);
dataRetention.cleanupStaleSessions(uid);
dataRetention.cleanupStaleFriendRequests(uid);
```

### Pagination

Firestore batch limit is 500 operations. Use paginated deletion:
```ts
async function paginatedDelete(q: Query, db: Firestore): Promise<number> {
  let totalDeleted = 0;
  let lastDoc: QueryDocumentSnapshot | undefined;
  while (true) {
    const paged = lastDoc
      ? query(q, startAfter(lastDoc), limit(500))
      : query(q, limit(500));
    const snap = await getDocs(paged);
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 500) break;
  }
  return totalDeleted;
}
```

---

## Part 3: Notification Click → Navigate to Conversation

**Problem:** When user taps a push notification, the service worker opens `/` but doesn't navigate to the specific conversation.

### Fix: `public/firebase-messaging-sw.js`

Update `notificationclick` handler to navigate to conversation:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  // Construct URL with conversation ID
  const url = data?.conversationId ? `/?chat=${data.conversationId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'OPEN_CONVERSATION', conversationId: data?.conversationId });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
```

### Fix: Frontend — Listen for SW messages

**File: `src/app/context/AppContext.tsx`** or `src/main.tsx`

Add a message listener to navigate when the SW sends `OPEN_CONVERSATION`:

```ts
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'OPEN_CONVERSATION' && event.data?.conversationId) {
    // Navigate to the conversation
    navigateToChat(event.data.conversationId);
  }
});
```

---

## Part 4: In-App Notification Panel (WhatsApp-style)

### New component: `src/app/components/NotificationPanel.tsx`

WhatsApp-style notification panel with:
- Bell icon in header with unread count badge
- Dropdown/overlay panel showing notifications
- Each item: avatar, sender name, message preview, relative timestamp
- Tap → navigate to conversation + mark as read
- "Mark all as read" button
- Empty state: "No new notifications"

### Integration: `src/app/components/LeftPanel.tsx`

Add bell icon in the header bar (next to search/menu). On click, toggle the NotificationPanel.

---

## Implementation Order

1. **Tick regression fix** — `AppContext.tsx` + `localMessageStore.ts` (2 files, small change)
2. **Notification click navigation** — `firebase-messaging-sw.js` + `AppContext.tsx` (2 files, small change)
3. **Client-side data retention** — new `dataRetention.ts` + `AppContext.tsx` startup hook
4. **Notification panel UI** — new `NotificationPanel.tsx` + `LeftPanel.tsx` integration

## Files Modified

| File | Change |
|------|--------|
| `src/app/context/AppContext.tsx` | Tick priority guard + SW message listener + startup cleanup calls |
| `src/utils/localMessageStore.ts` | Status priority guard in `updateMessageStatus()` |
| `public/firebase-messaging-sw.js` | Navigate to conversation on notification click |
| `src/utils/services/dataRetention.ts` | **New** — 4 cleanup functions with paginated deletes |
| `src/app/components/NotificationPanel.tsx` | **New** — WhatsApp-style notification panel |
| `src/app/components/LeftPanel.tsx` | Add bell icon + NotificationPanel toggle |

## Verification

1. `pnpm type-check` — 0 errors
2. `pnpm test` — 515+ tests pass
3. `pnpm build` — clean build
4. Manual: Send message → verify ✓ → ✓✓ → ✓✓ blue progression
5. Manual: Kill app → send message → reopen → verify notification + message arrive
6. Manual: Go offline → send messages → go online → verify ticks DON'T regress
7. Manual: Tap notification → verify app opens to correct conversation
8. Manual: Open notification panel → verify unread badge, mark as read, tap to navigate
