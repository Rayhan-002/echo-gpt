import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const FLUSH_INTERVAL_MS = 2_000;
const MAX_BATCH_SIZE = 200;
/** Drop logs instead of growing memory without bound if the DB is unreachable. */
const MAX_BUFFER_SIZE = 10_000;

export type RequestLogEntry = Prisma.ApiUsageLogCreateManyInput;

/**
 * Buffers request logs in memory and writes them in batches, keeping logging
 * off the request's critical path. Pending entries are flushed on shutdown.
 */
@Injectable()
export class RequestLogService implements OnModuleDestroy {
  private readonly logger = new Logger(RequestLogService.name);
  private readonly timer: NodeJS.Timeout;
  private buffer: RequestLogEntry[] = [];
  private flushing: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  record(entry: RequestLogEntry): void {
    if (this.buffer.length >= MAX_BUFFER_SIZE) return;
    this.buffer.push(entry);
    if (this.buffer.length >= MAX_BATCH_SIZE) void this.flush();
  }

  async flush(): Promise<void> {
    // Serialize flushes so batches are never written twice or out of order.
    while (this.flushing) await this.flushing;
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.buffer.length);
    this.flushing = this.write(batch).finally(() => (this.flushing = null));
    await this.flushing;
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  private async write(batch: RequestLogEntry[]): Promise<void> {
    try {
      await this.prisma.apiUsageLog.createMany({ data: await this.withExistingUsers(batch) });
    } catch (error) {
      this.logger.error(`Failed to persist ${batch.length} request logs`, (error as Error).stack);
    }
  }

  /**
   * A request may delete its own user (DELETE /users/me) before the batch is
   * written; unlink such rows instead of failing the whole batch on the FK.
   */
  private async withExistingUsers(batch: RequestLogEntry[]): Promise<RequestLogEntry[]> {
    const userIds = [...new Set(batch.map((entry) => entry.userId).filter(Boolean))] as string[];
    if (userIds.length === 0) return batch;

    const existing = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    const known = new Set(existing.map((user) => user.id));
    return batch.map((entry) =>
      entry.userId && !known.has(entry.userId) ? { ...entry, userId: null } : entry,
    );
  }
}
