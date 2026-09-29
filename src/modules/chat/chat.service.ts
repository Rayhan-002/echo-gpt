import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProvidersService, ResolvedProvider } from '../ai-providers/ai-providers.service';
import {
  ChatMessageInput,
  TokenUsage,
} from '../ai-providers/adapters/ai-provider-adapter.interface';
import { ProviderRequestError } from '../ai-providers/adapters/provider-http';
import { QuotaService } from '../subscriptions/quota.service';
import { ConversationsService } from './conversations.service';
import {
  ChatMessageDto,
  ConversationDto,
  SendMessageDto,
  SendMessageResponseDto,
} from './dto/chat.dto';

/** How many previous messages are replayed to the model as context. */
const CONTEXT_MESSAGE_LIMIT = 30;
const TITLE_MAX_LENGTH = 60;

/** A validated, quota-reserved chat turn that is ready to be sent to the provider. */
export interface PreparedChat {
  userId: string;
  conversationId: string;
  isNewConversation: boolean;
  title: string;
  systemPrompt: string | null;
  content: string;
  context: ChatMessageInput[];
  resolved: ResolvedProvider;
  maxTokens?: number;
  temperature?: number;
  startedAt: Date;
}

export type ChatStreamEvent =
  | { type: 'start'; data: { conversationId: string; providerId: string; model: string } }
  | { type: 'delta'; data: { text: string } }
  | { type: 'done'; data: SendMessageResponseDto }
  | { type: 'error'; data: { message: string } };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly providers: AiProvidersService,
    private readonly quota: QuotaService,
  ) {}

  /**
   * Validates ownership and provider/model selection, builds the model context
   * and reserves one request from the user's quota. Throws regular HTTP errors,
   * so callers can run it before committing to a streaming response.
   */
  async prepare(userId: string, dto: SendMessageDto): Promise<PreparedChat> {
    const conversation = dto.conversationId
      ? await this.conversations.findOwned(userId, dto.conversationId)
      : null;

    // Model preference only carries over when staying on the conversation's provider.
    const providerId = dto.providerId ?? conversation?.providerId;
    const sameProvider = !dto.providerId || dto.providerId === conversation?.providerId;
    const model = dto.model ?? (sameProvider ? conversation?.model : undefined);
    const resolved = await this.providers.resolve(providerId, model);

    const history = conversation ? await this.loadHistory(conversation.id) : [];
    const systemPrompt = conversation?.systemPrompt ?? null;
    const context: ChatMessageInput[] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...history,
      { role: 'user', content: dto.content },
    ];

    await this.quota.consume(userId);

    return {
      userId,
      conversationId: conversation?.id ?? randomUUID(),
      isNewConversation: !conversation,
      title: conversation?.title ?? this.titleFrom(dto.content),
      systemPrompt,
      content: dto.content,
      context,
      resolved,
      maxTokens: dto.maxTokens,
      temperature: dto.temperature,
      startedAt: new Date(),
    };
  }

  /** Sends a prompt and waits for the full answer. */
  async send(userId: string, dto: SendMessageDto): Promise<SendMessageResponseDto> {
    const chat = await this.prepare(userId, dto);
    const { adapter, connection, model } = chat.resolved;

    try {
      const result = await adapter.complete(connection, {
        model,
        messages: chat.context,
        maxTokens: chat.maxTokens,
        temperature: chat.temperature,
      });
      return await this.persist(chat, result.content, result.usage);
    } catch (error) {
      await this.quota.refund(userId);
      throw this.toHttpError(chat, error);
    }
  }

  /**
   * Streams the answer as events. A turn interrupted by the client is still
   * saved (and charged) if any text was generated, since the provider billed it.
   */
  async *stream(chat: PreparedChat, signal: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const { adapter, connection, model, provider } = chat.resolved;
    yield {
      type: 'start',
      data: { conversationId: chat.conversationId, providerId: provider.id, model },
    };

    let content = '';
    let usage: TokenUsage = {};
    try {
      for await (const chunk of adapter.stream(connection, {
        model,
        messages: chat.context,
        maxTokens: chat.maxTokens,
        temperature: chat.temperature,
        signal,
      })) {
        if (chunk.type === 'delta') {
          content += chunk.text;
          yield { type: 'delta', data: { text: chunk.text } };
        } else {
          usage = { ...usage, ...chunk.usage };
        }
      }
    } catch (error) {
      if (signal.aborted && content) {
        await this.persist(chat, content, usage);
        return;
      }
      await this.quota.refund(chat.userId);
      if (signal.aborted) return;
      yield { type: 'error', data: { message: this.toHttpError(chat, error).message } };
      return;
    }

    yield { type: 'done', data: await this.persist(chat, content, usage) };
  }

  /** Saves the turn atomically; a new conversation is only created once the AI answered. */
  private async persist(
    chat: PreparedChat,
    content: string,
    usage: TokenUsage,
  ): Promise<SendMessageResponseDto> {
    const { provider, model } = chat.resolved;
    const latencyMs = Date.now() - chat.startedAt.getTime();

    const { conversation, userMessage, assistantMessage } = await this.prisma.$transaction(
      async (tx) => {
        const selection = { providerId: provider.id, model };
        if (chat.isNewConversation) {
          await tx.conversation.create({
            data: { id: chat.conversationId, userId: chat.userId, title: chat.title, ...selection },
          });
        } else {
          await tx.conversation.update({
            where: { id: chat.conversationId },
            data: { ...selection, updatedAt: new Date() },
          });
        }

        const userMessage = await tx.message.create({
          data: {
            conversationId: chat.conversationId,
            role: MessageRole.USER,
            content: chat.content,
            createdAt: chat.startedAt,
          },
        });
        const assistantMessage = await tx.message.create({
          data: {
            conversationId: chat.conversationId,
            role: MessageRole.ASSISTANT,
            content,
            providerId: provider.id,
            model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            latencyMs,
          },
        });
        const conversation = await tx.conversation.findUniqueOrThrow({
          where: { id: chat.conversationId },
          include: { _count: { select: { messages: true } } },
        });
        return { conversation, userMessage, assistantMessage };
      },
    );

    return {
      conversation: ConversationDto.from(conversation),
      userMessage: ChatMessageDto.from(userMessage),
      assistantMessage: ChatMessageDto.from(assistantMessage),
    };
  }

  private async loadHistory(conversationId: string): Promise<ChatMessageInput[]> {
    const recent = await this.prisma.message.findMany({
      where: { conversationId, role: { in: [MessageRole.USER, MessageRole.ASSISTANT] } },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_MESSAGE_LIMIT,
      select: { role: true, content: true },
    });
    return recent.reverse().map((message) => ({
      role: message.role === MessageRole.USER ? 'user' : 'assistant',
      content: message.content,
    }));
  }

  private titleFrom(content: string): string {
    const singleLine = content.replace(/\s+/g, ' ').trim();
    return singleLine.length > TITLE_MAX_LENGTH
      ? `${singleLine.slice(0, TITLE_MAX_LENGTH - 1)}…`
      : singleLine || 'New conversation';
  }

  private toHttpError(chat: PreparedChat, error: unknown): Error {
    if (error instanceof ProviderRequestError) {
      const { provider } = chat.resolved;
      this.logger.warn(
        `Provider ${provider.name} failed (status ${error.status ?? 'n/a'}): ${error.message}`,
      );
      return new BadGatewayException(`${provider.name} request failed: ${error.message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
