export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessageInput {
  role: ChatRole;
  content: string;
}

/** Where and how to reach a vendor API (decrypted key, resolved base URL). */
export interface ProviderConnection {
  apiKey: string;
  baseUrl: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
  temperature?: number;
  /** Aborts the upstream request (e.g. client disconnected). */
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  usage: TokenUsage;
}

export type CompletionChunk =
  { type: 'delta'; text: string } | { type: 'usage'; usage: TokenUsage };

/** Vendor-specific translation between EchoGPT's chat model and a provider's REST API. */
export interface AiProviderAdapter {
  complete(connection: ProviderConnection, request: CompletionRequest): Promise<CompletionResult>;
  stream(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): AsyncIterable<CompletionChunk>;
  /** Cheap authenticated call proving the key and endpoint work. */
  healthCheck(connection: ProviderConnection): Promise<void>;
}
