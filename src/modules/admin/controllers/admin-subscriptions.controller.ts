import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PlanCode } from '@prisma/client';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { AdminOnly } from '../../../common/decorators/auth.decorators';
import { Paginated } from '../../../common/dto/pagination.dto';
import { PlanResponseDto, SubscriptionResponseDto } from '../../subscriptions/dto/subscription.dto';
import {
  AdminListSubscriptionsQueryDto,
  AdminPlanDto,
  AdminSubscriptionDto,
  AssignPlanDto,
  UpdatePlanDto,
} from '../dto/admin-subscriptions.dto';
import { AdminSubscriptionsService } from '../services/admin-subscriptions.service';

@ApiTags('Admin: Subscriptions')
@AdminOnly()
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly adminSubscriptions: AdminSubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'List subscriptions (filter by status and plan)' })
  @ApiPaginatedResponse(AdminSubscriptionDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  list(@Query() query: AdminListSubscriptionsQueryDto): Promise<Paginated<AdminSubscriptionDto>> {
    return this.adminSubscriptions.list(query);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all plans (including inactive) with subscriber counts' })
  @ApiOkResponse({ type: [AdminPlanDto] })
  plans(): Promise<AdminPlanDto[]> {
    return this.adminSubscriptions.plans();
  }

  @Patch('plans/:code')
  @ApiOperation({ summary: 'Update a plan (price, daily request limit, features, availability)' })
  @ApiParam({ name: 'code', enum: PlanCode })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  updatePlan(
    @Param('code', new ParseEnumPipe(PlanCode)) code: PlanCode,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanResponseDto> {
    return this.adminSubscriptions.updatePlan(code, dto);
  }

  @Put('users/:userId')
  @ApiOperation({
    summary: 'Upgrade or downgrade a user’s subscription',
    description: 'The previous subscription is kept as CANCELED history.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async assignPlan(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignPlanDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(
      await this.adminSubscriptions.assignPlan(userId, dto.planCode),
    );
  }
}
