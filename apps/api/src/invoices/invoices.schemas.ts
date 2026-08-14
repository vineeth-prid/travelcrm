import { CURRENCIES, INVOICE_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '@travel-crm/sdk';
import { z } from 'zod';

import { userSummarySchema } from '../users/users.schemas';

/** Response schemas — these generate the Swagger documentation. */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  invoiceId: z.string().uuid(),
  paidAt: dateOnly,
  amount: z.number().int(),
  method: z.enum(PAYMENT_METHODS),
  externalReference: z.string().nullable(),
  notes: z.string().nullable(),
  recordedBy: userSummarySchema.nullable(),
  createdAt: z.string().datetime(),
});

export const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  leadId: z.string().uuid(),
  leadReference: z.string(),
  customerId: z.string().uuid(),
  proposalId: z.string().uuid().nullable(),
  proposalReference: z.string().nullable(),

  status: z.enum(INVOICE_STATUSES),
  issueDate: dateOnly,
  dueDate: dateOnly,

  packageTitle: z.string(),
  destination: z.string().nullable(),
  travelStart: dateOnly.nullable(),
  travelEnd: dateOnly.nullable(),
  description: z.string().nullable(),

  currency: z.enum(CURRENCIES),
  totals: z.object({
    packageAmount: z.number().int(),
    discountAmount: z.number().int(),
    netAmount: z.number().int(),
    taxRateBps: z.number().int().nullable(),
    taxAmount: z.number().int(),
    totalAmount: z.number().int(),
  }),

  billingName: z.string(),
  billingAddress: z.string().nullable(),
  billingEmail: z.string().nullable(),
  billingPhone: z.string().nullable(),
  billingTaxId: z.string().nullable(),

  paymentTerms: z.string().nullable(),
  notes: z.string().nullable(),

  amountPaid: z.number().int(),
  outstanding: z.number().int(),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  payments: z.array(paymentResponseSchema),

  hasPdf: z.boolean(),
  createdBy: userSummarySchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const invoiceListSchema = z.array(invoiceResponseSchema);

export const invoiceWithPdfSchema = z.object({
  invoice: invoiceResponseSchema,
  pdfUrl: z.string().nullable(),
});
