import {
  Body,
  Controller,
  Get,
  Header,
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

  @Post('instagram')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async receiveInstagram(@Body() payload: unknown): Promise<{ received: true }> {
    await this.webhooks.handleInstagram(payload);
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
  async receiveWhatsApp(@Body() payload: unknown): Promise<{ received: true }> {
    await this.webhooks.handleWhatsApp(payload);
    return { received: true };
  }
}
