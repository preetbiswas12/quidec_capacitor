# Remaining Work — Veill Production Readiness

## Current State (Verified)
| Check | Status |
|-------|--------|
| `pnpm type-check` | 0 errors |
| `pnpm test` | **480/480 passing** (24 test files) |
| `pnpm lint` | **8 errors, 1033 warnings** |
| `pnpm build` | Clean production build |

---

## P0: Fix 8 Lint Errors (CI Blocker)

All 8 errors are `@typescript-eslint/no-unsafe-function-type` — using the `Function` type in test mocks.

| File | Lines | Fix |
|------|-------|-----|
| `src/utils/services/__tests__/callService.test.ts` | 157, 177, 201, 213, 233 | Replace `Function` → `(...args: unknown[]) => void` |
| `src/utils/services/__tests__/notificationService.test.ts` | 128, 148, 236 | Replace `Function` → `(...args: unknown[]) => void` |

CI will fail with `--max-warnings=800` since there are 8 errors (errors always fail regardless of threshold).

---

## P1: Lint Warning Threshold Regression

Warnings jumped from **792 → 1033** (241 new). This exceeds the CI threshold of 800 even after fixing errors. Need to either:
1. **Fix warnings** (preferred) — reduce to ≤800
2. **Raise threshold** to ~1040 (quick, temporary)

Source of increase: new test files added since last count (tests use `any` heavily in mocks, which is standard practice). The lint config should disable `no-explicit-any` and `no-unsafe-function-type` in test files via ESLint overrides.

---

## P2: Missing Test Coverage

These production-critical source files have **no test file**:

### Services (no tests)
| File | Priority | Notes |
|------|----------|-------|
| `src/utils/services/messageService.ts` | HIGH | Core messaging logic, Firestore sync |
| `src/utils/services/dataRetention.ts` | MEDIUM | Data retention/deletion policies |
| `src/utils/services/analyticsService.ts` | LOW | Analytics tracking |

### Utilities (no tests)
| File | Priority | Notes |
|------|----------|-------|
| `src/utils/sqliteMessageStore.ts` | HIGH | New SQLite store replacing .bin storage |
| `src/utils/encryption.js` | HIGH | E2E encryption core (tested via encryption.test.ts indirectly) |
| `src/utils/mediaUploadHandler.ts` | MEDIUM | Media upload logic |
| `src/utils/mediaValidator.ts` | MEDIUM | Input validation |
| `src/utils/migrationAndUtils.ts` | MEDIUM | Data migration |
| `src/utils/messageDatabase.ts` | LOW | Legacy message DB |
| `src/utils/encryptedChunkedMedia.ts` | MEDIUM | Chunked media encryption |
| `src/utils/permissionManager.ts` | LOW | Permission handling |
| `src/utils/logger.ts` | LOW | Logging |
| `src/utils/websocketManager.ts` | LOW | WebSocket management |
| `src/utils/notificationSettingsManager.ts` | LOW | Notification settings |
| `src/utils/hooks/useNetworkStatus.ts` | MEDIUM | Offline detection hook |

### Components (no tests)
| File | Priority | Notes |
|------|----------|-------|
| `src/app/components/VoiceCallScreen.tsx` | HIGH | Call screen with reconnection |
| `src/app/components/SettingsPage.tsx` | MEDIUM | Settings + GDPR export |
| `src/app/components/LeftPanel.tsx` | MEDIUM | Chat list + search + offline indicator |
| `src/app/components/ContactInfo.tsx` | LOW | Contact detail view |
| `src/app/components/GroupInfo.tsx` | LOW | Group detail view |
| `src/app/components/ChatList.tsx` | MEDIUM | Chat list component |
| `src/app/components/MainLayout.tsx` | LOW | Layout wrapper |
| `src/app/components/Avatar.tsx` | LOW | Avatar component |
| `src/app/components/Onboarding.tsx` | LOW | Onboarding flow |
| `src/app/components/StatusTab.tsx` | LOW | Status/stories tab |
| `src/app/components/CallsTab.tsx` | LOW | Call history tab |
| `src/app/components/MessageRequests.tsx` | LOW | Friend request list |
| `src/app/components/EmailVerification.tsx` | LOW | Email verification |
| `src/app/components/NotificationPanel.tsx` | LOW | Notifications panel |
| `src/app/components/WelcomeScreen.tsx` | LOW | Welcome/empty state |

### Context (no tests)
| File | Priority | Notes |
|------|----------|-------|
| `src/app/context/AppContext.tsx` | HIGH | App state management (complex, 800+ lines) |

---

## P3: ESLint Configuration for Test Files

Add ESLint overrides to suppress test-inappropriate rules in `__tests__/` files:
- `@typescript-eslint/no-explicit-any: off` (mocks need `any`)
- `@typescript-eslint/no-unsafe-function-type: off` (mock callbacks use `Function`)

This is a standard practice — reduces ~241 warnings from test mocks instantly.

---

## P4: Legacy Code Quality

| Item | Detail |
|------|--------|
| `@ts-nocheck` file | `src/utils/cloudFunctions.ts` — 1 file with legacy untyped Firebase SDK calls |
| `localMessageStore.ts` | Dead code — still exists but all consumers migrated to `sqliteMessageStore.ts`. Should be removed or kept as fallback |
| 552 `any` warnings | Mostly in test mocks (acceptable) and `dataRetention.ts` (1 `eslint-disable` already) |

---

## P5: Production Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| Privacy policy page | NOT DONE | Legal requirement for app stores |
| Terms of service page | NOT DONE | Legal requirement |
| App store metadata | NOT DONE | Screenshots, descriptions, icons |
| E2E tests | NOT DONE | No Playwright/Cypress setup |
| Performance profiling | NOT DONE | Bundle size analysis, render profiling |
| Accessibility audit | NOT DONE | ARIA labels, keyboard nav, screen reader |
| `CHANGELOG.md` update | NEEDED | Current version is 1.0.0 in package.json but 1.1.0 in CHANGELOG; needs sync + update for SQLite migration + all new work |
| Version bump | NEEDED | 1.0.0 → 1.1.0 (or 1.2.0 with SQLite) |

---

## Execution Plan — Fix Blockers + Add Tests

### Phase 1: Fix CI Blockers

#### Step 1: Add ESLint test file overrides
**File**: `.eslintrc.json`
Add `overrides` for test files to suppress `no-explicit-any` and `no-unsafe-function-type`:
```json
"overrides": [
  {
    "files": ["**/__tests__/**/*", "**/*.test.*", "**/*.spec.*", "**/test-utils.*"],
    "rules": {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off"
    }
  }
]
```

#### Step 2: Fix remaining `Function` type in test files (if any remain after Step 1)
**Files**: 
- `src/utils/services/__tests__/callService.test.ts` — lines 157, 177, 201, 213, 233: `Function` → `(...args: unknown[]) => void`
- `src/utils/services/__tests__/notificationService.test.ts` — lines 128, 148, 236: `Function` → `(...args: unknown[]) => void`

Even though ESLint overrides should catch these, fixing the actual `Function` type is better practice.

#### Step 3: Run lint + update CI threshold
- Run `pnpm lint` — count warnings
- Update `.github/workflows/ci.yml` line 39: `--max-warnings=X` to match new count (with headroom)
- Target: warnings should drop significantly since test file `any` usage is the bulk of new warnings

#### Step 4: Verify full CI pipeline
- `pnpm test` (expect 480+ pass)
- `pnpm type-check` (expect 0 errors)
- `pnpm lint` (expect 0 errors, warnings under threshold)
- `pnpm build` (expect clean)

---

### Phase 2: Add Missing Tests

#### Step 5: `sqliteMessageStore.test.ts`
**File**: `src/utils/__tests__/sqliteMessageStore.test.ts`
**What to test** (mirrors the API surface):
- `initSqliteMessageStore()` initializes DB, creates tables
- `appendMessage()` inserts a message, `loadMessages()` returns it
- `loadAllChats()` returns unique chatIds
- `listLocalChatIds()` lists chat IDs
- `deleteLocalChat()` removes all messages for a chatId
- `clearAllMessages()` wipes everything
- `updateMessageStatus()` changes status in place
- `updateMessageStar()` toggles star
- `updateMessageContent()` edits message content in place
- `updateMessageReactions()` updates reactions array
- `deleteMessageById()` removes a single message
- `getStarredMessages()` returns only starred
- `searchAllMessages()` returns matching results
- `clearKeyCache()` clears encryption key cache
- `saveMessages()` bulk insert
- Encryption: stored content is encrypted (not plaintext), decryption round-trips correctly
- Persistence: DB persists across re-init (mock Capacitor Filesystem)

**Mocking strategy**: Mock `@capacitor/filesystem` and `@capacitor/preferences`. Use `sql.js` directly (it works in Node). The `fake-indexeddb` polyfill should already be in test setup.

#### Step 6: `messageService.test.ts`
**File**: `src/utils/services/__tests__/messageService.test.ts`
**What to test**:
- `sendTextMessage()` — calls Firestore `addDoc`, triggers listeners
- `sendMediaMessage()` — uploads media, stores message with media URL
- `editMessage()` — updates content locally + calls `syncEditToFirestore()`
- `deleteMessage()` — soft-deletes (tombstone pattern)
- `reactToMessage()` — transaction-wrapped reaction toggle
- `markMessageRead()` — updates read status
- `listenToMessages()` — returns unsubscribe function, fires on snapshot changes
- `syncEditToFirestore()` — updates Firestore doc
- Message encryption/decryption round-trip

**Mocking strategy**: Mock `firebase/firestore` (same pattern as `conversationService.test.ts`).

#### Step 7: `VoiceCallScreen.test.tsx`
**File**: `src/app/components/__tests__/VoiceCallScreen.test.tsx`
**What to test** (mirror `VideoCallScreen.test.tsx` pattern):
- Renders call screen with caller info
- Calls `startCall` on mount
- Handles mute/unmute toggle
- Handles speaker toggle
- Handles end call (navigates away, cleans up refs)
- Reconnection banner appears on disconnect
- Cleanup on unmount (endCall, peerService.destroy)

**Mocking strategy**: Same as `VideoCallScreen.test.tsx` — mock `useParams`, `useNavigate`, `useApp`, `services`, `peerService`, `useCallReconnection`.

#### Step 8: `AppContext.test.tsx`
**File**: `src/app/context/__tests__/AppContext.test.tsx`
**What to test** (critical state management):
- `AppProvider` wraps children and provides context
- `useApp()` throws outside provider
- `isOffline` state changes with network events
- `isReconnecting` state toggles during reconnect
- `syncProgress` updates during flush
- `sendMessage` calls `sendMessageWhenAvailable` when offline
- `sendGroupMessage` routes through offline queue when offline
- `editMessage` calls local persist + `syncEditToFirestore`
- `addStatus` queues to localStorage when offline
- `markAsRead` queues to read receipt queue when offline
- `handleSendRequest` shows toast when offline
- `offlineFlushResult` event shows warning/success toast
- `offlineFlushProgress` event updates syncProgress
- Friends list loads and refreshes
- Contacts list loads

**Mocking strategy**: Mock all service modules, mock `useNetworkStatus`, mock `localStorage`, mock `window.addEventListener`.

---

### Phase 3: Cleanup & Release

#### Step 9: Remove dead `localMessageStore.ts`
- Delete `src/utils/localMessageStore.ts` (all consumers now import from `sqliteMessageStore`)
- Verify no remaining imports

#### Step 10: Update `CHANGELOG.md`
Add new section for latest changes:
- SQLite message store migration
- WhatsApp UI improvements (date separators, consecutive spacing, mic button)
- Offline mode LOW priority fixes (typing guard, exponential backoff, edit sync, status queue, sync progress)
- Memory leak audit (6 fixes)
- 480 tests, lint fixes, ESLint overrides

#### Step 11: Version bump
- Update `package.json` version to `1.2.0` (or `1.1.0` if preferred)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `sql.js` in tests may need WASM polyfill | Vitest setup.ts already loads `fake-indexeddb`; may need additional sql.js WASM config |
| `messageService` has many dependencies to mock | Follow existing pattern from `conversationService.test.ts` |
| `AppContext` is very large (800+ lines) | Focus on critical state paths, not exhaustive coverage |
| ESLint overrides may suppress useful warnings in tests | Scoped to `__tests__/**` and `*.test.*` only |

## Validation

After all steps:
1. `pnpm test` — 480+ tests passing
2. `pnpm type-check` — 0 errors
3. `pnpm lint` — 0 errors, warnings under threshold
4. `pnpm build` — clean production build
