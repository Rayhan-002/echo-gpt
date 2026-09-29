import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { AiProviderAdapter } from './ai-provider-adapter.interface';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAiAdapter } from './openai.adapter';

/** Resolves the adapter implementing a provider type (strategy pattern). */
@Injectable()
export class AiAdapterRegistry {
  private readonly adapters: Record<AiProviderType, AiProviderAdapter>;

  constructor(openAi: OpenAiAdapter, anthropic: AnthropicAdapter, gemini: GeminiAdapter) {
    this.adapters = {
      [AiProviderType.OPENAI]: openAi,
      [AiProviderType.ANTHROPIC]: anthropic,
      [AiProviderType.GEMINI]: gemini,
    };
  }

  get(type: AiProviderType): AiProviderAdapter {
    return this.adapters[type];
  }
}
