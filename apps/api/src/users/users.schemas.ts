import { z } from 'zod';

/**
 * Response schemas — used to generate the Swagger documentation. Request
 * schemas are shared with the web app and live in `@travel-crm/sdk`.
 */

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const messageSchema = z.object({ message: z.string() });
