import { mcpClient } from "./client.ts";
import type { Tool } from "../tools/index.js";
import { createLogger } from "../logger.ts";

const log = createLogger("mcp");

/**
 * Tool: list_mcp_tools
 * Lists all available tools from connected MCP servers
 */
const listMCPToolsTool: Tool = {
  name: "list_mcp_tools",
  description:
    "List all available tools from connected MCP (Model Context Protocol) servers. Shows tool names, descriptions, and which server they belong to.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async (): Promise<string> => {
    try {
      const tools = mcpClient.getAllTools();

      if (tools.length === 0) {
        return JSON.stringify({
          success: true,
          count: 0,
          tools: [],
          message: "No MCP servers connected or no tools available",
        });
      }

      const toolList = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        server: tool.serverName,
        parameters: Object.keys(tool.inputSchema.properties || {}),
        required: tool.inputSchema.required || [],
      }));

      return JSON.stringify({
        success: true,
        count: toolList.length,
        tools: toolList,
      });
    } catch (error: any) {
      log.error(`Error in list_mcp_tools tool: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to list MCP tools",
      });
    }
  },
};

/**
 * Tool: call_mcp_tool
 * Calls a tool on an MCP server
 */
const callMCPToolTool: Tool = {
  name: "call_mcp_tool",
  description:
    "Call a tool on an MCP server. First use list_mcp_tools to discover available tools, then call them by name with the required arguments.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: {
        type: "string",
        description: "Name of the MCP tool to call (e.g., 'read_file', 'search_web')",
      },
      arguments: {
        type: "object",
        description: "Arguments to pass to the tool (as key-value pairs)",
      },
    },
    required: ["tool_name", "arguments"],
  },
  execute: async (params: any): Promise<string> => {
    try {
      if (!params.tool_name || typeof params.tool_name !== "string") {
        return JSON.stringify({
          success: false,
          error: "Missing or invalid 'tool_name' parameter",
        });
      }

      if (!params.arguments || typeof params.arguments !== "object") {
        return JSON.stringify({
          success: false,
          error: "Missing or invalid 'arguments' parameter",
        });
      }

      const result = await mcpClient.callTool(
        params.tool_name,
        params.arguments
      );

      // Extract text content from MCP response
      let textContent = "";
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === "text" && item.text) {
            textContent += item.text;
          }
        }
      }

      if (result.isError) {
        return JSON.stringify({
          success: false,
          error: `Tool execution failed: ${textContent}`,
          tool: params.tool_name,
        });
      }

      return JSON.stringify({
        success: true,
        tool: params.tool_name,
        result: textContent || result,
      });
    } catch (error: any) {
      log.error(`Error in call_mcp_tool tool: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to call MCP tool",
        tool: params.tool_name,
      });
    }
  },
};

/**
 * Tool: mcp_status
 * Shows status of MCP servers
 */
const mcpStatusTool: Tool = {
  name: "mcp_status",
  description:
    "Check the status of all MCP servers: which are connected, how many tools each provides, and their configuration.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async (): Promise<string> => {
    try {
      const status = mcpClient.getStatus();

      return JSON.stringify({
        success: true,
        servers: status,
        totalServers: status.length,
        connectedServers: status.filter((s) => s.connected).length,
        totalTools: status.reduce((sum, s) => sum + s.toolCount, 0),
      });
    } catch (error: any) {
      log.error(`Error in mcp_status tool: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to get MCP status",
      });
    }
  },
};

// Export tools array
export const mcpTools: Tool[] = [
  listMCPToolsTool,
  callMCPToolTool,
  mcpStatusTool,
];

// Export client for initialization
export { mcpClient } from "./client.ts";
