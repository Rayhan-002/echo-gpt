import { Injectable, NotFoundException } from '@nestjs/common';
import { Conversation, Message, Prisma } from '@prisma/client';
import {
  Paginated,
  paginate,
  PaginationQueryDto,
  toPrismaPage,
} from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvidersService } from '../ai-providers/ai-providers.service';
import {
  CreateConversationDto,
  ListConversationsQueryDto,
  UpdateConversationDto,
} from './dto/chat.dto';

const withMessageCount = { _count: { select: { messages: true } } } as const;
export type ConversationWithCount = Conversation & { _count: { messages: number } };

/** Conversation history (CRUD). Every query is scoped to the owning user. */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProvidersService,
  ) {}

  async list(
    userId: string,
    query: ListConversationsQueryDto,
  ): Promise<Paginated<ConversationWithCount>> {
    const where: Prisma.ConversationWhereInput = {
      userId,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: withMessageCount,
        orderBy: { updatedAt: 'desc' },
        ...toPrismaPage(query),
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  async findOwned(userId: string, id: string): Promise<ConversationWithCount> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: withMessageCount,
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async create(userId: string, dto: CreateConversationDto): Promise<ConversationWithCount> {
    const { provider, model } = await this.resolveProviderSelection(dto);
    return this.prisma.conversation.create({
      data: {
        userId,
        title: dto.title ?? 'New conversation',
        systemPrompt: dto.systemPrompt,
        providerId: provider,
        model,
      },
      include: withMessageCount,
    });
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationWithCount> {
    const existing = await this.findOwned(userId, id);
    const selection =
      dto.providerId || dto.model
        ? await this.resolveProviderSelection({
            providerId: dto.providerId ?? existing.providerId ?? undefined,
            model: dto.model,
          })
        : undefined;

    return this.prisma.conversation.update({
      where: { id },
      data: {
        title: dto.title,
        systemPrompt: dto.systemPrompt,
        ...(selection ? { providerId: selection.provider, model: selection.model } : {}),
      },
      include: withMessageCount,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.conversation.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<Message>> {
    await this.findOwned(userId, conversationId);
    const where = { conversationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...toPrismaPage(query),
      }),
      this.prisma.message.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  /** Validates an optional provider/model pinning for a conversation. */
  private async resolveProviderSelection(dto: { providerId?: string; model?: string }) {
    if (!dto.providerId && !dto.model) {
      return { provider: null, model: null };
    }
    const resolved = await this.providers.resolve(dto.providerId, dto.model);
    return { provider: resolved.provider.id, model: resolved.model };
  }
}
