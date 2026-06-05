/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    WEBSOCKET MANAGER — COMMENTED OUT                     ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║ This module is NOT used anywhere in the application.                     ║
 * ║                                                                         ║
 * ║ The app uses Firebase Realtime Database (RTDB) for all real-time        ║
 * ║ features instead:                                                       ║
 * ║   - Messaging        → RTDB transient pipe (delivery/ node)             ║
 * ║   - Presence         → RTDB presence/ node                              ║
 * ║   - Typing           → RTDB typing/ node                                ║
 * ║   - Call signaling   → RTDB signaling/ node + Firestore calls/          ║
 * ║   - Push notifications → Firebase Cloud Messaging (FCM)                 ║
 * ║                                                                         ║
 * ║ The original implementation connected to a placeholder URL              ║
 * ║ (wss://octate-wee.example.com/ws) and was never integrated.             ║
 * ║                                                                         ║
 * ║ If you need a WebSocket relay in the future, consider:                  ║
 * ║   1. Cloudflare Workers (free tier, 100K req/day)                       ║
 * ║   2. Firebase Cloud Functions (requires Blaze plan)                      ║
 * ║                                                                         ║
 * ║ To re-enable: uncomment the code below and update the URL.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╣
 */

/* —————————————————————————————————————————————————————————————————————————
   ORIGINAL IMPLEMENTATION (inactive)
   —————————————————————————————————————————————————————————————————————————

import logger from './logger';

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://octate-wee.example.com/ws';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 60000;
  private messageQueue: any[] = [];
  private isConnecting = false;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private authToken?: string;

  connect(token?: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      if (this.isConnecting) {
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
        this.authToken = token;
      }

      try {
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          logger.info('WebSocket', 'Connected to message server');
          if (this.authToken) {
            this.sendAuthMessage(this.authToken);
          }
          this.isConnecting = false;
          this.reconnectAttempts = 0;
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

  private attemptReconnect(token?: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('WebSocket', `Max reconnection attempts (${this.maxReconnectAttempts}) reached.`);
      return;
    }
    this.reconnectAttempts++;
    const exponentialDelay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000;
    const totalDelay = exponentialDelay + jitter;
    logger.info('WebSocket', `Reconnecting in ${Math.round(totalDelay)}ms`);
    setTimeout(() => { this.connect(token); }, totalDelay);
  }

  private handleMessage(data: any) {
    const { type } = data;
    const callbacks = this.listeners.get(type);
    if (callbacks) callbacks.forEach(cb => cb(data));
    const allCallbacks = this.listeners.get('all');
    if (allCallbacks) allCallbacks.forEach(cb => cb(data));
  }

  on(type: string, callback: (data: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
    return () => { this.listeners.get(type)?.delete(callback); };
  }

  send(type: string, payload: any): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.messageQueue.push({ type, payload });
      return false;
    }
    try {
      this.ws.send(JSON.stringify({ type, ...payload, timestamp: new Date().toISOString() }));
      return true;
    } catch (err) {
      this.messageQueue.push({ type, payload });
      return false;
    }
  }

  sendEncryptedMessage(recipient: string, encryptedContent: string, messageId: string, messageType: string = 'text', mediaUrl: string | null = null): boolean {
    return this.send('message', { to: recipient, encrypted: encryptedContent, messageId, messageType, mediaUrl });
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const { type, payload } = this.messageQueue.shift();
      this.send(type, payload);
    }
  }

  private sendAuthMessage(token: string) {
    try {
      this.ws?.send(JSON.stringify({ type: 'auth', token, timestamp: Date.now() }));
    } catch (err) { logger.error('WebSocket', 'Failed to send auth', err); }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.messageQueue = [];
    this.authToken = undefined;
  }
}

export const wsManager = new WebSocketManager();
export default wsManager;

*/
