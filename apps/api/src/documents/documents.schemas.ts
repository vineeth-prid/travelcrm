import { TEMPLATE_KINDS } from '@travel-crm/sdk';
import { z } from 'zod';

/** Response schemas — these generate the Swagger documentation. */

export const companyProfileResponseSchema = z.object({
  name: z.string(),
  tagline: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  taxId: z.string().nullable(),
  bankDetails: z.string().nullable(),
  updatedAt: z.string().datetime().nullable(),
});

export const documentTemplateResponseSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  terms: z.string().nullable(),
  inclusions: z.string().nullable(),
  exclusions: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  footerNote: z.string().nullable(),
  validityDays: z.number().int(),
  taxRateBps: z.number().int().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
