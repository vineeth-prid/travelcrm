import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksService, type VerificationQuery } from './webhooks.service';

/**
 * Public endpoints called by Meta. They are unauthenticated by necessity, so
 * POSTs are protected by the request signature instead.
 *
 * Meta retries anything that is not answered with 2xx within a few seconds, so
 * a payload we cannot use is still acknowledged — never rejected into a retry
 * loop. Only a bad signature returns an error.
 */
@ApiTags('webhooks')
@SkipThrottle()
@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('instagram')
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Instagram webhook subscription handshake' })
  verifyInstagram(@Query() query: VerificationQuery): string {
    return this.webhooks.verifySubscription('instagram', query);
  }

  /**
   * Signature first, then acknowledge, then work. Meta wants the 200 inside
   * about five seconds and quietly disables a subscription that keeps missing
   * it, so nothing that touches the database or the Graph API runs before the
   * response goes out.
   */
  @Post('instagram')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  receiveInstagram(
    @Body() payload: unknown,
    @Headers('x-hub-signature-256') signature?: string,
  ): { received: true } {
    this.webhooks.logDelivery('instagram', signature, payload);
    this.webhooks.accept('instagram', payload);
    return { received: true };
  }

  @Get('whatsapp')
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'WhatsApp webhook subscription handshake' })
  verifyWhatsApp(@Query() query: VerificationQuery): string {
    return this.webhooks.verifySubscription('whatsapp', query);
  }

  @Post('whatsapp')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  receiveWhatsApp(
    @Body() payload: unknown,
    @Headers('x-hub-signature-256') signature?: string,
  ): { received: true } {
    this.webhooks.logDelivery('whatsapp', signature, payload);
    this.webhooks.accept('whatsapp', payload);
    return { received: true };
  }
}
