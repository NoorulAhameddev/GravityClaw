import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions, StreamCallback } from "../types/llm.js";

const RESPONSES: Record<string, string> = {
  default: "I'm a mock agent responding without an LLM API. I can help with file operations, running shell commands, and other tasks.",
  hello: "Hello! I'm running in mock mode for testing.",
  "how are": "I'm working perfectly in mock test mode!",
  "what is": "In mock mode, I provide simple responses. The tool filtering and safety features are fully functional.",
  help: "Available in mock mode: list files, read files, run shell commands (ls, dir, echo, npm run), delete files, HTTP requests, and more.",
};

function getResponse(userContent: string): string {
  for (const [key, value] of Object.entries(RESPONSES)) {
    if (userContent.includes(key)) {
      return value;
    }
  }
  return RESPONSES["default"] ?? "Mock response";
}

/**
 * Mock LLM Provider for testing - always returns tool calls or simple responses
 * based on keyword matching. No external API calls.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    _options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const lastMessage = messages[messages.length - 1];
    const userContent = typeof lastMessage?.content === "string" 
      ? lastMessage.content.toLowerCase() 
      : "";

    const availableTools = toolDefinitions.map(t => t.function.name);
    
    const keywordToTool: Record<string, string[]> = {
      "list": ["list_files", "run_shell"],
      "files": ["list_files", "read_file"],
      "delete": ["delete_file", "deleteFact"],
      "read": ["read_file"],
      "write": ["write_file"],
      "create": ["create_file"],
      "search": ["search_code", "grep_search"],
      "run": ["run_shell"],
      "shell": ["run_shell"],
      "command": ["run_shell"],
      "git": ["run_shell"],
      "npm": ["run_shell"],
      "node": ["run_shell"],
      "python": ["run_shell"],
      "http": ["http_request"],
      "fetch": ["http_request"],
      "url": ["http_request"],
      "calendar": ["calendar_create_event", "calendar_list_events"],
      "schedule": ["calendar_create_event", "calendar_list_events"],
      "task": ["create_task", "list_tasks"],
      "todo": ["create_task", "list_tasks"],
      "weather": ["get_weather"],
      "web": ["http_request"],
      "memory": ["store_memory", "search_memory"],
      "remind": ["create_reminder"],
    };

    let matchedTools: string[] = [];
    for (const [keyword, tools] of Object.entries(keywordToTool)) {
      if (userContent.includes(keyword)) {
        matchedTools = [...matchedTools, ...tools];
      }
    }
    
    matchedTools = [...new Set(matchedTools)].filter(t => availableTools.includes(t));

    if (matchedTools.length > 0 && availableTools.length > 0) {
      const selectedTool = matchedTools[0]!;
      
      let toolArgs: Record<string, unknown> = {};
      
      if (selectedTool === "list_files" || selectedTool === "run_shell") {
        // Extract actual command from user message
        const cmdMatch = userContent.match(/(?:command|run|execute|cmd)\s+(.+?)(?:\s|$)/);
        if (cmdMatch) {
          toolArgs = { command: cmdMatch[1]! };
        } else if (userContent.includes("list") || userContent.includes("files")) {
          toolArgs = { command: "ls -la" };
        } else if (userContent.includes("current")) {
          toolArgs = { command: "dir" };
        } else {
          toolArgs = { command: "echo test" };
        }
      } else if (selectedTool === "read_file") {
        const pathMatch = userContent.match(/(?:file|read|path):\s*(\S+)/);
        toolArgs = { filePath: pathMatch?.[1] ?? "README.md" };
      } else if (selectedTool === "delete_file") {
        toolArgs = { filePath: "/tmp/test.txt" };
      } else if (selectedTool === "http_request") {
        toolArgs = { url: "https://example.com", method: "GET" };
      } else if (selectedTool.includes("calendar") || selectedTool.includes("task")) {
        toolArgs = { title: "Test Event", time: "now" };
      } else if (selectedTool === "get_weather") {
        toolArgs = { location: "test" };
      } else {
        toolArgs = { query: userContent.substring(0, 50) };
      }

      return {
        stopReason: "tool_calls",
        text: "",
        toolCalls: [{
          id: `mock-call-${Date.now()}`,
          type: "function" as const,
          function: {
            name: selectedTool,
            arguments: JSON.stringify(toolArgs),
          },
        }],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }

    const responseText = getResponse(userContent);

    return {
      stopReason: "stop",
      text: responseText,
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  }

  async chatStream(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions & { onToken?: StreamCallback }
  ): Promise<LLMResponse> {
    const result = await this.chat(messages, toolDefinitions, options);
    const onToken = options?.onToken;

    if (onToken && result.text) {
      for (const char of result.text) {
        onToken(char, false);
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    onToken?.("", true);
    return result;
  }

  async listModels(): Promise<string[]> {
    return ["mock-model"];
  }

  countTokens(messages: ChatCompletionMessageParam[]): number {
    return messages.reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : 50), 0);
  }

  destroy(): void {
    // Mock provider has no resources to clean up
  }
}