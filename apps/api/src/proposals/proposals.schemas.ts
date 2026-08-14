import { CURRENCIES, PROPOSAL_STATUSES } from '@travel-crm/sdk';
import { z } from 'zod';

import { userSummarySchema } from '../users/users.schemas';

/**
 * Response schemas — these generate the Swagger documentation. Request schemas
 * are shared with the web app and live in `@travel-crm/sdk`.
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Absent from the response entirely when the viewer may not see it. */
export const proposalFinancialsSchema = z.object({
  actualCost: z.number().int(),
  grossProfit: z.number().int(),
  marginPercent: z.number(),
});

export const proposalVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),

  title: z.string(),
  destination: z.string().nullable(),
  travelStart: dateOnly.nullable(),
  travelEnd: dateOnly.nullable(),
  adults: z.number().int().nullable(),
  children: z.number().int().nullable(),
  executiveSummary: z.string().nullable(),
  itinerary: z.string().nullable(),
  inclusions: z.string().nullable(),
  exclusions: z.string().nullable(),
  hotelInfo: z.string().nullable(),
  transportInfo: z.string().nullable(),
  activities: z.string().nullable(),
  terms: z.string().nullable(),
  validUntil: dateOnly,

  currency: z.enum(CURRENCIES),
  sellingPrice: z.number().int(),
  financials: proposalFinancialsSchema.nullable(),

  hasPdf: z.boolean(),
  createdBy: userSummarySchema.nullable(),
  createdAt: z.string().datetime(),
});

export const proposalResponseSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  leadId: z.string().uuid(),
  leadReference: z.string(),
  customerName: z.string(),
  status: z.enum(PROPOSAL_STATUSES),
  submittedAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdBy: userSummarySchema.nullable(),
  submittedBy: userSummarySchema.nullable(),
  currentVersion: proposalVersionSchema,
  versionCount: z.number().int(),
  isExpired: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const proposalListSchema = z.array(proposalResponseSchema);

export const proposalWithHistorySchema = z.object({
  proposal: proposalResponseSchema,
  versions: z.array(proposalVersionSchema),
});

export const proposalWithPdfSchema = z.object({
  proposal: proposalResponseSchema,
  pdfUrl: z.string().nullable(),
});
