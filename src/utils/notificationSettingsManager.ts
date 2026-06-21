/**
 * Android Notification Settings Manager
 * Manages notification channels, sounds, vibration, and LED for Android
 * Uses Capacitor LocalNotifications plugin to configure native Android notifications
 */

import { LocalNotifications } from '@capacitor/local-notifications';

export interface NotificationChannelConfig {
  id: string;
  name: string;
  importance: 'min' | 'low' | 'default' | 'high' | 'max';
  sound?: string;
  vibration: boolean;
  lightColor?: string;
  bypassDnd?: boolean;
}

/**
 * Initialize Android notification channels
 * Call this on app startup
 */
export async function initializeNotificationChannels(): Promise<void> {
  try {
    // Check if running on native Android
    if (!(window as any).Capacitor?.isNativePlatform?.()) {
      console.log('🌐 Web platform - skipping native notification channels');
      return;
    }

    await createNotificationChannels();
    console.log('✅ Android notification channels initialized');
  } catch (error) {
    console.error('❌ Failed to initialize notification channels:', error);
  }
}

/**
 * Create all required notification channels for Android
 * Notification channels are only supported on Android 8+ (API 26+).
 * Each channel is created independently so one failure doesn't break the others.
 */
async function createNotificationChannels(): Promise<void> {
  const channels: NotificationChannelConfig[] = [
    {
      id: 'messages',
      name: 'Messages',
      importance: 'high',
      sound: 'default',
      vibration: true,
      lightColor: '#4d91fb',
    },
    {
      id: 'group_messages',
      name: 'Group Messages',
      importance: 'default',
      sound: 'default',
      vibration: true,
      lightColor: '#4d91fb',
    },
    {
      id: 'calls',
      name: 'Calls',
      importance: 'max',
      sound: 'default',
      vibration: true,
      lightColor: '#FF5722',
      bypassDnd: true,
    },
    {
      id: 'friend_requests',
      name: 'Friend Requests',
      importance: 'default',
      sound: 'default',
      vibration: false,
      lightColor: '#2196F3',
    },
    {
      id: 'system',
      name: 'System',
      importance: 'low',
      vibration: false,
      lightColor: '#757575',
    },
  ];

  // Notification channels are only available on Android 8+ (API 26+)
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    const apiLevel = (info as any).androidSDKVersion || 0;
    if (apiLevel > 0 && apiLevel < 26) {
      console.log(`📱 Android API ${apiLevel} (< 26): notification channels not supported, skipping`);
      return;
    }
  } catch {
    // If we can't detect API level, proceed anyway
  }

  if (!LocalNotifications.createChannel) {
    console.log('ℹ️ LocalNotifications.createChannel not available, skipping channel creation');
    return;
  }

  let created = 0;
  for (const channel of channels) {
    try {
      await LocalNotifications.createChannel({
        id: channel.id,
        name: channel.name,
        importance: getChannelImportance(channel.importance),
        sound: channel.sound,
        vibration: channel.vibration,
        lightColor: channel.lightColor,
        bypassDnd: channel.bypassDnd || false,
      } as any);
      created++;
    } catch (err) {
      console.warn(`⚠️ Failed to create notification channel "${channel.id}":`, err);
    }
  }
  console.log(`✅ Created ${created}/${channels.length} notification channels`);
}

/**
 * Convert importance string to Android NotificationManager importance value
 */
function getChannelImportance(importance: string): number {
  const importanceMap: Record<string, number> = {
    min: 1,        // IMPORTANCE_MIN
    low: 2,        // IMPORTANCE_LOW
    default: 3,    // IMPORTANCE_DEFAULT
    high: 4,       // IMPORTANCE_HIGH
    max: 5,        // IMPORTANCE_MAX
  };
  return importanceMap[importance] || 3;
}

/**
 * Update notification channel settings
 */
export async function updateNotificationChannel(
  channelId: string,
  config: Partial<NotificationChannelConfig>
): Promise<void> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;

    if (LocalNotifications.createChannel) {
      await LocalNotifications.createChannel({
        id: channelId,
        name: config.name || channelId,
        importance: config.importance ? getChannelImportance(config.importance) : 3,
        sound: config.sound,
        vibration: config.vibration ?? true,
        lightColor: config.lightColor,
        bypassDnd: config.bypassDnd ?? false,
      } as any);
    }
  } catch (error) {
    console.error(`❌ Failed to update notification channel ${channelId}:`, error);
  }
}

/**
 * Enable/disable vibration for a notification channel
 */
export async function setChannelVibration(
  channelId: string,
  enabled: boolean
): Promise<void> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;

    await updateNotificationChannel(channelId, { vibration: enabled });
    console.log(`✅ Vibration ${enabled ? 'enabled' : 'disabled'} for channel: ${channelId}`);
  } catch (error) {
    console.error(`❌ Failed to set vibration for ${channelId}:`, error);
  }
}

/**
 * Trigger test vibration/haptic feedback
 */
export async function testVibration(): Promise<void> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) {
      console.log('🌐 Web platform - haptic feedback not available');
      return;
    }

    // On native Android, vibration is handled by notification channels
    // This is a placeholder for device vibration test
    console.log('📳 Haptic feedback would trigger on native device');
    
    // You can send a test notification to trigger the channel's vibration
    await sendTestNotification('system', 'Vibration Test', 'Check if you felt the vibration pattern');
  } catch (error) {
    console.warn('⚠️ Haptic test failed:', error);
  }
}

/**
 * Get notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) {
      // On web, check if notifications API is available
      if ('Notification' in window) {
        return Notification.permission as any;
      }
      return 'prompt';
    }

    const result = await LocalNotifications.checkPermissions();
    if (result.display === 'granted') return 'granted';
    if (result.display === 'denied') return 'denied';
    return 'prompt';
  } catch (error) {
    console.error('❌ Failed to check notification permissions:', error);
    return 'prompt';
  }
}

/**
 * Request notification permissions on Android
 * On Android 12 (API 32) and below, notifications are granted by default.
 * On Android 13+ (API 33+), POST_NOTIFICATIONS permission must be requested at runtime.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) {
      // On web, request Notification API permission
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return true;
    }

    // Check Android API level — POST_NOTIFICATIONS is only needed on API 33+
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    const apiLevel = (info as any).androidSDKVersion || 0;

    if (apiLevel > 0 && apiLevel < 33) {
      // Android 12 and below: notifications are granted by default
      console.log(`📱 Android API ${apiLevel} (< 33): notifications granted by default`);
      return true;
    }

    // Android 13+: need to request POST_NOTIFICATIONS at runtime
    const result = await LocalNotifications.requestPermissions();
    const granted = result.display === 'granted';
    console.log(`${granted ? '✅' : '❌'} Notification permission: ${result.display}`);
    return granted;
  } catch (error) {
    console.error('❌ Failed to request notification permissions:', error);
    return false;
  }
}

/**
 * Configure Do Not Disturb (DND) settings for high-priority notifications
 * These will bypass DND when enabled
 */
export async function configureDNDBypass(channelIds: string[]): Promise<void> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return;

    for (const channelId of channelIds) {
      await updateNotificationChannel(channelId, { bypassDnd: true });
    }
    console.log(`✅ Configured DND bypass for channels: ${channelIds.join(', ')}`);
  } catch (error) {
    console.error('❌ Failed to configure DND bypass:', error);
  }
}

/**
 * Reset notification channels to defaults
 */
export async function resetNotificationChannels(): Promise<void> {
  try {
    // Recreate all channels with default settings
    await initializeNotificationChannels();
    console.log('✅ Notification channels reset to defaults');
  } catch (error) {
    console.error('❌ Failed to reset notification channels:', error);
  }
}

/**
 * Test notification with specific channel
 */
export async function sendTestNotification(channelId: string, title: string = 'Test', body: string = 'This is a test notification'): Promise<void> {
  try {
    if (LocalNotifications.schedule) {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 10000),
            schedule: { at: new Date(Date.now() + 1000) }, // 1 second from now
            channelId,
            smallIcon: 'ic_stat_quidec_logo',
          },
        ],
      });
      console.log(`✅ Test notification scheduled for channel: ${channelId}`);
    }
  } catch (error) {
    console.error('❌ Failed to send test notification:', error);
  }
}
