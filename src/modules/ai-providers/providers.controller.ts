import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../../common/decorators/auth.decorators';
import { AiProvidersService } from './ai-providers.service';
import { PublicProviderDto } from './dto/provider.dto';

@ApiTags('Providers')
@ApiAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: AiProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'List enabled AI providers and their models',
    description: 'Used by the extension to populate the provider/model picker.',
  })
  @ApiOkResponse({ type: [PublicProviderDto] })
  async list(): Promise<PublicProviderDto[]> {
    return (await this.providers.findEnabled()).map((p) => PublicProviderDto.from(p));
  }
}
