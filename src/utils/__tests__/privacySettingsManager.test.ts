import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockGetDoc, mockSetDoc, mockUpdateDoc, mockServerTimestamp } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'server-ts'),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db?: any, ...segments: string[]) => ({ _path: segments.join('/') })),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  serverTimestamp: mockServerTimestamp,
}));

import {
  getPrivacySettings,
  updatePrivacySettings,
  getAccountSecuritySettings,
  updateAccountSecuritySettings,
  setBiometricAuth,
  addTrustedDevice,
  removeTrustedDevice,
  blockUser,
  unblockUser,
  getBlockList,
  isUserBlocked,
  setDisappearingMessages,
  setTypingIndicator,
  exportUserSettings,
  importUserSettings,
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_ACCOUNT_SECURITY_SETTINGS,
} from '../privacySettingsManager';

function makeDocSnapshot(exists: boolean, data?: Record<string, any>) {
  return {
    exists: () => exists,
    data: () => data,
  };
}

describe('privacySettingsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPrivacySettings', () => {
    it('returns merged data with defaults when doc exists', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { readReceipts: false })
      );

      const result = await getPrivacySettings('uid1');

      expect(result.readReceipts).toBe(false);
      expect(result.lastSeenVisibility).toBe(DEFAULT_PRIVACY_SETTINGS.lastSeenVisibility);
      expect(result.typingIndicator).toBe(DEFAULT_PRIVACY_SETTINGS.typingIndicator);
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('initializes defaults when doc does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));
      mockSetDoc.mockResolvedValueOnce(undefined);

      const result = await getPrivacySettings('uid1');

      expect(result).toEqual(DEFAULT_PRIVACY_SETTINGS);
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ createdAt: 'server-ts' })
      );
    });

    it('returns defaults on error', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      const result = await getPrivacySettings('uid1');

      expect(result).toEqual(DEFAULT_PRIVACY_SETTINGS);
    });
  });

  describe('updatePrivacySettings', () => {
    it('calls updateDoc with correct fields and updatedAt', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await updatePrivacySettings('uid1', { readReceipts: false });

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ readReceipts: false, updatedAt: 'server-ts' })
      );
    });

    it('throws on error', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(updatePrivacySettings('uid1', { readReceipts: false })).rejects.toThrow('fail');
    });
  });

  describe('getAccountSecuritySettings', () => {
    it('returns merged data with defaults when doc exists', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { biometricEnabled: true, sessionTimeout: 60000 })
      );

      const result = await getAccountSecuritySettings('uid1');

      expect(result.biometricEnabled).toBe(true);
      expect(result.sessionTimeout).toBe(60000);
      expect(result.trustedDevices).toEqual(DEFAULT_ACCOUNT_SECURITY_SETTINGS.trustedDevices);
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('initializes defaults when doc does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));
      mockSetDoc.mockResolvedValueOnce(undefined);

      const result = await getAccountSecuritySettings('uid1');

      expect(result).toEqual(DEFAULT_ACCOUNT_SECURITY_SETTINGS);
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });

    it('returns defaults on error', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      const result = await getAccountSecuritySettings('uid1');

      expect(result).toEqual(DEFAULT_ACCOUNT_SECURITY_SETTINGS);
    });
  });

  describe('updateAccountSecuritySettings', () => {
    it('calls updateDoc with correct fields and updatedAt', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await updateAccountSecuritySettings('uid1', { biometricEnabled: true });

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ biometricEnabled: true, updatedAt: 'server-ts' })
      );
    });

    it('throws on error', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(updateAccountSecuritySettings('uid1', { biometricEnabled: true })).rejects.toThrow('fail');
    });
  });

  describe('setBiometricAuth', () => {
    it('calls updateAccountSecuritySettings with biometricEnabled', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await setBiometricAuth('uid1', true);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ biometricEnabled: true })
      );
    });

    it('throws on error', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(setBiometricAuth('uid1', true)).rejects.toThrow('fail');
    });
  });

  describe('addTrustedDevice', () => {
    it('adds deviceId to existing trusted devices', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { trustedDevices: ['dev1'] })
      );
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await addTrustedDevice('uid1', 'dev2', 'Phone');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ trustedDevices: ['dev1', 'dev2'] })
      );
    });

    it('does not duplicate an existing device', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { trustedDevices: ['dev1'] })
      );

      await addTrustedDevice('uid1', 'dev1', 'Phone');

      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('creates trusted devices list when doc has no devices', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(true, {}));
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await addTrustedDevice('uid1', 'dev1', 'Phone');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ trustedDevices: ['dev1'] })
      );
    });

    it('swallows errors', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(addTrustedDevice('uid1', 'dev1', 'Phone')).resolves.toBeUndefined();
    });
  });

  describe('removeTrustedDevice', () => {
    it('removes deviceId from trusted devices', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { trustedDevices: ['dev1', 'dev2'] })
      );
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await removeTrustedDevice('uid1', 'dev1');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ trustedDevices: ['dev2'] })
      );
    });

    it('swallows errors', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(removeTrustedDevice('uid1', 'dev1')).resolves.toBeUndefined();
    });
  });

  describe('blockUser', () => {
    it('creates new blocklist when doc does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));
      mockSetDoc.mockResolvedValueOnce(undefined);

      await blockUser('uid1', 'blocked1');

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ users: ['blocked1'], updatedAt: 'server-ts' })
      );
    });

    it('adds to existing blocklist', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { users: ['existing1'] })
      );
      mockSetDoc.mockResolvedValueOnce(undefined);

      await blockUser('uid1', 'blocked1');

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ users: ['existing1', 'blocked1'] })
      );
    });

    it('does not duplicate already blocked user', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { users: ['blocked1'] })
      );

      await blockUser('uid1', 'blocked1');

      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('throws on error', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(blockUser('uid1', 'blocked1')).rejects.toThrow('fail');
    });
  });

  describe('unblockUser', () => {
    it('removes user from blocklist', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { users: ['blocked1', 'blocked2'] })
      );
      mockSetDoc.mockResolvedValueOnce(undefined);

      await unblockUser('uid1', 'blocked1');

      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ users: ['blocked2'] })
      );
    });

    it('does nothing when blocklist doc does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));

      await unblockUser('uid1', 'blocked1');

      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('swallows errors', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(unblockUser('uid1', 'blocked1')).resolves.toBeUndefined();
    });
  });

  describe('getBlockList', () => {
    it('returns users array from blocklist doc', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { users: ['a', 'b'] })
      );

      const result = await getBlockList('uid1');

      expect(result).toEqual(['a', 'b']);
    });

    it('returns empty array when doc does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));

      const result = await getBlockList('uid1');

      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('fail'));

      const result = await getBlockList('uid1');

      expect(result).toEqual([]);
    });
  });

  describe('isUserBlocked', () => {
    it('returns true when target is in blocklist', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { users: ['a', 'b'] })
      );

      const result = await isUserBlocked('uid1', 'a');

      expect(result).toBe(true);
    });

    it('returns false when target is not in blocklist', async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeDocSnapshot(true, { users: ['a'] })
      );

      const result = await isUserBlocked('uid1', 'b');

      expect(result).toBe(false);
    });

    it('returns false when blocklist does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce(makeDocSnapshot(false));

      const result = await isUserBlocked('uid1', 'a');

      expect(result).toBe(false);
    });
  });

  describe('setDisappearingMessages', () => {
    it('enables with default 24h timeout', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await setDisappearingMessages('uid1', true);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          disappearingMessages: true,
          defaultDisappearingTime: 24 * 60 * 60,
        })
      );
    });

    it('enables with custom timeout', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await setDisappearingMessages('uid1', true, 300);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          disappearingMessages: true,
          defaultDisappearingTime: 300,
        })
      );
    });

    it('disables and sets timeout to 0', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await setDisappearingMessages('uid1', false);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          disappearingMessages: false,
          defaultDisappearingTime: 0,
        })
      );
    });

    it('throws on error', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(setDisappearingMessages('uid1', true)).rejects.toThrow('fail');
    });
  });

  describe('setTypingIndicator', () => {
    it('updates typing indicator setting', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await setTypingIndicator('uid1', false);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ typingIndicator: false })
      );
    });

    it('swallows errors', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(setTypingIndicator('uid1', false)).resolves.toBeUndefined();
    });
  });

  describe('exportUserSettings', () => {
    it('returns privacy, security, blocklist, and exportedAt', async () => {
      mockGetDoc
        .mockResolvedValueOnce(makeDocSnapshot(true, { readReceipts: false }))
        .mockResolvedValueOnce(makeDocSnapshot(true, { biometricEnabled: true }))
        .mockResolvedValueOnce(makeDocSnapshot(true, { users: ['a'] }));
      mockUpdateDoc.mockResolvedValue(undefined);

      const result = await exportUserSettings('uid1');

      expect(result.privacy).toBeDefined();
      expect(result.privacy.readReceipts).toBe(false);
      expect(result.security).toBeDefined();
      expect(result.security.biometricEnabled).toBe(true);
      expect(result.blocklist).toEqual(['a']);
      expect(result.exportedAt).toBeDefined();
      expect(typeof result.exportedAt).toBe('string');
    });

    it('returns defaults when inner calls fail', async () => {
      mockGetDoc.mockRejectedValue(new Error('fail'));

      const result = await exportUserSettings('uid1');

      expect(result.privacy).toEqual(DEFAULT_PRIVACY_SETTINGS);
      expect(result.security).toEqual(DEFAULT_ACCOUNT_SECURITY_SETTINGS);
      expect(result.blocklist).toEqual([]);
      expect(result.exportedAt).toBeDefined();
    });
  });

  describe('importUserSettings', () => {
    it('imports privacy and security settings', async () => {
      mockUpdateDoc.mockResolvedValue(undefined);

      const backup = {
        privacy: { readReceipts: false },
        security: { biometricEnabled: true },
      };

      await importUserSettings('uid1', backup);

      expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
    });

    it('does nothing when backup has no privacy or security', async () => {
      await importUserSettings('uid1', {});

      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('throws on error', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(
        importUserSettings('uid1', { privacy: { readReceipts: false } })
      ).rejects.toThrow('fail');
    });
  });

  describe('constants', () => {
    it('DEFAULT_PRIVACY_SETTINGS has expected shape', () => {
      expect(DEFAULT_PRIVACY_SETTINGS).toHaveProperty('lastSeenVisibility');
      expect(DEFAULT_PRIVACY_SETTINGS).toHaveProperty('readReceipts');
      expect(DEFAULT_PRIVACY_SETTINGS).toHaveProperty('disappearingMessages');
      expect(DEFAULT_PRIVACY_SETTINGS).toHaveProperty('encryptionEnabled');
    });

    it('DEFAULT_ACCOUNT_SECURITY_SETTINGS has expected shape', () => {
      expect(DEFAULT_ACCOUNT_SECURITY_SETTINGS).toHaveProperty('biometricEnabled');
      expect(DEFAULT_ACCOUNT_SECURITY_SETTINGS).toHaveProperty('sessionTimeout');
      expect(DEFAULT_ACCOUNT_SECURITY_SETTINGS).toHaveProperty('trustedDevices');
      expect(Array.isArray(DEFAULT_ACCOUNT_SECURITY_SETTINGS.trustedDevices)).toBe(true);
    });
  });
});
