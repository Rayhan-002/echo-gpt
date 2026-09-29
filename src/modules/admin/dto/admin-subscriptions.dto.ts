import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PlanResponseDto, SubscriptionResponseDto } from '../../subscriptions/dto/subscription.dto';

export class AdminListSubscriptionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(PlanCode)
  plan?: PlanCode;
}

class SubscriptionOwnerDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email: string;
}

export class AdminSubscriptionDto extends SubscriptionResponseDto {
  @ApiProperty({ type: SubscriptionOwnerDto })
  user: SubscriptionOwnerDto;
}

export class AdminPlanDto extends PlanResponseDto {
  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ description: 'Users currently on this plan', example: 42 })
  activeSubscribers: number;
}

export class AssignPlanDto {
  @ApiProperty({ enum: PlanCode, example: PlanCode.PREMIUM })
  @IsEnum(PlanCode)
  planCode: PlanCode;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Premium' })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ApiPropertyOptional({ example: 'For power users.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 1299, description: 'Monthly price in cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ example: 1000, description: 'AI requests per UTC day' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyRequestLimit?: number;

  @ApiPropertyOptional({ type: [String], example: ['1000 AI requests per day'] })
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  features?: string[];

  @ApiPropertyOptional({ description: 'Inactive plans cannot be subscribed to.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
