import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WebSearch } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
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
import { SearchResultItem } from '../engines/search-engine.interface';

export const MAX_SEARCH_RESULTS = 10;

export class SearchQueryDto {
  @ApiProperty({ example: 'What is NestJS?', maxLength: 500 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: MAX_SEARCH_RESULTS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_RESULTS)
  limit: number = 5;

  @ApiPropertyOptional({
    default: false,
    description:
      'Generate an AI answer grounded in the results (with [n] citations). Consumes one AI request from the plan quota.',
  })
  @IsOptional()
  @IsBoolean()
  summarize: boolean = false;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Provider for the summary (default if omitted)',
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ example: 'gpt-5-mini', description: 'Model for the summary' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;
}

export class SearchHistoryQueryDto extends PaginationQueryDto {
  /** Filter history by query text (case-insensitive). */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class RecentSearchesQueryDto {
  /** Number of distinct recent queries (max 50). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}

export class SuggestionsQueryDto {
  /** Prefix typed so far. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  q: string;

  /** Max suggestions (max 20). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 8;
}

export class SearchResultItemDto implements SearchResultItem {
  @ApiProperty({ example: 'NestJS' })
  title: string;

  @ApiProperty({ example: 'https://en.wikipedia.org/wiki/NestJS' })
  url: string;

  @ApiProperty({ example: 'NestJS is a server-side Node.js web framework...' })
  snippet: string;

  @ApiPropertyOptional({ example: 'Wikipedia' })
  source?: string;
}

export class SearchResponseDto {
  @ApiProperty({ format: 'uuid', description: 'History entry id' })
  id: string;

  @ApiProperty({ example: 'What is NestJS?' })
  query: string;

  @ApiProperty({ example: 'duckduckgo' })
  engine: string;

  @ApiProperty({ example: 5 })
  resultCount: number;

  @ApiProperty({ type: [SearchResultItemDto] })
  results: SearchResultItemDto[];

  @ApiProperty({ description: 'Results were served from the search cache' })
  fromCache: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'NestJS is a Node.js framework for building server-side applications [1].',
  })
  aiSummary: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  providerId: string | null;

  @ApiProperty()
  createdAt: Date;

  static from(search: WebSearch): SearchResponseDto {
    return {
      id: search.id,
      query: search.query,
      engine: search.engine,
      resultCount: search.resultCount,
      results: search.results as unknown as SearchResultItemDto[],
      fromCache: search.fromCache,
      aiSummary: search.aiSummary,
      providerId: search.providerId,
      createdAt: search.createdAt,
    };
  }
}

export class PerformSearchResponseDto extends SearchResponseDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Why the AI summary is missing although it was requested (results still returned).',
    example: null,
  })
  summaryError: string | null;
}

export class RecentSearchDto {
  @ApiProperty({ example: 'what is nestjs?' })
  query: string;

  @ApiProperty({ example: 3 })
  count: number;

  @ApiProperty()
  lastSearchedAt: Date;
}

export class SuggestionsResponseDto {
  @ApiProperty({ type: [String], example: ['nestjs', 'nestjs prisma', 'nestjs tutorial'] })
  suggestions: string[];
}
