# Plan: Remove In-App Notification Panel, App Icon Badge + FCM Only

## Context

The app currently has an in-app notification panel (Bell icon dropdown in the header) that reads from a Firestore `users/{uid}/notifications/` subcollection. This panel:
- Shows "Loading..." indefinitely (the Firestore subcollection is rarely populated)
- Overlaps/clips with the header border
- Provides no value since real notifications already work via FCM → system notification bar + lock screen

The user wants:
1. **No in-app notification UI at all** — no Bell icon, no badge, no indicator inside the app
2. **Home screen app icon badge** — red dot/number on the app icon (like WhatsApp, Instagram, etc.)
3. **FCM system notifications** — in status bar and lock screen (already working)

## Current Architecture

| Component | Location | Purpose |
|-----------|----------|---------|
| `NotificationPanel.tsx` | `src/app/components/NotificationPanel.tsx` | In-app dropdown panel (182 lines) — **DELETE** |
| Bell icon + toggle | `LeftPanel.tsx:311-324` | Triggers NotificationPanel — **REMOVE** |
| `notificationService.ts` | `src/utils/services/notificationService.ts` | FCM token, foreground listener, Firestore notification CRUD |
| `fcm.js` | `src/utils/fcm.js` | Capacitor push notifications (native) |
| `messageService.sendPushNotification()` | `messageService.ts:242` | Writes to RTDB `notifications/{uid}` → Render relay → FCM |
| `friendRequestService.sendNotificationToUser()` | `friendRequestService.ts:273` | Writes to Firestore `users/{uid}/notifications/` subcollection |
| Chat unread badges | `ChatList.tsx:247-252` | Per-chat green circle with count — **KEEP** (this is chat-specific, not notifications) |

## Changes

### 1. Delete `NotificationPanel.tsx`
- **File:** `src/app/components/NotificationPanel.tsx`
- **Action:** Delete entire file

### 2. Remove Bell icon + panel from `LeftPanel.tsx`
- **File:** `src/app/components/LeftPanel.tsx`
- Remove `import NotificationPanel from './NotificationPanel';` (line 12)
- Remove `Bell` from lucide-react import (line 2) — check if used elsewhere first
- Remove `const [showNotifications, setShowNotifications] = useState(false);` (line 32)
- Remove the entire Bell icon button block (lines 311-324):
  ```tsx
  {activeTab === 'chats' && (
    <div className="relative">
      <button onClick={() => setShowNotifications(v => !v)} ...>
        <Bell size={18} />
      </button>
      <AnimatePresence>
        {showNotifications && <NotificationPanel ... />}
      </AnimatePresence>
    </div>
  )}
  ```
- **NO replacement badge in the header** — header just has: Veill title, search, new chat, menu

### 3. Add app icon badge via `@capacitor/badge` plugin
- **Install:** `pnpm add @capacitor/badge`
- **File:** `src/utils/services/notificationService.ts`
- Add `setAppBadge(count)` and `clearAppBadge()` utility functions using `@capacitor/badge`
  ```ts
  import { Badge } from '@capacitor/badge';

  export async function setAppBadge(count: number) {
    try {
      await Badge.setBadge({ count });
    } catch { /* non-critical */ }
  }

  export async function clearAppBadge() {
    try {
      await Badge.clear();
    } catch { /* non-critical */ }
  }
  ```
- **File:** `src/app/context/AppContext.tsx`
  - When messages arrive and unread count changes, call `setAppBadge(totalUnread)`
  - When app comes to foreground, update badge to current totalUnread
  - When user opens a chat, update badge to new totalUnread (chat's unread clears)
- **File:** `src/utils/fcm.js`
  - When a foreground notification arrives, increment the badge
- **Capacitor config:** Add badge permission to `capacitor.config.ts` if needed (iOS: `NSBonjourServices`, Android: no extra config needed for badge)

### 4. Clean up `notificationService.ts`
- **File:** `src/utils/services/notificationService.ts`
- **Remove** `listenToUserNotifications()` (lines 83-104) — only used by deleted NotificationPanel
- **Remove** `markNotificationAsRead()` (lines 106-115) — only used by deleted NotificationPanel
- **Keep** everything else:
  - `requestFCMPermission()` — needed for FCM token setup
  - `listenToNotifications()` — foreground FCM message handler
  - `sendLocalNotification()` — local notification helper
- Remove unused Firestore imports (`collection`, `query`, `where`, `orderBy`, `getDocs`, `onSnapshot`) if no longer needed
- Remove the Firestore `db` import if no longer needed (RTDB import stays)

### 5. Keep `friendRequestService.sendNotificationToUser()` (no change)
- Writes to Firestore `users/{uid}/notifications/` subcollection
- Harmless, low-cost, could be useful for future notification history feature
- No consumer reads it now (NotificationPanel is deleted), but removing it touches more code for no user-visible benefit

### 6. Keep FCM flow intact (no changes needed)
The FCM push notification flow is already working correctly:
1. `messageService.sendPushNotification()` → RTDB `notifications/{uid}` → Render relay → FCM
2. `fcm.js` handles Capacitor push registration, foreground display, and notification tap
3. `notificationService.listenToNotifications()` handles web foreground FCM
4. System notification bar + lock screen notifications work via OS

### 7. Update test files
- **`src/utils/services/__tests__/notificationService.test.ts`** — Remove tests for `listenToUserNotifications` and `markNotificationAsRead`

## Files Changed Summary

| File | Action |
|------|--------|
| `src/app/components/NotificationPanel.tsx` | **DELETE** |
| `src/app/components/LeftPanel.tsx` | Remove Bell icon, NotificationPanel import, state |
| `src/utils/services/notificationService.ts` | Remove 2 methods, add badge utilities, cleanup imports |
| `src/app/context/AppContext.tsx` | Add badge update calls on unread count changes |
| `src/utils/fcm.js` | Increment badge on foreground notification |
| `package.json` | Add `@capacitor/badge` dependency |
| `src/utils/services/__tests__/notificationService.test.ts` | Remove corresponding tests |

## Validation
1. `pnpm test` — all unit tests pass
2. `pnpm typecheck` — no type errors
3. `pnpm lint` — no new lint errors
4. `pnpm build` — build succeeds
5. No Bell icon in header — header is clean: "Veill" + search + new chat + menu
6. App icon shows red badge with unread count on home screen (test on device)
7. FCM notifications appear in status bar and lock screen (test on device)
8. Opening a chat clears that chat's unread; badge updates to reflect remaining unread
