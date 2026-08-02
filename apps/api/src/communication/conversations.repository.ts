import { Injectable } from '@nestjs/common';
import type {
  Channel,
  LeadStatus,
  Message as MessageRow,
  MessageDirection,
  MessageType,
} from '@prisma/client';

import { PrismaService } from '../shared/prisma.service';
import type { ConversationWithContact } from './communication.mappers';

export interface UpsertContactInput {
  channel: Channel;
  externalId: string;
  name: string;
  username?: string | null;
  phone?: string | null;
  profilePicture?: string | null;
}

/** Mirrors the fields a salesperson may change; `undefined` means "leave alone". */
export interface UpdateDetailsInput {
  destination?: string | null;
  travelMonth?: string | null;
  adults?: number | null;
  children?: number | null;
  budget?: number | null;
  status?: LeadStatus;
  notes?: string | null;
  email?: string | null;
}

export interface CreateMessageInput {
  conversationId: string;
  direction: MessageDirection;
  messageType: MessageType;
  content: string;
  externalMessageId: string | null;
  sentAt: Date;
}

/** The only place that reads or writes the communication tables. */
@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(search?: string): Promise<ConversationWithContact[]> {
    const term = search?.trim();

    return this.prisma.conversation.findMany({
      where: term
        ? {
            OR: [
              { contact: { name: { contains: term, mode: 'insensitive' } } },
              { contact: { phone: { contains: term } } },
              { contact: { email: { contains: term, mode: 'insensitive' } } },
              { destination: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { contact: true },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
  }

  findById(id: string): Promise<ConversationWithContact | null> {
    return this.prisma.conversation.findUnique({ where: { id }, include: { contact: true } });
  }

  findMessages(conversationId: string): Promise<MessageRow[]> {
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'asc' },
    });
  }

  /**
   * Finds or creates the contact and its conversation. Contacts are keyed by
   * (channel, externalId), so the same person on two channels stays separate.
   */
  async upsertConversation(input: UpsertContactInput): Promise<ConversationWithContact> {
    const contact = await this.prisma.contact.upsert({
      where: { channel_externalId: { channel: input.channel, externalId: input.externalId } },
      // Only fill in details we learn later; never blank out what we already have.
      update: {
        name: input.name,
        ...(input.username ? { username: input.username } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.profilePicture ? { profilePicture: input.profilePicture } : {}),
      },
      create: {
        channel: input.channel,
        externalId: input.externalId,
        name: input.name,
        username: input.username ?? null,
        phone: input.phone ?? null,
        profilePicture: input.profilePicture ?? null,
      },
    });

    return this.prisma.conversation.upsert({
      where: { contactId: contact.id },
      update: {},
      create: { contactId: contact.id, channel: input.channel },
      include: { contact: true },
    });
  }

  /**
   * Stores a message and moves the conversation's summary forward in one
   * transaction. Returns null when the provider message id was already stored,
   * which is what makes webhook redelivery harmless.
   */
  async appendMessage(
    input: CreateMessageInput,
    options: { incrementUnread: boolean },
  ): Promise<MessageRow | null> {
    if (input.externalMessageId && (await this.messageExists(input.externalMessageId))) {
      return null;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({ data: input });

        await tx.conversation.update({
          where: { id: input.conversationId },
          data: {
            lastMessage: input.content,
            lastMessageAt: input.sentAt,
            // Starts the 24-hour window in which the provider allows a
            // free-form reply, so the inbox can warn before a send fails.
            ...(input.direction === 'INCOMING' ? { lastInboundAt: input.sentAt } : {}),
            ...(options.incrementUnread ? { unreadCount: { increment: 1 } } : {}),
          },
        });

        return message;
      });
    } catch (error) {
      // Lost the race against a concurrent redelivery of the same message.
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async contactExists(channel: Channel, externalId: string): Promise<boolean> {
    const found = await this.prisma.contact.findUnique({
      where: { channel_externalId: { channel, externalId } },
      select: { id: true },
    });
    return found !== null;
  }

  async messageExists(externalMessageId: string): Promise<boolean> {
    const found = await this.prisma.message.findUnique({
      where: { externalMessageId },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Saves the lead details. Fields left `undefined` keep their current value;
   * `null` clears them. The contact's email is updated through the relation so
   * the whole save is one statement.
   */
  updateDetails(id: string, input: UpdateDetailsInput): Promise<ConversationWithContact> {
    const { email, ...conversation } = input;

    return this.prisma.conversation.update({
      where: { id },
      data: {
        ...conversation,
        ...(email === undefined ? {} : { contact: { update: { email } } }),
      },
      include: { contact: true },
    });
  }

  async markRead(id: string): Promise<ConversationWithContact> {
    return this.prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 },
      include: { contact: true },
    });
  }

  /** Records a provider delivery receipt. Unknown ids are ignored. */
  async markDelivered(externalMessageId: string, deliveredAt: Date): Promise<void> {
    await this.prisma.message.updateMany({
      where: { externalMessageId, deliveredAt: null },
      data: { deliveredAt },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}
