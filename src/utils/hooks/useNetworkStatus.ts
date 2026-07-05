import { useState, useEffect, useCallback } from 'react';
import logger from '../logger';

export interface NetworkStatus {
  isOnline: boolean;
  isSlow: boolean;
  lastOnline: number | null;
  lastOffline: number | null;
  connectionType: string | null;
}

interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

function getConnection(): ConnectionInfo | null {
  const nav = navigator as unknown as Record<string, unknown>;
  return (nav.connection as ConnectionInfo) ||
    (nav.mozConnection as ConnectionInfo) ||
    (nav.webkitConnection as ConnectionInfo) ||
    null;
}

/**
 * Hook that tracks online/offline status and connection quality.
 * Uses navigator.onLine + online/offline events + Network Information API (if available).
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSlow: false,
    lastOnline: navigator.onLine ? Date.now() : null,
    lastOffline: navigator.onLine ? null : Date.now(),
    connectionType: null,
  });

  const updateConnectionInfo = useCallback(() => {
    const conn = getConnection();
    if (!conn) return;

    const isSlow = conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
    const connectionType = conn.effectiveType || conn.type || null;

    setStatus(prev => ({ ...prev, isSlow, connectionType }));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      const now = Date.now();
      logger.info('networkStatus', 'Network online');
      setStatus(prev => ({
        ...prev,
        isOnline: true,
        lastOnline: now,
        lastOffline: prev.lastOffline && prev.lastOnline === prev.lastOffline ? null : prev.lastOffline,
      }));
      updateConnectionInfo();
    };

    const handleOffline = () => {
      const now = Date.now();
      logger.warn('networkStatus', 'Network offline');
      setStatus(prev => ({
        ...prev,
        isOnline: false,
        lastOffline: now,
        lastOnline: prev.lastOnline && prev.lastOffline === prev.lastOnline ? null : prev.lastOnline,
      }));
    };

    const handleConnectionChange = () => {
      updateConnectionInfo();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    updateConnectionInfo();

    const conn = getConnection();
    if (conn) {
      (conn as EventTarget).addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (conn) {
        (conn as EventTarget).removeEventListener('change', handleConnectionChange);
      }
    };
  }, [updateConnectionInfo]);

  return status;
}
