import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pluginRegistry } from "../plugins/registry.ts";
import type { Plugin, ToolTrait, ProviderTrait } from "../plugins/base.ts";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { LLMResponse, LLMChatOptions } from "../llm/base.ts";

// Mock tool trait
class MockToolTrait implements ToolTrait {
  readonly traitType = "tool" as const;
  readonly toolId = "mock_tool";
  readonly toolName = "Mock Tool";
  readonly description = "A mock tool for testing";
  
  async initialize(_config: Record<string, unknown>): Promise<void> {
    // Mock initialization
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
            input: { type: "string", description: "Input text" },
          },
          required: ["input"],
        },
      },
    };
  }
  
  async execute(parameters: Record<string, unknown>): Promise<string> {
    return `Executed with: ${parameters.input}`;
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
      },
    };
  }
}

// Mock provider trait
class MockProviderTrait implements ProviderTrait {
  readonly traitType = "provider" as const;
  readonly name = "mock_provider";
  
  async chat(
    _messages: ChatCompletionMessageParam[],
    _toolDefinitions: ChatCompletionTool[],
    _options?: LLMChatOptions
  ): Promise<LLMResponse> {
    return {
      text: "Mock response",
      stopReason: "stop",
      toolCalls: [],
    };
  }
  
  async listModels(): Promise<string[]> {
    return ["mock-model-1", "mock-model-2"];
  }
  
  countTokens(messages: ChatCompletionMessageParam[]): number {
    return messages.map(m => String(m.content)).join(" ").length;
  }
  
  getConfigSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        apiKey: { type: "string" },
      },
      required: ["apiKey"],
    };
  }
}

// Mock plugin
function createMockPlugin(id: string, traits: Array<"provider" | "channel" | "tool" | "memory">): Plugin {
  let loaded = false;
  let unloaded = false;
  
  const plugin: Plugin = {
    metadata: {
      id,
      name: `Mock Plugin ${id}`,
      version: "1.0.0",
      traits,
    },
    
    getTrait(traitType) {
      if (traitType === "tool" && traits.includes("tool")) {
        return new MockToolTrait() as never;
      }
      if (traitType === "provider" && traits.includes("provider")) {
        return new MockProviderTrait() as never;
      }
      return null;
    },
    
    async onLoad() {
      loaded = true;
    },
    
    async onUnload() {
      unloaded = true;
    },
  };
  
  // Attach test helpers
  (plugin as Plugin & { _loaded: boolean; _unloaded: boolean })._loaded = false;
  (plugin as Plugin & { _loaded: boolean; _unloaded: boolean })._unloaded = false;
  
  Object.defineProperty(plugin, "_loaded", {
    get: () => loaded,
    enumerable: false,
  });
  
  Object.defineProperty(plugin, "_unloaded", {
    get: () => unloaded,
    enumerable: false,
  });
  
  return plugin;
}

describe("Plugin Registry", () => {
  beforeEach(() => {
    pluginRegistry.clear();
  });
  
  afterEach(() => {
    pluginRegistry.clear();
  });
  
  it("should register a plugin programmatically", () => {
    const plugin = createMockPlugin("test-plugin", ["tool"]);
    pluginRegistry.registerPlugin(plugin);
    
    const plugins = pluginRegistry.listPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.id).toBe("test-plugin");
  });
  
  it("should load a registered plugin", async () => {
    const plugin = createMockPlugin("test-plugin", ["tool"]);
    pluginRegistry.registerPlugin(plugin);
    
    await pluginRegistry.loadPlugin("test-plugin");
    
    const loadedPlugin = pluginRegistry.getPlugin("test-plugin");
    expect(loadedPlugin).toBeDefined();
    expect((loadedPlugin as Plugin & { _loaded: boolean })._loaded).toBe(true);
  });
  
  it("should unload a loaded plugin", async () => {
    const plugin = createMockPlugin("test-plugin", ["tool"]);
    pluginRegistry.registerPlugin(plugin);
    await pluginRegistry.loadPlugin("test-plugin");
    
    await pluginRegistry.unloadPlugin("test-plugin");
    
    const unloadedPlugin = pluginRegistry.getPlugin("test-plugin");
    expect(unloadedPlugin).toBeUndefined();
    expect((plugin as Plugin & { _unloaded: boolean })._unloaded).toBe(true);
  });
  
  it("should get loaded plugins", async () => {
    const plugin1 = createMockPlugin("plugin1", ["tool"]);
    const plugin2 = createMockPlugin("plugin2", ["provider"]);
    
    pluginRegistry.registerPlugin(plugin1);
    pluginRegistry.registerPlugin(plugin2);
    
    await pluginRegistry.loadPlugin("plugin1");
    await pluginRegistry.loadPlugin("plugin2");
    
    const loaded = pluginRegistry.getLoadedPlugins();
    expect(loaded.size).toBe(2);
    expect(loaded.has("plugin1")).toBe(true);
    expect(loaded.has("plugin2")).toBe(true);
  });
  
  it("should get plugins by trait type", async () => {
    const toolPlugin = createMockPlugin("tool-plugin", ["tool"]);
    const providerPlugin = createMockPlugin("provider-plugin", ["provider"]);
    const mixedPlugin = createMockPlugin("mixed-plugin", ["tool", "provider"]);
    
    pluginRegistry.registerPlugin(toolPlugin);
    pluginRegistry.registerPlugin(providerPlugin);
    pluginRegistry.registerPlugin(mixedPlugin);
    
    await pluginRegistry.loadAllPlugins();
    
    const toolPlugins = pluginRegistry.getPluginsByTrait<ToolTrait>("tool");
    expect(toolPlugins.size).toBe(2);
    expect(toolPlugins.has("tool-plugin")).toBe(true);
    expect(toolPlugins.has("mixed-plugin")).toBe(true);
    
    const providerPlugins = pluginRegistry.getPluginsByTrait<ProviderTrait>("provider");
    expect(providerPlugins.size).toBe(2);
    expect(providerPlugins.has("provider-plugin")).toBe(true);
    expect(providerPlugins.has("mixed-plugin")).toBe(true);
  });
  
  it("should load plugins with dependencies in order", async () => {
    const pluginA = createMockPlugin("plugin-a", ["tool"]);
    const pluginB: Plugin = {
      metadata: {
        id: "plugin-b",
        name: "Plugin B",
        version: "1.0.0",
        traits: ["tool"],
        dependencies: ["plugin-a"],
      },
      getTrait: () => null,
    };
    
    pluginRegistry.registerPlugin(pluginA);
    pluginRegistry.registerPlugin(pluginB);
    
    await pluginRegistry.loadPlugin("plugin-b");
    
    // Both plugins should be loaded, A first
    expect(pluginRegistry.getPlugin("plugin-a")).toBeDefined();
    expect(pluginRegistry.getPlugin("plugin-b")).toBeDefined();
  });
  
  it("should not register duplicate plugins", () => {
    const plugin1 = createMockPlugin("test-plugin", ["tool"]);
    const plugin2 = createMockPlugin("test-plugin", ["provider"]);
    
    pluginRegistry.registerPlugin(plugin1);
    pluginRegistry.registerPlugin(plugin2);
    
    const plugins = pluginRegistry.listPlugins();
    expect(plugins).toHaveLength(1);
  });
  
  it("should throw error when loading non-existent plugin", async () => {
    await expect(pluginRegistry.loadPlugin("nonexistent")).rejects.toThrow("Plugin not found");
  });
  
  it("should handle plugin without onLoad lifecycle hook", async () => {
    const plugin: Plugin = {
      metadata: {
        id: "no-lifecycle",
        name: "No Lifecycle Plugin",
        version: "1.0.0",
        traits: ["tool"],
      },
      getTrait: () => null,
    };
    
    pluginRegistry.registerPlugin(plugin);
    await expect(pluginRegistry.loadPlugin("no-lifecycle")).resolves.not.toThrow();
  });
  
  it("should handle plugin without onUnload lifecycle hook", async () => {
    const plugin: Plugin = {
      metadata: {
        id: "no-unload",
        name: "No Unload Plugin",
        version: "1.0.0",
        traits: ["tool"],
      },
      getTrait: () => null,
    };
    
    pluginRegistry.registerPlugin(plugin);
    await pluginRegistry.loadPlugin("no-unload");
    await expect(pluginRegistry.unloadPlugin("no-unload")).resolves.not.toThrow();
  });
  
  it("should list all registered plugins", () => {
    const plugin1 = createMockPlugin("plugin1", ["tool"]);
    const plugin2 = createMockPlugin("plugin2", ["provider"]);
    
    pluginRegistry.registerPlugin(plugin1);
    pluginRegistry.registerPlugin(plugin2);
    
    const list = pluginRegistry.listPlugins();
    expect(list).toHaveLength(2);
    expect(list.map(p => p.id)).toEqual(expect.arrayContaining(["plugin1", "plugin2"]));
  });
});

describe("Plugin Traits", () => {
  it("should create and use a tool trait", async () => {
    const tool = new MockToolTrait();
    
    expect(tool.traitType).toBe("tool");
    expect(tool.toolId).toBe("mock_tool");
    expect(tool.toolName).toBe("Mock Tool");
    
    const definition = tool.getDefinition();
    expect(definition.type).toBe("function");
    expect(definition.function.name).toBe("mock_tool");
    
    const result = await tool.execute({ input: "test" });
    expect(result).toBe("Executed with: test");
  });
  
  it("should create and use a provider trait", async () => {
    const provider = new MockProviderTrait();
    
    expect(provider.traitType).toBe("provider");
    expect(provider.name).toBe("mock_provider");
    
    const models = await provider.listModels();
    expect(models).toEqual(["mock-model-1", "mock-model-2"]);
    
    const response = await provider.chat([], []);
    expect(response.text).toBe("Mock response");
    expect(response.stopReason).toBe("stop");
    
    const tokens = provider.countTokens([{ role: "user", content: "hello world" }]);
    expect(tokens).toBeGreaterThan(0);
  });
  
  it("should return null for unsupported trait", () => {
    const plugin = createMockPlugin("test-plugin", ["tool"]);
    
    const providerTrait = plugin.getTrait("provider");
    expect(providerTrait).toBeNull();
  });
});
