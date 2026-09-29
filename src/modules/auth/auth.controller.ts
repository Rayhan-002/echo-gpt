import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import {
  ApiAuth,
  Client,
  type ClientInfo,
  CurrentUser,
  Public,
} from '../../common/decorators/auth.decorators';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import type { AuthUser } from './interfaces/auth-user.interface';

/** Tight per-IP limits for credential endpoints (brute-force / enumeration protection). */
const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @Throttle(STRICT_LIMIT)
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a USER account on the FREE plan, sends a verification email and signs the user in.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT, HttpStatus.TOO_MANY_REQUESTS)
  register(@Body() dto: RegisterDto, @Client() client: ClientInfo): Promise<AuthResponseDto> {
    return this.auth.register(dto, client);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.TOO_MANY_REQUESTS,
  )
  login(@Body() dto: LoginDto, @Client() client: ClientInfo): Promise<AuthResponseDto> {
    return this.auth.login(dto, client);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_LIMIT)
  @ApiOperation({
    summary: 'Rotate tokens',
    description:
      'Exchanges a refresh token for a new access/refresh token pair. The presented refresh token becomes invalid; re-using it revokes the session.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  refresh(@Body() dto: RefreshTokenDto, @Client() client: ClientInfo): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken, client);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({
    summary: 'Log out of the current session',
    description: 'Revokes the session: its access and refresh tokens stop working immediately.',
  })
  @ApiNoContentResponse({ description: 'Logged out' })
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({ summary: 'Log out of all sessions on every device' })
  @ApiNoContentResponse({ description: 'All sessions revoked' })
  async logoutAll(@CurrentUser('id') userId: string): Promise<void> {
    await this.auth.logoutAll(userId);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with the emailed token' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    await this.auth.verifyEmail(dto.token);
    return new MessageResponseDto('Email verified successfully');
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify email address (link variant)',
    description: 'Target of the link embedded in the verification email.',
  })
  @ApiQuery({ name: 'token', required: true })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async verifyEmailLink(@Query() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    return this.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(STRICT_LIMIT)
  @ApiAuth()
  @ApiOperation({ summary: 'Resend the verification email to the current user' })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.TOO_MANY_REQUESTS)
  async resendVerification(@CurrentUser('id') userId: string): Promise<MessageResponseDto> {
    const sent = await this.auth.resendVerification(userId);
    return new MessageResponseDto(
      sent ? 'Verification email sent' : 'Email address is already verified',
    );
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(STRICT_LIMIT)
  @ApiOperation({
    summary: 'Request a password reset email',
    description: 'Always returns 202 so the response does not reveal whether the email exists.',
  })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.TOO_MANY_REQUESTS)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.auth.forgotPassword(dto.email);
    return new MessageResponseDto(
      'If an account exists for this email, a password reset link has been sent',
    );
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT_LIMIT)
  @ApiOperation({
    summary: 'Reset password with the emailed token',
    description: 'All existing sessions are revoked.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.TOO_MANY_REQUESTS)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return new MessageResponseDto('Password has been reset. Please log in again.');
  }
}
