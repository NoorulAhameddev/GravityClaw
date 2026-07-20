# Model Context Protocol (MCP) Bridge

GravityClaw natively supports the **Model Context Protocol (MCP)**, allowing it to seamlessly interface with external, standardized tool servers.

## What is the MCP Bridge?

The MCP Bridge (`scripts/mcp-bridge/`) is a dedicated process that translates between GravityClaw's internal `ToolRegistry` and external MCP servers. By using the bridge, you can connect GravityClaw to any community-built MCP server (like the Postgres MCP server, GitHub MCP server, etc.) without writing any glue code.

## Configuration

To use the MCP bridge, define your MCP servers in `config/mcp-servers.schema.json` or in your `.env` configuration.

Example `.env`:
```bash
MCP_SERVERS='{"postgres": {"command": "npx", "args": ["@modelcontextprotocol/server-postgres", "postgres://localhost/mydb"]}}'
```

## Running the Bridge

The bridge can be run independently for testing or started automatically as part of the GravityClaw main process.

To run it independently:
```bash
cd scripts/mcp-bridge
npm install
npm run start
```

## How It Works

1. The bridge reads the configured MCP servers on startup.
2. It establishes standard RPC connections to each server using `stdio` or HTTP transports.
3. It fetches the manifest of available tools from each MCP server.
4. It dynamically registers these tools into GravityClaw's internal `ToolRegistry`.
5. When the LLM calls an MCP tool, the bridge routes the request to the corresponding external server and returns the result.

This approach ensures GravityClaw is immediately compatible with the growing ecosystem of MCP tools.
