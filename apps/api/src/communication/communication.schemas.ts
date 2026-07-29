import { LEAD_STATUSES } from '@travel-crm/sdk';
import { z } from 'zod';

/** Response schemas — used only to document the endpoints in Swagger. */

const channelSchema = z.enum(['INSTAGRAM', 'INSTAGRAM_LEAD', 'WHATSAPP']);

export const contactSchema = z.object({
  id: z.string().uuid(),
  channel: channelSchema,
  externalId: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  profilePicture: z.string().nullable(),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  channel: channelSchema,
  lastMessage: z.string().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  unreadCount: z.number().int(),
  contact: contactSchema,
  destination: z.string().nullable(),
  travelMonth: z.string().nullable(),
  adults: z.number().int().nullable(),
  children: z.number().int().nullable(),
  budget: z.number().int().nullable(),
  status: z.enum(LEAD_STATUSES),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const conversationListSchema = z.array(conversationSchema);

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  direction: z.enum(['INCOMING', 'OUTGOING']),
  messageType: z.enum(['TEXT', 'LEAD']),
  content: z.string(),
  externalMessageId: z.string().nullable(),
  sentAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable(),
});

export const messageListSchema = z.array(messageSchema);
