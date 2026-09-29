import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiAuth, CurrentUser, Public } from '../../common/decorators/auth.decorators';
import {
  ChangePlanDto,
  PlanResponseDto,
  SubscriptionResponseDto,
  SubscriptionStatusResponseDto,
  UsageResponseDto,
} from './dto/subscription.dto';
import { QuotaService } from './quota.service';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly quota: QuotaService,
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'List available plans (Free & Premium)' })
  @ApiOkResponse({ type: [PlanResponseDto] })
  async listPlans(): Promise<PlanResponseDto[]> {
    return (await this.subscriptions.listPlans()).map((plan) => PlanResponseDto.from(plan));
  }

  @Get('me')
  @ApiAuth()
  @ApiOperation({
    summary: 'Subscription status',
    description: 'Current plan, subscription state and today’s usage.',
  })
  @ApiOkResponse({ type: SubscriptionStatusResponseDto })
  async status(@CurrentUser('id') userId: string): Promise<SubscriptionStatusResponseDto> {
    const [subscription, usage] = await Promise.all([
      this.subscriptions.getActive(userId),
      this.quota.getUsage(userId),
    ]);
    return { subscription: SubscriptionResponseDto.from(subscription), usage };
  }

  @Get('me/usage')
  @ApiAuth()
  @ApiOperation({
    summary: 'Remaining requests',
    description: 'AI request quota for the current UTC day.',
  })
  @ApiOkResponse({ type: UsageResponseDto })
  usage(@CurrentUser('id') userId: string): Promise<UsageResponseDto> {
    return this.quota.getUsage(userId);
  }

  @Get('me/history')
  @ApiAuth()
  @ApiOperation({ summary: 'Subscription history (most recent first)' })
  @ApiOkResponse({ type: [SubscriptionResponseDto] })
  async history(@CurrentUser('id') userId: string): Promise<SubscriptionResponseDto[]> {
    return (await this.subscriptions.history(userId)).map((s) => SubscriptionResponseDto.from(s));
  }

  @Patch('me')
  @ApiAuth()
  @ApiOperation({
    summary: 'Upgrade or downgrade the subscription',
    description:
      'Switches the user to the given plan. Paid plans start a 30-day period; the previous subscription is kept as CANCELED in the history.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async changePlan(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePlanDto,
  ): Promise<SubscriptionResponseDto> {
    return SubscriptionResponseDto.from(await this.subscriptions.changePlan(userId, dto.planCode));
  }
}
