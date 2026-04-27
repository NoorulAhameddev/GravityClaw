import WebSocket from 'ws';
import { createLogger } from '../logger.js';
import type { BridgeConfig, SessionInfo, SessionStatus } from './types.js';

const log = createLogger('bridge-client');

export interface BridgeClientConfig {
  url: string;
  authToken: string;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export class BridgeClient {
  private config: BridgeClientConfig;
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: BridgeClientConfig) {
    this.config = {
      reconnect: true,
      reconnectInterval: 5000,
      ...config,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.url}?token=${this.config.authToken}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.connected = true;
        log.info(`Connected to bridge at ${this.config.url}`);
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          this.handleResponse(response);
        } catch (error) {
          log.error(`Failed to parse message: ${error}`);
        }
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        log.info(`Disconnected from bridge: ${code} ${reason}`);
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        log.error(`Bridge connection error: ${error}`);
        if (!this.connected) {
          reject(error);
        }
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private handleResponse(response: { id: number; result?: unknown; error?: { code: number; message: string } }): void {
    const pending = this.pendingRequests.get(response.id);
    
    if (!pending) {
      log.warn(`Received response for unknown request: ${response.id}`);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`Bridge error ${response.error.code}: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  private scheduleReconnect(): void {
    if (!this.config.reconnect || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      log.info('Attempting to reconnect to bridge...');
      this.connect().catch((error) => {
        log.error(`Reconnection failed: ${error}`);
      });
    }, this.config.reconnectInterval);
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to bridge'));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }));

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async spawnSession(workDir?: string): Promise<{ sessionId: string }> {
    return this.sendRequest('session.spawn', { workDir }) as Promise<{ sessionId: string }>;
  }

  async stopSession(sessionId: string): Promise<{ success: boolean }> {
    return this.sendRequest('session.stop', { sessionId }) as Promise<{ success: boolean }>;
  }

  async getSessionStatus(sessionId: string): Promise<SessionInfo | null> {
    return this.sendRequest('session.status', { sessionId }) as Promise<SessionInfo | null>;
  }

  async listSessions(): Promise<SessionInfo[]> {
    return this.sendRequest('session.list') as Promise<SessionInfo[]>;
  }

  async sendToSession(sessionId: string, message: string): Promise<{ success: boolean; response?: string }> {
    return this.sendRequest('session.send', { sessionId, message }) as Promise<{ success: boolean; response?: string }>;
  }

  async ping(): Promise<{ pong: boolean }> {
    return this.sendRequest('ping') as Promise<{ pong: boolean }>;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      return new Promise((resolve) => {
        this.ws!.on('close', resolve);
        this.ws!.close();
      });
    }
  }
}

export function createBridgeClient(config: BridgeClientConfig): BridgeClient {
  return new BridgeClient(config);
}