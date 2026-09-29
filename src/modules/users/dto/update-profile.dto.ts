import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Length, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe', minLength: 1, maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatar.png',
    nullable: true,
    description: 'HTTPS URL of the avatar image. Send null to remove it.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string | null;
}
