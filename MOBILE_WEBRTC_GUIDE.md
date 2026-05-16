# 📱 Capacitor + WebRTC Mobile Deployment Guide

## Why Capacitor Handles WebRTC Without Extra Code

### Architecture Overview

```
Your React Code (PeerJS + Firebase)
    ↓
Capacitor JavaScript Bridge
    ↓
Native WebView (WKWebView iOS / Chromium Android)
    ↓
OS-Level WebRTC APIs (Hardware-accelerated)
    ↓
Camera, Microphone, Network Stack
```

**Key Insight**: Capacitor's WebView **IS** a modern browser that supports WebRTC natively.

---

## iOS: WKWebView WebRTC Support

### ✅ What Works Out-of-the-Box

**WebRTC APIs in WKWebView (iOS 11+)**:
- `navigator.mediaDevices.getUserMedia()` ✅
- `RTCPeerConnection` ✅
- `MediaConnection` (PeerJS) ✅
- ICE candidates & TURN ✅
- H.264 video codec ✅
- Opus audio codec ✅

**Your Code**:
```typescript
// This just works on iOS via WKWebView:
const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
// No Capacitor plugins needed!
```

### ✅ iOS Configuration (Already Set)

```typescript
// capacitor.config.ts
ios: {
  limitsNavigationsToAppBoundDomains: true,
  preferredContentMode: 'mobile',  // ✅ Optimized
  scheme: 'App',
}
```

### ✅ iOS Permissions (Need to Add)

**File**: `ios/App/App/Info.plist`

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access for video calls</string>
<key>NSMicrophoneUsageDescription</key>
<string>We need microphone access for calls</string>
<key>NSLocalNetworkUsageDescription</key>
<string>We need local network access for peer connections</string>
<key>NSBonjourServices</key>
<array>
  <string>_webrtc._tcp</string>
</array>
```

**User Experience**:
- First call, user gets permission popup: "Allow camera access?"
- User clicks "Allow"
- Permission granted permanently
- All future calls work without asking again

---

## Android: Chromium WebView WebRTC Support

### ✅ What Works Out-of-the-Box

**WebRTC APIs in Chromium WebView (Android 4.1+)**:
- `navigator.mediaDevices.getUserMedia()` ✅
- `RTCPeerConnection` ✅
- `MediaConnection` (PeerJS) ✅
- ICE candidates & TURN ✅
- H.264 video codec ✅
- VP8/VP9 video codecs ✅
- Opus audio codec ✅

**Your Code**:
```typescript
// This just works on Android via Chromium WebView:
const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
// No Capacitor plugins needed!
```

### ✅ Android Configuration (Already Set)

```typescript
// capacitor.config.ts
android: {
  allowMixedContent: false,  // ✅ Security enabled
  buildOptions: {
    releaseSigningKeyPath: 'my-release-key.keystore',
    releaseSigningKeyAlias: 'my-release-alias',
  },
}
```

### ✅ Android Permissions (Need to Add)

**File**: `android/app/src/AndroidManifest.xml`

Add after `<manifest>` opening tag:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

**Runtime Permissions** (Capacitor handles automatically):
- Camera permission popup on first call
- Microphone permission popup on first call
- User grants, permission cached
- No re-asking needed

---

## 🔄 How Capacitor Handles WebRTC Flow

### Incoming Video Call on Mobile

```
1. Firebase notification (push)
2. Capacitor foreground notification plugin
3. User clicks "Accept"
4. App navigates to VideoCallScreen
   ↓
5. getUserMedia() (built-in to WebView)
   ↓
6. Browser's permission popup: "Allow camera?"
   ↓
7. User clicks "Allow"
   ↓
8. Camera stream obtained (hardware-accelerated)
   ↓
9. PeerJS initiates call to remote peer
   ↓
10. TURN relay connects users (no NAT issues)
    ↓
11. Video appears on screen (WebView renders video element)
```

**Zero Capacitor-specific code needed!** Your PeerJS code just works.

---

## 📦 Build & Deploy Workflow

### Android

```bash
# 1. Build web
pnpm build

# 2. Sync to Android
npx cap sync android

# 3. Build APK
npx cap build android

# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

**Then** (in Android Studio or command line):
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
# Or: open in Android Studio and run
```

### iOS

```bash
# 1. Build web
pnpm build

# 2. Sync to iOS
npx cap sync ios

# 3. Open Xcode
open ios/App/App.xcworkspace

# 4. Select target device
# 5. Press "Run" button (or ⌘R)
```

**Xcode handles codesigning and deployment**

---

## 🧪 Testing Workflow

### Phase 1: Browser Testing (Easiest)
```bash
pnpm dev
# Open http://localhost:5173
# Test both sides in 2 browser windows
```

**What to test**:
- ✅ Search and find contact
- ✅ Click video call button
- ✅ See incoming call notification
- ✅ Accept call
- ✅ Video appears
- ✅ Mute/camera toggle works
- ✅ Hangup works

### Phase 2: Android Emulator
```bash
# Use Chromium emulator (not always reliable for WebRTC)
# Better to use real device
pnpm build && npx cap sync android
# Open Android Studio, run emulator
```

**Known Emulator Issues**:
- Camera/microphone access tricky
- WebRTC slower than real device
- Recommend real device testing

### Phase 3: Android Real Device
```bash
pnpm build && npx cap sync android && npx cap build android
adb install android/app/build/outputs/apk/debug/app-debug.apk
# Or: npx cap run android
```

**On Device**:
- ✅ App opens
- ✅ Login/signup works
- ✅ Permission popups appear
- ✅ Grant camera/microphone
- ✅ Video calls work
- ✅ Test on 4G network
- ✅ Test on different WiFi

### Phase 4: iOS Real Device
```bash
pnpm build && npx cap sync ios
# Open Xcode and run on real device
```

**On Device**:
- ✅ App opens
- ✅ Permission popups appear
- ✅ Grant camera/microphone
- ✅ Video calls work
- ✅ Test on cellular
- ✅ Test on different WiFi

### Phase 5: Long-Distance Testing (2000km+)
- Deploy to Firebase Hosting
- Have users in different regions test
- Monitor latency and audio quality
- Verify TURN relay is active (check browser DevTools)

---

## 🐛 Debugging Mobile WebRTC Issues

### Android Debugging

**Connect adb** (Android Debug Bridge):
```bash
adb devices  # List connected devices
```

**View logs**:
```bash
adb logcat | grep -i peerservice
adb logcat | grep -i webrtc
adb logcat | grep -i "D/chromium"
```

**Remote DevTools** (for Chromium):
```bash
chrome://inspect
# Find your app, click "inspect"
# DevTools opens for your Capacitor app!
```

### iOS Debugging

**Xcode Console**:
```
Product → Scheme → Edit Scheme
→ Run → Arguments Passed On Launch
(console shows WebView logs)
```

**Safari DevTools** (iOS 16.4+):
```
Settings → Safari → Advanced → Web Inspector
# Then on Mac: Develop → iPhone → Your App
```

---

## 📊 Performance Expectations

### Bandwidth Usage
- **Audio only**: 50-100 kbps
- **Video 640x480**: 500kbps - 2.5 Mbps (adaptive)
- **TURN relay overhead**: ~50-250 kbps additional

### Latency
- **Same WiFi**: 50-100ms (best case)
- **WiFi to 4G**: 100-300ms
- **4G to 4G (different carriers, 2000km+)**: 200-500ms
- **With TURN**: +50-100ms additional

### CPU Usage
- **Idle**: <5%
- **Calling**: 20-40% (H.264 hardware encode)
- **Peak**: 30-50% (depends on device)

### Battery Usage
- **Per hour calling**: ~15-25% battery drain
- **Optimize by**: disabling video when not needed, using speaker phone

---

## ✅ Production Checklist

### Before First Deploy

- [ ] Test on real Android device
- [ ] Test on real iOS device
- [ ] Test with Capacitor (npx cap run)
- [ ] Add permissions to AndroidManifest.xml
- [ ] Add permissions to iOS Info.plist
- [ ] Verify TURN relay is working (check DevTools)
- [ ] Test on different WiFi networks
- [ ] Test on 4G/LTE cellular
- [ ] Test with users 1000km+ apart
- [ ] Check battery usage (should be reasonable)

### After First Deploy

- [ ] Monitor error logs (Firebase Crashlytics)
- [ ] Track call success rates
- [ ] Monitor average call duration
- [ ] Watch for permission denial issues
- [ ] Track network/TURN failures
- [ ] Collect user feedback on call quality

---

## 🚨 Common Issues & Fixes

### Issue: "Camera permission denied"
**Solution**:
- iOS: Settings → Quidec → Camera (toggle on)
- Android: Settings → Permissions → Quidec → Camera (allow)
- Restart app

### Issue: "No microphone input"
**Solution**:
- Check permission is granted (same as above)
- On Android: Settings → Permissions → Quidec → Microphone (allow)
- Restart app
- Try speaker phone (unmute)

### Issue: "Call connects but no video"
**Solution**:
- Check video track is enabled: `stream.getVideoTracks()[0].enabled`
- Check camera is not covered
- Toggle camera off/on using app controls
- Check lighting

### Issue: "TURN relay not being used"
**Solution**:
- Check `iceTransportPolicy: 'relay'` is set in peerService.ts
- Check ExpressTURN credentials are correct
- Check browser DevTools → Connection tab for relay candidates
- Verify `turn:free.expressturn.com:3478` appears in candidates

### Issue: "App crashes on first call"
**Solution**:
- Check Android permissions are added to AndroidManifest.xml
- Check iOS permissions are added to Info.plist
- Check Firebase is initialized (check console logs)
- Check PeerServer is running and reachable

### Issue: "Video is very laggy/freezing"
**Solution**:
- Check network quality (WiFi signal strength, 4G/LTE bars)
- Reduce video resolution (edit getUserMedia in VideoCallScreen)
- Disable video, use audio only
- Move closer to WiFi router
- Try different WiFi network

---

## 🎯 Quick Start for Next Deployment

1. **Add permissions** (Android & iOS)
2. **Set up PeerServer** (if not done)
3. **Build web**: `pnpm build`
4. **Sync Capacitor**: `npx cap sync`
5. **Build app**: 
   - Android: `npx cap build android` → Install APK
   - iOS: `npx cap build ios` → Open Xcode → Run
6. **Grant permissions** on first run
7. **Make test call** between 2 devices
8. **Monitor logs** for errors

---

## 📚 Reference

**Capacitor Docs**: https://capacitorjs.com
**WebRTC Docs**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
**PeerJS Docs**: https://docs.peerjs.com
**Firebase Docs**: https://firebase.google.com/docs

---

## Summary

✅ **No additional code needed** - Capacitor WebView handles WebRTC natively
✅ **iOS 11+ and Android 4.1+** support WebRTC fully
✅ **Your PeerJS + Firebase code just works** on mobile
✅ **Only need to add permissions** to native config files
✅ **Test on real devices** for production confidence

**You're ready to deploy!** 🚀
