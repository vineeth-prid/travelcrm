import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserRequest,
  type MessageResponse,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  type User,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { messageSchema, userSchema } from './users.schemas';
import { UsersService } from './users.service';

/**
 * Staff administration (§32).
 *
 * Accounts are deactivated rather than deleted: a consultant who leaves still
 * owns the leads they worked and the proposals they wrote, and removing the
 * row would take the history with it.
 */
@ApiTags('users')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller({ path: 'users', version: '1' })
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Every account, active or not' })
  @ApiZodResponse(HttpStatus.OK, z.array(userSchema), 'Users')
  list(): Promise<User[]> {
    return this.users.listAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create an account' })
  @ApiZodBody(createUserSchema)
  @ApiZodResponse(HttpStatus.CREATED, userSchema, 'The new account')
  create(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserRequest): Promise<User> {
    return this.users.createUser(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an account, its role or its access' })
  @ApiZodBody(updateUserSchema)
  @ApiZodResponse(HttpStatus.OK, userSchema, 'The updated account')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<User> {
    // Locking yourself out is the one mistake with no way back through the
    // interface, so it is refused rather than confirmed.
    if (id === current.id && (dto.role !== 'ADMIN' || !dto.active)) {
      throw new BadRequestException(
        'You cannot remove your own administrator access or deactivate yourself.',
      );
    }

    return this.users.updateUser(id, dto);
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set a colleague's password" })
  @ApiZodBody(resetPasswordSchema)
  @ApiZodResponse(HttpStatus.OK, messageSchema, 'Password set')
  async resetPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordRequest,
  ): Promise<MessageResponse> {
    await this.users.setPassword(id, dto.password);
    return { message: 'Password set' };
  }
}
