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
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { AdminOnly } from '../../common/decorators/auth.decorators';
import { AiProvidersService } from './ai-providers.service';
import { CreateProviderDto, ProviderResponseDto, UpdateProviderDto } from './dto/provider.dto';

@ApiTags('Admin: AI Providers')
@AdminOnly()
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly providers: AiProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'List all AI providers' })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  async list(): Promise<ProviderResponseDto[]> {
    return (await this.providers.findAll()).map((p) => ProviderResponseDto.from(p));
  }

  @Post()
  @ApiOperation({
    summary: 'Add an AI provider',
    description:
      'Registers an OpenAI, Anthropic (Claude) or Google Gemini provider. The API key is encrypted at rest and never returned.',
  })
  @ApiCreatedResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  async create(@Body() dto: CreateProviderDto): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.create(dto));
  }

  @Post('health-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health check all enabled providers',
    description:
      'Performs a live authenticated call to every enabled provider and stores the result.',
  })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  async checkAll(): Promise<ProviderResponseDto[]> {
    return (await this.providers.checkAllHealth()).map((p) => ProviderResponseDto.from(p));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an AI provider' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.findById(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit an AI provider',
    description: 'Send `apiKey` to rotate the key. The provider type cannot be changed.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an AI provider',
    description: 'Existing conversations keep their history; their provider reference is cleared.',
  })
  @ApiNoContentResponse({ description: 'Provider deleted' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.providers.remove(id);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable an AI provider' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async enable(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.setEnabled(id, true));
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable an AI provider',
    description: 'Disabling the default provider also clears the default selection.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async disable(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.setEnabled(id, false));
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make this the default provider' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async makeDefault(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.setDefault(id));
  }

  @Post(':id/health-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health check one provider',
    description: 'Performs a live authenticated call to the vendor and stores status and latency.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async checkOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return ProviderResponseDto.from(await this.providers.checkHealth(id));
  }
}
