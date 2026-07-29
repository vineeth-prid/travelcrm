import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordRequest,
  type MessageResponse,
  type UpdateProfileRequest,
  type User,
} from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { messageSchema, userSchema } from './users.schemas';
import { toPublicUser, UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'me', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Return the signed-in user' })
  @ApiZodResponse(HttpStatus.OK, userSchema, 'The current user')
  async me(@CurrentUser() current: AuthenticatedUser): Promise<User> {
    return toPublicUser(await this.users.findByIdOrFail(current.id));
  }

  @Patch()
  @ApiOperation({ summary: 'Update the signed-in user’s profile' })
  @ApiZodBody(updateProfileSchema)
  @ApiZodResponse(HttpStatus.OK, userSchema, 'The updated user')
  updateProfile(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileRequest,
  ): Promise<User> {
    return this.users.updateProfile(current.id, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the signed-in user’s password' })
  @ApiZodBody(changePasswordSchema)
  @ApiZodResponse(HttpStatus.OK, messageSchema, 'Password changed')
  async changePassword(
    @CurrentUser() current: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordRequest,
  ): Promise<MessageResponse> {
    await this.users.changePassword(current.id, dto);
    return { message: 'Password changed' };
  }
}
