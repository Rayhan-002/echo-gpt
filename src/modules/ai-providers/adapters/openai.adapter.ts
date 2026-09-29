import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import {
  AiProviderAdapter,
  CompletionChunk,
  CompletionRequest,
  CompletionResult,
  ProviderConnection,
} from './ai-provider-adapter.interface';
import { parseSse, providerFetch, trimTrailingSlash } from './provider-http';

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenAiCompletion {
  model: string;
  choices: { message?: { content?: string | null }; delta?: { content?: string | null } }[];
  usage?: OpenAiUsage | null;
}

const toUsage = (usage?: OpenAiUsage | null) => ({
  promptTokens: usage?.prompt_tokens,
  completionTokens: usage?.completion_tokens,
});

/** OpenAI Chat Completions API (also works with OpenAI-compatible gateways via baseUrl). */
@Injectable()
export class OpenAiAdapter implements AiProviderAdapter {
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.timeoutMs = config.get('ai.requestTimeoutMs', { infer: true });
  }

  async complete(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    const response = await this.post(connection, request, false);
    const body = (await response.json()) as OpenAiCompletion;
    return {
      content: body.choices[0]?.message?.content ?? '',
      model: body.model ?? request.model,
      usage: toUsage(body.usage),
    };
  }

  async *stream(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): AsyncIterable<CompletionChunk> {
    const response = await this.post(connection, request, true);
    for await (const { data } of parseSse(response.body)) {
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data) as OpenAiCompletion;
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield { type: 'delta', text };
      if (chunk.usage) yield { type: 'usage', usage: toUsage(chunk.usage) };
    }
  }

  async healthCheck(connection: ProviderConnection): Promise<void> {
    await providerFetch(`${trimTrailingSlash(connection.baseUrl)}/models`, {
      headers: this.headers(connection),
      timeoutMs: this.timeoutMs,
    });
  }

  private post(connection: ProviderConnection, request: CompletionRequest, stream: boolean) {
    return providerFetch(`${trimTrailingSlash(connection.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: this.headers(connection),
      timeoutMs: this.timeoutMs,
      signal: request.signal,
      body: {
        model: request.model,
        messages: request.messages,
        max_completion_tokens: request.maxTokens,
        temperature: request.temperature,
        stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      },
    });
  }

  private headers(connection: ProviderConnection) {
    return { authorization: `Bearer ${connection.apiKey}` };
  }
}
