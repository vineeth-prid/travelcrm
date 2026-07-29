import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { MetaGraphClient } from './meta-graph.client';
import { ProviderError } from './provider.error';

interface SendResponse {
  messages?: { id?: string }[];
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly graph: MetaGraphClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  private get phoneNumberId(): string {
    return this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true });
  }

  private get accessToken(): string {
    return this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true });
  }

  /** Sends a text message and returns the provider message id. */
  async sendText(to: string, content: string): Promise<string | null> {
    if (!this.isConfigured) {
      throw ProviderError.notConfigured('WhatsApp');
    }

    const response = await this.graph.post<SendResponse>(
      'WhatsApp',
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: content },
      },
      this.accessToken,
    );

    return response.messages?.[0]?.id ?? null;
  }

  /**
   * Sends a document by link. WhatsApp fetches the URL itself, so it must be
   * reachable from Meta's servers — a presigned storage link, not localhost.
   */
  async sendDocument(
    to: string,
    document: { url: string; filename: string; caption: string },
  ): Promise<string | null> {
    if (!this.isConfigured) {
      throw ProviderError.notConfigured('WhatsApp');
    }

    const response = await this.graph.post<SendResponse>(
      'WhatsApp',
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link: document.url,
          filename: document.filename,
          caption: document.caption,
        },
      },
      this.accessToken,
    );

    return response.messages?.[0]?.id ?? null;
  }
}
