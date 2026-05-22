# Mobile Testing Plan for Quidec Chat

## Overview
This document outlines the complete mobile testing strategy for the Quidec chat application across iOS and Android platforms. The app has been configured with Capacitor 8.3.1 for native mobile deployment with 13 integrated Capacitor plugins.

## Environment Setup

### Prerequisites
- **Web Build**: ✅ Complete (22.65s build time)
- **Android SDK**: API 24+ (Android 7.0+) with compileSdk 36 (Android 15)
- **iOS**: Xcode 14+ with iOS 11+ support
- **Capacitor CLI**: v8.3.1
- **Node.js**: v22.0.0+
- **pnpm**: v9.0.0+

### Installed Capacitor Plugins
1. ✅ **@capacitor-firebase/authentication** v8.2.0 - OAuth/Email login
2. ✅ **@capacitor-firebase/messaging** v8.2.0 - Push notifications
3. ✅ **@capacitor/app** v8.1.0 - App lifecycle
4. ✅ **@capacitor/camera** v8.0.2 - Photo/video capture
5. ✅ **@capacitor/device** v8.0.2 - Device info
6. ✅ **@capacitor/filesystem** v8.1.1 - File access
7. ✅ **@capacitor/local-notifications** v8.0.2 - Local alerts
8. ✅ **@capacitor/network** v8.0.1 - Network status
9. ✅ **@capacitor/preferences** v8.0.1 - Secure storage
10. ✅ **@capacitor/push-notifications** v8.0.3 - FCM integration
11. ✅ **@capacitor/share** v8.0.1 - Native share dialog
12. ✅ **@capacitor/splash-screen** v8.0.1 - Splash screen
13. ✅ **@capacitor/status-bar** v8.0.2 - Status bar control

## Phase 1: Web Integration Testing (CURRENT)

### Objective
Verify all 4 priority UI integrations work correctly in web browser before mobile deployment.

### Test Cases

#### Priority 1: Error Monitoring (Sentry)
- [ ] **Test 1.1**: Login and verify `setUserContext()` is called
  - **Steps**: Login with test account → Check browser console for breadcrumb
  - **Expected**: No errors, user context set in Sentry
  
- [ ] **Test 1.2**: Perform actions and check breadcrumbs
  - **Steps**: Send message → Open file upload → Share message
  - **Expected**: Breadcrumbs appear in Sentry dashboard

- [ ] **Test 1.3**: Logout and verify `clearUserContext()`
  - **Steps**: Click logout button
  - **Expected**: User context cleared, no errors

#### Priority 2: Message Queue (Offline Persistence)
- [ ] **Test 2.1**: Send message with queue indicator
  - **Steps**: Open DevTools → throttle connection → send message
  - **Expected**: Queue count shows in UI, message retries on reconnect

- [ ] **Test 2.2**: Check queue statistics
  - **Steps**: Throttle → send multiple messages → check queue
  - **Expected**: messageQueue.getStats() shows correct pending count

- [ ] **Test 2.3**: Queue cleanup on TTL
  - **Steps**: Queue message → wait 24+ hours (or mock time)
  - **Expected**: Expired messages auto-removed

#### Priority 3: Media Validation (DoS Protection)
- [ ] **Test 3.1**: Upload oversized image
  - **Steps**: Select image > 10MB
  - **Expected**: Error toast "File too large, maximum size is 10MB"

- [ ] **Test 3.2**: Upload high-resolution image
  - **Steps**: Select image > 8000x8000 pixels
  - **Expected**: Error "Image dimensions too large"

- [ ] **Test 3.3**: Upload document
  - **Steps**: Select PDF/DOC file
  - **Expected**: Accepts file if < 100MB, displays in chat

- [ ] **Test 3.4**: Upload oversized document
  - **Steps**: Select file > 100MB
  - **Expected**: Error "File too large"

#### Priority 4: Pagination (Infinite Scroll)
- [ ] **Test 4.1**: Scroll to load older messages
  - **Steps**: Open conversation with 100+ messages → scroll to top
  - **Expected**: Loads previous 50 messages, maintains position

- [ ] **Test 4.2**: Check IndexedDB storage
  - **Steps**: Open DevTools → Application → IndexedDB → quidec_cache
  - **Expected**: See messages stored with composite index (conversationId + timestamp)

- [ ] **Test 4.3**: Large conversation handling
  - **Steps**: Load conversation with 5000+ messages
  - **Expected**: App remains responsive, pagination works smoothly

- [ ] **Test 4.4**: Message search in paginated content
  - **Steps**: Search in conversation with thousands of messages
  - **Expected**: Search works on loaded messages

### Web Testing Commands

```bash
# Start development server
pnpm dev

# Open 2 browser windows for testing
# Window 1: http://localhost:5173
# Window 2: http://localhost:5173 (different user)

# Run TypeScript check
pnpm type-check

# View build output
pnpm build

# Check for errors
pnpm exec tsc --noEmit
```

### Performance Metrics to Monitor

| Metric | Target | Current |
|--------|--------|---------|
| Message send latency | < 1s | TBD |
| Queue flush interval | 30s | Configured |
| Pagination load time | < 500ms | TBD |
| Max concurrent uploads | 3 | Configured |
| Max local cache | 5000 messages | Configured |

## Phase 2: Android Build & Testing

### Build Commands

```bash
# Sync web assets to Android
pnpm sync:android

# Build debug APK (for testing on device)
pnpm build:android:apk
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# Build release AAB (for Play Store)
pnpm build:android:aab
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### Android Test Devices

| Device | OS Version | API | Network | Status |
|--------|-----------|-----|---------|--------|
| Primary | TBD | 24+ | WiFi + 4G | Pending |
| Secondary | TBD | 24+ | WiFi | Pending |
| Emulator | Android 12 | 31 | Virtual | Pending |

### Android Test Cases

#### Permission Tests
- [ ] **Test A1**: Camera permission request
  - **Steps**: Open chat → Click camera icon
  - **Expected**: OS shows permission dialog → grants access → camera opens

- [ ] **Test A2**: Photo library permission
  - **Steps**: Click attach → Select photo
  - **Expected**: OS permission dialog → file picker opens

- [ ] **Test A3**: Microphone permission (for future)
  - **Steps**: Prepare for voice messaging
  - **Expected**: Permission request handled correctly

#### Network Tests
- [ ] **Test A4**: WiFi connectivity
  - **Steps**: Connect to WiFi → send message
  - **Expected**: Message sent immediately with WebSocket

- [ ] **Test A5**: 4G connectivity
  - **Steps**: Switch to mobile data → send message
  - **Expected**: Message queued if no connection → sent when online

- [ ] **Test A6**: Network switching
  - **Steps**: Switch WiFi ↔ 4G rapidly
  - **Expected**: Queue handles switch gracefully, no message loss

#### Features Tests
- [ ] **Test A7**: Send text message
  - **Steps**: Type message → press send
  - **Expected**: Message appears in chat instantly

- [ ] **Test A8**: Send image
  - **Steps**: Attach image → verify upload
  - **Expected**: Image thumbnail in chat, full image in cloud

- [ ] **Test A9**: Receive push notification
  - **Steps**: Send message from another device
  - **Expected**: Notification appears with sound + badge

- [ ] **Test A10**: Reply to message
  - **Steps**: Long-press message → select "Reply"
  - **Expected**: Reply UI appears, message threading works

#### Performance Tests
- [ ] **Test A11**: App startup time
  - **Steps**: Force stop → launch app
  - **Expected**: App loads in < 3 seconds

- [ ] **Test A12**: Message list scrolling
  - **Steps**: Scroll through 1000+ messages
  - **Expected**: Smooth 60 FPS scrolling, no jank

- [ ] **Test A13**: Memory usage
  - **Steps**: Monitor via Android Studio → load large conversation
  - **Expected**: Memory usage stable, no leaks (< 300MB)

## Phase 3: iOS Build & Testing

### Build Commands

```bash
# Sync web assets to iOS
pnpm sync:ios

# Open Xcode
pnpm open:ios

# Build in Xcode:
# - Select device/simulator
# - Product → Build
# - Product → Run on device
```

### iOS Test Devices

| Device | OS Version | Status |
|--------|-----------|--------|
| iPhone 14+ | iOS 17+ | Pending |
| iPhone 12 | iOS 16+ | Pending |
| iPad | iOS 17+ | Pending |
| Simulator | iOS 17 | Pending |

### iOS Test Cases

Similar to Android, plus iOS-specific:
- [ ] Face ID/Touch ID for biometric auth (if implemented)
- [ ] Dark mode appearance
- [ ] Split view on iPad
- [ ] iCloud Keychain sync
- [ ] Siri shortcuts integration (future)

## Phase 4: Production Hardening

### Checklist
- [ ] Code signing certificates configured
- [ ] Release signing key generated
- [ ] ProGuard/R8 optimization (Android)
- [ ] App Store provisioning profiles (iOS)
- [ ] Privacy policy review
- [ ] App Store listing created
- [ ] Firebase production environment configured
- [ ] Error monitoring (Sentry) production DSN set
- [ ] Analytics tracking enabled
- [ ] Crash reporting validated

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Web Testing | 2-4 hours | In Progress |
| Phase 2: Android Build & Test | 4-6 hours | Pending (Gradle issue) |
| Phase 3: iOS Build & Test | 4-6 hours | Pending |
| Phase 4: Production Hardening | 2-3 hours | Pending |
| **Total** | **~14-19 hours** | - |

## Known Issues

### Gradle Build Error (Android)
- **Issue**: `MissingValueException` during `compileDebugJavaWithJavac`
- **Root Cause**: Possible Capacitor plugin configuration conflict
- **Solution**: Clean gradle cache, verify SDK installation
- **Status**: 🔴 Investigating

### Firefox DevTools IndexedDB Issue
- **Issue**: IndexedDB might not show in all browsers
- **Workaround**: Use Chrome/Edge for IndexedDB inspection
- **Status**: ✅ Known limitation

## Success Criteria

✅ All Phase 1 web tests pass (100%)
✅ Android APK builds successfully and runs on device
✅ iOS app builds and runs on device
✅ All core features work on both platforms:
  - ✅ User authentication
  - ✅ Send/receive messages
  - ✅ Error monitoring
  - ✅ Offline message queue
  - ✅ Media upload with validation
  - ✅ Large conversation pagination
  - ✅ Push notifications
✅ Performance metrics meet targets
✅ No critical crashes or data loss

## Next Steps

1. **Immediate**: Complete Phase 1 web testing (2-4 hours)
2. **Short Term**: Resolve Gradle build issue (1-2 hours)
3. **Short Term**: Build and test Android APK (4-6 hours)
4. **Medium Term**: Setup iOS build environment and test (4-6 hours)
5. **Medium Term**: Production hardening and deployment

---

**Document Version**: 1.0  
**Last Updated**: 2025  
**Prepared by**: Quidec Development Team
