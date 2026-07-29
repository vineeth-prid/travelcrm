import { Body, Controller, HttpCode, HttpStatus, Post, Res, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  loginSchema,
  type LoginRequest,
  type LoginResponse,
  type MessageResponse,
} from '@travel-crm/sdk';
import type { Response } from 'express';

import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { messageSchema } from '../users/users.schemas';
import { AuthService } from './auth.service';
import { loginResponseSchema } from './auth.schemas';

@ApiTags('auth')
@Controller({ version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Brute-force guard: 5 attempts per minute per IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  @ApiOperation({ summary: 'Sign in and receive an httpOnly session cookie' })
  @ApiZodBody(loginSchema)
  @ApiZodResponse(HttpStatus.OK, loginResponseSchema, 'Signed in')
  async login(
    @Body() dto: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const { user, token } = await this.auth.login(dto);
    this.auth.setSessionCookie(response, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the session cookie (safe to call when signed out)' })
  @ApiZodResponse(HttpStatus.OK, messageSchema, 'Signed out')
  logout(@Res({ passthrough: true }) response: Response): MessageResponse {
    this.auth.clearSessionCookie(response);
    return { message: 'Signed out' };
  }
}
