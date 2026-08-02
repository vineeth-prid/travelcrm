import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import {
  MessageIngestService,
  type IncomingMessage,
} from '../communication/message-ingest.service';
import { InstagramService } from '../integrations/instagram.service';
import { parseInstagramEvents, parseInstagramLeads } from './instagram.parser';
import { parseWhatsAppDeliveries, parseWhatsAppMessages } from './whatsapp.parser';

export interface VerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /**
   * Work queued after the 200 went out, chained so deliveries are processed in
   * order and a redelivery cannot race the original into the database.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly ingest: MessageIngestService,
    private readonly instagram: InstagramService,
  ) {}

  /**
   * Resolves once everything queued so far has been processed. Meant for tests
   * — nothing in the request path waits on it.
   */
  get settled(): Promise<void> {
    return this.queue;
  }

  /**
   * Prints exactly what Meta delivered, for proving end-to-end connectivity.
   *
   * Enabled with WEBHOOK_LOG_PAYLOADS=true and off otherwise, because these
   * bodies contain customer names, phone numbers and message text. Runs before
   * parsing, so a payload this build ignores — an unhandled field, a message
   * type that is out of scope — still shows up rather than vanishing silently.
   */
  logDelivery(
    channel: 'instagram' | 'whatsapp',
    signature: string | undefined,
    payload: unknown,
  ): void {
    if (!this.config.get('WEBHOOK_LOG_PAYLOADS', { infer: true })) {
      return;
    }

    this.logger.log(
      [
        `${channel} webhook received at ${new Date().toISOString()}`,
        `X-Hub-Signature-256: ${signature ?? '(absent)'}`,
        JSON.stringify(payload, null, 2),
      ].join('\n'),
    );
  }

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
   * Queues a payload for processing after the response has been sent.
   *
   * Meta wants the 200 within about five seconds and disables a subscription
   * that keeps timing out — silently, so the first symptom is an inbox that
   * stopped receiving. Database work and profile lookups therefore happen here,
   * behind the acknowledgement, never in front of it.
   */
  accept(channel: 'instagram' | 'whatsapp', payload: unknown): void {
    this.queue = this.queue.then(() =>
      this.safely(
        () =>
          channel === 'instagram' ? this.handleInstagram(payload) : this.handleWhatsApp(payload),
        `${channel} delivery`,
      ),
    );
  }

  /**
   * Handles an Instagram webhook: direct messages and lead ad submissions.
   * Each item is processed independently so one bad entry cannot discard the
   * rest of the batch.
   */
  async handleInstagram(payload: unknown): Promise<void> {
    const { messages, ignored } = parseInstagramEvents(payload);

    for (const event of ignored) {
      this.logger.log(
        `Ignoring Instagram ${event.kind} from ${event.senderId ?? 'unknown sender'}`,
      );
    }

    for (const message of messages) {
      await this.safely(
        () => this.ingestInstagramMessage(message),
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
   * The messaging webhook carries only an IGSID, so the first message from
   * someone new triggers one profile lookup to turn it into a name and avatar.
   * A failed lookup leaves the raw id in place; it never blocks the message.
   */
  private async ingestInstagramMessage(message: IncomingMessage): Promise<void> {
    if (await this.ingest.knowsContact('INSTAGRAM', message.contactExternalId)) {
      return this.ingest.ingest(message);
    }

    const profile = await this.instagram.fetchProfile(message.contactExternalId);

    return this.ingest.ingest({
      ...message,
      contactName: profile?.name ?? profile?.username ?? message.contactName,
      contactUsername: profile?.username ?? null,
      contactProfilePicture: profile?.profilePicture ?? null,
    });
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
