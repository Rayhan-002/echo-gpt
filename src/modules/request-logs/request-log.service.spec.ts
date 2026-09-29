import { PrismaService } from '../../prisma/prisma.service';
import { RequestLogEntry, RequestLogService } from './request-log.service';

describe('RequestLogService', () => {
  const entry = (userId: string | null = null): RequestLogEntry => ({
    method: 'GET',
    path: '/api/v1/users/me',
    statusCode: 200,
    durationMs: 5,
    userId,
  });

  let prisma: { apiUsageLog: { createMany: jest.Mock }; user: { findMany: jest.Mock } };
  let service: RequestLogService;

  beforeEach(() => {
    prisma = {
      apiUsageLog: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new RequestLogService(prisma as unknown as PrismaService);
  });

  afterEach(() => service.onModuleDestroy());

  it('writes buffered entries in one batch', async () => {
    service.record(entry());
    service.record(entry());
    await service.flush();

    expect(prisma.apiUsageLog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.apiUsageLog.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('does nothing when the buffer is empty', async () => {
    await service.flush();
    expect(prisma.apiUsageLog.createMany).not.toHaveBeenCalled();
  });

  it('unlinks users deleted before the flush instead of failing the batch', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'alive' }]);
    service.record(entry('alive'));
    service.record(entry('deleted'));
    await service.flush();

    const [{ data }] = prisma.apiUsageLog.createMany.mock.calls[0];
    expect(data.map((row: RequestLogEntry) => row.userId)).toEqual(['alive', null]);
  });

  it('swallows database errors so logging never breaks requests', async () => {
    prisma.apiUsageLog.createMany.mockRejectedValue(new Error('db down'));
    service.record(entry());
    await expect(service.flush()).resolves.toBeUndefined();
  });

  it('flushes pending entries on shutdown', async () => {
    service.record(entry());
    await service.onModuleDestroy();
    expect(prisma.apiUsageLog.createMany).toHaveBeenCalledTimes(1);
  });
});
