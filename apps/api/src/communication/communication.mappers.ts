import type {
  Contact as ContactRow,
  Conversation as ConversationRow,
  Message as MessageRow,
} from '@prisma/client';
import type { Contact, Conversation, Message } from '@travel-crm/sdk';

export type ConversationWithContact = ConversationRow & { contact: ContactRow };

export function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    channel: row.channel,
    externalId: row.externalId,
    name: row.name,
    username: row.username,
    phone: row.phone,
    email: row.email,
    profilePicture: row.profilePicture,
  };
}

export function toConversation(row: ConversationWithContact): Conversation {
  return {
    id: row.id,
    channel: row.channel,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
    unreadCount: row.unreadCount,
    contact: toContact(row.contact),
    destination: row.destination,
    travelMonth: row.travelMonth,
    adults: row.adults,
    children: row.children,
    budget: row.budget,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    messageType: row.messageType,
    content: row.content,
    externalMessageId: row.externalMessageId,
    sentAt: row.sentAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}
