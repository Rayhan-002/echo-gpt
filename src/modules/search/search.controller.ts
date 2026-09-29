import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { ApiAuth, CurrentUser } from '../../common/decorators/auth.decorators';
import { Paginated } from '../../common/dto/pagination.dto';
import {
  PerformSearchResponseDto,
  RecentSearchDto,
  RecentSearchesQueryDto,
  SearchHistoryQueryDto,
  SearchQueryDto,
  SearchResponseDto,
  SuggestionsQueryDto,
  SuggestionsResponseDto,
} from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Search the web (optionally with an AI summary)',
    description:
      'Results are cached per normalized query (see SEARCH_CACHE_TTL_SECONDS). With `summarize: true` an AI provider writes a grounded answer with [n] citations; this consumes one AI request from the plan quota. If only the summary fails, results are still returned with `summaryError` set.',
  })
  @ApiOkResponse({ type: PerformSearchResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.TOO_MANY_REQUESTS,
    HttpStatus.BAD_GATEWAY,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  perform(
    @CurrentUser('id') userId: string,
    @Body() dto: SearchQueryDto,
  ): Promise<PerformSearchResponseDto> {
    return this.search.search(userId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Search history (newest first)' })
  @ApiPaginatedResponse(SearchResponseDto)
  async history(
    @CurrentUser('id') userId: string,
    @Query() query: SearchHistoryQueryDto,
  ): Promise<Paginated<SearchResponseDto>> {
    const page = await this.search.history(userId, query);
    return { ...page, data: page.data.map((s) => SearchResponseDto.from(s)) };
  }

  @Delete('history')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the entire search history' })
  @ApiNoContentResponse({ description: 'History cleared' })
  async clearHistory(@CurrentUser('id') userId: string): Promise<void> {
    await this.search.clearHistory(userId);
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'Get a past search with its results' })
  @ApiOkResponse({ type: SearchResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SearchResponseDto> {
    return SearchResponseDto.from(await this.search.findOne(userId, id));
  }

  @Delete('history/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one search from history' })
  @ApiNoContentResponse({ description: 'Search deleted' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.search.remove(userId, id);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Recent distinct searches of the current user' })
  @ApiOkResponse({ type: [RecentSearchDto] })
  recent(
    @CurrentUser('id') userId: string,
    @Query() query: RecentSearchesQueryDto,
  ): Promise<RecentSearchDto[]> {
    return this.search.recent(userId, query.limit);
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Search suggestions for a prefix',
    description:
      'Combines the user’s own matching history (most frequent first) with engine autocomplete. Other users’ queries are never suggested.',
  })
  @ApiOkResponse({ type: SuggestionsResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async suggestions(
    @CurrentUser('id') userId: string,
    @Query() query: SuggestionsQueryDto,
  ): Promise<SuggestionsResponseDto> {
    return { suggestions: await this.search.suggestions(userId, query.q, query.limit) };
  }
}
