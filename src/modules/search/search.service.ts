import { BadGatewayException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, WebSearch } from '@prisma/client';
import { UpstreamRequestError } from '../../common/http/upstream-http';
import { Paginated, paginate, toPrismaPage } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { QuotaService } from '../subscriptions/quota.service';
import {
  MAX_SEARCH_RESULTS,
  PerformSearchResponseDto,
  RecentSearchDto,
  SearchHistoryQueryDto,
  SearchQueryDto,
  SearchResponseDto,
} from './dto/search.dto';
import { SEARCH_ENGINE, SearchEngine, SearchResultItem } from './engines/search-engine.interface';
import { SearchCacheService } from './search-cache.service';

const SUMMARY_MAX_TOKENS = 800;
const SUMMARY_SYSTEM_PROMPT =
  'You are the web search assistant of EchoGPT. Answer the user query concisely using ONLY the ' +
  'numbered search results provided. Cite sources inline as [n]. If the results do not contain ' +
  'the answer, say so briefly.';

/** Lower-cased, whitespace-collapsed form used for caching, history grouping and suggestions. */
export const normalizeQuery = (query: string): string =>
  query.trim().replace(/\s+/g, ' ').toLowerCase();

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SearchCacheService,
    private readonly providers: AiProvidersService,
    private readonly quota: QuotaService,
    @Inject(SEARCH_ENGINE) private readonly engine: SearchEngine,
  ) {}

  /**
   * Runs a web search (cache first), optionally summarizes the results with an
   * AI provider, and records the search in the user's history.
   */
  async search(userId: string, dto: SearchQueryDto): Promise<PerformSearchResponseDto> {
    const normalizedQuery = normalizeQuery(dto.query);
    const { results: allResults, fromCache } = await this.fetchResults(normalizedQuery);
    const results = allResults.slice(0, dto.limit);

    const summary = dto.summarize
      ? await this.summarize(userId, dto, results)
      : { aiSummary: null, providerId: null, error: null };

    const record = await this.prisma.webSearch.create({
      data: {
        userId,
        query: dto.query,
        normalizedQuery,
        engine: this.engine.name,
        resultCount: results.length,
        results: results as unknown as Prisma.InputJsonValue,
        aiSummary: summary.aiSummary,
        providerId: summary.providerId,
        fromCache,
      },
    });

    return { ...SearchResponseDto.from(record), summaryError: summary.error };
  }

  async history(userId: string, query: SearchHistoryQueryDto): Promise<Paginated<WebSearch>> {
    const where: Prisma.WebSearchWhereInput = {
      userId,
      ...(query.q ? { query: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.webSearch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toPrismaPage(query),
      }),
      this.prisma.webSearch.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  async findOne(userId: string, id: string): Promise<WebSearch> {
    const search = await this.prisma.webSearch.findFirst({ where: { id, userId } });
    if (!search) {
      throw new NotFoundException('Search not found');
    }
    return search;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.webSearch.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw new NotFoundException('Search not found');
    }
  }

  async clearHistory(userId: string): Promise<void> {
    await this.prisma.webSearch.deleteMany({ where: { userId } });
  }

  /** Distinct queries the user searched most recently. */
  async recent(userId: string, limit: number): Promise<RecentSearchDto[]> {
    const groups = await this.prisma.webSearch.groupBy({
      by: ['normalizedQuery'],
      where: { userId },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: limit,
    });
    return groups.map((group) => ({
      query: group.normalizedQuery,
      count: group._count._all,
      lastSearchedAt: group._max.createdAt as Date,
    }));
  }

  /**
   * Suggestions for a prefix: the user's own matching history first (most
   * frequent), then engine autocomplete. Other users' queries are never
   * suggested, since search history is private.
   */
  async suggestions(userId: string, prefix: string, limit: number): Promise<string[]> {
    const normalizedPrefix = normalizeQuery(prefix);
    const [own, remote] = await Promise.all([
      this.prisma.webSearch.groupBy({
        by: ['normalizedQuery'],
        where: { userId, normalizedQuery: { startsWith: normalizedPrefix } },
        _count: { _all: true },
        orderBy: [{ _count: { normalizedQuery: 'desc' } }, { normalizedQuery: 'asc' }],
        take: limit,
      }),
      // Autocomplete is best effort; failures must not break suggestions.
      this.engine.suggest(normalizedPrefix, limit).catch((error: Error) => {
        this.logger.debug(`Engine suggestions unavailable: ${error.message}`);
        return [] as string[];
      }),
    ]);

    const merged = [...own.map((group) => group.normalizedQuery), ...remote.map(normalizeQuery)];
    return [...new Set(merged)].slice(0, limit);
  }

  private async fetchResults(
    normalizedQuery: string,
  ): Promise<{ results: SearchResultItem[]; fromCache: boolean }> {
    const cached = await this.cache.get(this.engine.name, normalizedQuery);
    if (cached) {
      return { results: cached, fromCache: true };
    }

    try {
      const results = await this.engine.search(normalizedQuery, MAX_SEARCH_RESULTS);
      await this.cache.set(this.engine.name, normalizedQuery, results);
      return { results, fromCache: false };
    } catch (error) {
      if (error instanceof UpstreamRequestError) {
        this.logger.warn(`Search engine ${this.engine.name} failed: ${error.message}`);
        throw new BadGatewayException('The search engine is currently unavailable');
      }
      throw error;
    }
  }

  /**
   * Grounded AI answer over the results. Validation/quota errors propagate
   * (the caller asked for a summary it cannot have); a failing provider only
   * degrades the response, since the search itself succeeded.
   */
  private async summarize(userId: string, dto: SearchQueryDto, results: SearchResultItem[]) {
    const none = { aiSummary: null, providerId: null };
    if (results.length === 0) {
      return { ...none, error: 'No results to summarize' };
    }

    const { adapter, connection, model, provider } = await this.providers.resolve(
      dto.providerId,
      dto.model,
    );
    await this.quota.consume(userId);

    const sources = results
      .map((result, index) => `[${index + 1}] ${result.title}\n${result.url}\n${result.snippet}`)
      .join('\n\n');

    try {
      const completion = await adapter.complete(connection, {
        model,
        maxTokens: SUMMARY_MAX_TOKENS,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Query: ${dto.query}\n\nSearch results:\n\n${sources}` },
        ],
      });
      return { aiSummary: completion.content, providerId: provider.id, error: null };
    } catch (error) {
      await this.quota.refund(userId);
      const reason = error instanceof UpstreamRequestError ? error.message : 'unexpected error';
      this.logger.warn(`Search summary via ${provider.name} failed: ${reason}`);
      return { ...none, error: `${provider.name} could not summarize the results: ${reason}` };
    }
  }
}
