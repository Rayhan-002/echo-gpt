import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanCode, Prisma, RoleName } from '@prisma/client';
import { PasswordService } from '../../common/security/password.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { userWithRole, UserWithRole } from './dto/user-response.dto';

export interface CreateUserInput {
  email: string;
  password: string;
  fullName?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
  ) {}

  async findById(id: string): Promise<UserWithRole> {
    const user = await this.prisma.user.findUnique({ where: { id }, ...userWithRole });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findByEmail(email: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, ...userWithRole });
  }

  /** Creates a regular user on the FREE plan. */
  async create({ email, password, fullName }: CreateUserInput): Promise<UserWithRole> {
    const normalizedEmail = email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email: normalizedEmail } })) {
      throw new ConflictException('An account with this email already exists');
    }

    try {
      return await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          fullName,
          passwordHash: await this.passwords.hash(password),
          role: { connect: { name: RoleName.USER } },
          subscriptions: { create: { plan: { connect: { code: PlanCode.FREE } } } },
        },
        ...userWithRole,
      });
    } catch (error) {
      // Lost a race with a concurrent registration for the same email.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserWithRole> {
    return this.prisma.user.update({
      where: { id },
      data: { fullName: dto.fullName, avatarUrl: dto.avatarUrl },
      ...userWithRole,
    });
  }

  /** Changes the password and signs out every other device. */
  async changePassword(
    id: string,
    currentSessionId: string,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.findById(id);
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must differ from the current password');
    }

    await this.setPassword(id, newPassword);
    await this.sessions.revokeAll(id, currentSessionId);
  }

  async setPassword(id: string, newPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
  }

  /** Permanently deletes the account and all owned data (sessions, chats, searches...). */
  async deleteAccount(id: string, password: string): Promise<void> {
    const user = await this.findById(id);
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new BadRequestException('Password is incorrect');
    }
    await this.delete(user);
  }

  async delete(user: UserWithRole): Promise<void> {
    await this.assertNotLastAdmin(user);
    await this.prisma.user.delete({ where: { id: user.id } });
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }

  async recordLogin(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  /** Guards against locking everyone out of the admin APIs. */
  async assertNotLastAdmin(user: UserWithRole): Promise<void> {
    if (user.role.name !== RoleName.ADMIN) return;
    const admins = await this.prisma.user.count({
      where: { role: { name: RoleName.ADMIN }, isActive: true },
    });
    if (admins <= 1) {
      throw new ForbiddenException('The last active administrator cannot be removed');
    }
  }
}
