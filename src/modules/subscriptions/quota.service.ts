import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageResponseDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of the current quota window and of the next one. */
const currentWindow = (now = new Date()) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, resetsAt: new Date(start.getTime() + DAY_MS) };
};

/** `YYYY-MM-DD` literal, independent of the database session time zone. */
const toSqlDate = (date: Date): string => date.toISOString().slice(0, 10);

export class QuotaExceededException extends HttpException {
  constructor(limit: number, planName: string, resetsAt: Date) {
    super(
      `Daily limit of ${limit} AI requests reached on the ${planName} plan. ` +
        `Resets at ${resetsAt.toISOString()}. Upgrade your plan for a higher limit.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Enforces per-plan daily AI request quotas.
 *
 * `consume` is a single guarded upsert, so concurrent requests can never push
 * a user past their limit (no read-then-write race).
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getUsage(userId: string): Promise<UsageResponseDto> {
    const { plan } = await this.subscriptions.getActive(userId);
    const { start, resetsAt } = currentWindow();
    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_periodStart: { userId, periodStart: start } },
    });
    const used = counter?.requestCount ?? 0;
    return {
      period: 'DAILY',
      limit: plan.dailyRequestLimit,
      used,
      remaining: Math.max(plan.dailyRequestLimit - used, 0),
      resetsAt,
    };
  }

  /** Reserves one request from today's quota or throws 429. */
  async consume(userId: string): Promise<void> {
    const { plan } = await this.subscriptions.getActive(userId);
    const { start, resetsAt } = currentWindow();
    const limit = plan.dailyRequestLimit;

    const rows =
      limit > 0
        ? await this.prisma.$queryRaw<{ request_count: number }[]>`
            INSERT INTO usage_counters (user_id, period_start, request_count, updated_at)
            VALUES (${userId}::uuid, ${toSqlDate(start)}::date, 1, now())
            ON CONFLICT (user_id, period_start) DO UPDATE
              SET request_count = usage_counters.request_count + 1, updated_at = now()
              WHERE usage_counters.request_count < ${limit}
            RETURNING request_count`
        : [];

    if (rows.length === 0) {
      throw new QuotaExceededException(limit, plan.name, resetsAt);
    }
  }

  /** Gives a reserved request back (e.g. the upstream AI provider failed). */
  async refund(userId: string): Promise<void> {
    const { start } = currentWindow();
    await this.prisma.usageCounter.updateMany({
      where: { userId, periodStart: start, requestCount: { gt: 0 } },
      data: { requestCount: { decrement: 1 } },
    });
  }
}
