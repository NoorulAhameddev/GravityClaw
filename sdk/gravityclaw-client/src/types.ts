export interface Session {
  id: string;
  allow_messages?: number;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MemoryMessage {
  id: number;
  session_id: string;
  timestamp: string;
  message_json: string;
}

export interface MemorySessionSummary {
  session_id: string;
  message_count: number;
  last_active: string;
}

export interface UsageReport {
  allTime: {
    requests: number;
    tokens: number;
    cost: number;
  };
  models: Record<string, { calls: number; tokens: number; cost: number }>;
  avgLatency: number;
}
