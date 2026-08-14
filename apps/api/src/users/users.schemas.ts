import { z } from 'zod';

/**
 * Response schemas — used to generate the Swagger documentation. Request
 * schemas are shared with the web app and live in `@travel-crm/sdk`.
 */

export const roleSchema = z.enum(['ADMIN', 'EMPLOYEE']);

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  active: z.boolean(),
  canViewOwnProfitability: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  active: z.boolean(),
});

export const userSummaryListSchema = z.array(userSummarySchema);

export const messageSchema = z.object({ message: z.string() });
