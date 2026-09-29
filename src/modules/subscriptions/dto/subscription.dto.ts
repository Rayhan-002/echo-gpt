import { ApiProperty } from '@nestjs/swagger';
import { PlanCode, Prisma, SubscriptionStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export const subscriptionWithPlan = Prisma.validator<Prisma.SubscriptionDefaultArgs>()({
  include: { plan: true },
});
export type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<typeof subscriptionWithPlan>;
type Plan = SubscriptionWithPlan['plan'];

export class PlanResponseDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ enum: PlanCode, example: PlanCode.PREMIUM })
  code: PlanCode;

  @ApiProperty({ example: 'Premium' })
  name: string;

  @ApiProperty({ nullable: true, type: String, example: 'For power users.' })
  description: string | null;

  @ApiProperty({ description: 'Monthly price in minor units (cents)', example: 999 })
  priceCents: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ description: 'AI requests allowed per UTC day', example: 500 })
  dailyRequestLimit: number;

  @ApiProperty({ type: [String], example: ['500 AI requests per day'] })
  features: string[];

  static from(plan: Plan): PlanResponseDto {
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      currency: plan.currency,
      dailyRequestLimit: plan.dailyRequestLimit,
      features: plan.features,
    };
  }
}

export class SubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @ApiProperty()
  startedAt: Date;

  @ApiProperty({
    nullable: true,
    type: Date,
    description: 'End of the paid period. Null for plans that never expire (Free).',
  })
  currentPeriodEnd: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  canceledAt: Date | null;

  @ApiProperty({ type: PlanResponseDto })
  plan: PlanResponseDto;

  static from(subscription: SubscriptionWithPlan): SubscriptionResponseDto {
    return {
      id: subscription.id,
      status: subscription.status,
      startedAt: subscription.startedAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      canceledAt: subscription.canceledAt,
      plan: PlanResponseDto.from(subscription.plan),
    };
  }
}

export class UsageResponseDto {
  @ApiProperty({ example: 'DAILY', description: 'Quota window (UTC day)' })
  period: 'DAILY';

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  used: number;

  @ApiProperty({ example: 17 })
  remaining: number;

  @ApiProperty({ description: 'When the quota resets', example: '2026-09-30T00:00:00.000Z' })
  resetsAt: Date;
}

export class SubscriptionStatusResponseDto {
  @ApiProperty({ type: SubscriptionResponseDto })
  subscription: SubscriptionResponseDto;

  @ApiProperty({ type: UsageResponseDto })
  usage: UsageResponseDto;
}

export class ChangePlanDto {
  @ApiProperty({ enum: PlanCode, example: PlanCode.PREMIUM })
  @IsEnum(PlanCode)
  planCode: PlanCode;
}
