/**
 * IndexedDB Pagination Service
 * Efficiently loads messages in pages to prevent memory bloat
 * 
 * Features:
 * - Cursor-based pagination (better than offset)
 * - Lazy loading as user scrolls
 * - Configurable page size
 * - Efficient sorting and filtering
 * - Auto-cleanup of old messages
 */

import logger from './logger';

export interface PaginationCursor {
  direction: 'forward' | 'backward';
  lastKey?: IDBValidKey;
  lastTimestamp?: number;
}

export interface PageResult<T> {
  items: T[];
  hasMore: boolean;
  cursor: PaginationCursor;
  pageNumber: number;
  pageSize: number;
}

class IndexedDBPaginator {
  private db: IDBDatabase | null = null;
  private pageSizeLimit = 100; // Max items per page
  private defaultPageSize = 50; // Default page size
  private maxMessages = 5000; // Max messages to keep in DB
  private storeName = 'messages';

  constructor() {
    this.initialize();
  }

  /**
   * Initialize IndexedDB connection
   */
  private async initialize(): Promise<void> {
    try {
      const request = indexedDB.open('quidec_messages', 1);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('conversationId', 'conversationId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('conversationTimestamp', ['conversationId', 'timestamp'], {
            unique: false,
          });
          logger.info('pagination', 'IndexedDB schema initialized');
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info('pagination', 'IndexedDB connected');
      };

      request.onerror = () => {
        logger.error('pagination', 'Failed to open IndexedDB');
      };
    } catch (err) {
      logger.error('pagination', `Initialization failed: ${err}`);
    }
  }

  /**
   * Load messages page (forward direction)
   */
  async loadPage(
    conversationId: string,
    pageNumber: number = 1,
    pageSize?: number
  ): Promise<PageResult<any>> {
    if (!this.db) {
      return { items: [], hasMore: false, cursor: { direction: 'forward' }, pageNumber, pageSize: 0 };
    }

    const size = Math.min(pageSize || this.defaultPageSize, this.pageSizeLimit);
    const offset = (pageNumber - 1) * size;

    try {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('conversationTimestamp');

      const range = IDBKeyRange.bound([conversationId, 0], [conversationId, Number.MAX_VALUE]);
      const countRequest = index.count(range);

      return new Promise((resolve) => {
        countRequest.onsuccess = () => {
          const totalCount = countRequest.result;
          const items: any[] = [];
          let skipped = 0;
          let lastKey: IDBValidKey | undefined;
          let lastTimestamp: number | undefined;

          const getAllRequest = index.openCursor(range, 'next');

          getAllRequest.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;

            if (!cursor) {
              const hasMore = offset + size < totalCount;
              resolve({
                items,
                hasMore,
                cursor: {
                  direction: 'forward',
                  lastKey,
                  lastTimestamp,
                },
                pageNumber,
                pageSize: size,
              });
              return;
            }

            if (skipped < offset) {
              skipped++;
              cursor.continue();
              return;
            }

            if (items.length < size) {
              items.push(cursor.value);
              lastKey = cursor.primaryKey;
              lastTimestamp = cursor.value.timestamp;
              cursor.continue();
            } else {
              const hasMore = true;
              resolve({
                items,
                hasMore,
                cursor: {
                  direction: 'forward',
                  lastKey,
                  lastTimestamp,
                },
                pageNumber,
                pageSize: size,
              });
            }
          };

          getAllRequest.onerror = () => {
            logger.error('pagination', 'Cursor navigation failed');
            resolve({
              items,
              hasMore: false,
              cursor: { direction: 'forward' },
              pageNumber,
              pageSize: size,
            });
          };
        };
      });
    } catch (err) {
      logger.error('pagination', `Load page failed: ${err}`);
      return { items: [], hasMore: false, cursor: { direction: 'forward' }, pageNumber, pageSize: size };
    }
  }

  /**
   * Load messages before cursor (for backwards pagination/infinite scroll)
   */
  async loadBefore(
    conversationId: string,
    beforeTimestamp: number,
    pageSize?: number
  ): Promise<PageResult<any>> {
    if (!this.db) {
      return { items: [], hasMore: false, cursor: { direction: 'backward' }, pageNumber: 0, pageSize: 0 };
    }

    const size = Math.min(pageSize || this.defaultPageSize, this.pageSizeLimit);

    try {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('conversationTimestamp');

      const range = IDBKeyRange.bound(
        [conversationId, 0],
        [conversationId, beforeTimestamp - 1]
      );

      const items: any[] = [];
      let lastKey: IDBValidKey | undefined;
      let lastTimestamp: number | undefined;

      return new Promise((resolve) => {
        const getAllRequest = index.openCursor(range, 'prev');

        getAllRequest.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest).result;

          if (!cursor || items.length >= size) {
            const hasMore = items.length >= size; // If we hit limit, there's more
            resolve({
              items: items.reverse(), // Reverse to maintain chronological order
              hasMore,
              cursor: {
                direction: 'backward',
                lastKey,
                lastTimestamp,
              },
              pageNumber: 0,
              pageSize: size,
            });
            return;
          }

          items.push(cursor.value);
          lastKey = cursor.primaryKey;
          lastTimestamp = cursor.value.timestamp;
          cursor.continue();
        };

        getAllRequest.onerror = () => {
          logger.error('pagination', 'Backward cursor navigation failed');
          resolve({
            items: items.reverse(),
            hasMore: false,
            cursor: { direction: 'backward' },
            pageNumber: 0,
            pageSize: size,
          });
        };
      });
    } catch (err) {
      logger.error('pagination', `Load before failed: ${err}`);
      return { items: [], hasMore: false, cursor: { direction: 'backward' }, pageNumber: 0, pageSize: size };
    }
  }

  /**
   * Get total message count for conversation
   */
  async getMessageCount(conversationId: string): Promise<number> {
    if (!this.db) return 0;

    try {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('conversationId');
      const range = IDBKeyRange.only(conversationId);

      return new Promise((resolve) => {
        const countRequest = index.count(range);
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => resolve(0);
      });
    } catch (err) {
      logger.error('pagination', `Get count failed: ${err}`);
      return 0;
    }
  }

  /**
   * Add messages to database
   */
  async addMessages(messages: any[]): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);

      messages.forEach((msg) => {
        store.put(msg);
      });

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });

      logger.debug('pagination', `Added ${messages.length} messages to database`);

      // Cleanup old messages
      await this.cleanupOldMessages();
    } catch (err) {
      logger.error('pagination', `Add messages failed: ${err}`);
    }
  }

  /**
   * Clear conversation messages
   */
  async clearConversation(conversationId: string): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const index = store.index('conversationId');
      const range = IDBKeyRange.only(conversationId);

      index.openCursor(range).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });

      logger.info('pagination', `Cleared conversation: ${conversationId}`);
    } catch (err) {
      logger.error('pagination', `Clear conversation failed: ${err}`);
    }
  }

  /**
   * Cleanup old messages when database exceeds max size
   */
  private async cleanupOldMessages(): Promise<void> {
    if (!this.db) return;

    try {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);

      const countRequest = store.count();
      countRequest.onsuccess = () => {
        if (countRequest.result > this.maxMessages) {
          const toDelete = countRequest.result - Math.floor(this.maxMessages * 0.9);
          const index = store.index('timestamp');
          let deleted = 0;

          index.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor && deleted < toDelete) {
              cursor.delete();
              deleted++;
              cursor.continue();
            }
          };

          logger.warn('pagination', `Cleaned up ${toDelete} old messages`);
        }
      };
    } catch (err) {
      logger.error('pagination', `Cleanup failed: ${err}`);
    }
  }

  /**
   * Get pagination stats
   */
  async getStats(): Promise<any> {
    if (!this.db) return { status: 'not_connected' };

    try {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);

      return new Promise((resolve) => {
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          resolve({
            totalMessages: countRequest.result,
            pageSizeDefault: this.defaultPageSize,
            pageSizeLimit: this.pageSizeLimit,
            maxMessages: this.maxMessages,
          });
        };
      });
    } catch (err) {
      logger.error('pagination', `Get stats failed: ${err}`);
      return { error: String(err) };
    }
  }
}

// Singleton instance
export const idbPaginator = new IndexedDBPaginator();
