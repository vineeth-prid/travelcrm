import { CURRENCIES, PAYMENT_METHODS } from '@travel-crm/sdk';
import { z } from 'zod';

import { userSummarySchema } from '../users/users.schemas';

/** Response schemas — these generate the Swagger documentation. */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const expenseCategoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});

export const expenseCategoryListSchema = z.array(expenseCategoryResponseSchema);

export const expenseResponseSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  spentAt: dateOnly,
  category: expenseCategoryResponseSchema,
  description: z.string(),
  amount: z.number().int(),
  currency: z.enum(CURRENCIES),
  paidBy: userSummarySchema.nullable(),
  method: z.enum(PAYMENT_METHODS),
  vendor: z.string().nullable(),
  externalReference: z.string().nullable(),
  hasReceipt: z.boolean(),
  receiptName: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: userSummarySchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const expenseListSchema = z.array(expenseResponseSchema);

export const expenseSummarySchema = z.object({
  from: dateOnly,
  to: dateOnly,
  currency: z.string(),
  total: z.number().int(),
  count: z.number().int(),
  byCategory: z.array(
    z.object({
      categoryId: z.string().uuid(),
      name: z.string(),
      total: z.number().int(),
      count: z.number().int(),
      share: z.number(),
    }),
  ),
  byMonth: z.array(z.object({ month: z.string(), total: z.number().int() })),
  currentMonthTotal: z.number().int(),
  previousMonthTotal: z.number().int(),
  otherCurrencies: z.array(z.string()),
});

export const receiptLinkSchema = z.object({
  url: z.string(),
  name: z.string().nullable(),
});
