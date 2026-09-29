import { ApiProperty } from '@nestjs/swagger';
import { Prisma, RoleName } from '@prisma/client';

export const userWithRole = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { role: true },
});
export type UserWithRole = Prisma.UserGetPayload<typeof userWithRole>;

/** Public representation of a user. Never exposes credentials. */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid', example: '3f6c1a2e-8a41-4a57-9d0f-1b8c0f2e6a11' })
  id: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email: string;

  @ApiProperty({ nullable: true, type: String, example: 'Jane Doe' })
  fullName: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'https://cdn.example.com/avatar.png' })
  avatarUrl: string | null;

  @ApiProperty({ enum: RoleName, example: RoleName.USER })
  role: RoleName;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty({ nullable: true, type: Date })
  lastLoginAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(user: UserWithRole): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
      isActive: user.isActive,
      emailVerified: user.emailVerifiedAt !== null,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
