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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/decorators/api-error-responses.decorator';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { AdminOnly, CurrentUser } from '../../../common/decorators/auth.decorators';
import { MessageResponseDto } from '../../../common/dto/message-response.dto';
import { Paginated } from '../../../common/dto/pagination.dto';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import {
  AdminListUsersQueryDto,
  AdminUpdateUserDto,
  AdminUserDetailDto,
  AdminUserDto,
} from '../dto/admin-users.dto';
import { AdminUsersService } from '../services/admin-users.service';

@ApiTags('Admin: Users')
@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (search by email/name, filter by role, status, plan)' })
  @ApiPaginatedResponse(AdminUserDto)
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  list(@Query() query: AdminListUsersQueryDto): Promise<Paginated<AdminUserDto>> {
    return this.adminUsers.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User details with subscription, usage and activity counts' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.adminUsers.detail(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a user’s role or activate/deactivate the account',
    description:
      'Deactivation revokes all sessions immediately. Admins cannot modify themselves, and the last active admin cannot be demoted or deactivated.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  update(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.adminUsers.update(actorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a user and all of their data' })
  @ApiNoContentResponse({ description: 'User deleted' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async remove(
    @CurrentUser('id') actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.adminUsers.remove(actorId, id);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign a user out of every device' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async revokeSessions(@Param('id', ParseUUIDPipe) id: string): Promise<MessageResponseDto> {
    const count = await this.adminUsers.revokeSessions(id);
    return new MessageResponseDto(`Revoked ${count} session(s)`);
  }
}
