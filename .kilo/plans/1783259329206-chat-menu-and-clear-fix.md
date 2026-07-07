# Fix: Message Bubble Animation & Chat Spacing

## Problem: Entrance animation doesn't play + swipe bounces back

**Root cause**: `style={{ x }}` (imperative control from `useMotionValue`) overrides `initial/animate x` (declarative animation). The entrance animation never plays because `style` wins. Also `dragElastic: 0.15` causes visible bounce-back after swipe.

**Key constraint**: `x` motion value must remain because it drives the reply swipe visual indicators (`swipeOpacity`, `swipeScale`, `rotateZ`).

**Fix** (`ChatWindow.tsx` ~line 1409):

1. **Remove `style={{ x }}`** from the motion.div — lets `initial/animate` work for entrance
2. **Remove `layout`** — causes layout thrashing with animation
3. **Set `dragElastic: 0`** — no elastic overshoot
4. **Add `dragSnapToOrigin`** — snaps back instantly to original position on release
5. **Add `onDrag` callback** — feeds the `x` motion value during drag so reply visual still works

The drag gesture internally moves the element. `onDrag` updates `x` so the reply icon opacity/scale/rotation animate correctly. On release, `dragSnapToOrigin` snaps the bubble back instantly (no bounce).

Before:
```jsx
<motion.div
  layout
  drag="x"
  dragConstraints={{ left: 0, right: 60 }}
  dragElastic={0.15}
  onDragEnd={handleDragEnd}
  style={{ x }}
  initial={{ opacity: 0, x: isMe ? 40 : -40, scale: 0.92 }}
  animate={{ opacity: 1, x: 0, scale: 1 }}
  transition={{ type: 'spring', damping: 18, stiffness: 260, mass: 0.8 }}
  whileTap={{ scale: 0.995 }}
```

After:
```jsx
<motion.div
  drag="x"
  dragConstraints={{ left: -60, right: 0 }}
  dragElastic={0}
  dragSnapToOrigin
  onDrag={(_, info) => x.set(info.offset.x)}
  onDragEnd={handleDragEnd}
  initial={{ opacity: 0, x: isMe ? 40 : -40, scale: 0.92 }}
  animate={{ opacity: 1, x: 0, scale: 1 }}
  transition={{ type: 'spring', damping: 18, stiffness: 260, mass: 0.8 }}
  whileTap={{ scale: 0.995 }}
```

## Spacing Reduction

- Line 1023: `py-3 px-3` → `py-1.5 px-1.5`
- Line 1392: `mb-2` → `mb-1.5` (non-consecutive), `mb-0.5` stays for consecutive
- Line 1392: `gap-1.5` → `gap-1`

## Validation
- Open chat → messages slide in from their respective sides with bounce
- Swipe a message left → release → snaps back instantly (no elastic bounce)
- Reply icon still appears/disappears correctly during swipe
- Side padding and gaps are tighter
