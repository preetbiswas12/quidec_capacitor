# WhatsApp UI Polish Plan

## Goal
Make the Quidec chat app UI sleek and WhatsApp-like with Apple-level polish — smooth animations, no high-contrast or choppy AI-generated vibes. Focus on animations, loading states, interaction feedback, and theme consistency.

## Design Direction
- **Sleek, not choppy**: Smooth spring animations (damping 28-35), no abrupt transitions
- **Apple-level polish**: Subtle shadows, refined spacing, consistent typography
- **WhatsApp patterns**: Bouncing typing dots, message send slide-up, skeleton shimmer, scroll FAB
- **Low contrast**: No harsh colors, soft borders, muted backgrounds
- **Keep current accent color** (`#4d91fb`) — user did not request a change

---

## Task 1: Theme Token Cleanup
**File: `src/styles/theme.css`**
- Add new tokens: `--wa-online-green: #25D366`, `--wa-read-blue: #53bdeb`, `--wa-star-yellow: #f9a825`, `--wa-menu-bg: #233138`, `--wa-menu-hover: #2A3942`, `--wa-date-bg: #182229`
- Map all new tokens to Tailwind `@theme` section (e.g., `--color-wa-online: var(--wa-online-green)`)

**File: `src/styles/tailwind.css`**
- Remove the conflicting `@theme` block (duplicate `--color-primary`, `--color-whatsapp-green`)
- Keep only `@import "tailwindcss"` — all theme tokens are already in `theme.css`

**File: `src/index.css`**
- Remove the duplicate `@theme` block (lines 4-72) that conflicts with `theme.css`
- Keep the `@theme dark` block, scrollbar styles, and base layer

**Across all components** — replace hardcoded hex colors with theme tokens:
- `#4d91fb` → `wa-accent` (already mapped, just use the class)
- `#233138` → `wa-menu-bg` (new token)
- `#2A3942` → `wa-menu-hover` (new token)
- `#53bdeb` → `wa-read-blue` (new token)
- `#25D366` → `wa-online` (new token)
- `#f9a825` → `wa-star` (new token)
- `#182229` → `wa-date-bg` (new token)
- `#8696A0` → already matches `wa-text-muted` but use token class

**Files to update**: `ChatWindow.tsx`, `ChatList.tsx`, `LeftPanel.tsx`, `Avatar.tsx`, `SettingsPage.tsx`, `StatusTab.tsx`, `MessageRequests.tsx`

---

## Task 2: Typing Indicator — Animated Dots
**File: `src/app/components/TypingDots.tsx`** (new component)
- 3 small circles with staggered bounce animation using `motion/react`
- Each dot: `w-1.5 h-1.5 rounded-full bg-wa-accent`
- Animation: `y: [0, -4, 0]` with `repeat: Infinity`, staggered by 0.15s per dot
- Duration: ~0.6s per cycle, ease-in-out

**File: `src/app/components/ChatWindow.tsx`**
- Line 928: Replace `typing...` text with `<TypingDots />` component
- Keep the `AnimatePresence mode="wait"` wrapper for smooth enter/exit

**File: `src/app/components/ChatList.tsx`**
- Line 199: Replace `typing...` text with inline mini `<TypingDots size="sm" />`

---

## Task 3: Message Send Animation
**File: `src/app/components/ChatWindow.tsx`**
- In `MessageBubble` (line 1365): Change entrance from `initial={{ opacity: 0, y: 6, scale: 0.97 }}` to `initial={{ opacity: 0, y: 12, scale: 0.96 }}` — slightly more slide-up
- Change transition from `damping: 30, stiffness: 400` to `damping: 28, stiffness: 350` — smoother, less snappy
- Add `layout` prop to `motion.div` for smooth reorder when new messages arrive

---

## Task 4: Skeleton Loading States
**File: `src/app/components/SkeletonChatRow.tsx`** (new component)
- Shimmer animation using CSS `@keyframes shimmer` with `background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.08) 50%, transparent 75%)`
- Layout: 50px circle (avatar) + two lines (name + message) + small circle (time)
- Use `bg-wa-secondary/40` base with shimmer overlay
- `animate-pulse` alternative: custom shimmer for smoother Apple-like feel

**File: `src/app/components/ChatList.tsx`**
- When `chats` is empty and loading, show 6 `<SkeletonChatRow />` entries
- Add `isLoadingChats` state or check from context

**File: `src/app/components/Avatar.tsx`**
- Add `loading` prop — when true, show shimmer circle instead of image/initials
- Shimmer: `bg-wa-secondary/40` with sweep animation

---

## Task 5: Scroll-to-Bottom FAB
**File: `src/app/components/ChatWindow.tsx`**
- Track scroll position: `isNearBottom = scrollHeight - scrollTop - clientHeight < 100`
- Show FAB when `!isNearBottom && chatMessages.length > 0`
- FAB: `motion.button` with `initial={{ scale: 0, opacity: 0 }}` → `animate={{ scale: 1, opacity: 1 }}`
- Position: `absolute bottom-20 right-4 z-30`
- Style: `w-10 h-10 rounded-full bg-wa-header shadow-lg border border-wa-border/20 flex items-center justify-center`
- Icon: `ChevronDown size={20} text-wa-header-icon`
- On click: `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`
- Add haptic: `navigator.vibrate(10)` on tap

---

## Task 6: Pull-to-Refresh
**File: `src/app/components/ChatList.tsx`**
- Add `pullDistance` state and touch event handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`)
- Threshold: 80px to trigger refresh
- Visual: Circular spinner at top that rotates as user pulls down
- On release: trigger `window.location.reload()` or a custom refresh callback
- Animation: `motion.div` with `rotate` bound to pull distance
- Style: `w-6 h-6 border-2 border-wa-accent border-t-transparent rounded-full`
- Only activate when `scrollTop === 0` (at top of list)

---

## Task 7: Bottom Nav Unread Badge
**File: `src/app/components/LeftPanel.tsx`**
- In the tabs array, add `badge` field for the "chats" tab
- Badge value: `chats.reduce((sum, c) => sum + c.unreadCount, 0)` from context
- Render badge as absolute-positioned dot or number on the icon:
  - If count > 0: `absolute -top-0.5 right-1/4 w-2 h-2 rounded-full bg-wa-accent` (dot style, like WhatsApp)
  - Or for numbers: small pill `bg-wa-accent text-white text-[0.55rem] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center`
- WhatsApp uses a simple green dot for unread, not a number — use dot style

---

## Task 8: Haptic Feedback
**File: `src/app/components/ChatWindow.tsx`**
- `handleSend` (line ~1199): Add `navigator.vibrate(15)` after send
- `handleDragEnd` (line 1320): Already has `navigator.vibrate(40)` — keep as-is
- Send button tap: Already has `active:scale-90` — haptic reinforces it

**File: `src/app/components/ChatList.tsx`**
- `openChat` function: Add `navigator.vibrate(10)` on chat open

**File: `src/app/components/LeftPanel.tsx`**
- Tab switch: Add `navigator.vibrate(8)` on tab change

**Note**: All `navigator.vibrate` calls should be guarded with `if (navigator.vibrate)` check (some already are).

---

## Task 9: Visual Polish — Apple-Level Refinement

### Chat Bubbles (ChatWindow.tsx)
- Reduce shadow: `shadow-sm` → `shadow-[0_1px_2px_rgba(0,0,0,0.06)]` — softer, more subtle
- Remove `hover:shadow-md` — no hover shadow on mobile (feels jarring)
- Bubble tail: Slightly smaller triangles (reduce from `border-l-8` to `border-l-[7px]`)

### Input Area (ChatWindow.tsx)
- Input wrapper: Add subtle `backdrop-blur-sm` for glass effect
- Focus state: `focus-within:shadow-[0_0_0_1px_rgba(77,145,251,0.15)]` instead of border change
- Send button: Reduce shadow intensity, use `shadow-[0_2px_8px_rgba(77,145,251,0.25)]`

### Chat List Items (ChatList.tsx)
- Remove `active:scale-[0.98]` — feels choppy on low-end devices
- Add `will-change: transform` for smoother touch feedback
- Reduce border opacity: `border-wa-border/8` → `border-wa-border/5`

### Header (LeftPanel.tsx, ChatWindow.tsx)
- Add subtle `backdrop-blur-md` to headers for depth
- Menu dropdown: Add `backdrop-blur-xl` and reduce shadow from `shadow-2xl` to `shadow-xl`

### Date Separators (ChatWindow.tsx)
- Reduce background opacity: `bg-[#182229]/70` → use new `wa-date-bg` token at 60% opacity
- Add `backdrop-blur-sm` (already present, keep)

### Reactions (ChatWindow.tsx)
- Reaction bubble: `bg-[#233138]` → use `wa-menu-bg` token
- Add subtle `backdrop-blur-sm`

### Online Indicator (Avatar.tsx, ChatWindow.tsx)
- Add pulse animation: `animate-[pulse_3s_ease-in-out_infinite]` — subtle glow effect
- Use `wa-online` token instead of hardcoded `#25D366`

---

## Files Modified (Summary)
| File | Changes |
|------|---------|
| `src/styles/theme.css` | Add 6 new tokens, map to Tailwind |
| `src/styles/tailwind.css` | Remove conflicting `@theme` block |
| `src/index.css` | Remove duplicate `@theme` block |
| `src/app/components/TypingDots.tsx` | **NEW** — animated typing dots |
| `src/app/components/SkeletonChatRow.tsx` | **NEW** — skeleton loading |
| `src/app/components/ChatWindow.tsx` | Message animation, scroll FAB, typing dots, token cleanup, visual polish |
| `src/app/components/ChatList.tsx` | Skeleton loading, pull-to-refresh, typing dots, token cleanup, haptic |
| `src/app/components/LeftPanel.tsx` | Bottom nav badge, haptic, token cleanup |
| `src/app/components/Avatar.tsx` | Online pulse animation, loading prop, token cleanup |
| `src/app/components/SettingsPage.tsx` | Token cleanup (replace hardcoded hex) |
| `src/app/components/StatusTab.tsx` | Token cleanup |
| `src/app/components/MessageRequests.tsx` | Token cleanup |

## Validation
1. `npm run build` — must pass with 0 errors
2. Visual check: All hardcoded `#hex` colors replaced with `wa-*` token classes
3. Visual check: Typing dots animate smoothly in both ChatWindow header and ChatList
4. Visual check: Skeleton loading appears when chat list is loading
5. Visual check: Scroll FAB appears when scrolled up, disappears near bottom
6. Visual check: Pull-to-refresh works at top of chat list
7. Visual check: Bottom nav shows unread dot on Chats tab
8. Visual check: All animations feel smooth (no jank, no abrupt cuts)
9. Mobile test: Haptic feedback on send, chat open, tab switch
