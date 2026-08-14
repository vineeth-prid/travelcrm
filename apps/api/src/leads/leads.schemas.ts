import {
  CONTACT_METHODS,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STAGES,
  LOST_REASONS,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { userSummarySchema } from '../users/users.schemas';

/**
 * Response schemas — these generate the Swagger documentation. Request schemas
 * are shared with the web app and live in `@travel-crm/sdk`.
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const customerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  preferredContact: z.enum(CONTACT_METHODS).nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const leadResponseSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  customer: customerSchema,

  destination: z.string().nullable(),
  departureCity: z.string().nullable(),
  travelStart: dateOnly.nullable(),
  travelEnd: dateOnly.nullable(),
  adults: z.number().int().nullable(),
  children: z.number().int().nullable(),
  childAges: z.array(z.number().int()),
  tripType: z.string().nullable(),
  hotelCategory: z.string().nullable(),
  mealPreference: z.string().nullable(),
  transportRequired: z.boolean(),
  flightRequired: z.boolean(),
  activityRequirements: z.string().nullable(),
  specialRequirements: z.string().nullable(),
  budget: z.number().int().nullable(),
  currency: z.string(),
  rawRequirement: z.string().nullable(),
  requirementSummary: z.string().nullable(),

  source: z.enum(LEAD_SOURCES),
  stage: z.enum(LEAD_STAGES),
  priority: z.enum(LEAD_PRIORITIES),
  tags: z.array(z.string()),
  assignedTo: userSummarySchema.nullable(),
  createdBy: userSummarySchema.nullable(),
  lostReason: z.enum(LOST_REASONS).nullable(),
  lostNotes: z.string().nullable(),
  nextAction: z.string().nullable(),
  nextFollowUpAt: dateOnly.nullable(),
  lastActivityAt: z.string().datetime(),
  notes: z.string().nullable(),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const leadPageSchema = z.object({
  leads: z.array(leadResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const leadActivitySchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  type: z.string(),
  summary: z.string(),
  detail: z.string().nullable(),
  actor: userSummarySchema.nullable(),
  createdAt: z.string().datetime(),
});

export const leadActivityListSchema = z.array(leadActivitySchema);

export const duplicateCheckSchema = z.object({
  matches: z.array(
    z.object({
      customerId: z.string().uuid(),
      customerName: z.string(),
      matchedOn: z.array(z.enum(['phone', 'whatsapp', 'email'])),
      leadCount: z.number().int(),
      latestLeadReference: z.string().nullable(),
      latestLeadStage: z.enum(LEAD_STAGES).nullable(),
    }),
  ),
});
