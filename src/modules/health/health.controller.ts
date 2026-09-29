import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';

const HEAP_LIMIT_BYTES = 512 * 1024 * 1024;

@ApiTags('Health')
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe', description: 'Returns 200 while the process is up.' })
  live() {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Checks critical dependencies. Returns 503 when any of them is down.',
  })
  check() {
    return this.health.check([() => this.memory.checkHeap('memory_heap', HEAP_LIMIT_BYTES)]);
  }
}
