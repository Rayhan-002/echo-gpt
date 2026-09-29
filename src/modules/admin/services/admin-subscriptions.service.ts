import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanCode, Prisma, SubscriptionStatus } from '@prisma/client';
import { Paginated, paginate, toPrismaPage } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PlanResponseDto,
  SubscriptionResponseDto,
  SubscriptionWithPlan,
} from '../../subscriptions/dto/subscription.dto';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { UsersService } from '../../users/users.service';
import {
  AdminListSubscriptionsQueryDto,
  AdminPlanDto,
  AdminSubscriptionDto,
  UpdatePlanDto,
} from '../dto/admin-subscriptions.dto';

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly users: UsersService,
  ) {}

  async list(query: AdminListSubscriptionsQueryDto): Promise<Paginated<AdminSubscriptionDto>> {
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.plan ? { plan: { code: query.plan } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        include: { plan: true, user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        ...toPrismaPage(query),
      }),
      this.prisma.subscription.count({ where }),
    ]);

    const data = items.map(({ user, ...subscription }) => ({
      ...SubscriptionResponseDto.from(subscription),
      user,
    }));
    return paginate(data, total, query);
  }

  async plans(): Promise<AdminPlanDto[]> {
    const [plans, counts] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: { priceCents: 'asc' } }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        where: { status: SubscriptionStatus.ACTIVE },
        _count: { _all: true },
      }),
    ]);
    const countByPlan = new Map(counts.map((row) => [row.planId, row._count._all]));
    return plans.map((plan) => ({
      ...PlanResponseDto.from(plan),
      isActive: plan.isActive,
      activeSubscribers: countByPlan.get(plan.id) ?? 0,
    }));
  }

  async updatePlan(code: PlanCode, dto: UpdatePlanDto): Promise<PlanResponseDto> {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan) {
      throw new NotFoundException(`Plan ${code} not found`);
    }
    return PlanResponseDto.from(await this.prisma.plan.update({ where: { code }, data: dto }));
  }

  /** Moves a user to a plan (e.g. support-granted upgrade or refund downgrade). */
  async assignPlan(userId: string, planCode: PlanCode): Promise<SubscriptionWithPlan> {
    await this.users.findById(userId);
    return this.subscriptions.changePlan(userId, planCode);
  }
}
