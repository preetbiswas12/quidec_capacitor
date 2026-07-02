import Peer, { DataConnection, MediaConnection } from 'peerjs';
import logger from './logger';
import { getICEServers } from './iceServers';

interface PeerServiceConfig {
  userId: string;       // Custom handle (e.g. "preet.5815") — used for display
  peerId?: string;      // Firebase Auth UID — used as PeerJS cloud ID for global uniqueness
  debug?: boolean;
}

interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export class PeerServiceImpl {
  private peer: Peer | null = null;
  private currentCall: MediaConnection | null = null;
  private currentDataConnection: DataConnection | null = null;
  private userId: string = '';
  private debug: boolean = false;

  private log(message: string, data?: any) {
    if (this.debug) {
      logger.debug('PeerService', message, data);
    }
  }

  private error(message: string, err?: any) {
    logger.error('PeerService', message, err);
  }

  /**
   * Initialize PeerJS with forced TURN relay for long-distance connections
   * Lazy-loaded only when call starts or is accepted
   */
  async initialize(config: PeerServiceConfig): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.userId = config.userId;
        this.debug = config.debug || false;

        // Use Firebase Auth UID as PeerJS cloud ID for global uniqueness.
        // Falls back to userId (custom handle) if peerId not provided.
        const peerJsId = config.peerId || config.userId;
        this.log(`Initializing PeerJS for user: ${this.userId} (peerId: ${peerJsId})`);

        // ─── ICE Servers ──────────────────────────────────────────────────────────
        // STUN for direct connections, TURN (optional) for NAT relay.
        const iceServers = getICEServers();

        // PeerCloud configuration (cloud.peerjs.com)
        const peerServerHost = import.meta.env.VITE_PEER_SERVER_HOST || 'cloud.peerjs.com';
        const peerServerPort = import.meta.env.VITE_PEER_SERVER_PORT ? parseInt(import.meta.env.VITE_PEER_SERVER_PORT) : 443;
        const peerServerSecure = import.meta.env.VITE_PEER_SERVER_SECURE !== 'false';
        const peerServerKey = import.meta.env.VITE_PEER_SERVER_KEY || 'peerjs';

        this.peer = new Peer(peerJsId, {
          host: peerServerHost,
          port: peerServerPort,
          path: '/',
          key: peerServerKey,
          secure: peerServerSecure,
          config: {
            // Use P2P first, fall back to TURN only when direct connection fails.
            // 'relay' forces all traffic through TURN which overloads free servers.
            // For 2-4 users, P2P will work in most cases.
            iceTransportPolicy: 'all',
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceServers,
          },
          debug: this.debug ? 3 : 0,
        });

        // Handle peer connection open
        this.peer.on('open', (id) => {
          this.log(`✅ PeerJS connected with ID: ${id}`);
          resolve(id);
        });

        // Handle peer connection errors
        this.peer.on('error', (err) => {
          this.error('PeerJS connection error', err);
          this.destroy();
          reject(new Error(`PeerJS Error: ${err.message}`));
        });

        // Handle disconnection
        this.peer.on('disconnected', () => {
          this.log('⚠️ PeerJS disconnected');
        });

        // Handle peer reconnection
        this.peer.on('close', () => {
          this.log('🔴 PeerJS connection closed');
          this.peer = null;
        });

        // Timeout if connection takes too long
        const timeout = setTimeout(() => {
          reject(new Error('PeerJS initialization timeout (30s)'));
          this.destroy();
        }, 30000);

        // Clear timeout on successful connection
        if (this.peer.open) {
          clearTimeout(timeout);
          resolve(this.userId);
        }
      } catch (err) {
        this.error('Failed to initialize PeerJS', err);
        reject(err);
      }
    });
  }

  /**
   * Initiate an outgoing call to a remote peer
   */
  async initiateCall(remotePeerId: string, localStream: MediaStream): Promise<MediaConnection> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.peer) {
          return reject(new Error('PeerJS not initialized'));
        }

        if (!localStream || localStream.getTracks().length === 0) {
          return reject(new Error('Local stream is empty or invalid'));
        }

        this.log(`📞 Initiating call to: ${remotePeerId}`);

        const call = this.peer.call(remotePeerId, localStream, {
          metadata: {
            userId: this.userId,
            timestamp: Date.now(),
          },
        });

        this.currentCall = call;

        // Handle call establishment
        call.on('stream', (remoteStream) => {
          this.log(`✅ Remote stream received from ${remotePeerId}`);
          resolve(call);
        });

        // Handle call errors
        call.on('error', (err) => {
          this.error('Call error', err);
          this.currentCall = null;
          reject(err);
        });

        // Handle call close
        call.on('close', () => {
          this.log(`📵 Call ended with ${remotePeerId}`);
          this.currentCall = null;
        });

        // Timeout if call doesn't establish within 60 seconds
        const timeout = setTimeout(() => {
          if (this.currentCall === call) {
            this.error('Call establishment timeout (60s)');
            call.close();
            this.currentCall = null;
            reject(new Error('Call timeout'));
          }
        }, 60000);

        // Clear timeout on stream received
        call.on('stream', () => clearTimeout(timeout));
      } catch (err) {
        this.error('Failed to initiate call', err);
        reject(err);
      }
    });
  }

  /**
   * Answer an incoming call
   */
  async answerCall(incomingCall: MediaConnection, localStream: MediaStream): Promise<void> {
    try {
      if (!localStream || localStream.getTracks().length === 0) {
        throw new Error('Local stream is empty or invalid');
      }

      this.log(`✅ Answering call from: ${incomingCall.peer}`);
      this.currentCall = incomingCall;

      incomingCall.answer(localStream);

      return new Promise((resolve, reject) => {
        incomingCall.on('stream', () => {
          this.log(`🎬 Remote stream received`);
          resolve();
        });

        incomingCall.on('error', (err) => {
          this.error('Answer call error', err);
          reject(err);
        });

        // Timeout after 60 seconds
        setTimeout(() => {
          if (this.currentCall === incomingCall && !incomingCall.open) {
            reject(new Error('Answer timeout'));
          }
        }, 60000);
      });
    } catch (err) {
      this.error('Failed to answer call', err);
      throw err;
    }
  }

  /**
   * Hang up the current call
   */
  async hangUp(): Promise<void> {
    try {
      this.log('📞 Hanging up call');

      if (this.currentCall) {
        this.currentCall.close();
        this.currentCall = null;
      }

      if (this.currentDataConnection) {
        this.currentDataConnection.close();
        this.currentDataConnection = null;
      }
    } catch (err) {
      this.error('Error during hangup', err);
    }
  }

  /**
   * Listen for incoming calls
   */
  onIncomingCall(callback: (call: MediaConnection, remoteStream: MediaStream) => void): () => void {
    if (!this.peer) {
      this.error('PeerJS not initialized');
      return () => {};
    }

    this.log('👂 Listening for incoming calls');

    const callHandler = (call: MediaConnection) => {
      this.log(`📱 Incoming call from: ${call.peer}`);
      callback(call, null as any); // Stream will be provided via 'stream' event on answer
    };

    this.peer.on('call', callHandler);

    // Return unsubscribe function
    return () => {
      this.peer?.removeListener('call', callHandler);
    };
  }

  /**
   * Get current call status
   */
  getCallStatus(): {
    isCallActive: boolean;
    remotePeerId: string | null;
    callStartTime: number | null;
  } {
    return {
      isCallActive: this.currentCall !== null && this.currentCall.open,
      remotePeerId: this.currentCall?.peer || null,
      callStartTime: (this.currentCall as any)?.metadata?.timestamp || null,
    };
  }

  /**
   * Get PeerJS instance (for advanced usage)
   */
  getInstance(): Peer | null {
    return this.peer;
  }

  /**
   * Get current active call
   */
  getCurrentCall(): MediaConnection | null {
    return this.currentCall;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    try {
      this.log('🧹 Cleaning up PeerService resources');

      if (this.currentCall) {
        this.currentCall.close();
        this.currentCall = null;
      }

      if (this.currentDataConnection) {
        this.currentDataConnection.close();
        this.currentDataConnection = null;
      }

      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }

      this.log('✅ PeerService cleanup complete');
    } catch (err) {
      this.error('Error during cleanup', err);
    }
  }

  /**
   * Check if PeerJS is initialized
   */
  isInitialized(): boolean {
    return this.peer !== null && this.peer.open;
  }
}

// Export singleton instance
export const peerService = new PeerServiceImpl();
export default peerService;
