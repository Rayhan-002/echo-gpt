import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { AdminOnly } from '../../../common/decorators/auth.decorators';
import { Paginated } from '../../../common/dto/pagination.dto';
import { ListRequestLogsQueryDto, RequestLogDto } from '../dto/admin-analytics.dto';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@ApiTags('Admin: Logs')
@AdminOnly()
@Controller('admin/logs')
export class AdminLogsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get()
  @ApiOperation({
    summary: 'API request logs',
    description: 'Newest first. Filter by user, method, status, path and time range.',
  })
  @ApiPaginatedResponse(RequestLogDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  list(@Query() query: ListRequestLogsQueryDto): Promise<Paginated<RequestLogDto>> {
    return this.analytics.requestLogs(query);
  }
}
