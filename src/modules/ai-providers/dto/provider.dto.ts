import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AiProvider, AiProviderType, ProviderHealthStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/validation.decorators';
import { AI_PROVIDER_CATALOG } from '../ai-provider.catalog';

export class CreateProviderDto {
  @ApiProperty({ example: 'OpenAI', description: 'Unique display name' })
  @Trim()
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({ enum: AiProviderType, example: AiProviderType.OPENAI })
  @IsEnum(AiProviderType)
  type: AiProviderType;

  @ApiProperty({
    description: 'Vendor API key. Stored encrypted (AES-256-GCM) and never returned.',
    example: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx',
    writeOnly: true,
  })
  @IsString()
  @Length(8, 512)
  apiKey: string;

  @ApiPropertyOptional({
    description: 'Override the vendor base URL (proxy / compatible gateway). Defaults per type.',
    example: 'https://api.openai.com/v1',
  })
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  baseUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Models users may select. Defaults to the vendor catalog.',
    example: ['gpt-5', 'gpt-5-mini'],
  })
  @IsOptional()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  models?: string[];

  @ApiPropertyOptional({ description: 'Must be one of `models`.', example: 'gpt-5-mini' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  defaultModel?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Make this the default provider.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** The provider type is immutable; use a new provider for a different vendor. */
export class UpdateProviderDto extends PartialType(
  OmitType(CreateProviderDto, ['type', 'isEnabled', 'isDefault'] as const),
) {}

export class ProviderHealthDto {
  @ApiProperty({ enum: ProviderHealthStatus, example: ProviderHealthStatus.HEALTHY })
  status: ProviderHealthStatus;

  @ApiProperty({ nullable: true, type: Date })
  checkedAt: Date | null;

  @ApiProperty({ nullable: true, type: Number, example: 245 })
  latencyMs: number | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  error: string | null;
}

/** Admin view of a provider. The API key is only ever shown masked. */
export class ProviderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'OpenAI' })
  name: string;

  @ApiProperty({ enum: AiProviderType })
  type: AiProviderType;

  @ApiProperty({ example: 'https://api.openai.com/v1' })
  baseUrl: string;

  @ApiProperty({ example: '••••••••3xYz' })
  apiKeyMasked: string;

  @ApiProperty({ example: 'gpt-5-mini' })
  defaultModel: string;

  @ApiProperty({ type: [String], example: ['gpt-5', 'gpt-5-mini'] })
  models: string[];

  @ApiProperty()
  isEnabled: boolean;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty({ type: ProviderHealthDto })
  health: ProviderHealthDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(provider: AiProvider): ProviderResponseDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl ?? AI_PROVIDER_CATALOG[provider.type].baseUrl,
      apiKeyMasked: `••••••••${provider.apiKeyLast4}`,
      defaultModel: provider.defaultModel,
      models: provider.models,
      isEnabled: provider.isEnabled,
      isDefault: provider.isDefault,
      health: {
        status: provider.healthStatus,
        checkedAt: provider.lastHealthCheckAt,
        latencyMs: provider.lastHealthLatencyMs,
        error: provider.lastHealthError,
      },
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }
}

/** What end users see when picking a provider/model. */
export class PublicProviderDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Claude (Anthropic)' })
  name: string;

  @ApiProperty({ enum: AiProviderType })
  type: AiProviderType;

  @ApiProperty({ example: 'claude-sonnet-5-5' })
  defaultModel: string;

  @ApiProperty({ type: [String] })
  models: string[];

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty({ enum: ProviderHealthStatus })
  healthStatus: ProviderHealthStatus;

  static from(provider: AiProvider): PublicProviderDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      defaultModel: provider.defaultModel,
      models: provider.models,
      isDefault: provider.isDefault,
      healthStatus: provider.healthStatus,
    };
  }
}
