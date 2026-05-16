import Peer, { DataConnection, MediaConnection } from 'peerjs';

interface PeerServiceConfig {
  userId: string;
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
      console.log(`[PeerService] ${message}`, data || '');
    }
  }

  private error(message: string, err?: any) {
    console.error(`[PeerService] ❌ ${message}`, err || '');
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

        this.log(`Initializing PeerJS for user: ${this.userId}`);

        // ExpressTURN configuration - forced relay for 4k-5k km distances
        const iceServers: ICEServer[] = [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
            ],
          },
          {
            urls: [
              'turn:free.expressturn.com:3478',
              'turn:free.expressturn.com:3479?transport=tcp',
              'turns:free.expressturn.com:5349',
            ],
            username: '0000000020932600049',
            credential: 'K8KMvixuaPZkje9gjLJojFTM0+Y=',
          },
        ];

        // PeerJS configuration with strict TURN relay enforcement
        this.peer = new Peer(this.userId, {
          host: 'peerserver.example.com',
          port: 9000,
          path: '/peerjs',
          secure: false, // Set to true if using HTTPS
          config: {
            // CRITICAL: Force all ICE traffic through TURN relay
            // This is essential for users 4k-5k km apart on carrier NATs
            iceTransportPolicy: 'relay',
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
