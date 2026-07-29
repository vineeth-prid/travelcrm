import { Injectable, Logger } from '@nestjs/common';
import type { Channel, MessageType } from '@prisma/client';

import { toConversation, toMessage } from './communication.mappers';
import { ConversationsRepository } from './conversations.repository';
import { InboxEventsService } from './inbox-events.service';

/** A provider event normalised into the shape the inbox stores. */
export interface IncomingMessage {
  channel: Channel;
  /** Provider-side id of the person: IG-scoped user id, or WhatsApp wa_id. */
  contactExternalId: string;
  contactName: string;
  contactPhone?: string | null;
  contactProfilePicture?: string | null;
  externalMessageId: string;
  content: string;
  messageType: MessageType;
  sentAt: Date;
}

@Injectable()
export class MessageIngestService {
  private readonly logger = new Logger(MessageIngestService.name);

  constructor(
    private readonly repository: ConversationsRepository,
    private readonly events: InboxEventsService,
  ) {}

  /**
   * Stores one inbound message. Idempotent: a webhook redelivery of a message
   * we already have is dropped silently, which Meta does routinely.
   */
  async ingest(input: IncomingMessage): Promise<void> {
    const conversation = await this.repository.upsertConversation({
      channel: input.channel,
      externalId: input.contactExternalId,
      name: input.contactName,
      phone: input.contactPhone,
      profilePicture: input.contactProfilePicture,
    });

    const row = await this.repository.appendMessage(
      {
        conversationId: conversation.id,
        direction: 'INCOMING',
        messageType: input.messageType,
        content: input.content,
        externalMessageId: input.externalMessageId,
        sentAt: input.sentAt,
      },
      { incrementUnread: true },
    );

    if (!row) {
      this.logger.debug(`Ignored duplicate message ${input.externalMessageId}`);
      return;
    }

    const updated = await this.repository.findById(conversation.id);
    this.events.messageAdded(toMessage(row));
    if (updated) {
      this.events.conversationChanged(toConversation(updated));
    }
  }

  /** Records a delivery receipt for an outgoing message. */
  async recordDelivery(externalMessageId: string, deliveredAt: Date): Promise<void> {
    await this.repository.markDelivered(externalMessageId, deliveredAt);
  }
}
