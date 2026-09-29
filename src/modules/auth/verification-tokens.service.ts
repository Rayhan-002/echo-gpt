import { BadRequestException, Injectable } from '@nestjs/common';
import { TokenType } from '@prisma/client';
import { generateToken, sha256 } from '../../common/utils/crypto.util';
import { PrismaService } from '../../prisma/prisma.service';

/** Single-use, expiring tokens for email verification and password reset. */
@Injectable()
export class VerificationTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a new token, invalidating any outstanding token of the same type. */
  async issue(userId: string, type: TokenType, ttlMs: number): Promise<string> {
    const token = generateToken();
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({ where: { userId, type, usedAt: null } }),
      this.prisma.verificationToken.create({
        data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return token;
  }

  /** Atomically marks the token as used and returns its owner. */
  async consume(token: string, type: TokenType): Promise<string> {
    const tokenHash = sha256(token);
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });

    const { count } = record
      ? await this.prisma.verificationToken.updateMany({
          where: { id: record.id, type, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        })
      : { count: 0 };

    if (!record || count === 0) {
      throw new BadRequestException('Token is invalid or has expired');
    }
    return record.userId;
  }
}
