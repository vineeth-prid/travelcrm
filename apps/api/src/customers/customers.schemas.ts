import { INVOICE_STATUSES, LEAD_STAGES } from '@travel-crm/sdk';
import { z } from 'zod';

import { customerSchema } from '../leads/leads.schemas';
import { userSummarySchema } from '../users/users.schemas';

/** Response schemas — these generate the Swagger documentation. */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const customerSummarySchema = customerSchema.extend({
  leadCount: z.number().int(),
  wonCount: z.number().int(),
  invoicedAmount: z.number().int(),
  collectedAmount: z.number().int(),
  currency: z.string(),
  lastLeadAt: z.string().datetime().nullable(),
  destinations: z.array(z.string()),
});

export const customerListSchema = z.array(customerSummarySchema);

export const customerDetailSchema = z.object({
  customer: customerSummarySchema,
  leads: z.array(
    z.object({
      id: z.string().uuid(),
      reference: z.string(),
      destination: z.string().nullable(),
      stage: z.enum(LEAD_STAGES),
      createdAt: z.string().datetime(),
      assignedTo: userSummarySchema.nullable(),
    }),
  ),
  invoices: z.array(
    z.object({
      id: z.string().uuid(),
      reference: z.string(),
      status: z.enum(INVOICE_STATUSES),
      currency: z.string(),
      totalAmount: z.number().int(),
      amountPaid: z.number().int(),
      issueDate: dateOnly,
    }),
  ),
});
