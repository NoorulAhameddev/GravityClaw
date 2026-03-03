/**
 * MCP (Model Context Protocol) Type Definitions
 * Based on JSON-RPC 2.0
 */

/**
 * JSON-RPC 2.0 Request
 */
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

/**
 * JSON-RPC 2.0 Response (success)
 */
export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: JSONRPCError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

/**
 * MCP Tool Schema (compatible with OpenAI function calling)
 */
export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

/**
 * MCP Server Manager Configuration
 */
export interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * MCP Server Instance
 */
export interface MCPServer {
  name: string;
  config: MCPServerConfig;
  process: any; // ChildProcess
  connected: boolean;
  tools: MCPToolSchema[];
}

/**
 * MCP Tool Call Request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

/**
 * MCP Tool Call Response
 */
export interface MCPToolCallResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
