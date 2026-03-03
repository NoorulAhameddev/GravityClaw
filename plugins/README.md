# Gravity Claw Plugins

This directory contains external plugins for Gravity Claw AI agent.

## Plugin Structure

Each plugin should be in its own subdirectory with the following structure:

```
plugins/
├── my-plugin/
│   ├── plugin.json       # Plugin manifest (required)
│   ├── index.ts          # Main entry point (or .js)
│   └── ...               # Additional files
```

## Plugin Manifest (plugin.json)

The `plugin.json` file describes your plugin:

```json
{
  "id": "my-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "main": "index.ts",
  "traits": ["tool"],
  "description": "A plugin that does something cool",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": [],
  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "description": "API key for my service"
      }
    },
    "required": ["apiKey"]
  }
}
```

### Required Fields

- `id`: Unique plugin identifier (lowercase, hyphen-separated)
- `name`: Human-readable plugin name
- `version`: Semantic version (e.g., "1.0.0")
- `main`: Entry file (relative to plugin directory)
- `traits`: Array of traits this plugin implements
  - `"provider"` - LLM provider
  - `"channel"` - Communication channel
  - `"tool"` - Agent tool
  - `"memory"` - Memory backend

### Optional Fields

- `description`: Brief description of the plugin
- `author`: Plugin author(s)
- `license`: Plugin license
- `dependencies`: Array of plugin IDs this plugin depends on
- `configSchema`: JSON Schema for plugin configuration

## Plugin Implementation

Your main entry file should export a `Plugin` object as the default export:

```typescript
import type { Plugin, ToolTrait } from "../src/plugins/base.ts";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

class MyToolTrait implements ToolTrait {
  readonly traitType = "tool" as const;
  readonly toolId = "my_tool";
  readonly toolName = "My Tool";
  readonly description = "Does something useful";
  
  private config: Record<string, unknown> = {};
  
  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config;
    console.log("My tool initialized!");
  }
  
  getDefinition(): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: this.toolId,
        description: this.description,
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The query to process",
            },
          },
          required: ["query"],
        },
      },
    };
  }
  
  async execute(parameters: Record<string, unknown>): Promise<string> {
    const query = parameters.query as string;
    // Do something with the query
    return `Processed: ${query}`;
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        apiKey: {
          type: "string",
          description: "API key for my service",
        },
      },
      required: ["apiKey"],
    };
  }
}

const plugin: Plugin = {
  metadata: {
    id: "my-plugin",
    name: "My Awesome Plugin",
    version: "1.0.0",
    traits: ["tool"],
  },
  
  getTrait(traitType) {
    if (traitType === "tool") {
      return new MyToolTrait();
    }
    return null;
  },
  
  async onLoad() {
    console.log("My plugin loaded!");
  },
  
  async onUnload() {
    console.log("My plugin unloaded!");
  },
};

export default plugin;
```

## Plugin Traits

### Provider Trait

Implement an LLM provider (e.g., custom API, local model):

```typescript
import type { ProviderTrait } from "../src/plugins/base.ts";
import type { LLMResponse, LLMChatOptions } from "../src/llm/base.ts";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";

class MyProviderTrait implements ProviderTrait {
  readonly traitType = "provider" as const;
  readonly name = "my_provider";
  
  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    // Call your LLM API
    return {
      text: "Hello from my provider!",
      stopReason: "stop",
      toolCalls: [],
    };
  }
  
  async listModels(): Promise<string[]> {
    return ["my-model-1", "my-model-2"];
  }
  
  async countTokens(text: string): Promise<number> {
    return text.split(" ").length; // Simple word count
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        apiKey: { type: "string" },
        endpoint: { type: "string" },
      },
      required: ["apiKey"],
    };
  }
}
```

### Channel Trait

Implement a communication channel (e.g., Discord, Slack):

```typescript
import type { ChannelTrait } from "../src/plugins/base.ts";

class MyChannelTrait implements ChannelTrait {
  readonly traitType = "channel" as const;
  readonly channelId = "my_channel";
  readonly channelName = "My Channel";
  
  async initialize(config: Record<string, unknown>): Promise<void> {
    // Initialize your channel client
  }
  
  async start(): Promise<void> {
    // Start listening for messages
  }
  
  async stop(): Promise<void> {
    // Stop gracefully
  }
  
  async sendMessage(userId: string, message: string): Promise<string | void> {
    // Send message to user
    console.log(`Sending to ${userId}: ${message}`);
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        token: { type: "string" },
      },
      required: ["token"],
    };
  }
}
```

### Tool Trait

Implement an agent tool (e.g., web search, calculator):

```typescript
import type { ToolTrait } from "../src/plugins/base.ts";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

class MyToolTrait implements ToolTrait {
  readonly traitType = "tool" as const;
  readonly toolId = "my_tool";
  readonly toolName = "My Tool";
  readonly description = "Does something useful";
  
  async initialize(config: Record<string, unknown>): Promise<void> {
    // Initialize tool
  }
  
  getDefinition(): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: this.toolId,
        description: this.description,
        parameters: {
          type: "object",
          properties: {
            input: { type: "string", description: "Input parameter" },
          },
          required: ["input"],
        },
      },
    };
  }
  
  async execute(parameters: Record<string, unknown>): Promise<string> {
    const input = parameters.input as string;
    // Process input and return result
    return `Result: ${input}`;
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {};
  }
}
```

### Memory Trait

Implement a memory backend (e.g., Redis, PostgreSQL):

```typescript
import type { MemoryTrait } from "../src/plugins/base.ts";

class MyMemoryTrait implements MemoryTrait {
  readonly traitType = "memory" as const;
  readonly memoryId = "my_memory";
  readonly memoryName = "My Memory Backend";
  
  async initialize(config: Record<string, unknown>): Promise<void> {
    // Connect to database
  }
  
  async storeMessage(userId: string, message: {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
  }): Promise<void> {
    // Store message
  }
  
  async getHistory(userId: string, limit?: number): Promise<Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
  }>> {
    // Retrieve history
    return [];
  }
  
  async clearHistory(userId: string): Promise<void> {
    // Clear history
  }
  
  async set(key: string, value: unknown): Promise<void> {
    // Store key-value
  }
  
  async get<T>(key: string): Promise<T | null> {
    // Retrieve value
    return null;
  }
  
  async delete(key: string): Promise<void> {
    // Delete key
  }
  
  async close(): Promise<void> {
    // Close connection
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        connectionString: { type: "string" },
      },
      required: ["connectionString"],
    };
  }
}
```

## Plugin Loading

Plugins are automatically discovered and loaded at startup:

1. All subdirectories in `plugins/` are scanned for `plugin.json`
2. Valid plugins are registered
3. Dependencies are resolved and loaded in order
4. Plugin `onLoad()` lifecycle hook is called

## Built-in Plugins

Core plugins are located in `src/plugins/builtin/` and follow the same structure.

## Testing Your Plugin

Create a test directory for your plugin:

```
plugins/my-plugin/
├── plugin.json
├── index.ts
├── __tests__/
│   └── my-plugin.test.ts
```

## Examples

See `src/plugins/builtin/` for examples of built-in plugins.
