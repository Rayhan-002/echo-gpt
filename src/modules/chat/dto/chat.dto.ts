import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Conversation, Message, MessageRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export const MAX_PROMPT_LENGTH = 32_000;

export class SendMessageDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Continue an existing conversation. Omit to start a new one.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ example: 'Summarize the key ideas of this page in 3 bullet points.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROMPT_LENGTH)
  content: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Provider to use. Defaults to the conversation’s provider, then the default provider.',
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({
    example: 'gpt-5-mini',
    description: 'Model to use; must be enabled for the provider.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;

  @ApiPropertyOptional({ example: 1024, minimum: 1, maximum: 32000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32_000)
  maxTokens?: number;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'Trip planning', maxLength: 200 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ example: 'claude-sonnet-5-5' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;

  @ApiPropertyOptional({
    example: 'You are a concise assistant. Answer in plain English.',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;
}

export class UpdateConversationDto extends CreateConversationDto {}

export class ListConversationsQueryDto extends PaginationQueryDto {
  /** Case-insensitive search in conversation titles. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class ChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ enum: MessageRole, example: MessageRole.ASSISTANT })
  role: MessageRole;

  @ApiProperty({ example: 'Here are the three key ideas: ...' })
  content: string;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  providerId: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'gpt-5-mini' })
  model: string | null;

  @ApiProperty({ nullable: true, type: Number, example: 42 })
  promptTokens: number | null;

  @ApiProperty({ nullable: true, type: Number, example: 128 })
  completionTokens: number | null;

  @ApiProperty({ nullable: true, type: Number, example: 1830 })
  latencyMs: number | null;

  @ApiProperty()
  createdAt: Date;

  static from(message: Message): ChatMessageDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      providerId: message.providerId,
      model: message.model,
      promptTokens: message.promptTokens,
      completionTokens: message.completionTokens,
      latencyMs: message.latencyMs,
      createdAt: message.createdAt,
    };
  }
}

export class ConversationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Summarize the key ideas of this page' })
  title: string;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  providerId: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'gpt-5-mini' })
  model: string | null;

  @ApiProperty({ nullable: true, type: String })
  systemPrompt: string | null;

  @ApiProperty({ example: 6 })
  messageCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(conversation: Conversation & { _count?: { messages: number } }): ConversationDto {
    return {
      id: conversation.id,
      title: conversation.title,
      providerId: conversation.providerId,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
      messageCount: conversation._count?.messages ?? 0,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }
}

export class SendMessageResponseDto {
  @ApiProperty({ type: ConversationDto })
  conversation: ConversationDto;

  @ApiProperty({ type: ChatMessageDto })
  userMessage: ChatMessageDto;

  @ApiProperty({ type: ChatMessageDto })
  assistantMessage: ChatMessageDto;
}
