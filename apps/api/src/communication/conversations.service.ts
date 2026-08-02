import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation, Message, UpdateConversationRequest } from '@travel-crm/sdk';

import { InstagramService } from '../integrations/instagram.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { toConversation, toMessage, type ConversationWithContact } from './communication.mappers';
import { ConversationsRepository } from './conversations.repository';
import { InboxEventsService } from './inbox-events.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly repository: ConversationsRepository,
    private readonly events: InboxEventsService,
    private readonly instagram: InstagramService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async list(search?: string): Promise<Conversation[]> {
    const rows = await this.repository.findMany(search);
    return rows.map(toConversation);
  }

  /** Reads a conversation without the side effect of marking it read. */
  async getById(id: string): Promise<Conversation> {
    return toConversation(await this.findOrFail(id));
  }

  /** Opening a conversation is what marks it read. */
  async openById(id: string): Promise<Conversation> {
    const existing = await this.findOrFail(id);

    if (existing.unreadCount === 0) {
      return toConversation(existing);
    }

    const conversation = toConversation(await this.repository.markRead(id));
    this.events.conversationChanged(conversation);
    return conversation;
  }

  /** Saves the lead details and returns the conversation as it now stands. */
  async updateDetails(id: string, input: UpdateConversationRequest): Promise<Conversation> {
    await this.findOrFail(id);

    const conversation = toConversation(await this.repository.updateDetails(id, input));
    this.events.conversationChanged(conversation);
    return conversation;
  }

  /**
   * Moves a lead to QUOTE_SENT after a quote goes out. A conversation that has
   * already been won or lost keeps its outcome.
   */
  async markQuoteSent(id: string): Promise<void> {
    const conversation = await this.findOrFail(id);
    if (conversation.status === 'WON' || conversation.status === 'LOST') {
      return;
    }

    const updated = toConversation(
      await this.repository.updateDetails(id, { status: 'QUOTE_SENT' }),
    );
    this.events.conversationChanged(updated);
  }

  async messages(id: string): Promise<Message[]> {
    await this.findOrFail(id);
    const rows = await this.repository.findMessages(id);
    return rows.map(toMessage);
  }

  /**
   * Sends to the provider first, then stores. A message only exists locally if
   * the customer will actually receive it, so there is no "failed" state to
   * reconcile — the salesperson simply sees the error and retries.
   */
  async sendMessage(id: string, content: string): Promise<Message> {
    const conversation = await this.findOrFail(id);
    const externalMessageId = await this.dispatch(conversation, content);
    return this.persistOutgoing(conversation, content, externalMessageId);
  }

  /**
   * Sends a document on the conversation's own channel, reusing the same
   * provider selection and persistence as a text reply.
   *
   * WhatsApp takes a real document. Instagram Direct has no document message
   * type, so the link is sent as text — the customer still receives the PDF.
   */
  async sendDocument(
    id: string,
    document: { url: string; filename: string; caption: string },
  ): Promise<Message> {
    const conversation = await this.findOrFail(id);
    const recipient = conversation.contact.externalId;

    let externalMessageId: string | null;
    let content: string;

    switch (conversation.channel) {
      case 'WHATSAPP':
        externalMessageId = await this.whatsapp.sendDocument(recipient, document);
        content = `${document.caption}\n${document.filename}`;
        break;
      case 'INSTAGRAM':
        content = `${document.caption}\n${document.url}`;
        externalMessageId = await this.instagram.sendText(
          recipient,
          content,
          conversation.lastInboundAt,
        );
        break;
      case 'INSTAGRAM_LEAD':
        throw new BadRequestException(
          "Instagram Lead Ads don't support file replies. Please continue the conversation on WhatsApp.",
        );
    }

    return this.persistOutgoing(conversation, content, externalMessageId);
  }

  private async persistOutgoing(
    conversation: ConversationWithContact,
    content: string,
    externalMessageId: string | null,
  ): Promise<Message> {
    const row = await this.repository.appendMessage(
      {
        conversationId: conversation.id,
        direction: 'OUTGOING',
        messageType: 'TEXT',
        content,
        externalMessageId,
        sentAt: new Date(),
      },
      { incrementUnread: false },
    );

    if (!row) {
      // Only reachable if the provider handed back an id we have already stored.
      throw new BadRequestException('That message was already sent.');
    }

    const message = toMessage(row);
    this.events.messageAdded(message);
    this.events.conversationChanged(toConversation(await this.findOrFail(conversation.id)));
    return message;
  }

  private async dispatch(
    conversation: ConversationWithContact,
    content: string,
  ): Promise<string | null> {
    switch (conversation.channel) {
      case 'INSTAGRAM':
        return this.instagram.sendText(
          conversation.contact.externalId,
          content,
          conversation.lastInboundAt,
        );
      case 'WHATSAPP':
        return this.whatsapp.sendText(conversation.contact.externalId, content);
      case 'INSTAGRAM_LEAD':
        throw new BadRequestException(
          'Instagram lead ads cannot receive replies. Contact this person on WhatsApp instead.',
        );
    }
  }

  private async findOrFail(id: string): Promise<ConversationWithContact> {
    const conversation = await this.repository.findById(id);
    if (!conversation) {
      throw new NotFoundException('That conversation no longer exists.');
    }
    return conversation;
  }
}
