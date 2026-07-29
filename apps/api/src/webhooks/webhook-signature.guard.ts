import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import type { Env } from '../config/env';

const SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the raw request body.
 * Without this, anyone who learns the webhook URL can inject messages.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get('META_APP_SECRET', { infer: true });
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();

    if (!secret) {
      // Refusing outright in production beats silently trusting the caller.
      if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
        throw new UnauthorizedException('Webhook signature verification is not configured.');
      }
      this.logger.warn(
        'META_APP_SECRET is not set — accepting an unverified webhook (development only).',
      );
      return true;
    }

    const header = request.header(SIGNATURE_HEADER);
    if (!header?.startsWith('sha256=')) {
      throw new UnauthorizedException('Missing webhook signature.');
    }

    const body = request.rawBody;
    if (!body) {
      throw new UnauthorizedException('Webhook body could not be verified.');
    }

    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const received = header.slice('sha256='.length);

    if (received.length !== expected.length) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    if (!timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'))) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    return true;
  }
}
