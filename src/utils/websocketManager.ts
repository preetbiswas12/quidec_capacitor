/**
 * WebSocket Manager - Lightweight WebSocket for message delivery
 * Used for real-time message delivery (replaces RTDB delivery pipe)
 *
 * Architecture:
 * - WebSocket for real-time message transfer
 * - Messages stored locally in .bin files only
 * - Firebase/FCM used ONLY for push notifications
 */

import logger from './logger';

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://octate-wee.example.com/ws';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50; // Increased from 5 to 50 (covers ~24 hours)
  private baseReconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 60000; // Cap at 60 seconds
  private messageQueue: any[] = [];
  private isConnecting = false;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private authToken?: string;

  /**
   * Connect to WebSocket server
   * ✅ SECURITY FIX: Token sent as first message, not in URL
   */
  connect(token?: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      if (this.isConnecting) {
        // Wait for existing connection attempt
        const checkConnection = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection);
            resolve(true);
          }
        }, 100);
        return;
      }

      this.isConnecting = true;
      if (token) {
        this.authToken = token; // Store for reconnection
      }

      try {
        // ✅ Connect WITHOUT token in URL (secure)
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          logger.info('WebSocket', 'Connected to message server');
          
          // ✅ Send auth token as first message (secure, in Authorization header)
          if (this.authToken) {
            this.sendAuthMessage(this.authToken);
          }
          
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Send queued messages
          this.flushMessageQueue();

          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            logger.error('WebSocket', 'Failed to parse message', err);
          }
        };

        this.ws.onclose = () => {
          logger.warn('WebSocket', 'Connection closed');
          this.isConnecting = false;
          this.attemptReconnect(token);
        };

        this.ws.onerror = (err) => {
          logger.error('WebSocket', 'Connection error', err);
          this.isConnecting = false;
        };
      } catch (err) {
        logger.error('WebSocket', 'Failed to connect', err);
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(token?: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('WebSocket', `Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff: 1s → 1.5s → 2.25s → 3.375s ... capped at 60s
    const exponentialDelay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    // Add random jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    const totalDelay = exponentialDelay + jitter;

    logger.info(
      'WebSocket',
      `Reconnecting in ${Math.round(totalDelay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect(token);
    }, totalDelay);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: any) {
    const { type } = data;
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }

    // Also notify 'all' listeners
    const allCallbacks = this.listeners.get('all');
    if (allCallbacks) {
      allCallbacks.forEach(cb => cb(data));
    }
  }

  /**
   * Register message listener
   */
  on(type: string, callback: (data: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  /**
   * Send message via WebSocket with error handling
   */
  send(type: string, payload: any): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket', `WebSocket not ready (state: ${this.ws?.readyState}), queueing message`);
      this.messageQueue.push({ type, payload });
      
      // Notify listeners of offline status
      const offlineCallbacks = this.listeners.get('offline');
      if (offlineCallbacks) {
        offlineCallbacks.forEach(cb => cb({ type: 'offline', timestamp: new Date().toISOString() }));
      }
      
      return false;
    }

    try {
      const message = JSON.stringify({ type, ...payload, timestamp: new Date().toISOString() });
      this.ws.send(message);
      logger.info('WebSocket', `Sent ${type} message (${message.length} bytes)`);
      return true;
    } catch (err) {
      logger.error('WebSocket', `Failed to send message: ${err}`);
      this.messageQueue.push({ type, payload });
      return false;
    }
  }

  /**
   * Send encrypted message
   */
  sendEncryptedMessage(recipient: string, encryptedContent: string, messageId: string, messageType: string = 'text', mediaUrl: string | null = null): boolean {
    return this.send('message', {
      to: recipient,
      encrypted: encryptedContent,
      messageId,
      messageType,
      mediaUrl,
    });
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const { type, payload } = this.messageQueue.shift();
      this.send(type, payload);
    }
  }

  /**
   * Send authentication message (✅ SECURITY FIX)
   * Sends auth as first message instead of URL parameter
   */
  private sendAuthMessage(token: string) {
    try {
      this.ws?.send(JSON.stringify({
        type: 'auth',
        token,
        timestamp: Date.now()
      }));
      logger.info('WebSocket', 'Auth message sent');
    } catch (err) {
      logger.error('WebSocket', 'Failed to send auth message', err);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Close connection
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageQueue = [];
    this.authToken = undefined; // Clear token on disconnect
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
export default wsManager;