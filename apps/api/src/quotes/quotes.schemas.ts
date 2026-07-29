import { CURRENCIES } from '@travel-crm/sdk';
import { z } from 'zod';

/** Response schemas — used only to document the endpoints in Swagger. */

const quoteItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  totalPrice: z.number().int(),
  sortOrder: z.number().int(),
});

export const quoteResponseSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  version: z.number().int(),
  status: z.enum(['DRAFT', 'SENT']),
  title: z.string(),
  currency: z.enum(CURRENCIES),
  totalAmount: z.number().int(),
  validUntil: z.string(),
  notes: z.string().nullable(),
  hasPdf: z.boolean(),
  sentAt: z.string().datetime().nullable(),
  items: z.array(quoteItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const quoteListSchema = z.array(quoteResponseSchema);

export const quoteWithPdfSchema = z.object({
  quote: quoteResponseSchema,
  pdfUrl: z.string().nullable(),
});
