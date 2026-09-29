import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { AdminOnly } from '../../../common/decorators/auth.decorators';
import { Paginated } from '../../../common/dto/pagination.dto';
import {
  DateRangeQueryDto,
  EndpointUsageDto,
  ListRequestLogsQueryDto,
  ProviderUsageDto,
  RequestLogDto,
  UsagePointDto,
} from '../dto/admin-analytics.dto';
import { DashboardStatsDto } from '../dto/admin-dashboard.dto';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@AdminOnly()
@Controller('admin')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('dashboard')
  @ApiTags('Admin: Dashboard')
  @ApiOperation({ summary: 'Dashboard statistics (users, plans, activity, providers, API)' })
  @ApiOkResponse({ type: DashboardStatsDto })
  dashboard(): Promise<DashboardStatsDto> {
    return this.analytics.dashboard();
  }

  @Get('analytics/usage')
  @ApiTags('Admin: Analytics')
  @ApiOperation({
    summary: 'Daily API usage time series',
    description: 'Zero-filled UTC days. Defaults to the last 30 days; max range 366 days.',
  })
  @ApiOkResponse({ type: [UsagePointDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  usage(@Query() range: DateRangeQueryDto): Promise<UsagePointDto[]> {
    return this.analytics.usage(range);
  }

  @Get('analytics/providers')
  @ApiTags('Admin: Analytics')
  @ApiOperation({ summary: 'AI usage per provider (messages, search summaries, tokens, latency)' })
  @ApiOkResponse({ type: [ProviderUsageDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  providers(@Query() range: DateRangeQueryDto): Promise<ProviderUsageDto[]> {
    return this.analytics.providers(range);
  }

  @Get('analytics/endpoints')
  @ApiTags('Admin: Analytics')
  @ApiOperation({ summary: 'Top endpoints with error counts and average / p95 latency' })
  @ApiOkResponse({ type: [EndpointUsageDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  endpoints(@Query() range: DateRangeQueryDto): Promise<EndpointUsageDto[]> {
    return this.analytics.endpoints(range);
  }

  @Get('logs')
  @ApiTags('Admin: Logs')
  @ApiOperation({
    summary: 'API request logs',
    description: 'Newest first. Filter by user, method, status, path and time range.',
  })
  @ApiPaginatedResponse(RequestLogDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  logs(@Query() query: ListRequestLogsQueryDto): Promise<Paginated<RequestLogDto>> {
    return this.analytics.requestLogs(query);
  }
}
