import { Module } from '@nestjs/common';
import { AiAdapterRegistry } from './adapters/ai-adapter.registry';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAiAdapter } from './adapters/openai.adapter';
import { AdminProvidersController } from './admin-providers.controller';
import { AiProvidersService } from './ai-providers.service';
import { ProvidersController } from './providers.controller';

@Module({
  controllers: [ProvidersController, AdminProvidersController],
  providers: [
    AiProvidersService,
    AiAdapterRegistry,
    OpenAiAdapter,
    AnthropicAdapter,
    GeminiAdapter,
  ],
  exports: [AiProvidersService],
})
export class AiProvidersModule {}
