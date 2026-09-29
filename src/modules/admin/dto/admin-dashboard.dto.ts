import { ApiProperty } from '@nestjs/swagger';
import { AiProviderType, PlanCode, ProviderHealthStatus } from '@prisma/client';

class UserStatsDto {
  @ApiProperty({ example: 1250 }) total: number;
  @ApiProperty({ example: 1198 }) active: number;
  @ApiProperty({ example: 1010 }) verified: number;
  @ApiProperty({ example: 2 }) admins: number;
  @ApiProperty({ example: 87 }) newLast7Days: number;
}

class PlanCountDto {
  @ApiProperty({ enum: PlanCode }) plan: PlanCode;
  @ApiProperty({ example: 1100 }) activeSubscribers: number;
}

class ActivityStatsDto {
  @ApiProperty({ example: 5400 }) conversations: number;
  @ApiProperty({ example: 61234 }) messages: number;
  @ApiProperty({ example: 2150 }) messagesLast24h: number;
  @ApiProperty({ example: 9800 }) searches: number;
  @ApiProperty({ example: 310 }) searchesLast24h: number;
}

class ProviderStatsDto {
  @ApiProperty({ example: 3 }) total: number;
  @ApiProperty({ example: 3 }) enabled: number;
  @ApiProperty({ example: 2 }) healthy: number;
  @ApiProperty({ nullable: true, type: String, example: 'OpenAI' }) defaultProvider: string | null;
}

class ApiStatsDto {
  @ApiProperty({ example: 18230 }) requestsLast24h: number;
  @ApiProperty({ example: 41 }) serverErrorsLast24h: number;
  @ApiProperty({ example: 0.0022, description: '5xx / total, last 24h' }) errorRateLast24h: number;
  @ApiProperty({ nullable: true, type: Number, example: 212 }) avgLatencyMsLast24h: number | null;
}

export class DashboardStatsDto {
  @ApiProperty({ type: UserStatsDto }) users: UserStatsDto;
  @ApiProperty({ type: [PlanCountDto] }) subscriptions: PlanCountDto[];
  @ApiProperty({ type: ActivityStatsDto }) activity: ActivityStatsDto;
  @ApiProperty({ type: ProviderStatsDto }) providers: ProviderStatsDto;
  @ApiProperty({ type: ApiStatsDto }) api: ApiStatsDto;
  @ApiProperty() generatedAt: Date;
}

class DatabaseHealthDto {
  @ApiProperty({ enum: ['up', 'down'] }) status: 'up' | 'down';
  @ApiProperty({ nullable: true, type: Number, example: 3 }) latencyMs: number | null;
  @ApiProperty({ nullable: true, type: Number, example: 18_874_368 }) sizeBytes: number | null;
}

class ProcessHealthDto {
  @ApiProperty({ example: 86400 }) uptimeSeconds: number;
  @ApiProperty({ example: 'v24.15.0' }) nodeVersion: string;
  @ApiProperty({ example: 'production' }) environment: string;
  @ApiProperty({ example: 157_286_400 }) rssBytes: number;
  @ApiProperty({ example: 61_865_984 }) heapUsedBytes: number;
  @ApiProperty({ example: 83_886_080 }) heapTotalBytes: number;
}

class ProviderHealthSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'OpenAI' }) name: string;
  @ApiProperty({ enum: AiProviderType }) type: AiProviderType;
  @ApiProperty() isEnabled: boolean;
  @ApiProperty() isDefault: boolean;
  @ApiProperty({ enum: ProviderHealthStatus }) healthStatus: ProviderHealthStatus;
  @ApiProperty({ nullable: true, type: Date }) lastCheckedAt: Date | null;
  @ApiProperty({ nullable: true, type: Number }) latencyMs: number | null;
}

class SearchHealthDto {
  @ApiProperty({ example: 'duckduckgo' }) engine: string;
  @ApiProperty({ example: 312 }) cachedQueries: number;
}

export class SystemHealthDto {
  @ApiProperty({
    enum: ['ok', 'degraded', 'down'],
    description: 'down: database unreachable; degraded: an enabled provider is unhealthy',
  })
  status: 'ok' | 'degraded' | 'down';

  @ApiProperty({ type: DatabaseHealthDto }) database: DatabaseHealthDto;
  @ApiProperty({ type: ProcessHealthDto }) process: ProcessHealthDto;
  @ApiProperty({ type: [ProviderHealthSummaryDto] }) providers: ProviderHealthSummaryDto[];
  @ApiProperty({ type: SearchHealthDto }) search: SearchHealthDto;
  @ApiProperty() timestamp: Date;
}

export class MaintenanceResultDto {
  @ApiProperty({ example: 120, description: 'Expired or revoked sessions removed' })
  sessions: number;

  @ApiProperty({ example: 45, description: 'Used or expired verification tokens removed' })
  verificationTokens: number;

  @ApiProperty({ example: 300, description: 'Expired search cache entries removed' })
  searchCache: number;

  @ApiProperty({ example: 50000, description: 'Request logs past the retention period removed' })
  requestLogs: number;
}
