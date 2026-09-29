import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DuckDuckGoSearchEngine } from './engines/duckduckgo.engine';
import { SEARCH_ENGINE, SearchEngine } from './engines/search-engine.interface';
import { TavilySearchEngine } from './engines/tavily.engine';
import { SearchCacheService } from './search-cache.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

const SEARCH_TIMEOUT_MS = 10_000;

@Module({
  imports: [AiProvidersModule, SubscriptionsModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchCacheService,
    {
      provide: SEARCH_ENGINE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): SearchEngine => {
        const { engine, tavilyApiKey } = config.get('search', { infer: true });
        return engine === 'tavily'
          ? new TavilySearchEngine(tavilyApiKey, SEARCH_TIMEOUT_MS)
          : new DuckDuckGoSearchEngine(SEARCH_TIMEOUT_MS);
      },
    },
  ],
  exports: [SearchCacheService],
})
export class SearchModule {}
