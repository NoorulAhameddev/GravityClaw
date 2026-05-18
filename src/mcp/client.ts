import { spawn, ChildProcess } from "child_process";
import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../utils/json.ts";
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPServer,
  MCPServerConfig,
  MCPServersConfig,
  MCPToolSchema,
  MCPToolCallRequest,
  MCPToolCallResponse,
} from "./types.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const log = createLogger("mcp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MCP Client Manager
 * Manages connections to MCP servers and routes tool calls
 * Includes automatic reconnection for crashed servers
 */
export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();
  private requestId = 0;
  private pendingRequests: Map<
    number,
    { resolve: (value: any) => void; reject: (error: any) => void }
  > = new Map();

  // Track failed servers for reconnection with exponential backoff
  private failedServers: Map<string, { 
    lastFailure: number; 
    attempt: number;
    reconnectTimer?: NodeJS.Timeout;
  }> = new Map();
  
  // Reconnection configuration
  private readonly INITIAL_RECONNECT_DELAY_MS = 5000;
  private readonly MAX_RECONNECT_DELAY_MS = 300000; // 5 minutes max
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  /**
   * Initialize MCP client and connect to all configured servers
   */
  async initialize(): Promise<void> {
    const config = this.loadConfig();

    if (!config || Object.keys(config.mcpServers).length === 0) {
      log.info("No MCP servers configured in mcp-servers.json");
      return;
    }

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (serverConfig.disabled) {
        log.info(`MCP server "${name}" is disabled, skipping`);
        continue;
      }

      try {
        await this.connectServer(name, serverConfig);
      } catch (error) {
        log.error(`Failed to connect to MCP server "${name}": ${error}`);
        // Schedule reconnection for failed server
        this.scheduleReconnect(name, serverConfig);
      }
    }

    log.info(
      `MCP client initialized with ${this.servers.size} server(s)`
    );
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnect(name: string, config: MCPServerConfig): void {
    // Clear any existing reconnect timer
    const existing = this.failedServers.get(name);
    if (existing?.reconnectTimer) {
      clearTimeout(existing.reconnectTimer);
    }

    const failure = this.failedServers.get(name) || { lastFailure: Date.now(), attempt: 0 };
    failure.lastFailure = Date.now();
    failure.attempt++;

    // Don't retry beyond max attempts
    if (failure.attempt > this.MAX_RECONNECT_ATTEMPTS) {
      log.warn(`MCP server "${name}" has exceeded max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}). Manual intervention required.`);
      this.failedServers.delete(name);
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY_MS * Math.pow(2, failure.attempt - 1),
      this.MAX_RECONNECT_DELAY_MS
    );

    log.info(`Scheduling reconnection for MCP server "${name}" in ${delay}ms (attempt ${failure.attempt}/${this.MAX_RECONNECT_ATTEMPTS})`);

    const timer = setTimeout(async () => {
      try {
        await this.connectServer(name, config);
        // Connection succeeded - remove from failed list
        this.failedServers.delete(name);
        log.info(`MCP server "${name}" reconnected successfully`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.warn(`Reconnection failed for MCP server "${name}": ${errMsg}`);
        // Schedule next attempt
        this.scheduleReconnect(name, config);
      }
    }, delay);

    failure.reconnectTimer = timer;
    this.failedServers.set(name, failure);
  }

  /**
   * Manually trigger reconnection for a specific server
   */
  async reconnectServer(name: string): Promise<boolean> {
    const config = this.loadConfig();
    if (!config || !config.mcpServers[name]) {
      log.error(`Cannot reconnect: MCP server "${name}" not found in config`);
      return false;
    }

    // Clear any pending reconnect
    const failed = this.failedServers.get(name);
    if (failed?.reconnectTimer) {
      clearTimeout(failed.reconnectTimer);
    }
    this.failedServers.delete(name);

    try {
      await this.connectServer(name, config.mcpServers[name]);
      log.info(`MCP server "${name}" reconnected manually`);
      return true;
    } catch (error) {
      log.error(`Manual reconnection failed for "${name}": ${error}`);
      this.scheduleReconnect(name, config.mcpServers[name]);
      return false;
    }
  }

  /**
   * Check if a server is available or scheduled for reconnection
   */
  getServerHealth(name: string): { connected: boolean; reconnectScheduled: boolean; attempt: number } {
    const server = this.servers.get(name);
    const failed = this.failedServers.get(name);

    return {
      connected: server?.connected ?? false,
      reconnectScheduled: failed !== undefined,
      attempt: failed?.attempt ?? 0,
    };
  }

  /**
   * Load MCP servers configuration from mcp-servers.json
   */
  private loadConfig(): MCPServersConfig | null {
    const configPath = path.join(process.cwd(), "config", "mcp-servers.json");

    if (!fs.existsSync(configPath)) {
      log.info("config/mcp-servers.json not found, MCP bridge disabled");
      return null;
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const result = safeJsonParse<MCPServersConfig | null>(content, null, "MCP config");
    if (!result.success || result.data === null) {
      log.error(`Error loading config/mcp-servers.json: ${result.error}`);
      return null;
    }
    return result.data;
  }

  /**
   * Connect to an MCP server
   */
  private async connectServer(
    name: string,
    config: MCPServerConfig
  ): Promise<void> {
    log.info(`Connecting to MCP server: ${name} (command: ${config.command})`);

    // Spawn the MCP server process
    const serverProcess = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    const server: MCPServer = {
      name,
      config,
      process: serverProcess,
      connected: false,
      tools: [],
    };

    // Buffer for incomplete JSON-RPC messages
    let buffer = "";

    // Handle stdout (JSON-RPC responses)
    serverProcess.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();

      // Split by newlines (JSON-RPC messages are newline-delimited)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep last incomplete line

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line) as JSONRPCResponse;
            this.handleResponse(server, response);
          } catch (error) {
            log.error(
              `Error parsing JSON-RPC response from ${name}: ${error}`
            );
          }
        }
      }
    });

    // Handle stderr (logging)
    serverProcess.stderr?.on("data", (data: Buffer) => {
      log.warn(`MCP server "${name}" stderr: ${data.toString().trim()}`);
    });

    // Handle process exit
    serverProcess.on("exit", (code: number | null) => {
      log.info(`MCP server "${name}" stopped (code: ${code})`);
      server.connected = false;
      this.servers.delete(name);
    });

    // Handle process errors
    serverProcess.on("error", (error: Error) => {
      log.error(`MCP server "${name}" process error: ${error}`);
      server.connected = false;
    });

    this.servers.set(name, server);

    // Wait a bit for the process to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Initialize connection and discover tools
    try {
      await this.initializeServer(server);
      server.connected = true;
      log.info(
        `MCP server "${name}" connected, discovered ${server.tools.length} tools`
      );
    } catch (error) {
      log.error(`Failed to initialize MCP server "${name}": ${error}`);
      serverProcess.kill("SIGTERM");
      this.servers.delete(name);
      throw error;
    }
  }

  /**
   * Initialize connection with MCP server and discover tools
   */
  private async initializeServer(server: MCPServer): Promise<void> {
    // Call initialize method
    try {
      await this.sendRequest(server, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "gravity-claw",
          version: "1.0.0",
        },
      });
    } catch (error) {
      log.warn(
        `Server ${server.name} doesn't support initialize, continuing...`
      );
    }

    // Discover tools via tools/list
    const toolsResult = await this.sendRequest(server, "tools/list", {});

    if (toolsResult && Array.isArray(toolsResult.tools)) {
      server.tools = toolsResult.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema || {
          type: "object",
          properties: {},
        },
      }));
    }
  }

  /**
   * Send JSON-RPC request to MCP server
   */
  private sendRequest(
    server: MCPServer,
    method: string,
    params: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const request: JSONRPCRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject });

      // Send request
      const message = JSON.stringify(request) + "\n";
      server.process.stdin?.write(message);

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(
            new Error(
              `Request timeout for ${method} on server ${server.name}`
            )
          );
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Handle JSON-RPC response from MCP server
   */
  private handleResponse(server: MCPServer, response: JSONRPCResponse): void {
    const id = typeof response.id === "number" ? response.id : parseInt(response.id as string);
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      log.warn(
        `Received response for unknown request ID ${id} from ${server.name}`
      );
      return;
    }

    this.pendingRequests.delete(id);

    if (response.error) {
      pending.reject(
        new Error(
          `MCP Error ${response.error.code}: ${response.error.message}`
        )
      );
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Get all available tools from all connected MCP servers
   */
  getAllTools(): Array<MCPToolSchema & { serverName: string }> {
    const tools: Array<MCPToolSchema & { serverName: string }> = [];

    for (const [serverName, server] of this.servers.entries()) {
      if (server.connected) {
        for (const tool of server.tools) {
          tools.push({
            ...tool,
            serverName,
          });
        }
      }
    }

    return tools;
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolCallResponse> {
    // Find which server has this tool
    let targetServer: MCPServer | null = null;

    for (const server of this.servers.values()) {
      if (server.connected && server.tools.some((t) => t.name === toolName)) {
        targetServer = server;
        break;
      }
    }

    if (!targetServer) {
      throw new Error(`Tool "${toolName}" not found in any MCP server`);
    }

    log.info(
      `Calling MCP tool "${toolName}" on server "${targetServer.name}"`
    );

    try {
      const result = await this.sendRequest(targetServer, "tools/call", {
        name: toolName,
        arguments: args,
      });

      return result as MCPToolCallResponse;
    } catch (error) {
      log.error(
        `Error calling tool "${toolName}" on ${targetServer.name}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Disconnect from all MCP servers
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down MCP client...");

    // Clear all reconnection timers
    for (const [name, failure] of this.failedServers.entries()) {
      if (failure.reconnectTimer) {
        clearTimeout(failure.reconnectTimer);
      }
    }
    this.failedServers.clear();

    for (const server of this.servers.values()) {
      try {
        server.process.kill();
      } catch (error) {
        log.error(`Error killing MCP server ${server.name}: ${error}`);
      }
    }

    this.servers.clear();
    this.pendingRequests.clear();
    log.info("MCP client shut down");
  }

  /**
   * Get server status for all connected servers
   */
  getStatus(): Array<{
    name: string;
    connected: boolean;
    toolCount: number;
    command: string;
    reconnectAttempt?: number;
    lastFailure?: number;
  }> {
    return Array.from(this.servers.values()).map((server) => {
      const failed = this.failedServers.get(server.name);
      const status: {
        name: string;
        connected: boolean;
        toolCount: number;
        command: string;
        reconnectAttempt?: number;
        lastFailure?: number;
      } = {
        name: server.name,
        connected: server.connected,
        toolCount: server.tools.length,
        command: server.config.command,
      };
      
      if (failed) {
        status.reconnectAttempt = failed.attempt;
        status.lastFailure = failed.lastFailure;
      }
      
      return status;
    });
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();
