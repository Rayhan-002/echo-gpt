import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { EmailField, PasswordField, Trim } from '../../../common/decorators/validation.decorators';

export class RegisterDto {
  @EmailField()
  email: string;

  @PasswordField()
  password: string;

  @ApiPropertyOptional({ example: 'Jane Doe', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 100)
  fullName?: string;
}

export class LoginDto {
  @EmailField()
  email: string;

  @ApiProperty({ example: 'Str0ngPass!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token returned by login/register/refresh',
    example: '9b1f7c7e-2f55-4f7a-9d59-6c2d3e1a8b90.q5Zb3n...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token received by email', example: 'mZ4q2pUe0wV3...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token: string;
}

export class ForgotPasswordDto {
  @EmailField()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received by email', example: 'mZ4q2pUe0wV3...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token: string;

  @PasswordField('New password', 'N3wStr0ngPass!')
  newPassword: string;
}
