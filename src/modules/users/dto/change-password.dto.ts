import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PasswordField } from '../../../common/decorators/validation.decorators';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Str0ngPass!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @PasswordField('New password', 'N3wStr0ngPass!')
  newPassword: string;
}
