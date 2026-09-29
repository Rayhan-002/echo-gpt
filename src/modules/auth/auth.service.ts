import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenType } from '@prisma/client';
import { ClientInfo } from '../../common/decorators/auth.decorators';
import { PasswordService } from '../../common/security/password.service';
import { AppConfig } from '../../config/configuration';
import { MailService } from '../mail/mail.service';
import { IssuedSession, SessionsService } from '../sessions/sessions.service';
import { UserResponseDto, UserWithRole } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AuthUser, JwtPayload } from './interfaces/auth-user.interface';
import { VerificationTokensService } from './verification-tokens.service';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtlSeconds: number;
  private readonly emailVerificationTtlMs: number;
  private readonly passwordResetTtlMs: number;

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly verificationTokens: VerificationTokensService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    config: ConfigService<AppConfig, true>,
  ) {
    const auth = config.get('auth', { infer: true });
    this.accessTtlSeconds = auth.accessTtlSeconds;
    this.emailVerificationTtlMs = auth.emailVerificationTtlHours * HOUR_MS;
    this.passwordResetTtlMs = auth.passwordResetTtlMinutes * MINUTE_MS;
  }

  async register(dto: RegisterDto, client: ClientInfo): Promise<AuthResponseDto> {
    const user = await this.users.create(dto);
    await this.sendVerificationEmail(user);
    this.logger.log(`New user registered: ${user.id}`);
    return this.startSession(user, client);
  }

  async login({ email, password }: LoginDto, client: ClientInfo): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verifyDummy(password);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    this.assertActive(user);

    await this.users.recordLogin(user.id);
    return this.startSession(user, client);
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthResponseDto> {
    const session = await this.sessions.rotate(refreshToken, client);
    const user = await this.users.findById(session.userId);
    if (!user.isActive) {
      await this.sessions.revoke(user.id, session.sessionId);
    }
    this.assertActive(user);
    return this.buildResponse(user, session);
  }

  async logout(user: AuthUser): Promise<void> {
    await this.sessions.revoke(user.id, user.sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAll(userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.verificationTokens.consume(token, TokenType.EMAIL_VERIFICATION);
    await this.users.markEmailVerified(userId);
  }

  /** Returns false when the address is already verified (nothing sent). */
  async resendVerification(userId: string): Promise<boolean> {
    const user = await this.users.findById(userId);
    if (user.emailVerifiedAt) return false;
    await this.sendVerificationEmail(user);
    return true;
  }

  /** Always resolves, so the response does not reveal whether the email is registered. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user?.isActive) return;
    const token = await this.verificationTokens.issue(
      user.id,
      TokenType.PASSWORD_RESET,
      this.passwordResetTtlMs,
    );
    await this.mail.sendPasswordReset(user.email, token);
  }

  /** Sets a new password and signs the user out everywhere. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.verificationTokens.consume(token, TokenType.PASSWORD_RESET);
    await this.users.setPassword(userId, newPassword);
    await this.sessions.revokeAll(userId);
  }

  private async startSession(user: UserWithRole, client: ClientInfo): Promise<AuthResponseDto> {
    const session = await this.sessions.create(user.id, client);
    return this.buildResponse(user, session);
  }

  private async buildResponse(
    user: UserWithRole,
    session: IssuedSession,
  ): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, sid: session.sessionId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: session.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
      user: UserResponseDto.from(user),
    };
  }

  private async sendVerificationEmail(user: UserWithRole): Promise<void> {
    const token = await this.verificationTokens.issue(
      user.id,
      TokenType.EMAIL_VERIFICATION,
      this.emailVerificationTtlMs,
    );
    await this.mail.sendEmailVerification(user.email, token);
  }

  private assertActive(user: UserWithRole): void {
    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated');
    }
  }
}
