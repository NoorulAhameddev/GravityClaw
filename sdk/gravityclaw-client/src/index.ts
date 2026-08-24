import type {
  Session,
  ToolDefinition,
  MemoryMessage,
  MemorySessionSummary,
  UsageReport,
} from './types.js';
import { GravityClawError } from './errors.js';

interface ClientConfig {
  baseUrl: string;
  apiKey: string;
}

export class GravityClawClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new GravityClawError(res.status, error.error || 'Unknown error');
    }

    return res.json();
  }

  createSession(): Promise<Session> {
    throw new GravityClawError(
      501,
      'Unsupported operation: the GravityClaw server has no POST /api/sessions endpoint and no HTTP chat surface yet. Sessions are created implicitly by channel activity, and chat happens over WebSocket (request a token via GET /api/auth/token).',
    );
  }

  async listSessions(): Promise<Session[]> {
    const result = await this.request<{ success: boolean; data: Session[] }>('GET', '/sessions');
    return result.data;
  }

  chat(_sessionId: string, _message: string): Promise<never> {
    throw new GravityClawError(
      501,
      'Unsupported operation: the GravityClaw server exposes no HTTP chat endpoint. Chat happens over WebSocket — request a session token via GET /api/auth/token, then connect to the WebSocket endpoint.',
    );
  }

  chatStream(_sessionId: string, _message: string): AsyncGenerator<never> {
    throw new GravityClawError(
      501,
      'Unsupported operation: the GravityClaw server exposes no HTTP SSE/streaming chat endpoint. Streaming chat happens over WebSocket — request a session token via GET /api/auth/token, then connect to the WebSocket endpoint.',
    );
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = await this.request<{ success: boolean; data: ToolDefinition[] }>(
      'GET',
      '/tools',
    );
    return result.data;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<any> {
    return this.request('POST', '/tools/execute', { tool: name, input: args });
  }

  async listMemoryMessages(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    const params = new URLSearchParams({ session: sessionId });
    if (limit !== undefined) params.set('limit', String(limit));
    const result = await this.request<{ success: boolean; data: MemoryMessage[] }>(
      'GET',
      `/memory?${params.toString()}`,
    );
    return result.data;
  }

  async listMemorySessions(limit?: number): Promise<MemorySessionSummary[]> {
    const query = limit !== undefined ? `?limit=${limit}` : '';
    const result = await this.request<{ success: boolean; data: MemorySessionSummary[] }>(
      'GET',
      `/memory${query}`,
    );
    return result.data;
  }

  async getUsage(period: string = '24h'): Promise<UsageReport> {
    const result = await this.request<{ success: boolean; data: UsageReport }>(
      'GET',
      `/admin/usage?period=${period}`,
    );
    return result.data;
  }
}

export { GravityClawError } from './errors.js';
export type * from './types.js';
