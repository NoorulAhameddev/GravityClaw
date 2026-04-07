declare module "cohere" {
  export interface CohereClientOptions {
    apiKey: string;
    baseUrl?: string;
    version?: string;
    fetch?: typeof fetch;
  }

  export interface ChatRequestParams {
    model: string;
    message: string;
    chatHistory?: Array<{ role: string; message: string }>;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    tools?: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
    toolChoice?: string | { type: string; function: { name: string } };
    preamble?: string;
  }

  export interface ChatResponse {
    text?: string;
    toolCalls?: Array<{
      id?: string;
      name?: string;
      parameters?: Record<string, unknown>;
    }>;
    tokenCount?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }

  export interface ListResponse<T> {
    data: T[];
  }

  export interface ModelInfo {
    id: string;
    name?: string;
    status?: string;
  }

  export class Client {
    constructor(options: CohereClientOptions);
    chat(params: ChatRequestParams): Promise<ChatResponse>;
    models: {
      list(): Promise<ListResponse<ModelInfo>>;
    };
  }

  export default Client;
}
