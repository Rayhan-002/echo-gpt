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
import { parseSse, ProviderRequestError, providerFetch, trimTrailingSlash } from './provider-http';

const ANTHROPIC_VERSION = '2023-06-01';
/** The Messages API requires max_tokens. */
const DEFAULT_MAX_TOKENS = 4096;

interface AnthropicMessage {
  model: string;
  content: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicStreamEvent {
  type: string;
  message?: AnthropicMessage;
  delta?: { type?: string; text?: string };
  usage?: { output_tokens?: number };
  error?: { message?: string };
}

/** Anthropic Messages API (Claude models). */
@Injectable()
export class AnthropicAdapter implements AiProviderAdapter {
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.timeoutMs = config.get('ai.requestTimeoutMs', { infer: true });
  }

  async complete(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    const response = await this.post(connection, request, false);
    const body = (await response.json()) as AnthropicMessage;
    return {
      content: body.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join(''),
      model: body.model ?? request.model,
      usage: {
        promptTokens: body.usage?.input_tokens,
        completionTokens: body.usage?.output_tokens,
      },
    };
  }

  async *stream(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): AsyncIterable<CompletionChunk> {
    const response = await this.post(connection, request, true);
    let promptTokens: number | undefined;

    for await (const { data } of parseSse(response.body)) {
      const event = JSON.parse(data) as AnthropicStreamEvent;
      switch (event.type) {
        case 'message_start':
          promptTokens = event.message?.usage?.input_tokens;
          break;
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'delta', text: event.delta.text };
          }
          break;
        case 'message_delta':
          yield {
            type: 'usage',
            usage: { promptTokens, completionTokens: event.usage?.output_tokens },
          };
          break;
        case 'error':
          throw new ProviderRequestError(event.error?.message ?? 'Anthropic stream error');
      }
    }
  }

  async healthCheck(connection: ProviderConnection): Promise<void> {
    await providerFetch(`${trimTrailingSlash(connection.baseUrl)}/v1/models?limit=1`, {
      headers: this.headers(connection),
      timeoutMs: this.timeoutMs,
    });
  }

  private post(connection: ProviderConnection, request: CompletionRequest, stream: boolean) {
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');

    return providerFetch(`${trimTrailingSlash(connection.baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: this.headers(connection),
      timeoutMs: this.timeoutMs,
      signal: request.signal,
      body: {
        model: request.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: request.temperature,
        system: system || undefined,
        messages: request.messages
          .filter((message) => message.role !== 'system')
          .map(({ role, content }) => ({ role, content })),
        stream,
      },
    });
  }

  private headers(connection: ProviderConnection) {
    return { 'x-api-key': connection.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }
}
