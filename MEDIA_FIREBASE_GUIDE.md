# 📸 Media Storage & Firebase Integration Guide

## 🎥 Media Storage Architecture

### Storage Hierarchy:

```
┌────────────────────────────────────────────────────────────┐
│            WHERE ARE VIDEOS & PICTURES SAVED?              │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  📍 LOCATION 1: App Cache (Temporary)                      │
│  /data/data/com.quidec.chat/cache/                         │
│  ├─ Downloaded media                                        │
│  ├─ Thumbnails                                              │
│  ├─ Temporary files                                         │
│  └─ Auto-cleared when app is uninstalled                   │
│                                                              │
│  📍 LOCATION 2: App Documents (Persistent)                 │
│  /data/data/com.quidec.chat/files/                         │
│  ├─ User avatars                                            │
│  ├─ Saved images                                            │
│  ├─ Metadata files                                          │
│  └─ Persists across app updates                            │
│                                                              │
│  📍 LOCATION 3: External Storage (User-accessible)         │
│  /sdcard/Android/data/com.quidec.chat/                     │
│  ├─ Large media files                                       │
│  ├─ Backup files                                            │
│  ├─ User can access via file manager                       │
│  └─ Requires READ/WRITE permissions                        │
│                                                              │
│  📍 DATABASE: IndexedDB                                     │
│  quidec-app (IndexedDB)                                     │
│  └─ media-metadata store (metadata only, NOT files)        │
│      ├─ File path reference                                │
│      ├─ File size                                           │
│      ├─ Upload timestamp                                    │
│      └─ MIME type                                           │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

---

## 📱 Capacitor FileSystem Usage

### Configuration in `capacitor.config.ts`:

```typescript
{
  plugins: {
    Camera: {
      permissions: ['camera', 'photos'],
    },
    // Other plugin configs...
  }
}
```

### Core API Usage:

#### 1. **Save Image/Video**

```typescript
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

async function saveMedia(fileName, data, mimeType) {
  try {
    // Save to app documents
    const result = await Filesystem.writeFile({
      path: `media/${fileName}`,
      data: data, // Base64 string or Blob
      directory: Directory.Documents,
      recursive: true, // Create directory if not exists
    });

    console.log('✅ File saved:', result.uri);
    
    // Store reference in IndexedDB
    await saveMediaMetadata({
      id: generateId(),
      uri: result.uri,
      type: mimeType,
      fileName: fileName,
      uploadedAt: new Date().toISOString(),
    });

    return result.uri;
  } catch (error) {
    console.error('❌ Failed to save media:', error);
    throw error;
  }
}
```

#### 2. **Read/Display Image**

```typescript
async function loadImageForDisplay(fileName) {
  try {
    const file = await Filesystem.readFile({
      path: `media/${fileName}`,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    // Create data URL for img tag
    const dataUrl = `data:image/jpeg;base64,${file.data}`;
    return dataUrl;
  } catch (error) {
    console.error('❌ Failed to load image:', error);
    throw error;
  }
}

// Usage in React
function DisplayImage({ fileName }) {
  const [imageSrc, setImageSrc] = useState(null);

  useEffect(() => {
    loadImageForDisplay(fileName).then(setImageSrc);
  }, [fileName]);

  return <img src={imageSrc} alt="Chat media" />;
}
```

#### 3. **Delete Media**

```typescript
async function deleteMedia(fileName) {
  try {
    await Filesystem.deleteFile({
      path: `media/${fileName}`,
      directory: Directory.Documents,
    });

    // Remove from IndexedDB
    await removeMediaMetadata(fileName);

    console.log('✅ File deleted:', fileName);
  } catch (error) {
    console.error('❌ Failed to delete media:', error);
  }
}
```

#### 4. **List All Media**

```typescript
async function listAllMedia() {
  try {
    const result = await Filesystem.readdir({
      path: 'media',
      directory: Directory.Documents,
    });

    return result.files;
  } catch (error) {
    console.error('❌ Failed to list media:', error);
    return [];
  }
}
```

#### 5. **Check Storage Space**

```typescript
async function getStorageInfo() {
  // Capacitor doesn't have built-in storage quota API
  // Use native plugins for detailed info
  
  const files = await listAllMedia();
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  
  console.log('Total media size:', (totalSize / 1024 / 1024).toFixed(2) + ' MB');
  return totalSize;
}
```

---

## 📸 Camera & Photo Selection

### Taking a Photo:

```typescript
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

async function takePhoto() {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64, // Returns base64 data
      source: CameraSource.Camera, // Use device camera
      correctOrientation: true,
    });

    // Save to device
    const uri = await saveMedia(`photo-${Date.now()}.jpg`, photo.base64String, 'image/jpeg');

    return {
      uri: uri,
      base64: photo.base64String,
      mimeType: photo.format,
    };
  } catch (error) {
    console.error('❌ Camera error:', error);
  }
}
```

### Selecting from Photo Library:

```typescript
async function pickPhotoFromLibrary() {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos, // Use photo library
    });

    // Save to device
    const uri = await saveMedia(`selected-${Date.now()}.jpg`, photo.base64String, 'image/jpeg');

    return {
      uri: uri,
      base64: photo.base64String,
      mimeType: photo.format,
    };
  } catch (error) {
    console.error('❌ Photo selection error:', error);
  }
}
```

---

## 🔥 Firebase Cloud Messaging (FCM)

### Configuration File: `src/utils/firebase.ts`

### Firebase Setup Checklist:

- [ ] Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- [ ] Enable Cloud Messaging
- [ ] Generate credentials
- [ ] Add credentials to `.env` or GitHub Secrets
- [ ] Create service worker for background notifications
- [ ] Configure push notification handlers

### Environment Variables:

```bash
VITE_FIREBASE_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

### Firebase Initialization:

```typescript
import { initializeApp } from 'firebase/app';
import { getMessaging, onMessage, getToken } from 'firebase/messaging';

let firebaseApp = null;
let messaging = null;

export function initializeFirebase() {
  try {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    // Check if credentials are provided
    if (!firebaseConfig.apiKey) {
      console.warn('⚠️ Firebase credentials not configured');
      return null;
    }

    firebaseApp = initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized');

    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    return null;
  }
}

export function getMessagingInstance() {
  if (!firebaseApp) {
    initializeFirebase();
  }

  if (!messaging && firebaseApp) {
    try {
      messaging = getMessaging(firebaseApp);
    } catch (error) {
      console.warn('⚠️ Could not get messaging instance:', error);
    }
  }

  return messaging;
}
```

### Get FCM Token:

```typescript
export async function getFCMToken() {
  const msg = getMessagingInstance();
  
  if (!msg) {
    console.warn('⚠️ Firebase Messaging not available');
    return null;
  }

  try {
    const token = await getToken(msg, {
      vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
    });

    if (token) {
      console.log('✅ FCM Token:', token);
      
      // Send token to server for push notifications
      await sendTokenToServer(token);
      
      return token;
    }
  } catch (error) {
    console.error('❌ Failed to get FCM token:', error);
    return null;
  }
}
```

### Listen for Push Notifications:

```typescript
export function setupPushNotificationListener() {
  const msg = getMessagingInstance();
  
  if (!msg) return;

  // Handle messages received in foreground
  onMessage(msg, (payload) => {
    console.log('📨 Message received:', payload);

    const { title, body, icon } = payload.notification;

    // Show in-app notification
    showNotification(title, body, icon);

    // Also send system notification
    sendLocalNotification(title, body);
  });
}

function showNotification(title, body, icon) {
  // Use your notification UI component
  toast.success({
    title,
    description: body,
  });
}
```

### Service Worker Setup:

**File: `public/firebase-messaging-sw.js`**

```javascript
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'notification',
    requireInteraction: true,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

### Capacitor Push Notifications:

```typescript
import { PushNotifications } from '@capacitor/push-notifications';

export async function setupPushNotifications() {
  try {
    // Request permission
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('⚠️ Push notification permission denied');
      return;
    }

    // Register with Firebase
    await PushNotifications.register();

    // Listen for token
    PushNotifications.addListener('registration', (token) => {
      console.log('✅ Capacitor push token:', token.value);
      sendTokenToServer(token.value);
    });

    // Listen for notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📨 Notification received:', notification);
      showLocalNotification(notification.title, notification.body);
    });

    // Handle notification tap
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('👆 Notification tapped:', action);
      handleNotificationTap(action.notification.data);
    });

  } catch (error) {
    console.error('❌ Push notification setup failed:', error);
  }
}
```

---

## 📋 Firebase Features Available

### Push Notifications:
✅ Send targeted messages to users  
✅ Schedule notifications  
✅ Track delivery and engagement  
✅ A/B testing for messages  

### Cloud Messaging:
✅ Real-time message delivery  
✅ Offline message queuing  
✅ Message analytics  
✅ Deep linking to app features  

### Remote Config:
❌ Not configured (Optional feature)

### Firebase Crashlytics:
❌ Not configured (Optional feature)

### Firebase Analytics:
❌ Not configured (Optional feature)

---

## 🎯 Firebase Configuration Scenarios

### Scenario 1: Firebase NOT Configured
```
- App works normally for chat functionality
- Push notifications are disabled
- Use local/system notifications only
- Server can still send WebSocket notifications
```

### Scenario 2: Firebase Configured
```
- Push notifications enabled
- Background message handling
- Token-based targeting
- Analytics tracking possible
- Deep linking works
```

---

## 📸 Complete Media Flow Example

```typescript
// User takes a photo and sends it
async function sendPhotoMessage(contactId) {
  try {
    // 1. Take photo
    const photo = await takePhoto();
    
    // 2. Compress if needed
    const compressed = await compressImage(photo.base64, 0.8);
    
    // 3. Create message object
    const message = {
      id: generateId(),
      from: currentUser.id,
      to: contactId,
      type: 'media',
      mediaType: 'image',
      mediaUri: photo.uri,
      mediaBase64: compressed,
      caption: '',
      timestamp: Date.now(),
      status: 'sending'
    };
    
    // 4. Save to IndexedDB
    await saveMessage(message);
    
    // 5. Send via WebSocket
    sendWebSocketMessage({
      type: 'message',
      data: message
    });
    
    // 6. Update UI
    setMessages([...messages, message]);
    
    // 7. On server acknowledgment
    message.status = 'sent';
    await updateMessage(message);
    
  } catch (error) {
    message.status = 'failed';
    showErrorNotification('Failed to send photo');
  }
}

// Receiving a photo message
function handleReceivedPhoto(message) {
  // 1. Save media metadata
  saveMediaMetadata({
    id: message.id,
    uri: message.mediaUri,
    type: 'image',
  });
  
  // 2. Show thumbnail in chat
  displayMessageInChat({
    ...message,
    displayUri: message.mediaUri
  });
  
  // 3. Optionally download full resolution
  // (can be triggered when user taps)
}
```

---

## ⚠️ Troubleshooting

### Issue: Firebase not initializing
```
Solution: Check environment variables are set in .env
Debug: console.log(import.meta.env.VITE_FIREBASE_API_KEY)
```

### Issue: Push notifications not received
```
Solution: 
1. Check Firebase Cloud Messaging is enabled
2. Verify service worker is loaded
3. Check device settings allow notifications
4. Review Firebase console logs
```

### Issue: Photos not saving
```
Solution:
1. Check permission READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE
2. Ensure app has storage quota
3. Check directory exists (/data/data/com.quidec.chat/files/)
```

### Issue: Media files too large
```
Solution:
1. Compress images before saving
2. Use video compression
3. Implement chunked uploads
4. Set size limits in UI
```

---

## 🚀 Optimization Tips

### Media Optimization:
1. **Image compression:** Use 80-85% quality
2. **Thumbnail generation:** Create 200x200px thumbnails
3. **Progressive loading:** Show thumbnail while loading full image
4. **Lazy loading:** Load media on demand, not all at once

### Firebase Optimization:
1. **Batch notifications:** Group messages into single notification
2. **Topic-based targeting:** Use topics for group chats
3. **Condition-based targeting:** Target specific user segments
4. **Message prioritization:** High priority for chats, low for analytics

### Storage Optimization:
1. **Archive old media:** Move to cloud storage after 6 months
2. **Cleanup cache:** Regular cleanup of temporary files
3. **Deduplicate:** Avoid storing duplicate photos
4. **Reference counting:** Delete only when no messages reference

---

*Media & Firebase Integration Guide v1.0*  
*Last Updated: May 6, 2026*
