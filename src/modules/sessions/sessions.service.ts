import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientInfo } from '../../common/decorators/auth.decorators';
import { generateToken, sha256 } from '../../common/utils/crypto.util';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionResponseDto } from './dto/session-response.dto';

export interface IssuedSession {
  sessionId: string;
  userId: string;
  /** Opaque token `<sessionId>.<secret>`; only sha256(secret) is persisted. */
  refreshToken: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Manages login sessions and their rotating refresh tokens.
 *
 * Every refresh issues a new token and invalidates the previous one. Presenting
 * an already-rotated token means it leaked (or was replayed), so the whole
 * session is revoked (refresh token reuse detection, per OAuth 2.0 BCP).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ttlMs = config.get('auth.refreshTtlDays', { infer: true }) * DAY_MS;
  }

  async create(userId: string, client: ClientInfo): Promise<IssuedSession> {
    const secret = generateToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(secret),
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        expiresAt: this.nextExpiry(),
      },
      select: { id: true },
    });
    return { sessionId: session.id, userId, refreshToken: `${session.id}.${secret}` };
  }

  async rotate(refreshToken: string, client: ClientInfo): Promise<IssuedSession> {
    const parsed = this.parse(refreshToken);
    const session = parsed
      ? await this.prisma.session.findUnique({ where: { id: parsed.sessionId } })
      : null;

    if (!parsed || !session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const nextSecret = generateToken();
    // Compare-and-swap on the current hash makes concurrent refreshes safe:
    // exactly one caller wins, any other presenter of the old token is treated as reuse.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: sha256(parsed.secret), revokedAt: null },
      data: {
        refreshTokenHash: sha256(nextSecret),
        lastUsedAt: new Date(),
        expiresAt: this.nextExpiry(),
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      },
    });

    if (count === 0) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Refresh token reuse detected, revoked session ${session.id}`);
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      refreshToken: `${session.id}.${nextSecret}`,
    };
  }

  async listActive(userId: string, currentSessionId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  async revoke(userId: string, sessionId: string): Promise<void> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException('Session not found');
    }
  }

  /** Revokes every active session of the user, optionally keeping one (the caller's). */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private parse(token: string): { sessionId: string; secret: string } | null {
    const separator = token.indexOf('.');
    if (separator <= 0) return null;
    const sessionId = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    return UUID_PATTERN.test(sessionId) && secret ? { sessionId, secret } : null;
  }

  private nextExpiry(): Date {
    return new Date(Date.now() + this.ttlMs);
  }
}
