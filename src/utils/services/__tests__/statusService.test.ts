import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
}));

const { mockSetDoc, mockUpdateDoc, mockDeleteDoc, mockGetDocs, mockWriteBatch, mockOnSnapshot, mockArrayUnion } = vi.hoisted(() => ({
  mockSetDoc: vi.fn().mockResolvedValue(undefined),
  mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
  mockDeleteDoc: vi.fn().mockResolvedValue(undefined),
  mockGetDocs: vi.fn(),
  mockWriteBatch: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockArrayUnion: vi.fn((val: any) => ({ type: 'arrayUnion', value: val })),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'collectionRef'),
  doc: vi.fn((_db: any, ...parts: string[]) => ({ path: parts.join('/') })),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  arrayUnion: mockArrayUnion,
  query: vi.fn(() => 'queryRef'),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  getDocs: mockGetDocs,
  writeBatch: mockWriteBatch,
  deleteDoc: mockDeleteDoc,
  serverTimestamp: vi.fn(() => 'serverTimestamp'),
  Timestamp: {
    now: vi.fn(() => ({ seconds: Date.now() / 1000 })),
    fromMillis: vi.fn((ms: number) => ({ seconds: ms / 1000, millis: ms })),
  },
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
}));

vi.mock('../../validators', () => ({
  validateStatusContent: vi.fn((content: string) => content),
  statusLimiter: { checkLimit: vi.fn(() => true) },
}));

vi.mock('../shared', () => ({
  normalizeFirestoreTimestamp: vi.fn((v: any) => v),
}));

import { statusService } from '../statusService';
import { Timestamp } from 'firebase/firestore';
import { statusLimiter } from '../../validators';

describe('statusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue({ docs: [], empty: true, size: 0 });
    const mockBatch = { delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    mockWriteBatch.mockReturnValue(mockBatch);
  });

  describe('createStatus', () => {
    it('creates a doc with correct fields', async () => {
      const result = await statusService.createStatus('uid1', 'Hello');

      expect(result.success).toBe(true);
      expect(result.statusId).toMatch(/^status_\d+_[a-z0-9]+$/);
      expect(mockSetDoc).toHaveBeenCalledOnce();

      const [ref, data] = mockSetDoc.mock.calls[0];
      expect(ref.path).toBe('users/uid1/statuses/' + data.statusId);
      expect(data.uid).toBe('uid1');
      expect(data.content).toBe('Hello');
      expect(data.type).toBe('text');
      expect(data.backgroundColor).toBe('#4D91FB');
      expect(data.viewedBy).toEqual([]);
      expect(data.expiresAt).toBeDefined();
    });

    it('passes mediaUrl for image type', async () => {
      await statusService.createStatus('uid1', 'https://img.jpg', 'image', '#FF0000', 'https://img.jpg');

      const [, data] = mockSetDoc.mock.calls[0];
      expect(data.type).toBe('image');
      expect(data.mediaUrl).toBe('https://img.jpg');
      expect(data.backgroundColor).toBe('#FF0000');
    });

    it('does not set mediaUrl for text type', async () => {
      await statusService.createStatus('uid1', 'text status', 'text');

      const [, data] = mockSetDoc.mock.calls[0];
      expect(data.mediaUrl).toBeUndefined();
    });

    it('sets expiresAt ~24h from now', async () => {
      const before = Date.now() + 24 * 60 * 60 * 1000 - 5000;
      const after = Date.now() + 24 * 60 * 60 * 1000 + 5000;

      await statusService.createStatus('uid1', 'test');

      expect((Timestamp.fromMillis as any)).toHaveBeenCalled();
      const callMs = (Timestamp.fromMillis as any).mock.calls[0][0];
      expect(callMs).toBeGreaterThanOrEqual(before);
      expect(callMs).toBeLessThanOrEqual(after);
    });

    it('throws when rate limiter rejects', async () => {
      (statusLimiter.checkLimit as any).mockReturnValueOnce(false);

      await expect(statusService.createStatus('uid1', 'spam')).rejects.toThrow(
        'Too many statuses posted',
      );
      expect(mockSetDoc).not.toHaveBeenCalled();
    });
  });

  describe('getUserStatuses', () => {
    it('returns mapped status list', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          { id: 's1', data: () => ({ content: 'hi', uid: 'uid1' }) },
          { id: 's2', data: () => ({ content: 'yo', uid: 'uid1' }) },
        ],
        empty: false,
        size: 2,
      });

      const statuses = await statusService.getUserStatuses('uid1');
      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toEqual({ id: 's1', content: 'hi', uid: 'uid1' });
      expect(statuses[1]).toEqual({ id: 's2', content: 'yo', uid: 'uid1' });
    });

    it('returns empty array when no statuses', async () => {
      mockGetDocs.mockResolvedValue({ docs: [], empty: true, size: 0 });

      const statuses = await statusService.getUserStatuses('uid1');
      expect(statuses).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockGetDocs.mockRejectedValue(new Error('Firestore down'));

      const statuses = await statusService.getUserStatuses('uid1');
      expect(statuses).toEqual([]);
    });
  });

  describe('markStatusViewed', () => {
    it('calls updateDoc with arrayUnion', async () => {
      await statusService.markStatusViewed('owner1', 's1', 'viewer1');

      expect(mockUpdateDoc).toHaveBeenCalledOnce();
      const [ref, data] = mockUpdateDoc.mock.calls[0];
      expect(ref.path).toBe('users/owner1/statuses/s1');
      expect(mockArrayUnion).toHaveBeenCalledWith('viewer1');
      expect(data.viewedBy).toEqual({ type: 'arrayUnion', value: 'viewer1' });
    });

    it('silently handles errors', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));

      await expect(
        statusService.markStatusViewed('owner1', 's1', 'viewer1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteStatus', () => {
    it('calls deleteDoc with correct path', async () => {
      await statusService.deleteStatus('uid1', 's1');

      expect(mockDeleteDoc).toHaveBeenCalledOnce();
      const [ref] = mockDeleteDoc.mock.calls[0];
      expect(ref.path).toBe('users/uid1/statuses/s1');
    });

    it('silently handles errors', async () => {
      mockDeleteDoc.mockRejectedValueOnce(new Error('not found'));

      await expect(statusService.deleteStatus('uid1', 's1')).resolves.toBeUndefined();
    });
  });

  describe('deleteExpiredStatuses', () => {
    it('batch deletes expired statuses', async () => {
      const mockBatchDelete = vi.fn();
      const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
      mockWriteBatch.mockReturnValue({ delete: mockBatchDelete, commit: mockBatchCommit });

      mockGetDocs.mockResolvedValue({
        docs: [
          { id: 'exp1', ref: { path: 'users/uid1/statuses/exp1' } },
          { id: 'exp2', ref: { path: 'users/uid1/statuses/exp2' } },
        ],
        empty: false,
        size: 2,
      });

      await statusService.deleteExpiredStatuses('uid1');

      expect(mockBatchDelete).toHaveBeenCalledTimes(2);
      expect(mockBatchCommit).toHaveBeenCalledOnce();
    });

    it('does nothing when no expired statuses', async () => {
      mockGetDocs.mockResolvedValue({ docs: [], empty: true, size: 0 });

      await statusService.deleteExpiredStatuses('uid1');

      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('silently handles errors', async () => {
      mockGetDocs.mockRejectedValueOnce(new Error('query failed'));

      await expect(statusService.deleteExpiredStatuses('uid1')).resolves.toBeUndefined();
    });
  });
});
