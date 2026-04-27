import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { createLogger } from '../logger.js';
import type { BridgeConfig, SessionHandle, SessionInfo, BridgeMessage, SessionStatus } from './types.js';

const log = createLogger('bridge');

export class BridgeServer {
  private config: BridgeConfig;
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, SessionHandle> = new Map();
  private connections: Map<string, Set<WebSocket>> = new Map();
  private requestId = 0;
  private pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host,
        });

        this.wss.on('listening', () => {
          log.info(`Bridge server listening on ${this.config.host}:${this.config.port}`);
          resolve();
        });

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
          this.handleConnection(ws, req);
        });

        this.wss.on('error', (error) => {
          log.error(`Bridge server error: ${error}`);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = req.url || '';
    const token = new URL(url, `http://${this.config.host}:${this.config.port}`).searchParams.get('token');

    if (token !== this.config.authToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const connectionId = randomUUID();
    log.info(`New bridge connection: ${connectionId}`);

    ws.on('message', (data: Buffer) => {
      try {
        const message: BridgeMessage = JSON.parse(data.toString());
        this.handleMessage(ws, connectionId, message);
      } catch (error) {
        log.error(`Failed to parse message: ${error}`);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          error: { code: -32700, message: 'Parse error' }
        }));
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(connectionId);
    });

    ws.on('error', (error) => {
      log.error(`Connection ${connectionId} error: ${error}`);
    });
  }

  private async handleMessage(ws: WebSocket, connectionId: string, message: BridgeMessage): Promise<void> {
    const { method, params, id } = message;

    try {
      let result: unknown;

      switch (method) {
        case 'session.spawn':
          result = await this.spawnSession(params as { workDir?: string });
          break;
        case 'session.stop':
          result = await this.stopSession(params as { sessionId: string });
          break;
        case 'session.status':
          result = this.getSessionStatus(params as { sessionId: string });
          break;
        case 'session.list':
          result = this.listSessions();
          break;
        case 'session.send':
          result = await this.sendToSession(params as { sessionId: string; message: string });
          break;
        case 'ping':
          result = { pong: true };
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }

      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result
      }));
    } catch (error) {
      const err = error as Error;
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: err.message }
      }));
    }
  }

  private handleDisconnect(connectionId: string): void {
    this.connections.delete(connectionId);
    log.info(`Bridge connection disconnected: ${connectionId}`);
  }

  async spawnSession(params: { workDir?: string }): Promise<{ sessionId: string }> {
    const sessionId = randomUUID();
    
    const session: SessionHandle = {
      sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      connected: false,
      workDir: params.workDir || process.cwd(),
    };

    this.sessions.set(sessionId, session);
    log.info(`Session spawned: ${sessionId}`);

    return { sessionId };
  }

  async stopSession(params: { sessionId: string }): Promise<{ success: boolean }> {
    const { sessionId } = params;
    
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.sessions.delete(sessionId);
    log.info(`Session stopped: ${sessionId}`);

    return { success: true };
  }

  getSessionStatus(params: { sessionId: string }): SessionInfo | null {
    const session = this.sessions.get(params.sessionId);
    
    if (!session) {
      return null;
    }

    const status: SessionStatus = session.connected ? 'active' : 'starting';
    
    return {
      sessionId: session.sessionId,
      status,
      startedAt: session.createdAt,
      lastActivity: session.lastActivity,
      toolCount: 0,
      messageCount: 0,
    };
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      status: (session.connected ? 'active' : 'idle') as SessionStatus,
      startedAt: session.createdAt,
      lastActivity: session.lastActivity,
      toolCount: 0,
      messageCount: 0,
    }));
  }

  async sendToSession(params: { sessionId: string; message: string }): Promise<{ success: boolean; response?: string }> {
    const session = this.sessions.get(params.sessionId);
    
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }

    session.lastActivity = Date.now();

    return {
      success: true,
      response: `Message received by session ${params.sessionId}: ${params.message}`
    };
  }

  async stop(): Promise<void> {
    log.info('Stopping bridge server...');

    for (const session of this.sessions.values()) {
      this.sessions.delete(session.sessionId);
    }

    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          log.info('Bridge server stopped');
          resolve();
        });
      });
    }
  }
}

export function createBridgeServer(config: BridgeConfig): BridgeServer {
  return new BridgeServer(config);
}