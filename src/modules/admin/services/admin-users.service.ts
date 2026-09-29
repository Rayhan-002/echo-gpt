import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RoleName, SubscriptionStatus } from '@prisma/client';
import { Paginated, paginate, toPrismaPage } from '../../../common/dto/pagination.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SessionsService } from '../../sessions/sessions.service';
import { SubscriptionResponseDto } from '../../subscriptions/dto/subscription.dto';
import { QuotaService } from '../../subscriptions/quota.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { UsersService } from '../../users/users.service';
import {
  AdminListUsersQueryDto,
  AdminUpdateUserDto,
  AdminUserDetailDto,
  AdminUserDto,
} from '../dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly quota: QuotaService,
  ) {}

  async list(query: AdminListUsersQueryDto): Promise<Paginated<AdminUserDto>> {
    const where: Prisma.UserWhereInput = {
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { fullName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.plan
        ? {
            subscriptions: {
              some: { status: SubscriptionStatus.ACTIVE, plan: { code: query.plan } },
            },
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          role: true,
          subscriptions: {
            where: { status: SubscriptionStatus.ACTIVE },
            select: { plan: { select: { code: true } } },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        ...toPrismaPage(query),
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map((user) => ({
      ...UserResponseDto.from(user),
      plan: user.subscriptions[0]?.plan.code ?? null,
    }));
    return paginate(data, total, query);
  }

  async detail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.users.findById(id);
    const [subscription, usage, conversations, messages, searches, activeSessions] =
      await Promise.all([
        this.subscriptions.getActive(id),
        this.quota.getUsage(id),
        this.prisma.conversation.count({ where: { userId: id } }),
        this.prisma.message.count({ where: { conversation: { userId: id } } }),
        this.prisma.webSearch.count({ where: { userId: id } }),
        this.prisma.session.count({
          where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
        }),
      ]);

    return {
      ...UserResponseDto.from(user),
      subscription: SubscriptionResponseDto.from(subscription),
      usage,
      stats: { conversations, messages, searches, activeSessions },
    };
  }

  /** Changes role and/or activation. Deactivation signs the user out everywhere. */
  async update(actorId: string, id: string, dto: AdminUpdateUserDto): Promise<UserResponseDto> {
    if (actorId === id) {
      throw new BadRequestException('Administrators cannot change their own role or status');
    }

    const user = await this.users.findById(id);
    const losesAdmin =
      user.role.name === RoleName.ADMIN &&
      ((dto.role !== undefined && dto.role !== RoleName.ADMIN) || dto.isActive === false);
    if (losesAdmin) {
      await this.users.assertNotLastAdmin(user);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        ...(dto.role ? { role: { connect: { name: dto.role } } } : {}),
      },
      include: { role: true },
    });

    if (dto.isActive === false) {
      await this.sessions.revokeAll(id);
    }
    return UserResponseDto.from(updated);
  }

  async remove(actorId: string, id: string): Promise<void> {
    if (actorId === id) {
      throw new BadRequestException('Use DELETE /users/me to delete your own account');
    }
    await this.users.delete(await this.users.findById(id));
  }

  async revokeSessions(id: string): Promise<number> {
    await this.users.findById(id);
    return this.sessions.revokeAll(id);
  }
}
