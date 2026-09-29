import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaExceededException, QuotaService } from './quota.service';
import { SubscriptionsService } from './subscriptions.service';

describe('QuotaService', () => {
  const plan = (dailyRequestLimit: number) => ({ plan: { name: 'Free', dailyRequestLimit } });

  let prisma: { $queryRaw: jest.Mock; usageCounter: { findUnique: jest.Mock } };
  let subscriptions: { getActive: jest.Mock };
  let service: QuotaService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn(), usageCounter: { findUnique: jest.fn() } };
    subscriptions = { getActive: jest.fn().mockResolvedValue(plan(20)) };
    service = new QuotaService(
      prisma as unknown as PrismaService,
      subscriptions as unknown as SubscriptionsService,
    );
  });

  it('consumes a request while under the limit', async () => {
    prisma.$queryRaw.mockResolvedValue([{ request_count: 5 }]);
    await expect(service.consume('user-1')).resolves.toBeUndefined();
  });

  it('throws 429 when the guarded upsert updates nothing (limit reached)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const error = await service.consume('user-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaExceededException);
    expect((error as QuotaExceededException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('rejects without touching the counter when the plan allows 0 requests', async () => {
    subscriptions.getActive.mockResolvedValue(plan(0));
    await expect(service.consume('user-1')).rejects.toBeInstanceOf(QuotaExceededException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports remaining requests for the current day', async () => {
    prisma.usageCounter.findUnique.mockResolvedValue({ requestCount: 7 });
    const usage = await service.getUsage('user-1');

    expect(usage).toMatchObject({ period: 'DAILY', limit: 20, used: 7, remaining: 13 });
    expect(usage.resetsAt.getUTCHours()).toBe(0);
    expect(usage.resetsAt.getTime()).toBeGreaterThan(Date.now());
  });
});
