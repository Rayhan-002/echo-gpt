import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProviderHealthStatus } from '@prisma/client';
import { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiProvidersService } from '../../ai-providers/ai-providers.service';
import { SEARCH_ENGINE, SearchEngine } from '../../search/engines/search-engine.interface';
import { SearchCacheService } from '../../search/search-cache.service';
import { MaintenanceResultDto, SystemHealthDto } from '../dto/admin-dashboard.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Revoked/expired sessions are kept briefly for auditing before being purged. */
const SESSION_GRACE_DAYS = 7;

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private readonly logRetentionDays: number;
  private readonly environment: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProvidersService,
    private readonly searchCache: SearchCacheService,
    @Inject(SEARCH_ENGINE) private readonly searchEngine: SearchEngine,
    config: ConfigService<AppConfig, true>,
  ) {
    this.logRetentionDays = config.get('logs.retentionDays', { infer: true });
    this.environment = config.get('app.env', { infer: true });
  }

  async health(): Promise<SystemHealthDto> {
    const [database, providers, cachedQueries] = await Promise.all([
      this.databaseHealth(),
      this.providers.findAll(),
      this.prisma.searchCache.count({ where: { expiresAt: { gt: new Date() } } }).catch(() => 0),
    ]);
    const memory = process.memoryUsage();
    const unhealthyProvider = providers.some(
      (p) => p.isEnabled && p.healthStatus === ProviderHealthStatus.UNHEALTHY,
    );

    return {
      status: database.status === 'down' ? 'down' : unhealthyProvider ? 'degraded' : 'ok',
      database,
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        environment: this.environment,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        isEnabled: p.isEnabled,
        isDefault: p.isDefault,
        healthStatus: p.healthStatus,
        lastCheckedAt: p.lastHealthCheckAt,
        latencyMs: p.lastHealthLatencyMs,
      })),
      search: { engine: this.searchEngine.name, cachedQueries },
      timestamp: new Date(),
    };
  }

  /** Purges expired auth artifacts, stale cache entries and old request logs. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'maintenance' })
  async runMaintenance(): Promise<MaintenanceResultDto> {
    const now = Date.now();
    const sessionCutoff = new Date(now - SESSION_GRACE_DAYS * DAY_MS);
    const logCutoff = new Date(now - this.logRetentionDays * DAY_MS);

    const [sessions, verificationTokens, searchCache, requestLogs] = await Promise.all([
      this.prisma.session
        .deleteMany({
          where: {
            OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }],
          },
        })
        .then((r) => r.count),
      this.prisma.verificationToken
        .deleteMany({
          where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date(now) } }] },
        })
        .then((r) => r.count),
      this.searchCache.purgeExpired(),
      this.prisma.apiUsageLog
        .deleteMany({ where: { createdAt: { lt: logCutoff } } })
        .then((r) => r.count),
    ]);

    const result = { sessions, verificationTokens, searchCache, requestLogs };
    this.logger.log(`Maintenance completed: ${JSON.stringify(result)}`);
    return result;
  }

  /** Keeps provider health fresh for the dashboard and the system health endpoint. */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'provider-health' })
  async refreshProviderHealth(): Promise<void> {
    await this.providers.checkAllHealth();
  }

  private async databaseHealth(): Promise<SystemHealthDto['database']> {
    const startedAt = Date.now();
    try {
      const [{ size }] = await this.prisma.$queryRaw<{ size: bigint }[]>`
        SELECT pg_database_size(current_database()) AS size`;
      return { status: 'up', latencyMs: Date.now() - startedAt, sizeBytes: Number(size) };
    } catch (error) {
      this.logger.error('Database health check failed', (error as Error).stack);
      return { status: 'down', latencyMs: null, sizeBytes: null };
    }
  }
}
