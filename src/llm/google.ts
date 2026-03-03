import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { Content, Part, Tool as GeminiTool, FunctionDeclaration } from "@google/generative-ai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type OpenAI from "openai";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:google");

/**
 * Google Gemini Provider
 * Access to Gemini models with function calling support
 */
export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private client: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "gemini-1.5-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.defaultModel = defaultModel;
    log.info(`Google provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const modelName = options?.model ?? this.defaultModel;
    
    log.debug(`Calling Google Gemini — model: ${modelName}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const { systemInstruction, contents } = this.convertMessages(messages);
    const tools = this.convertTools(toolDefinitions);

    const modelParams: any = {
      model: modelName,
      systemInstruction,
    };

    if (tools.length > 0) {
      modelParams.tools = tools;
    }

    const model: GenerativeModel = this.client.getGenerativeModel(modelParams);

    const generationConfig: any = {
      maxOutputTokens: options?.maxTokens ?? 2000,
    };
    
    if (options?.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options?.topP !== undefined) {
      generationConfig.topP = options.topP;
    }

    const result = await model.generateContent({
      contents,
      generationConfig,
    });

    const response = result.response;
    const candidate = response.candidates?.[0];
    
    if (!candidate) {
      throw new Error("Google Gemini returned no candidates");
    }

    let text = "";
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        text += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          },
        });
      }
    }

    log.debug(
      `Google response — stop: ${candidate.finishReason}, text: ${text.length} chars, tools: ${toolCalls.length}`
    );

    const llmResponse: LLMResponse = {
      stopReason: candidate.finishReason ?? "STOP",
      text,
      toolCalls,
    };

    // Google doesn't provide token counts in the same way, estimate if needed
    if (response.usageMetadata) {
      llmResponse.usage = {
        promptTokens: response.usageMetadata.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata.totalTokenCount ?? 0,
      };
    }

    return llmResponse;
  }

  private convertMessages(messages: ChatCompletionMessageParam[]): {
    systemInstruction: string | undefined;
    contents: Content[];
  } {
    let systemInstruction: string | undefined;
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = typeof msg.content === "string" ? msg.content : "";
      } else if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: typeof msg.content === "string" ? msg.content : "" }],
        });
      } else if (msg.role === "assistant") {
        const parts: Part[] = [];
        
        if (msg.content) {
          const content = typeof msg.content === "string" ? msg.content : "";
          parts.push({ text: content });
        }

        if ("tool_calls" in msg && msg.tool_calls) {
          for (const toolCall of msg.tool_calls) {
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
              },
            });
          }
        }

        contents.push({ role: "model", parts });
      } else if (msg.role === "tool") {
        // Google expects function responses as function response parts
        contents.push({
          role: "function",
          parts: [{
            functionResponse: {
              name: "tool_result", // Generic name, would need mapping in real system
              response: { result: msg.content },
            },
          }],
        });
      }
    }

    return { systemInstruction, contents };
  }

  private convertTools(tools: ChatCompletionTool[]): GeminiTool[] {
    if (tools.length === 0) return [];

    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
      parameters: tool.function.parameters as any,
    }));

    return [{ functionDeclarations }];
  }
}
