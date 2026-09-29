import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../../common/decorators/auth.decorators';
import { DashboardStatsDto } from '../dto/admin-dashboard.dto';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

@ApiTags('Admin: Dashboard')
@AdminOnly()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard statistics (users, plans, activity, providers, API)' })
  @ApiOkResponse({ type: DashboardStatsDto })
  dashboard(): Promise<DashboardStatsDto> {
    return this.analytics.dashboard();
  }
}
