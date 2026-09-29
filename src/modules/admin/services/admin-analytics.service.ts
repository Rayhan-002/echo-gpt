import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MessageRole,
  Prisma,
  ProviderHealthStatus,
  RoleName,
  SubscriptionStatus,
} from '@prisma/client';
import { Paginated, paginate, toPrismaPage } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DateRangeQueryDto,
  EndpointUsageDto,
  ListRequestLogsQueryDto,
  ProviderUsageDto,
  RequestLogDto,
  UsagePointDto,
} from '../dto/admin-analytics.dto';
import { DashboardStatsDto } from '../dto/admin-dashboard.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const TOP_ENDPOINTS = 50;

interface DailyCount {
  day: Date;
  count: number;
}

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(): Promise<DashboardStatsDto> {
    const now = Date.now();
    const last24h = new Date(now - DAY_MS);
    const last7d = new Date(now - 7 * DAY_MS);

    const [
      users,
      activeUsers,
      verifiedUsers,
      admins,
      newUsers,
      planCounts,
      conversations,
      messages,
      recentMessages,
      searches,
      recentSearches,
      providers,
      apiStats,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.prisma.user.count({ where: { role: { name: RoleName.ADMIN } } }),
      this.prisma.user.count({ where: { createdAt: { gte: last7d } } }),
      this.activeSubscribersByPlan(),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.webSearch.count(),
      this.prisma.webSearch.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.aiProvider.findMany({
        select: { name: true, isEnabled: true, isDefault: true, healthStatus: true },
      }),
      this.prisma.$queryRaw<{ total: number; server_errors: number; avg_ms: number | null }[]>`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
               round(avg(duration_ms))::int AS avg_ms
        FROM api_usage_logs WHERE created_at >= ${last24h}`,
    ]);

    const [api] = apiStats;
    return {
      users: {
        total: users,
        active: activeUsers,
        verified: verifiedUsers,
        admins,
        newLast7Days: newUsers,
      },
      subscriptions: planCounts,
      activity: {
        conversations,
        messages,
        messagesLast24h: recentMessages,
        searches,
        searchesLast24h: recentSearches,
      },
      providers: {
        total: providers.length,
        enabled: providers.filter((p) => p.isEnabled).length,
        healthy: providers.filter((p) => p.healthStatus === ProviderHealthStatus.HEALTHY).length,
        defaultProvider: providers.find((p) => p.isDefault)?.name ?? null,
      },
      api: {
        requestsLast24h: api.total,
        serverErrorsLast24h: api.server_errors,
        errorRateLast24h: api.total ? Number((api.server_errors / api.total).toFixed(4)) : 0,
        avgLatencyMsLast24h: api.avg_ms,
      },
      generatedAt: new Date(),
    };
  }

  /** Daily time series (UTC days, zero-filled) of API traffic, AI usage, searches and signups. */
  async usage(range: DateRangeQueryDto): Promise<UsagePointDto[]> {
    const { from, to } = this.resolveRange(range);

    const [requests, aiMessages, searches, signups] = await Promise.all([
      this.dailyCounts(Prisma.sql`api_usage_logs`, from, to),
      this.prisma.$queryRaw<(DailyCount & { prompt: number; completion: number })[]>`
        SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
               count(*)::int AS count,
               coalesce(sum(prompt_tokens), 0)::int AS prompt,
               coalesce(sum(completion_tokens), 0)::int AS completion
        FROM messages
        WHERE role = 'ASSISTANT' AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1`,
      this.dailyCounts(Prisma.sql`web_searches`, from, to),
      this.dailyCounts(Prisma.sql`users`, from, to),
    ]);

    const byDay = <T extends DailyCount>(rows: T[]) =>
      new Map(rows.map((row) => [this.dayKey(row.day), row]));
    const [requestsByDay, messagesByDay, searchesByDay, signupsByDay] = [
      byDay(requests),
      byDay(aiMessages),
      byDay(searches),
      byDay(signups),
    ];

    const points: UsagePointDto[] = [];
    for (let day = this.startOfUtcDay(from); day < to; day = new Date(day.getTime() + DAY_MS)) {
      const key = this.dayKey(day);
      const ai = messagesByDay.get(key);
      points.push({
        date: key,
        apiRequests: requestsByDay.get(key)?.count ?? 0,
        aiMessages: ai?.count ?? 0,
        promptTokens: ai?.prompt ?? 0,
        completionTokens: ai?.completion ?? 0,
        searches: searchesByDay.get(key)?.count ?? 0,
        newUsers: signupsByDay.get(key)?.count ?? 0,
      });
    }
    return points;
  }

  /** AI usage per provider: chat responses, search summaries, tokens and latency. */
  async providers(range: DateRangeQueryDto): Promise<ProviderUsageDto[]> {
    const { from, to } = this.resolveRange(range);
    const createdAt = { gte: from, lt: to };

    const [providers, messageStats, summaryStats] = await Promise.all([
      this.prisma.aiProvider.findMany({ select: { id: true, name: true, type: true } }),
      this.prisma.message.groupBy({
        by: ['providerId'],
        where: { role: MessageRole.ASSISTANT, providerId: { not: null }, createdAt },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.webSearch.groupBy({
        by: ['providerId'],
        where: { providerId: { not: null }, createdAt },
        _count: { _all: true },
      }),
    ]);

    const messagesBy = new Map(messageStats.map((row) => [row.providerId, row]));
    const summariesBy = new Map(summaryStats.map((row) => [row.providerId, row._count._all]));

    return providers
      .map((provider) => {
        const stats = messagesBy.get(provider.id);
        return {
          providerId: provider.id,
          name: provider.name,
          type: provider.type,
          messages: stats?._count._all ?? 0,
          searchSummaries: summariesBy.get(provider.id) ?? 0,
          promptTokens: stats?._sum.promptTokens ?? 0,
          completionTokens: stats?._sum.completionTokens ?? 0,
          avgLatencyMs: stats?._avg.latencyMs ? Math.round(stats._avg.latencyMs) : null,
        };
      })
      .sort((a, b) => b.messages - a.messages);
  }

  /** Busiest endpoints with error counts and latency percentiles. */
  async endpoints(range: DateRangeQueryDto): Promise<EndpointUsageDto[]> {
    const { from, to } = this.resolveRange(range);
    return this.prisma.$queryRaw<EndpointUsageDto[]>`
      SELECT method,
             route,
             count(*)::int AS "requests",
             count(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int AS "clientErrors",
             count(*) FILTER (WHERE status_code >= 500)::int AS "serverErrors",
             round(avg(duration_ms))::int AS "avgDurationMs",
             round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS "p95DurationMs"
      FROM api_usage_logs
      WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY method, route
      ORDER BY "requests" DESC
      LIMIT ${TOP_ENDPOINTS}`;
  }

  async requestLogs(query: ListRequestLogsQueryDto): Promise<Paginated<RequestLogDto>> {
    const where: Prisma.ApiUsageLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.path ? { path: { contains: query.path } } : {}),
      ...(query.statusCode || query.minStatusCode
        ? {
            statusCode: {
              ...(query.statusCode ? { equals: query.statusCode } : {}),
              ...(query.minStatusCode ? { gte: query.minStatusCode } : {}),
            },
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lt: query.to } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.apiUsageLog.findMany({ where, orderBy: { id: 'desc' }, ...toPrismaPage(query) }),
      this.prisma.apiUsageLog.count({ where }),
    ]);
    return paginate(
      logs.map((log) => ({ ...log, id: log.id.toString() })),
      total,
      query,
    );
  }

  private async activeSubscribersByPlan() {
    const [plans, counts] = await Promise.all([
      this.prisma.plan.findMany({
        select: { id: true, code: true },
        orderBy: { priceCents: 'asc' },
      }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        where: { status: SubscriptionStatus.ACTIVE },
        _count: { _all: true },
      }),
    ]);
    const countByPlan = new Map(counts.map((row) => [row.planId, row._count._all]));
    return plans.map((plan) => ({
      plan: plan.code,
      activeSubscribers: countByPlan.get(plan.id) ?? 0,
    }));
  }

  /** `table` is always a trusted Prisma.sql literal, never user input. */
  private dailyCounts(table: Prisma.Sql, from: Date, to: Date): Promise<DailyCount[]> {
    return this.prisma.$queryRaw<DailyCount[]>`
      SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, count(*)::int AS count
      FROM ${table}
      WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY 1`;
  }

  private resolveRange({ from, to }: DateRangeQueryDto): { from: Date; to: Date } {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    if (start >= end) {
      throw new BadRequestException('`from` must be before `to`');
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    }
    return { from: start, to: end };
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
