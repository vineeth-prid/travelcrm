import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { MessageIngestService } from '../communication/message-ingest.service';
import { InstagramService } from '../integrations/instagram.service';
import { parseInstagramLeads, parseInstagramMessages } from './instagram.parser';
import { parseWhatsAppDeliveries, parseWhatsAppMessages } from './whatsapp.parser';

export interface VerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly ingest: MessageIngestService,
    private readonly instagram: InstagramService,
  ) {}

  /** Meta's subscription handshake: echo the challenge if the token matches. */
  verifySubscription(channel: 'instagram' | 'whatsapp', query: VerificationQuery): string {
    const expected =
      channel === 'instagram'
        ? this.config.get('INSTAGRAM_VERIFY_TOKEN', { infer: true })
        : this.config.get('WHATSAPP_VERIFY_TOKEN', { infer: true });

    const challenge = query['hub.challenge'];

    if (!expected || query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== expected) {
      this.logger.warn(`Rejected ${channel} webhook verification attempt`);
      throw new ForbiddenException('Webhook verification failed.');
    }

    return challenge ?? '';
  }

  /**
   * Handles an Instagram webhook: direct messages and lead ad submissions.
   * Each item is processed independently so one bad entry cannot discard the
   * rest of the batch.
   */
  async handleInstagram(payload: unknown): Promise<void> {
    for (const message of parseInstagramMessages(payload)) {
      await this.safely(
        () => this.ingest.ingest(message),
        `IG message ${message.externalMessageId}`,
      );
    }

    for (const lead of parseInstagramLeads(payload)) {
      await this.safely(
        () => this.ingestLead(lead.leadgenId, lead.createdAt),
        `IG lead ${lead.leadgenId}`,
      );
    }
  }

  async handleWhatsApp(payload: unknown): Promise<void> {
    for (const message of parseWhatsAppMessages(payload)) {
      await this.safely(
        () => this.ingest.ingest(message),
        `WA message ${message.externalMessageId}`,
      );
    }

    for (const delivery of parseWhatsAppDeliveries(payload)) {
      await this.safely(
        () => this.ingest.recordDelivery(delivery.externalMessageId, delivery.deliveredAt),
        `WA delivery ${delivery.externalMessageId}`,
      );
    }
  }

  /**
   * A lead ad gives us a form submission, not a message. It is stored as the
   * first message of a new conversation so it shows up in the same inbox.
   */
  private async ingestLead(leadgenId: string, createdAt: Date): Promise<void> {
    const lead = await this.instagram.fetchLead(leadgenId);

    const content = lead?.fields.length
      ? lead.fields.map((field) => `${humanise(field.label)}: ${field.value}`).join('\n')
      : 'New Instagram lead (form answers could not be retrieved).';

    await this.ingest.ingest({
      channel: 'INSTAGRAM_LEAD',
      contactExternalId: leadgenId,
      contactName: lead?.name ?? 'Instagram lead',
      contactPhone: lead?.phone ?? null,
      externalMessageId: `leadgen:${leadgenId}`,
      content,
      messageType: 'LEAD',
      sentAt: createdAt,
    });
  }

  /** Webhook batches must not fail as a unit; log and carry on. */
  private async safely(work: () => Promise<void>, label: string): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(
        `Failed to process ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** `full_name` -> `Full name`. */
function humanise(label: string): string {
  const spaced = label.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
