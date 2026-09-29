import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { sha256 } from '../../common/utils/crypto.util';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchResultItem } from './engines/search-engine.interface';

/**
 * Shared, TTL-based cache of raw engine results, stored in PostgreSQL so it is
 * consistent across horizontally scaled API instances. Keyed by engine + normalized query.
 */
@Injectable()
export class SearchCacheService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttlMs = config.get('search.cacheTtlSeconds', { infer: true }) * 1000;
  }

  get enabled(): boolean {
    return this.ttlMs > 0;
  }

  async get(engine: string, normalizedQuery: string): Promise<SearchResultItem[] | null> {
    if (!this.enabled) return null;
    const entry = await this.prisma.searchCache.findUnique({
      where: { key: this.key(engine, normalizedQuery) },
    });
    return entry && entry.expiresAt > new Date()
      ? (entry.results as unknown as SearchResultItem[])
      : null;
  }

  async set(engine: string, normalizedQuery: string, results: SearchResultItem[]): Promise<void> {
    if (!this.enabled) return;
    const key = this.key(engine, normalizedQuery);
    const data = {
      engine,
      query: normalizedQuery,
      results: results as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + this.ttlMs),
    };
    await this.prisma.searchCache.upsert({
      where: { key },
      create: { key, ...data },
      update: { ...data, createdAt: new Date() },
    });
  }

  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.searchCache.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  }

  private key(engine: string, normalizedQuery: string): string {
    return sha256(`${engine}:${normalizedQuery}`);
  }
}
