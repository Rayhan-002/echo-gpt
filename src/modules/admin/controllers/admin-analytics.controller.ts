import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { AdminOnly } from '../../../common/decorators/auth.decorators';
import {
  DateRangeQueryDto,
  EndpointUsageDto,
  ProviderUsageDto,
  UsagePointDto,
} from '../dto/admin-analytics.dto';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@ApiTags('Admin: Analytics')
@AdminOnly()
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('usage')
  @ApiOperation({
    summary: 'Daily API usage time series',
    description: 'Zero-filled UTC days. Defaults to the last 30 days; max range 366 days.',
  })
  @ApiOkResponse({ type: [UsagePointDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  usage(@Query() range: DateRangeQueryDto): Promise<UsagePointDto[]> {
    return this.analytics.usage(range);
  }

  @Get('providers')
  @ApiOperation({ summary: 'AI usage per provider (messages, search summaries, tokens, latency)' })
  @ApiOkResponse({ type: [ProviderUsageDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  providers(@Query() range: DateRangeQueryDto): Promise<ProviderUsageDto[]> {
    return this.analytics.providers(range);
  }

  @Get('endpoints')
  @ApiOperation({ summary: 'Top endpoints with error counts and average / p95 latency' })
  @ApiOkResponse({ type: [EndpointUsageDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  endpoints(@Query() range: DateRangeQueryDto): Promise<EndpointUsageDto[]> {
    return this.analytics.endpoints(range);
  }
}
