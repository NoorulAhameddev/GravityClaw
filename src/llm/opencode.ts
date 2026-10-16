import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import type { LLMProvider, LLMResponse, LLMChatOptions, StreamCallback } from '../types/llm.js';
import { createLogger } from '../logger.ts';
import { extractThinking } from './base.ts';

const log = createLogger('llm:opencode');

export class OpenCodeProvider implements LLMProvider {
  readonly name = 'opencode';
  private defaultModel: string;
  private baseUrl: string;
  private port: number;
  private autoStart: boolean;
  private sessionMap = new Map<string, string>();
  private serverReady = false;

  constructor(
    defaultModel: string = 'deepseek-v4.1-flash-free',
    baseUrl: string = 'http://127.0.0.1:4096',
    autoStart: boolean = true,
  ) {
    this.defaultModel =
      !defaultModel || defaultModel === 'openrouter/free' || defaultModel === 'nemotron-3.5-lightning-free'
        ? 'deepseek-v4.1-flash-free'
        : defaultModel;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    const url = new URL(this.baseUrl);
    this.port = parseInt(url.port || '4096', 10);
    this.autoStart = autoStart;
  }

  private findOpenCodeExecutable(): string {
    const localAppData = process.env.LOCALAPPDATA || '';
    const wingetPath = path.join(
      localAppData,
      'Microsoft',
      'WinGet',
      'Packages',
      'SST.opencode_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'opencode.exe',
    );
    if (existsSync(wingetPath)) {
      return wingetPath;
    }
    return 'opencode';
  }

  private async isServerListening(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/global/health`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      try {
        const res2 = await fetch(`${this.baseUrl}/doc`, {
          signal: AbortSignal.timeout(1500),
        });
        return res2.ok;
      } catch {
        return false;
      }
    }
  }

  private async ensureServer(): Promise<void> {
    if (this.serverReady) {
      return;
    }

    const alive = await this.isServerListening();
    if (alive) {
      this.serverReady = true;
      return;
    }

    if (!this.autoStart) {
      throw new Error(
        `OpenCode server at ${this.baseUrl} is unreachable and autoStart is disabled. Run 'opencode serve --port ${this.port}' first.`,
      );
    }

    log.info(`OpenCode server not detected at ${this.baseUrl}. Launching background daemon...`);
    const exe = this.findOpenCodeExecutable();

    const child = spawn(exe, ['serve', '--port', String(this.port)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    const startTime = Date.now();
    const timeoutMs = 12000;
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (await this.isServerListening()) {
        this.serverReady = true;
        log.info(`OpenCode server successfully connected at ${this.baseUrl}`);
        return;
      }
    }

    throw new Error(
      `Timed out waiting for OpenCode server to start on port ${this.port}. Please start it manually with 'opencode serve --port ${this.port}'.`,
    );
  }

  private async getOrCreateOpenCodeSession(key: string): Promise<string> {
    const existing = this.sessionMap.get(key);
    if (existing) {
      return existing;
    }

    await this.ensureServer();

    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: process.cwd() }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create OpenCode session (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { id: string };
    this.sessionMap.set(key, data.id);
    return data.id;
  }

  private formatToolsInstruction(tools: ChatCompletionTool[]): string {
    if (!tools || tools.length === 0) return '';
    const toolList = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {},
    }));

    return `\n\nYou have access to the following system tools:
<tools>
${JSON.stringify(toolList, null, 2)}
</tools>

When you need to call a tool to inspect the machine or execute actions, respond ONLY with one or more <tool_call> tags:
<tool_call>
{"name": "tool_name", "arguments": {"arg": "value"}}
</tool_call>
When you have the final answer or do not need a tool, respond normally with concise text without <tool_call> tags.`;
  }

  private parseToolCalls(text: string): {
    cleanText: string;
    toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  } {
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
    let cleanText = text;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = toolCallRegex.exec(text)) !== null) {
      const rawJson = (match[1] || '').trim();
      try {
        const parsed = JSON.parse(rawJson);
        const name = parsed.name || parsed.function || '';
        const args =
          typeof parsed.arguments === 'string'
            ? parsed.arguments
            : JSON.stringify(parsed.arguments || parsed.args || {});

        if (name) {
          toolCalls.push({
            id: `call_${Date.now()}_${idx++}`,
            type: 'function',
            function: { name, arguments: args },
          });
        }
      } catch {
        log.warn(`Failed to parse tool call JSON: ${rawJson}`);
      }
    }

    cleanText = cleanText.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();

    return { cleanText, toolCalls };
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions,
  ): Promise<LLMResponse> {
    await this.ensureServer();

    const model = options?.model ?? this.defaultModel;
    const sessionKey = (options?.__sessionId as string) || 'default';
    const opencodeSessionId = await this.getOrCreateOpenCodeSession(sessionKey);

    let systemPrompt = '';
    const conversationTurns: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const sysContent = typeof msg.content === 'string' ? msg.content : '';
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${sysContent}` : sysContent;
      } else if (msg.role === 'user') {
        const userContent =
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        conversationTurns.push(`User: ${userContent}`);
      } else if (msg.role === 'assistant') {
        const asstContent = typeof msg.content === 'string' ? msg.content : '';
        const toolCallsInfo = msg.tool_calls
          ? msg.tool_calls
              .map(
                (tc) =>
                  `<tool_call>\n${JSON.stringify({ name: tc.function.name, arguments: tc.function.arguments })}\n</tool_call>`,
              )
              .join('\n')
          : '';
        conversationTurns.push(`Assistant: ${asstContent} ${toolCallsInfo}`.trim());
      } else if (msg.role === 'tool') {
        const toolContent =
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        conversationTurns.push(`Tool Result [${msg.tool_call_id}]:\n${toolContent}`);
      }
    }

    if (toolDefinitions.length > 0) {
      systemPrompt += this.formatToolsInstruction(toolDefinitions);
    }

    const latestTurn = conversationTurns[conversationTurns.length - 1] || 'Hello';
    const historyContext =
      conversationTurns.length > 1 ? conversationTurns.slice(0, -1).join('\n\n') : '';

    const promptText = historyContext
      ? `Prior Conversation:\n${historyContext}\n\nCurrent Request:\n${latestTurn}`
      : latestTurn;

    const payload = {
      model: {
        providerID: 'opencode',
        modelID: model,
      },
      system: systemPrompt || undefined,
      parts: [
        {
          type: 'text',
          text: promptText,
        },
      ],
    };

    const res = await fetch(`${this.baseUrl}/session/${opencodeSessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenCode chat error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      info?: {
        cost?: number;
        finish?: string;
        tokens?: {
          input?: number;
          output?: number;
          total?: number;
          reasoning?: number;
        };
      };
      parts?: Array<{
        type: string;
        text?: string;
        callID?: string;
        tool?: string;
        args?: Record<string, unknown>;
      }>;
    };

    let rawText = '';
    let rawThought = '';
    const nativeToolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    for (const part of data.parts || []) {
      if (part.type === 'reasoning' && part.text) {
        rawThought = rawThought ? `${rawThought}\n${part.text}` : part.text;
      } else if (part.type === 'text' && part.text) {
        rawText += part.text;
      } else if ((part.type === 'tool-call' || part.type === 'tool_use') && part.tool) {
        nativeToolCalls.push({
          id: part.callID || `call_${Date.now()}_${nativeToolCalls.length}`,
          type: 'function',
          function: {
            name: part.tool,
            arguments: JSON.stringify(part.args || {}),
          },
        });
      }
    }

    const { cleanText: parsedText, toolCalls: extractedCalls } = this.parseToolCalls(rawText);
    const { text: finalText, thought: embeddedThought } = extractThinking(parsedText, rawThought);

    const allToolCalls = [...nativeToolCalls, ...extractedCalls];
    const combinedThought = [rawThought, embeddedThought].filter(Boolean).join('\n\n') || undefined;

    const stopReason = allToolCalls.length > 0 ? 'tool_calls' : (data.info?.finish ?? 'stop');

    const result: LLMResponse = {
      stopReason,
      text: finalText,
      toolCalls: allToolCalls,
    };

    if (combinedThought) {
      result.thought = combinedThought;
    }

    if (data.info?.tokens) {
      result.usage = {
        promptTokens: data.info.tokens.input ?? 0,
        completionTokens: data.info.tokens.output ?? 0,
        totalTokens: data.info.tokens.total ?? 0,
      };
    }

    return result;
  }

  async chatStream?(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions & { onToken?: StreamCallback },
  ): Promise<LLMResponse> {
    const res = await this.chat(messages, toolDefinitions, options);
    if (options?.onToken && res.text) {
      options.onToken(res.text, true);
    }
    return res;
  }

  async listModels(): Promise<string[]> {
    try {
      await this.ensureServer();
      const res = await fetch(`${this.baseUrl}/provider`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [this.defaultModel];
      const data = (await res.json()) as {
        all?: Array<{ id: string; models?: Record<string, unknown> }>;
      };
      const opencodeEntry = data.all?.find((p) => p.id === 'opencode');
      if (opencodeEntry?.models) {
        return Object.keys(opencodeEntry.models);
      }
      return [this.defaultModel];
    } catch {
      return [this.defaultModel];
    }
  }

  destroy(): void {
    this.sessionMap.clear();
  }
}
