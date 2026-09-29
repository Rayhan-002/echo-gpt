import { BadGatewayException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpstreamRequestError } from '../../common/http/upstream-http';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import { QuotaService } from '../subscriptions/quota.service';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';

describe('ChatService', () => {
  const adapter = { complete: jest.fn(), stream: jest.fn(), healthCheck: jest.fn() };
  const resolved = {
    provider: { id: 'p1', name: 'OpenAI' },
    model: 'gpt-5-mini',
    adapter,
    connection: { apiKey: 'k', baseUrl: 'https://vendor.test' },
  };

  let prisma: { $transaction: jest.Mock; message: { findMany: jest.Mock } };
  let quota: { consume: jest.Mock; refund: jest.Mock };
  let service: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { $transaction: jest.fn(), message: { findMany: jest.fn().mockResolvedValue([]) } };
    quota = { consume: jest.fn(), refund: jest.fn() };
    const providers = { resolve: jest.fn().mockResolvedValue(resolved) };
    const conversations = { findOwned: jest.fn() };
    service = new ChatService(
      prisma as unknown as PrismaService,
      conversations as unknown as ConversationsService,
      providers as unknown as AiProvidersService,
      quota as unknown as QuotaService,
    );
  });

  it('reserves quota before calling the provider', async () => {
    const chat = await service.prepare('u1', { content: 'Hello' });

    expect(quota.consume).toHaveBeenCalledWith('u1');
    expect(chat.isNewConversation).toBe(true);
    expect(chat.context).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('derives a single-line, truncated title for new conversations', async () => {
    const chat = await service.prepare('u1', { content: `Line one\n\n${'x'.repeat(100)}` });

    expect(chat.title).not.toContain('\n');
    expect(chat.title.length).toBeLessThanOrEqual(60);
    expect(chat.title.endsWith('…')).toBe(true);
  });

  it('refunds the quota, persists nothing and returns 502 when the provider fails', async () => {
    adapter.complete.mockRejectedValue(new UpstreamRequestError('Upstream exploded', 500));

    const error = await service.send('u1', { content: 'Hello' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toBe('OpenAI request failed: Upstream exploded');
    expect(quota.refund).toHaveBeenCalledWith('u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
