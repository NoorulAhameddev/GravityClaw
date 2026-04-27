export interface BridgeConfig {
  port: number;
  host: string;
  authToken: string;
  maxSessions: number;
  sessionTimeoutMs: number;
  debug: boolean;
}

export interface SessionHandle {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  connected: boolean;
  workDir: string;
  accessToken?: string;
}

export interface BridgeMessage {
  jsonrpc?: '2.0';
  id?: number | string;
  type: 'request' | 'response' | 'event';
  sessionId?: string;
  method: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: BridgeError;
}

export interface BridgeError {
  code: number;
  message: string;
  data?: unknown;
}

export interface SessionRequest {
  type: 'spawn' | 'message' | 'stop' | 'status';
  sessionId?: string;
  data?: unknown;
}

export interface SessionResponse {
  success: boolean;
  sessionId?: string;
  data?: unknown;
  error?: string;
}

export type SessionStatus = 'idle' | 'starting' | 'active' | 'completed' | 'failed' | 'interrupted';

export interface SessionInfo {
  sessionId: string;
  status: SessionStatus;
  startedAt: number;
  lastActivity: number;
  toolCount: number;
  messageCount: number;
}