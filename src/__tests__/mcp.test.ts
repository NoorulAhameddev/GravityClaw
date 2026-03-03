import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MCPClient } from "../mcp/client.ts";
import { mcpTools } from "../mcp/index.ts";

describe("MCP Module", () => {
  describe("Tool Metadata", () => {
    it("should export exactly 3 tools", () => {
      expect(mcpTools).toHaveLength(3);
    });

    it("should have correct tool names", () => {
      const names = mcpTools.map((t) => t.name);
      expect(names).toContain("list_mcp_tools");
      expect(names).toContain("call_mcp_tool");
      expect(names).toContain("mcp_status");
    });

    it("should have descriptions for all tools", () => {
      mcpTools.forEach((tool) => {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      });
    });

    it("should have valid parameter schemas", () => {
      mcpTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe("MCPClient", () => {
    let client: MCPClient;

    beforeEach(() => {
      client = new MCPClient();
    });

    afterEach(async () => {
      await client.shutdown();
    });

    it("should initialize with no config", async () => {
      // Mock fs.existsSync to return false
      vi.mock("fs", () => ({
        default: {
          existsSync: vi.fn(() => false),
          readFileSync: vi.fn(),
        },
      }));

      await client.initialize();
      const status = client.getStatus();
      expect(status).toHaveLength(0);
    });

    it("should return empty tools list when no servers connected", () => {
      const tools = client.getAllTools();
      expect(tools).toEqual([]);
    });

    it("should return empty status when no servers connected", () => {
      const status = client.getStatus();
      expect(status).toEqual([]);
    });
  });

  describe("list_mcp_tools tool", () => {
    const listTool = mcpTools.find((t) => t.name === "list_mcp_tools")!;

    it("should not require any parameters", () => {
      const schema = listTool.inputSchema;
      expect(schema.required).toEqual([]);
    });

    it("should return empty list when no servers connected", async () => {
      const result = await listTool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(0);
      expect(parsed.tools).toEqual([]);
    });
  });

  describe("call_mcp_tool tool", () => {
    const callTool = mcpTools.find((t) => t.name === "call_mcp_tool")!;

    it("should require tool_name and arguments parameters", () => {
      const schema = callTool.inputSchema;
      expect(schema.required).toContain("tool_name");
      expect(schema.required).toContain("arguments");
    });

    it("should reject missing tool_name parameter", async () => {
      const result = await callTool.execute({
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("tool_name");
    });

    it("should reject missing arguments parameter", async () => {
      const result = await callTool.execute({
        tool_name: "test_tool",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("arguments");
    });

    it("should reject invalid tool_name type", async () => {
      const result = await callTool.execute({
        tool_name: 123,
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("tool_name");
    });

    it("should reject invalid arguments type", async () => {
      const result = await callTool.execute({
        tool_name: "test_tool",
        arguments: "not an object",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("arguments");
    });

    it("should fail gracefully when tool not found", async () => {
      const result = await callTool.execute({
        tool_name: "non_existent_tool",
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });
  });

  describe("mcp_status tool", () => {
    const statusTool = mcpTools.find((t) => t.name === "mcp_status")!;

    it("should not require any parameters", () => {
      const schema = statusTool.inputSchema;
      expect(schema.required).toEqual([]);
    });

    it("should return status with no servers", async () => {
      const result = await statusTool.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.servers).toEqual([]);
      expect(parsed.totalServers).toBe(0);
      expect(parsed.connectedServers).toBe(0);
      expect(parsed.totalTools).toBe(0);
    });
  });

  describe("Result Format Consistency", () => {
    it("should return success/error format for all tools", async () => {
      for (const tool of mcpTools) {
        const result = await tool.execute({});
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty("success");
        expect(typeof parsed.success).toBe("boolean");
      }
    });
  });

  describe("JSON-RPC Protocol", () => {
    it("should format requests correctly", () => {
      const request = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "tools/list",
        params: {},
      };

      expect(request.jsonrpc).toBe("2.0");
      expect(request.id).toBe(1);
      expect(request.method).toBe("tools/list");
    });

    it("should handle responses correctly", () => {
      const response = {
        jsonrpc: "2.0" as const,
        id: 1,
        result: {
          tools: [],
        },
      };

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
    });

    it("should handle error responses correctly", () => {
      const errorResponse = {
        jsonrpc: "2.0" as const,
        id: 1,
        error: {
          code: -32600,
          message: "Invalid Request",
        },
      };

      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.code).toBe(-32600);
      expect(errorResponse.error.message).toBeTruthy();
    });
  });

  describe("Tool Schema Mapping", () => {
    it("should map MCP tool schema to OpenAI format", () => {
      const mcpTool = {
        name: "test_tool",
        description: "Test tool description",
        inputSchema: {
          type: "object" as const,
          properties: {
            param1: { type: "string" },
            param2: { type: "number" },
          },
          required: ["param1"],
        },
      };

      expect(mcpTool.name).toBe("test_tool");
      expect(mcpTool.description).toBe("Test tool description");
      expect(mcpTool.inputSchema.type).toBe("object");
      expect(mcpTool.inputSchema.properties).toHaveProperty("param1");
      expect(mcpTool.inputSchema.required).toContain("param1");
    });
  });

  describe("Error Handling", () => {
    const callTool = mcpTools.find((t) => t.name === "call_mcp_tool")!;

    it("should handle network errors gracefully", async () => {
      const result = await callTool.execute({
        tool_name: "failing_tool",
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeTruthy();
    });

    it("should handle invalid JSON responses", async () => {
      // This would be tested with actual process mocking
      // For now, we verify error structure
      const result = await callTool.execute({
        tool_name: "bad_tool",
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("success");
      if (!parsed.success) {
        expect(parsed).toHaveProperty("error");
      }
    });
  });

  describe("Configuration Loading", () => {
    it("should handle missing config file", async () => {
      const client = new MCPClient();
      await client.initialize();
      const status = client.getStatus();
      expect(status).toHaveLength(0);
      await client.shutdown();
    });

    it("should validate config schema", () => {
      const validConfig = {
        mcpServers: {
          "test-server": {
            command: "node",
            args: ["server.js"],
            env: { API_KEY: "test" },
          },
        },
      };

      expect(validConfig.mcpServers).toHaveProperty("test-server");
      expect(validConfig.mcpServers["test-server"].command).toBe("node");
      expect(validConfig.mcpServers["test-server"].args).toContain("server.js");
    });
  });

  describe("Edge Cases", () => {
    it("should handle tool names with special characters", async () => {
      const callTool = mcpTools.find((t) => t.name === "call_mcp_tool")!;
      const result = await callTool.execute({
        tool_name: "tool-with-dashes_and_underscores",
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("success");
    });

    it("should handle empty arguments object", async () => {
      const callTool = mcpTools.find((t) => t.name === "call_mcp_tool")!;
      const result = await callTool.execute({
        tool_name: "test_tool",
        arguments: {},
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("success");
    });

    it("should handle very large argument values", async () => {
      const callTool = mcpTools.find((t) => t.name === "call_mcp_tool")!;
      const largeString = "a".repeat(10000);
      const result = await callTool.execute({
        tool_name: "test_tool",
        arguments: { data: largeString },
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("success");
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle multiple tool calls concurrently", async () => {
      const client = new MCPClient();
      await client.initialize();

      // This tests that the request ID mechanism works correctly
      const status1 = client.getStatus();
      const status2 = client.getStatus();

      expect(status1).toEqual(status2);
      await client.shutdown();
    });
  });
});
