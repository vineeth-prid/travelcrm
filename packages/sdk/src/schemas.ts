import { z } from 'zod';

/**
 * Request validation shared by the API (server-side enforcement) and the web
 * forms (client-side feedback). Defined once so the two can never drift.
 */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from the current one',
  });

/** A reply typed by a salesperson. Text only in this phase. */
export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Type a message before sending')
    .max(4096, 'Messages are limited to 4096 characters'),
});

export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

// --- Lead details ----------------------------------------------------------

export const LEAD_STATUSES = ['NEW', 'QUALIFIED', 'QUOTE_SENT', 'WON', 'LOST'] as const;

/**
 * Form fields arrive as strings and a cleared field means "no value", not "".
 * Normalising here lets the same schema validate the browser form and the
 * request body.
 */
const blankToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable()).optional();

const optionalCount = (min: number, label: string) =>
  z
    .preprocess(
      blankToNull,
      z.coerce
        .number({ invalid_type_error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(min, `${label} cannot be less than ${min}`)
        .nullable(),
    )
    .optional();

/** The only fields a salesperson may change on a conversation. */
export const updateConversationSchema = z.object({
  destination: optionalText(120),
  travelMonth: optionalText(60),
  adults: optionalCount(1, 'Adults'),
  children: optionalCount(0, 'Children'),
  budget: optionalCount(0, 'Budget'),
  status: z.enum(LEAD_STATUSES, { required_error: 'Choose a status' }),
  notes: optionalText(5000),
  email: z
    .preprocess(
      blankToNull,
      z.string().trim().toLowerCase().email('Enter a valid email address').nullable(),
    )
    .optional(),
});

// --- Quotes ----------------------------------------------------------------

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'] as const;

const quoteItemSchema = z.object({
  title: z.preprocess(blankToNull, z.string().trim().min(1, 'Every item needs a title').max(160)),
  description: optionalText(500),
  quantity: z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: 'Quantity must be a number' })
      .int('Quantity must be a whole number')
      .min(1, 'Quantity must be at least 1'),
  ),
  unitPrice: z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: 'Unit price must be a number' })
      .int('Unit price must be a whole number')
      .min(0, 'Unit price cannot be negative'),
  ),
});

/**
 * A quote as the consultant fills it in. Line totals and the grand total are
 * always recalculated server-side, so they are not part of the request.
 */
export const quoteSchema = z.object({
  title: z.preprocess(blankToNull, z.string().trim().min(1, 'Give the quote a title').max(160)),
  currency: z.enum(CURRENCIES, { required_error: 'Choose a currency' }),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid-until date')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid-until date'),
  notes: optionalText(2000),
  items: z.array(quoteItemSchema).min(1, 'Add at least one item'),
});

export type QuoteItemRequest = z.infer<typeof quoteItemSchema>;
export type QuoteRequest = z.infer<typeof quoteSchema>;
export type QuoteInput = z.input<typeof quoteSchema>;

// --- AI assistant ----------------------------------------------------------

/** Every AI action works from a conversation the salesperson has open. */
export const aiRequestSchema = z.object({
  conversationId: z.string().uuid(),
});

/**
 * The shape the model must return for extraction, and the guard the API applies
 * to whatever actually comes back. A value the model cannot determine is
 * `null` — it is told never to guess.
 */
export const extractedDetailsSchema = z.object({
  destination: z.string().trim().min(1).max(120).nullable(),
  travelMonth: z.string().trim().min(1).max(60).nullable(),
  adults: z.number().int().min(1).max(99).nullable(),
  children: z.number().int().min(0).max(99).nullable(),
  budget: z.number().int().min(0).nullable(),
});

export type AiRequest = z.infer<typeof aiRequestSchema>;
export type ExtractedDetails = z.infer<typeof extractedDetailsSchema>;

/** What the API stores. */
export type UpdateConversationRequest = z.infer<typeof updateConversationSchema>;
/** What a browser form holds before normalisation — every field starts as text. */
export type UpdateConversationInput = z.input<typeof updateConversationSchema>;

export type LoginRequest = z.infer<typeof loginSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
