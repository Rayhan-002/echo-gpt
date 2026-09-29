import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiAuth, CurrentUser } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsService } from './sessions.service';

@ApiTags('Auth')
@ApiAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions (logged-in devices) of the current user' })
  @ApiOkResponse({ type: [SessionResponseDto] })
  list(@CurrentUser() user: AuthUser): Promise<SessionResponseDto[]> {
    return this.sessions.listActive(user.id, user.sessionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one of the current user’s sessions (remote logout)' })
  @ApiNoContentResponse({ description: 'Session revoked' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async revoke(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.sessions.revoke(userId, sessionId);
  }
}
