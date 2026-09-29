import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sha256 } from '../../common/utils/crypto.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const sessionId = '9b1f7c7e-2f55-4f7a-9d59-6c2d3e1a8b90';
  const client = { ipAddress: '127.0.0.1', userAgent: 'jest' };

  let prisma: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: SessionsService;

  beforeEach(() => {
    prisma = {
      session: {
        create: jest.fn().mockResolvedValue({ id: sessionId }),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const config = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;
    service = new SessionsService(prisma as unknown as PrismaService, config as never);
  });

  const activeSession = (overrides = {}) => ({
    id: sessionId,
    userId: 'user-1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  it('creates a session and only persists the token hash', async () => {
    const issued = await service.create('user-1', client);
    const [, secret] = issued.refreshToken.split('.');

    expect(issued.sessionId).toBe(sessionId);
    const { data } = prisma.session.create.mock.calls[0][0];
    expect(data.refreshTokenHash).toBe(sha256(secret));
    expect(JSON.stringify(data)).not.toContain(secret);
  });

  it('rotates a valid refresh token', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());
    prisma.session.updateMany.mockResolvedValue({ count: 1 });

    const issued = await service.rotate(`${sessionId}.old-secret`, client);

    expect(issued.refreshToken).not.toBe(`${sessionId}.old-secret`);
    expect(prisma.session.updateMany.mock.calls[0][0].where.refreshTokenHash).toBe(
      sha256('old-secret'),
    );
  });

  it('revokes the session when an already rotated token is reused', async () => {
    prisma.session.findUnique.mockResolvedValue(activeSession());
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rotate(`${sessionId}.stale-secret`, client)).rejects.toThrow(
      /reuse detected/,
    );
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: sessionId },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it.each([
    ['malformed token', 'not-a-token', undefined],
    ['unknown session', `${sessionId}.secret`, null],
    ['revoked session', `${sessionId}.secret`, activeSession({ revokedAt: new Date() })],
    ['expired session', `${sessionId}.secret`, activeSession({ expiresAt: new Date(0) })],
  ])('rejects a %s', async (_, token, session) => {
    prisma.session.findUnique.mockResolvedValue(session);
    await expect(service.rotate(token, client)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });
});
