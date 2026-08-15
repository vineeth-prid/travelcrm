import {
  CONTACT_METHODS,
  FOLLOW_UP_KINDS,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_STATUSES,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { userSummarySchema } from '../users/users.schemas';

/** Response schemas — these generate the Swagger documentation. */

export const followUpResponseSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(FOLLOW_UP_KINDS),
  proposalId: z.string().uuid().nullable(),
  proposalReference: z.string().nullable(),
  invoiceId: z.string().uuid().nullable(),
  invoiceReference: z.string().nullable(),
  leadId: z.string().uuid(),
  leadReference: z.string(),
  customerName: z.string(),
  destination: z.string().nullable(),
  reason: z.string().nullable(),
  sequence: z.number().int(),
  dueAt: z.string().datetime(),
  status: z.enum(FOLLOW_UP_STATUSES),
  assignedTo: userSummarySchema.nullable(),

  completedAt: z.string().datetime().nullable(),
  completedBy: userSummarySchema.nullable(),
  comment: z.string().nullable(),
  contactMethod: z.enum(CONTACT_METHODS).nullable(),
  outcome: z.enum(FOLLOW_UP_OUTCOMES).nullable(),
  nextAction: z.string().nullable(),

  currency: z.string(),
  proposalValue: z.number().int(),

  daysOverdue: z.number().int(),
  createdAt: z.string().datetime(),
});

export const followUpListSchema = z.array(followUpResponseSchema);

export const followUpRuleResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  offsetDays: z.array(z.number().int()),
  notifyAssignee: z.boolean(),
  graceHours: z.number().int(),
  mandatory: z.boolean(),
  escalateAfterMissed: z.number().int().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const followUpRuleListSchema = z.array(followUpRuleResponseSchema);
