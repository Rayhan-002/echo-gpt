import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../interfaces/auth-user.interface';

/**
 * Validates the access token signature, then confirms the backing session is
 * still active and the account enabled. This makes logout / session revocation /
 * account deactivation effective immediately instead of at token expiry, and
 * always uses the user's current role.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('auth.accessSecret', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        user: {
          select: { id: true, email: true, isActive: true, role: { select: { name: true } } },
        },
      },
    });

    if (!session || !session.user.isActive) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const { user } = session;
    return { id: user.id, email: user.email, role: user.role.name, sessionId: payload.sid };
  }
}
