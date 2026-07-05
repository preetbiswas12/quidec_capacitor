# Production Readiness Plan - Veill (Quidec) Encrypted Messenger

**Date**: July 3, 2026  
**Verified Status**: ~80% production-ready (better than audit docs claim, but with critical gaps)  
**Target**: 100% production-ready

---

## Verified Current State (Code Audit)

### What's Actually Done (Confirmed in Code)

| Area | Status | Evidence |
|------|--------|----------|
| Input validation + rate limiting | ✅ Integrated | `validators.ts` imported in ChatWindow, Onboarding, authService, userService, friendRequestService, statusService, groupService |
| Error handling (try-catch) | ✅ 86 blocks across services | All 14 service files in `src/utils/services/` |
| Sentry error monitoring | ⚠️ Setup only | `errorMonitoring.tsx` exists, `initializeSentry()` called in `main.tsx`, but **`@sentry/react` not in package.json** |
| Persistent message queue | ✅ Implemented | `persistentMessageQueue.ts` - localStorage persistence, auto-flush, 24h TTL |
| Image compression | ✅ Utility exists | `imageCompression.ts` |
| Media validation | ✅ Implemented | `mediaValidator.ts` with `reportError` integration |
| Android permissions | ✅ Added | `AndroidManifest.xml` has CAMERA, RECORD_AUDIO, INTERNET, etc. |
| iOS permissions | ✅ Added | `Info.plist` has NSCamera, NSMicrophone, NSLocalNetwork, etc. |
| Unit tests | ⚠️ Minimal | Only `validators.test.ts` (217 lines) and `encryption.test.ts` (118 lines) |
| CI/CD workflows | ✅ Exist | 6 workflow files in `.github/workflows/` (but no test step) |
| Firebase services | ✅ Refactored | 14 modular service files in `src/utils/services/` |
| WebSocket | ✅ Replaced by Firebase RTDB | `websocketManager.ts` fully commented out; RTDB used for real-time |
| Dark mode | ⚠️ CSS ready, no toggle | CSS variables exist, no UI toggle component |

### Critical Bugs Found

1. **`@sentry/react` not installed** - `errorMonitoring.tsx:6` imports it but `package.json` has no `@sentry/react` dependency → **FIXED**: `pnpm add @sentry/react` done (v10.63.0 installed)
2. **Call routes missing** - `routes.tsx` has NO `/call/video/:id` or `/call/voice/:id` routes. `VideoCallScreen.tsx` and `VoiceCallScreen.tsx` components exist but are unreachable via navigation → **TODO**
3. **`setUserContext` never called** - **FALSE ALARM** — `setUserContext()` IS called at `authService.ts:109` (register), `authService.ts:184` (login), and `clearUserContext()` at `authService.ts:260` (logout). No fix needed.

---

## Production Readiness Gaps (Ordered by Priority)

### 🔴 P0 — BUILD BLOCKERS (App won't compile/deploy)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Install `@sentry/react` dependency | `package.json` | ✅ Done (v10.63.0) |
| 2 | Add call routes to router | `src/app/routes.tsx` | ❌ TODO |
| 3 | Verify build compiles: `pnpm build` | root | ❌ TODO |
| 4 | Fix any TypeScript errors | Various | ❌ TODO |

### 🔴 P1 — CRITICAL SECURITY (Exploitable in production)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 5 | Call `setUserContext()` after Firebase auth login | `src/utils/services/authService.ts`, `src/utils/services/userService.ts` | ✅ Already done (authService.ts:109,184,260) |
| 6 | Add Firestore transaction safety for message status updates | `src/utils/services/messageService.ts` | ❌ TODO |
| 7 | Add message deletion protocol (user-initiated) | `src/utils/services/messageService.ts`, `ChatWindow.tsx` | ❌ TODO |
| 8 | Implement daily key rotation for E2E encryption | `src/utils/encryption.js` | ❌ TODO |
| 9 | Add HMAC message authentication | `src/utils/encryption.js`, message send/receive | ❌ TODO |

### 🟠 P2 — PRODUCTION QUALITY (Required before public release)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 10 | Add unit tests for services (authService, messageService, etc.) | `src/utils/services/__tests__/` | 8h |
| 11 | Add component tests for ChatWindow, VideoCallScreen | `src/app/components/__tests__/` | 6h |
| 12 | Add E2E tests (Playwright or Cypress) | `e2e/` | 8h |
| 13 | Add CI test step to workflows | `.github/workflows/ci.yml` | 1h |
| 14 | Add message pagination (Firestore cursor-based) | `src/utils/services/messageService.ts`, `src/utils/idbPaginator.ts` | 4h |
| 15 | Add offline mode (load from IndexedDB, queue sends) | `ChatWindow.tsx`, `persistentMessageQueue.ts` | 6h |
| 16 | Add call reconnection on network loss | `VideoCallScreen.tsx`, `peerService.ts` | 3h |
| 17 | Run type-check and lint, fix all errors | root | 2h |
| 18 | Memory leak audit (verify all useEffect cleanups) | All component files | 3h |

### 🟡 P3 — COMPLIANCE & INFRASTRUCTURE

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 19 | Create privacy policy | New file | 2h |
| 20 | Create terms of service | New file | 2h |
| 21 | Add data export feature (GDPR) | New service file | 4h |
| 22 | Add right-to-delete (GDPR) | `src/utils/services/userService.ts` | 2h |
| 23 | Configure GitHub Secrets for CI/CD | GitHub repo settings | 30 min |
| 24 | Add `.env.production` with production Firebase config | root | 15 min |
| 25 | Add Firebase Cloud Function for data retention cleanup | `functions/` | 4h |
| 26 | Add Firestore automated backup | Firebase console | 30 min |

### 🟢 P4 — UX POLISH (Post-MVP or launch week)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 27 | Add dark mode toggle to Settings | `SettingsPage.tsx` | 2h |
| 28 | Add message search UI | `ChatWindow.tsx` | 3h |
| 29 | Add media gallery grid view | New component | 3h |
| 30 | Add typing indicators polish | `typingService.ts`, `ChatWindow.tsx` | 2h |
| 31 | Add read receipt UI (single/double/blue ticks) | `ChatWindow.tsx` | 2h |
| 32 | Performance/load testing | New test suite | 4h |
| 33 | Security penetration testing | External or manual | 4h |
| 34 | WCAG 2.1 AA accessibility audit | All components | 4h |

---

## Implementation Order (Recommended Sprint Plan)

### Sprint 1: Fix Build + Critical Bugs
1. ~~`pnpm add @sentry/react`~~ ✅ Done
2. Add call routes to `routes.tsx` (P0-2) — see implementation instructions below
3. `pnpm build` to verify compilation (P0-3)
4. Fix TypeScript/lint errors (P0-4)
5. ~~Call `setUserContext()` after login~~ ✅ Already done
6. `pnpm type-check` and `pnpm lint` pass

### Sprint 2: Security Hardening (Day 2-3)
7. Firestore transactions for message status (P1-6)
8. Message deletion protocol (P1-7)
9. Key rotation (P1-8)
10. HMAC authentication (P1-9)

### Sprint 3: Testing (Day 4-6)
11. Unit tests for all services (P2-10)
12. Component tests (P2-11)
13. CI test step (P2-13)
14. Type-check and lint clean (P2-17)

### Sprint 4: Reliability (Day 7-9)
15. Message pagination (P2-14)
16. Offline mode (P2-15)
17. Call reconnection (P2-16)
18. Memory leak audit (P2-18)

### Sprint 5: Compliance & Launch (Day 10-12)
19. Privacy policy + ToS (P3-19, P3-20)
20. GDPR features (P3-21, P3-22)
21. GitHub Secrets + CI/CD (P3-23)
22. Data retention Cloud Function (P3-25)
23. E2E tests (P2-12)

### Sprint 6: Polish (Day 13-15)
24. Dark mode toggle (P4-27)
25. Message search UI (P4-28)
26. Read receipts polish (P4-31)
27. Performance testing (P4-32)
28. Security audit (P4-33)

---

## Implementation Instructions (Sprint 1 Remaining)

### Task: Add call routes to `src/app/routes.tsx`

**Current state of `routes.tsx`**: Lines 1-10 import components, lines 127-158 define the router. The router has `ProtectedRoute` children under `/app` with `MainLayout` containing `chat/:id` and `group/:id` routes. Call screens are standalone (not inside MainLayout).

**What to change in `src/app/routes.tsx`**:

1. Add imports after line 10 (after `EmailVerification` import):
```typescript
import VideoCallScreen from './components/VideoCallScreen';
import VoiceCallScreen from './components/VoiceCallScreen';
```

2. Add two new route objects inside the `ProtectedRoute` children array (after the `/app` route block, before the `*` catch-all at line 156):
```typescript
{
  path: '/call/video/:id',
  element: <VideoCallScreen />,
},
{
  path: '/call/voice/:id',
  element: <VoiceCallScreen />,
},
```

**Verification**:
- After editing, run `pnpm type-check` — should pass with 0 errors
- Run `pnpm build` — should compile without errors
- The routes are standalone (not nested under `/app/MainLayout`) because call screens are full-screen experiences

**Note on VoiceCallScreen**: This component imports `services from '../../utils/firebaseServices'` and `getRTCConfig from '../../utils/iceServers'`. Verify these import paths resolve correctly. If VoiceCallScreen uses PeerJS like VideoCallScreen, confirm it works. If it uses a different architecture (raw WebRTC), that's also fine — just verify the component compiles.

### Task: Run build verification

After adding routes, execute:
```bash
pnpm type-check
pnpm lint
pnpm build
```

If there are errors, fix them before proceeding to Sprint 2.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `@sentry/react` version compatibility | Install latest stable; check React 18 compatibility |
| Call routes may have stale imports | Verify `VideoCallScreen`/`VoiceCallScreen` import paths after adding routes |
| Firestore transactions may increase latency | Use only for critical writes (message status, friend requests) |
| Key rotation may break existing encrypted messages | Store rotation metadata; decrypt with all historical keys |
| E2E tests flaky with Firebase | Use Firebase emulators for CI testing |
| Group chat architectural limitation | Intentional 1:1 design — document clearly, defer groups to v2 |

---

## Validation Plan

After each sprint, verify:
1. `pnpm type-check` passes with 0 errors
2. `pnpm lint` passes with 0 errors
3. `pnpm test` passes with all tests green
4. `pnpm build` produces dist/ without warnings
5. `pnpm dev` loads in browser without console errors
6. Manual smoke test: register → login → send message → receive message
7. Manual call test: initiate call → accept → verify audio/video → hang up

---

## Success Criteria for Production Launch

- [ ] Build compiles cleanly (`pnpm build` 0 errors)
- [ ] Type-check passes (`pnpm type-check` 0 errors)
- [ ] Lint passes (`pnpm lint` 0 errors)
- [ ] All tests pass (`pnpm test`)
- [ ] Sentry initialized with user context
- [ ] Call routes functional (voice + video)
- [ ] Input validation + rate limiting integrated and tested
- [ ] Message deletion works end-to-end
- [ ] No memory leaks (useEffect cleanups verified)
- [ ] Privacy policy and ToS published
- [ ] Android APK builds and runs on device
- [ ] iOS builds and runs on device
- [ ] CI/CD pipeline runs tests on push
