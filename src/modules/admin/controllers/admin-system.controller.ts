import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../../../common/decorators/auth.decorators';
import { MaintenanceResultDto, SystemHealthDto } from '../dto/admin-dashboard.dto';
import { SystemService } from '../services/system.service';

@ApiTags('Admin: System')
@AdminOnly()
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly system: SystemService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Detailed system health',
    description:
      'Database status/latency/size, process metrics, AI provider health and search cache. Unlike the public readiness probe, this is for operators.',
  })
  @ApiOkResponse({ type: SystemHealthDto })
  health(): Promise<SystemHealthDto> {
    return this.system.health();
  }

  @Post('maintenance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run maintenance now',
    description:
      'Purges expired sessions and tokens, expired search cache entries and request logs past API_LOG_RETENTION_DAYS. Also runs daily at 03:00.',
  })
  @ApiOkResponse({ type: MaintenanceResultDto })
  maintenance(): Promise<MaintenanceResultDto> {
    return this.system.runMaintenance();
  }
}
