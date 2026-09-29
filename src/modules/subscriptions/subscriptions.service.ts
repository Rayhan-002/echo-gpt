import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanCode, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { subscriptionWithPlan, SubscriptionWithPlan } from './dto/subscription.dto';

/** Paid plans run in 30-day periods; free plans never expire. */
const PAID_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  listPlans() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: 'asc' } });
  }

  /**
   * Returns the user's ACTIVE subscription. Paid subscriptions past their period
   * end are lazily expired and the user falls back to the Free plan; a missing
   * subscription is self-healed the same way.
   */
  async getActive(userId: string): Promise<SubscriptionWithPlan> {
    const current = await this.prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      ...subscriptionWithPlan,
    });

    if (current && !this.isPastPeriodEnd(current)) {
      return current;
    }

    if (current) {
      await this.prisma.subscription.updateMany({
        where: { id: current.id, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      this.logger.log(`Subscription ${current.id} expired, falling back to FREE`);
    }

    return this.activateFreePlan(userId);
  }

  history(userId: string): Promise<SubscriptionWithPlan[]> {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      ...subscriptionWithPlan,
    });
  }

  /**
   * Upgrades or downgrades the user. The previous subscription is kept as
   * CANCELED for history.
   *
   * NOTE: payment collection is out of scope; in production an upgrade would be
   * activated by the payment provider's webhook rather than directly by the user.
   */
  async changePlan(userId: string, planCode: PlanCode): Promise<SubscriptionWithPlan> {
    const plan = await this.prisma.plan.findFirst({ where: { code: planCode, isActive: true } });
    if (!plan) {
      throw new NotFoundException(`Plan ${planCode} is not available`);
    }

    const current = await this.getActive(userId);
    if (current.planId === plan.id) {
      throw new ConflictException(`You are already subscribed to the ${plan.name} plan`);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: current.id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: now },
      });
      return tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          startedAt: now,
          currentPeriodEnd:
            plan.priceCents > 0 ? new Date(now.getTime() + PAID_PERIOD_DAYS * DAY_MS) : null,
        },
        ...subscriptionWithPlan,
      });
    });
  }

  private async activateFreePlan(userId: string): Promise<SubscriptionWithPlan> {
    try {
      return await this.prisma.subscription.create({
        data: {
          user: { connect: { id: userId } },
          plan: { connect: { code: PlanCode.FREE } },
        },
        ...subscriptionWithPlan,
      });
    } catch (error) {
      // A concurrent request activated it first (one-ACTIVE-per-user unique index).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.subscription.findFirstOrThrow({
          where: { userId, status: SubscriptionStatus.ACTIVE },
          ...subscriptionWithPlan,
        });
      }
      throw error;
    }
  }

  private isPastPeriodEnd(subscription: SubscriptionWithPlan): boolean {
    return subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd <= new Date();
  }
}
