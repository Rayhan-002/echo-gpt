import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { ApiAuth, CurrentUser } from '../../common/decorators/auth.decorators';
import { Paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';
import {
  ChatMessageDto,
  ConversationDto,
  CreateConversationDto,
  ListConversationsQueryDto,
  SendMessageDto,
  SendMessageResponseDto,
  UpdateConversationDto,
} from './dto/chat.dto';

const STREAM_DESCRIPTION = `
Same as \`POST /chat/messages\` but the answer is streamed as **Server-Sent Events**.

Validation, provider and quota errors are returned as regular JSON errors *before* the stream starts.
Once streaming, events are:

| event   | data |
|---------|------|
| \`start\` | \`{ conversationId, providerId, model }\` |
| \`delta\` | \`{ text }\` — append to the answer |
| \`done\`  | \`SendMessageResponseDto\` — the persisted messages |
| \`error\` | \`{ message }\` — upstream provider failure (quota is refunded) |

Closing the connection aborts the upstream request.
`;

@ApiTags('Chat')
@ApiAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly conversations: ConversationsService,
  ) {}

  @Post('messages')
  @ApiOperation({
    summary: 'Send a prompt and receive the AI response',
    description:
      'Omit `conversationId` to start a new conversation. Consumes one request from the daily plan quota (refunded if the provider fails).',
  })
  @ApiCreatedResponse({ type: SendMessageResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.BAD_GATEWAY,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  send(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    return this.chat.send(userId, dto);
  }

  @Post('messages/stream')
  @ApiOperation({
    summary: 'Send a prompt and stream the AI response (SSE)',
    description: STREAM_DESCRIPTION,
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Server-Sent Events stream',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          example:
            'event: start\ndata: {"conversationId":"…","providerId":"…","model":"gpt-5-mini"}\n\n' +
            'event: delta\ndata: {"text":"Hello"}\n\n' +
            'event: done\ndata: {"conversation":{…},"userMessage":{…},"assistantMessage":{…}}\n\n',
        },
      },
    },
  })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  async stream(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    const prepared = await this.chat.prepare(userId, dto);

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    // Drain the generator even after a disconnect (don't `break`): it winds down
    // quickly once the upstream request is aborted and settles quota/persistence.
    for await (const event of this.chat.stream(prepared, abort.signal)) {
      if (!abort.signal.aborted) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    }
    res.end();
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Conversation history (most recently active first)' })
  @ApiPaginatedResponse(ConversationDto)
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListConversationsQueryDto,
  ): Promise<Paginated<ConversationDto>> {
    const page = await this.conversations.list(userId, query);
    return { ...page, data: page.data.map((c) => ConversationDto.from(c)) };
  }

  @Post('conversations')
  @ApiOperation({
    summary: 'Create an empty conversation',
    description: 'Optional: lets clients pin a provider/model or a system prompt up front.',
  })
  @ApiCreatedResponse({ type: ConversationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationDto> {
    return ConversationDto.from(await this.conversations.create(userId, dto));
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a conversation' })
  @ApiOkResponse({ type: ConversationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDto> {
    return ConversationDto.from(await this.conversations.findOwned(userId, id));
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Rename a conversation or change its provider/model/system prompt' })
  @ApiOkResponse({ type: ConversationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationDto> {
    return ConversationDto.from(await this.conversations.update(userId, id, dto));
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  @ApiNoContentResponse({ description: 'Conversation deleted' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.conversations.remove(userId, id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Messages of a conversation (chronological)' })
  @ApiPaginatedResponse(ChatMessageDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async messages(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ChatMessageDto>> {
    const page = await this.conversations.listMessages(userId, id, query);
    return { ...page, data: page.data.map((m) => ChatMessageDto.from(m)) };
  }
}
