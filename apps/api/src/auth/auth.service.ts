import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { LoginRequest, User } from '@travel-crm/sdk';
import type { CookieOptions, Response } from 'express';

import type { Env } from '../config/env';
import { toPublicUser, UsersService } from '../users/users.service';
import { AUTH_COOKIE, type JwtPayload } from './auth.constants';

const DURATION_UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Converts a JWT-style duration ("7d", "12h", "30m") to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  const unitMs = match ? DURATION_UNITS[match[2] ?? ''] : undefined;

  if (!match || unitMs === undefined) {
    throw new Error(`Unsupported duration: "${value}". Use e.g. 30m, 12h or 7d.`);
  }

  return Number(match[1]) * unitMs;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Verifies credentials. The same error is returned for unknown emails and
   * wrong passwords so the endpoint cannot be used to enumerate accounts.
   */
  async login(dto: LoginRequest): Promise<{ user: User; token: string }> {
    const record = await this.users.findByEmail(dto.email);
    const passwordMatches = record
      ? await this.users.verifyPassword(dto.password, record.password)
      : false;

    // A deactivated account is rejected with the same message, for the same
    // reason: the endpoint must not reveal which accounts exist.
    if (!record || !passwordMatches || !record.active) {
      this.logger.warn(`Failed login attempt for ${dto.email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: record.id, email: record.email };
    return { user: toPublicUser(record), token: await this.jwt.signAsync(payload) };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      path: '/',
    };
  }

  setSessionCookie(response: Response, token: string): void {
    response.cookie(AUTH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: durationToMs(this.config.get('JWT_EXPIRES_IN', { infer: true })),
    });
  }

  clearSessionCookie(response: Response): void {
    response.clearCookie(AUTH_COOKIE, this.cookieOptions());
  }
}
