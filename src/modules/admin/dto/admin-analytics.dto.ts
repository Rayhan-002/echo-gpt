import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiProviderType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class DateRangeQueryDto {
  /** Start of the range (ISO 8601). Defaults to 30 days ago. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** End of the range (ISO 8601). Defaults to now. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class UsagePointDto {
  @ApiProperty({ example: '2026-09-29', description: 'UTC day' })
  date: string;

  @ApiProperty({ example: 1520 })
  apiRequests: number;

  @ApiProperty({ example: 310, description: 'AI responses generated (chat)' })
  aiMessages: number;

  @ApiProperty({ example: 48210 })
  promptTokens: number;

  @ApiProperty({ example: 91833 })
  completionTokens: number;

  @ApiProperty({ example: 87 })
  searches: number;

  @ApiProperty({ example: 12 })
  newUsers: number;
}

export class ProviderUsageDto {
  @ApiProperty({ format: 'uuid' })
  providerId: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;

  @ApiProperty({ enum: AiProviderType })
  type: AiProviderType;

  @ApiProperty({ example: 812 })
  messages: number;

  @ApiProperty({ example: 64 })
  searchSummaries: number;

  @ApiProperty({ example: 120331 })
  promptTokens: number;

  @ApiProperty({ example: 240120 })
  completionTokens: number;

  @ApiProperty({ nullable: true, type: Number, example: 1840 })
  avgLatencyMs: number | null;
}

export class EndpointUsageDto {
  @ApiProperty({ example: 'POST' })
  method: string;

  @ApiProperty({ nullable: true, type: String, example: '/api/v1/chat/messages' })
  route: string | null;

  @ApiProperty({ example: 950 })
  requests: number;

  @ApiProperty({ example: 12, description: '4xx responses' })
  clientErrors: number;

  @ApiProperty({ example: 3, description: '5xx responses' })
  serverErrors: number;

  @ApiProperty({ example: 420 })
  avgDurationMs: number;

  @ApiProperty({ example: 2310 })
  p95DurationMs: number;
}

export class ListRequestLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
  method?: string;

  /** Exact status code. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;

  /** Only responses with status >= this value (e.g. 400 for all errors). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  minStatusCode?: number;

  /** Substring of the request path. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  path?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class RequestLogDto {
  @ApiProperty({ example: '1024', description: 'Sequential id (bigint as string)' })
  id: string;

  @ApiProperty({ nullable: true, type: String })
  requestId: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  userId: string | null;

  @ApiProperty({ example: 'POST' })
  method: string;

  @ApiProperty({ example: '/api/v1/chat/messages' })
  path: string;

  @ApiProperty({ nullable: true, type: String, example: '/api/v1/chat/messages' })
  route: string | null;

  @ApiProperty({ example: 201 })
  statusCode: number;

  @ApiProperty({ example: 1840 })
  durationMs: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  ipAddress: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  userAgent: string | null;

  @ApiProperty()
  createdAt: Date;
}
