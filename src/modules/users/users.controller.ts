import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiAuth, CurrentUser } from '../../common/decorators/auth.decorators';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user’s profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async getProfile(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.findById(userId));
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user’s profile' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.from(await this.users.updateProfile(userId, dto));
  }

  @Patch('password')
  @ApiOperation({
    summary: 'Change password',
    description: 'Requires the current password. All other sessions are signed out.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.users.changePassword(user.id, user.sessionId, dto);
    return new MessageResponseDto('Password changed. Other sessions have been signed out.');
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete account',
    description:
      'Permanently deletes the account and all associated data (sessions, conversations, searches). Requires the current password.',
  })
  @ApiNoContentResponse({ description: 'Account deleted' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN)
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.users.deleteAccount(userId, dto.password);
  }
}
