import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../config/env';
import { UsersService } from '../users/users.service';
import { AUTH_COOKIE, type JwtPayload } from './auth.constants';

/** Reads the JWT from the httpOnly session cookie. */
function fromAuthCookie(request: Request): string | null {
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[AUTH_COOKIE] ?? null;
}

/** The authenticated user attached to `request.user`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  canViewOwnProfitability: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromAuthCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Re-reads the user on every request, so deleted *and* deactivated accounts
   * lose access immediately rather than when their token happens to expire.
   * The role is read here too — it is never trusted from the token body.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      canViewOwnProfitability: user.canViewOwnProfitability,
    };
  }
}
