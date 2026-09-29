import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCode, RoleName } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  SubscriptionResponseDto,
  UsageResponseDto,
} from '../../subscriptions/dto/subscription.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/** Parses "true"/"false" query strings into booleans. */
export const QueryBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class AdminListUsersQueryDto extends PaginationQueryDto {
  /** Search in email and full name (case-insensitive). */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(PlanCode)
  plan?: PlanCode;
}

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ enum: RoleName, example: RoleName.ADMIN })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({
    example: false,
    description: 'Deactivating a user immediately revokes all of their sessions.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminUserDto extends UserResponseDto {
  @ApiProperty({ enum: PlanCode, nullable: true, example: PlanCode.FREE })
  plan: PlanCode | null;
}

export class AdminUserStatsDto {
  @ApiProperty({ example: 12 })
  conversations: number;

  @ApiProperty({ example: 148 })
  messages: number;

  @ApiProperty({ example: 37 })
  searches: number;

  @ApiProperty({ example: 2 })
  activeSessions: number;
}

export class AdminUserDetailDto extends UserResponseDto {
  @ApiProperty({ type: SubscriptionResponseDto })
  subscription: SubscriptionResponseDto;

  @ApiProperty({ type: UsageResponseDto })
  usage: UsageResponseDto;

  @ApiProperty({ type: AdminUserStatsDto })
  stats: AdminUserStatsDto;
}
