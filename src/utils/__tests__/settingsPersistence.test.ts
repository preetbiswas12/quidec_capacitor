import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockGetDoc, mockSetDoc, mockServerTimestamp } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'server-ts'),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db?: any, ...segments: string[]) => segments),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: vi.fn(),
  serverTimestamp: mockServerTimestamp,
  Timestamp: { fromMillis: vi.fn((ms: number) => ({ toMillis: () => ms })) },
}));

import { Preferences } from '@capacitor/preferences';
import {
  initSettingsPersistence,
  saveSettingsToNative,
  syncSettingsToFirebase,
  updateSetting,
  getSetting,
  clearSettings,
  getOrCreateDeviceId,
  registerLinkedDevice,
  unregisterLinkedDevice,
  DEFAULT_SETTINGS,
} from '../settingsPersistence';

const mockPreferences = vi.mocked(Preferences);

function makeDocSnapshot(exists: boolean, data?: Record<string, any>) {
  return {
    exists: () => exists,
    data: () => data,
  };
}

describe('settingsPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue(undefined);
    mockPreferences.remove.mockResolvedValue(undefined);
    mockGetDoc.mockReset();
    mockSetDoc.mockReset();
    mockServerTimestamp.mockReturnValue('server-ts' as any);
  });

  describe('DEFAULT_SETTINGS', () => {
    it('has expected shape', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('notifications');
      expect(DEFAULT_SETTINGS).toHaveProperty('groupNotifications');
      expect(DEFAULT_SETTINGS).toHaveProperty('callNotifications');
      expect(DEFAULT_SETTINGS).toHaveProperty('readReceipts');
      expect(DEFAULT_SETTINGS).toHaveProperty('enterSendsMessage');
      expect(DEFAULT_SETTINGS).toHaveProperty('mediaAutoDownload');
      expect(DEFAULT_SETTINGS).toHaveProperty('theme');
      expect(DEFAULT_SETTINGS).toHaveProperty('fontSize');
      expect(DEFAULT_SETTINGS).toHaveProperty('linkedDevices');
      expect(Array.isArray(DEFAULT_SETTINGS.linkedDevices)).toBe(true);
    });

    it('has sensible defaults', () => {
      expect(DEFAULT_SETTINGS.notifications).toBe(true);
      expect(DEFAULT_SETTINGS.theme).toBe('dark');
      expect(DEFAULT_SETTINGS.fontSize).toBe('medium');
      expect(DEFAULT_SETTINGS.readReceipts).toBe(true);
    });
  });

  describe('initSettingsPersistence', () => {
    it('returns default settings when Preferences is empty and no remote', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));

      const result = await initSettingsPersistence('uid1');

      expect(result).toEqual({ ...DEFAULT_SETTINGS });
      expect(mockPreferences.set).toHaveBeenCalledTimes(1);
      expect(mockPreferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'quidec_app_settings',
          value: JSON.stringify(DEFAULT_SETTINGS),
        })
      );
    });

    it('loads existing settings from Preferences', async () => {
      const saved = { ...DEFAULT_SETTINGS, theme: 'light' as const };
      mockPreferences.get.mockResolvedValue({ value: JSON.stringify(saved) });
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));

      const result = await initSettingsPersistence('uid1');

      expect(result.theme).toBe('light');
    });

    it('merges with remote settings when remote is newer', async () => {
      const local = {
        ...DEFAULT_SETTINGS,
        theme: 'light' as const,
      };
      mockPreferences.get.mockResolvedValue({ value: JSON.stringify(local) });
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, {
          ...DEFAULT_SETTINGS,
          theme: 'dark',
          lastSyncedAt: { toMillis: () => 200 },
        })
      );

      const result = await initSettingsPersistence('uid1');

      expect(result.theme).toBe('dark');
    });

    it('keeps local settings when local is newer', async () => {
      const local = {
        ...DEFAULT_SETTINGS,
        theme: 'light' as const,
        lastSyncedAt: { toMillis: () => 300 } as any,
      };
      mockPreferences.get.mockResolvedValue({ value: JSON.stringify(local) });
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, {
          ...DEFAULT_SETTINGS,
          theme: 'dark',
          lastSyncedAt: { toMillis: () => 100 },
        })
      );

      const result = await initSettingsPersistence('uid1');

      expect(result.theme).toBe('light');
    });

    it('uses remote when local has no lastSyncedAt', async () => {
      const local = { ...DEFAULT_SETTINGS };
      delete (local as any).lastSyncedAt;
      mockPreferences.get.mockResolvedValue({ value: JSON.stringify(local) });
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, {
          ...DEFAULT_SETTINGS,
          theme: 'dark',
          lastSyncedAt: { toMillis: () => 100 },
        })
      );

      const result = await initSettingsPersistence('uid1');

      expect(result.theme).toBe('dark');
    });

    it('saves merged settings back to Preferences', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));

      await initSettingsPersistence('uid1');

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'quidec_app_settings',
        value: JSON.stringify(DEFAULT_SETTINGS),
      });
    });

    it('falls back to defaults on Preferences error', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs fail'));

      const result = await initSettingsPersistence('uid1');

      expect(result).toEqual({ ...DEFAULT_SETTINGS });
    });

    it('handles Firebase error gracefully and still saves defaults', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockGetDoc.mockRejectedValueOnce(new Error('firebase fail'));

      const result = await initSettingsPersistence('uid1');

      expect(result).toEqual({ ...DEFAULT_SETTINGS });
      expect(mockPreferences.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveSettingsToNative', () => {
    it('writes serialized settings to Preferences', async () => {
      const settings = { ...DEFAULT_SETTINGS, theme: 'light' as const };

      await saveSettingsToNative(settings);

      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'quidec_app_settings',
        value: JSON.stringify(settings),
      });
    });

    it('handles error gracefully', async () => {
      mockPreferences.set.mockRejectedValueOnce(new Error('write fail'));

      await expect(saveSettingsToNative(DEFAULT_SETTINGS)).resolves.toBeUndefined();
    });
  });

  describe('syncSettingsToFirebase', () => {
    it('calls setDoc with settings and serverTimestamp', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);

      await syncSettingsToFirebase('uid1', DEFAULT_SETTINGS);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ...DEFAULT_SETTINGS,
          lastSyncedAt: 'server-ts',
        }),
        { merge: true }
      );
    });

    it('handles error gracefully', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('firebase fail'));

      await expect(syncSettingsToFirebase('uid1', DEFAULT_SETTINGS)).resolves.toBeUndefined();
    });
  });

  describe('updateSetting', () => {
    it('updates Preferences and fires Firebase sync', async () => {
      mockPreferences.get.mockResolvedValue({
        value: JSON.stringify(DEFAULT_SETTINGS),
      });
      mockPreferences.set.mockResolvedValue(undefined);
      mockSetDoc.mockResolvedValue(undefined);

      await updateSetting('uid1', 'theme', 'light');

      expect(mockPreferences.set).toHaveBeenCalledTimes(1);
      const savedValue = JSON.parse(mockPreferences.set.mock.calls[0][0].value);
      expect(savedValue.theme).toBe('light');
      expect(savedValue.lastSyncedAt).toBeDefined();

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    it('defaults to DEFAULT_SETTINGS when Preferences is empty', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue(undefined);

      await updateSetting('uid1', 'notifications', false);

      const savedValue = JSON.parse(mockPreferences.set.mock.calls[0][0].value);
      expect(savedValue.notifications).toBe(false);
      expect(savedValue.theme).toBe(DEFAULT_SETTINGS.theme);
    });

    it('handles Preferences error gracefully', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs fail'));

      await expect(updateSetting('uid1', 'theme', 'light')).resolves.toBeUndefined();
    });
  });

  describe('getSetting', () => {
    it('returns value from Preferences', async () => {
      const saved = { ...DEFAULT_SETTINGS, theme: 'light' };
      mockPreferences.get.mockResolvedValue({ value: JSON.stringify(saved) });

      const result = await getSetting('theme');

      expect(result).toBe('light');
    });

    it('returns default when Preferences is empty', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });

      const result = await getSetting('theme');

      expect(result).toBe(DEFAULT_SETTINGS.theme);
    });

    it('returns default when key is missing from saved settings', async () => {
      const saved = { notifications: true };
      mockPreferences.get.mockResolvedValue({ value: JSON.stringify(saved) });

      const result = await getSetting('theme');

      expect(result).toBe(DEFAULT_SETTINGS.theme);
    });

    it('handles error gracefully and returns default', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('read fail'));

      const result = await getSetting('theme');

      expect(result).toBe(DEFAULT_SETTINGS.theme);
    });
  });

  describe('clearSettings', () => {
    it('removes settings from Preferences', async () => {
      await clearSettings();

      expect(mockPreferences.remove).toHaveBeenCalledWith({
        key: 'quidec_app_settings',
      });
    });

    it('handles error gracefully', async () => {
      mockPreferences.remove.mockRejectedValueOnce(new Error('remove fail'));

      await expect(clearSettings()).resolves.toBeUndefined();
    });
  });

  describe('getOrCreateDeviceId', () => {
    it('returns existing device ID', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'existing-device-id' });

      const result = await getOrCreateDeviceId();

      expect(result).toBe('existing-device-id');
      expect(mockPreferences.set).not.toHaveBeenCalled();
    });

    it('creates and persists a new device ID when none exists', async () => {
      mockPreferences.get.mockResolvedValue({ value: null });
      mockPreferences.set.mockResolvedValue(undefined);

      const result = await getOrCreateDeviceId();

      expect(result).toMatch(/^device_\d+_[a-z0-9]+$/);
      expect(mockPreferences.set).toHaveBeenCalledTimes(1);
      expect(mockPreferences.set).toHaveBeenCalledWith({
        key: 'quidec_device_id',
        value: result,
      });
    });

    it('handles error gracefully and returns fallback ID', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs fail'));

      const result = await getOrCreateDeviceId();

      expect(result).toMatch(/^device_\d+$/);
    });
  });

  describe('registerLinkedDevice', () => {
    it('creates device doc in Firebase', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'dev-123' });
      mockSetDoc.mockResolvedValueOnce(undefined);

      const result = await registerLinkedDevice('uid1', 'My Phone', 'mobile');

      expect(result.id).toBe('dev-123');
      expect(result.name).toBe('My Phone');
      expect(result.type).toBe('mobile');
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'dev-123',
          name: 'My Phone',
          type: 'mobile',
          lastActive: 'server-ts',
        })
      );
    });

    it('defaults to mobile device type', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'dev-456' });
      mockSetDoc.mockResolvedValueOnce(undefined);

      const result = await registerLinkedDevice('uid1', 'My Device');

      expect(result.type).toBe('mobile');
    });

    it('throws on error', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs fail'));

      await expect(registerLinkedDevice('uid1', 'Phone')).resolves.toBeDefined();
    });

    it('throws when Firebase write fails', async () => {
      mockPreferences.get.mockResolvedValue({ value: 'dev-789' });
      mockSetDoc.mockRejectedValueOnce(new Error('firebase fail'));

      await expect(registerLinkedDevice('uid1', 'Phone')).rejects.toThrow('firebase fail');
    });
  });

  describe('unregisterLinkedDevice', () => {
    it('marks device as inactive in Firebase', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);

      await unregisterLinkedDevice('uid1', 'dev-123');

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        { active: false },
        { merge: true }
      );
    });

    it('handles error gracefully', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('firebase fail'));

      await expect(unregisterLinkedDevice('uid1', 'dev-123')).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('initSettingsPersistence handles Preferences.get failure', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs error'));

      const result = await initSettingsPersistence('uid1');

      expect(result).toEqual({ ...DEFAULT_SETTINGS });
    });

    it('updateSetting handles Preferences.get failure', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs error'));

      await expect(updateSetting('uid1', 'theme', 'light')).resolves.toBeUndefined();
    });

    it('getSetting handles parse error', async () => {
      mockPreferences.get.mockResolvedValue({ value: '{invalid json' });

      const result = await getSetting('theme');

      expect(result).toBe(DEFAULT_SETTINGS.theme);
    });

    it('clearSettings handles remove failure', async () => {
      mockPreferences.remove.mockRejectedValueOnce(new Error('remove error'));

      await expect(clearSettings()).resolves.toBeUndefined();
    });

    it('getOrCreateDeviceId handles Preferences.get failure', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs error'));

      const result = await getOrCreateDeviceId();

      expect(result).toMatch(/^device_\d+$/);
    });

    it('registerLinkedDevice propagates getOrCreateDeviceId errors', async () => {
      mockPreferences.get.mockRejectedValueOnce(new Error('prefs error'));

      await expect(registerLinkedDevice('uid1', 'Phone')).resolves.toBeDefined();
    });

    it('unregisterLinkedDevice handles Firebase error', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('firebase error'));

      await expect(unregisterLinkedDevice('uid1', 'dev-1')).resolves.toBeUndefined();
    });
  });
});
