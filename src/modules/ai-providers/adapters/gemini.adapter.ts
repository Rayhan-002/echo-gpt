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

interface GeminiResponse {
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const extractText = (response: GeminiResponse): string =>
  (response.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');

const toUsage = (response: GeminiResponse) => ({
  promptTokens: response.usageMetadata?.promptTokenCount,
  completionTokens: response.usageMetadata?.candidatesTokenCount,
});

/** Google Gemini API (generateContent / streamGenerateContent). */
@Injectable()
export class GeminiAdapter implements AiProviderAdapter {
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.timeoutMs = config.get('ai.requestTimeoutMs', { infer: true });
  }

  async complete(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    const response = await this.post(connection, request, 'generateContent');
    const body = (await response.json()) as GeminiResponse;
    return {
      content: extractText(body),
      model: body.modelVersion ?? request.model,
      usage: toUsage(body),
    };
  }

  async *stream(
    connection: ProviderConnection,
    request: CompletionRequest,
  ): AsyncIterable<CompletionChunk> {
    const response = await this.post(connection, request, 'streamGenerateContent?alt=sse');
    let lastUsage: GeminiResponse | undefined;

    for await (const { data } of parseSse(response.body)) {
      const chunk = JSON.parse(data) as GeminiResponse;
      const text = extractText(chunk);
      if (text) yield { type: 'delta', text };
      if (chunk.usageMetadata) lastUsage = chunk;
    }
    // Usage metadata is cumulative; the last chunk carries the totals.
    if (lastUsage) yield { type: 'usage', usage: toUsage(lastUsage) };
  }

  async healthCheck(connection: ProviderConnection): Promise<void> {
    await providerFetch(`${trimTrailingSlash(connection.baseUrl)}/models?pageSize=1`, {
      headers: this.headers(connection),
      timeoutMs: this.timeoutMs,
    });
  }

  private post(connection: ProviderConnection, request: CompletionRequest, action: string) {
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => ({ text: message.content }));

    const model = encodeURIComponent(request.model);
    return providerFetch(`${trimTrailingSlash(connection.baseUrl)}/models/${model}:${action}`, {
      method: 'POST',
      headers: this.headers(connection),
      timeoutMs: this.timeoutMs,
      signal: request.signal,
      body: {
        ...(system.length ? { systemInstruction: { parts: system } } : {}),
        contents: request.messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
        generationConfig: {
          maxOutputTokens: request.maxTokens,
          temperature: request.temperature,
        },
      },
    });
  }

  /** Header auth keeps the key out of URLs (and therefore out of proxy/access logs). */
  private headers(connection: ProviderConnection) {
    return { 'x-goog-api-key': connection.apiKey };
  }
}
