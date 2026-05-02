# Mobile App Development - Quick Reference

## Essential Commands

### Development
```bash
cd web
pnpm dev              # Start dev server (localhost:5173)
pnpm sync:android     # Sync to Android
pnpm sync:ios         # Sync to iOS
```

### Build
```bash
pnpm build:web        # Build for web (creates dist/)
pnpm build:android:apk   # Build Android debug APK
pnpm build:android:aab   # Build Android App Bundle (Play Store)
```

### IDE
```bash
pnpm open:android     # Open Android Studio
pnpm open:ios         # Open Xcode
```

## Workflows

### Quick Test Cycle (30 seconds)
```bash
# Make changes to src/
pnpm build:web        # Rebuilds in ~5 seconds
pnpm sync:android     # Syncs to device
# Refresh app - changes visible
```

### Dev with Hot Reload (Best for UI)
```bash
# Terminal 1
pnpm dev              # Starts Vite dev server

# Terminal 2
# Edit .env.development with your IP
VITE_SERVER_URL=ws://192.168.x.x:3000
pnpm sync:android     # Syncs once

# Now just save files - app refreshes automatically
```

### Build for Testing
```bash
pnpm build:android:apk
# Install: adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Build for Release
```bash
# 1. Update version
# Edit .env, android/app/build.gradle, iOS version

# 2. Build
pnpm build:android:aab

# 3. Upload to Play Store / App Store
```

## File Locations

| What | Where |
|------|-------|
| React components | `src/app/components/` |
| Styles | `src/styles/` |
| Global state | `src/app/context/AppContext.tsx` |
| Routes | `src/app/routes.tsx` |
| Environment vars | `.env` or `.env.development` |
| Build output | `dist/` |
| Android project | `android/` |
| iOS project | `ios/` |

## Environment

**Production:**
- Server: `wss://quidec-server.onrender.com`
- Debug: OFF
- Minify: ON

**Development:**
- Server: `ws://192.168.x.x:3000` (set your IP)
- Debug: ON
- Minify: OFF

## Key Package Versions

- React: 18.3.1
- React Router: 7.14.2
- TypeScript: 5.9.3
- Capacitor: 8.3.1
- Vite: 6.4.2
- Tailwind: 4.2.4
- Radix UI: Latest

## Common Issues

| Problem | Solution |
|---------|----------|
| WebSocket won't connect | Check VITE_SERVER_URL in .env |
| Changes don't appear | Run `pnpm build:web` then sync |
| Gradle error | Run `cd android && ./gradlew clean` |
| Xcode error | Delete Pods and run `pod install` |
| App crashes on startup | Check browser console for errors |

## Documentation Files

- **MOBILE_APP_SETUP.md** - Complete guide (start here)
- **MOBILE_BUILD_GUIDE.md** - Detailed build instructions
- This file - Quick reference

## Important Notes

✓ App ID: `com.quidec.chat`
✓ App Name: `Quidec`
✓ Current Version: `1.0.0`
✓ Min Android: API 24 (Android 5.0)
✓ Min iOS: 15.0+

## Before Committing

```bash
pnpm type-check    # Ensure no TS errors
pnpm lint           # Check code style
pnpm format         # Auto-format code
```

## For CI/CD Pipeline

```bash
# Install & build
pnpm install
pnpm build:web

# For Android
cd android && ./gradlew assembleRelease

# For iOS  
cd ios && xcodebuild -scheme Quidec
```

## First Time Setup

```bash
cd web
bash setup-mobile.sh        # Mac/Linux
# or
setup-mobile.bat           # Windows

# Then follow printed instructions
```

## App Structure

```
App (with Router)
├── LoginScreen (no auth needed)
├── Onboarding (new users)
├── MainLayout (authenticated)
│   ├── LeftPanel (contacts, chats)
│   ├── ChatWindow (messages)
│   └── Sidebar (settings, calls, status)
├── VoiceCallScreen (protected)
├── VideoCallScreen (protected)
└── SettingsPage (app preferences)
```

---

**Pro Tip:** Use two terminals - one for dev server (`pnpm dev`) and one for commands. Changes save automatically with hot reload!
