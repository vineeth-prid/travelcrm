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

/** Every currency the business quotes in. Shared by leads, quotes and invoices. */
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'] as const;

// --- CRM leads -------------------------------------------------------------

export const LEAD_SOURCES = [
  'MANUAL',
  'INSTAGRAM',
  'WHATSAPP',
  'WEBSITE',
  'REFERRAL',
  'PHONE',
  'EMAIL',
  'WALK_IN',
  'OTHER',
] as const;

export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_PREPARING',
  'PROPOSAL_SENT',
  'FOLLOW_UP',
  'NEGOTIATION',
  'WON',
  'LOST',
  'ON_HOLD',
] as const;

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const LOST_REASONS = [
  'BUDGET',
  'CHOSE_COMPETITOR',
  'DATES_CHANGED',
  'TRIP_CANCELLED',
  'NO_RESPONSE',
  'NOT_INTERESTED',
  'OTHER',
] as const;

export const CONTACT_METHODS = ['PHONE', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER'] as const;

/** Suggested in the tag picker; anything else the consultant types is allowed. */
export const SUGGESTED_LEAD_TAGS = [
  'Family',
  'Couple',
  'Honeymoon',
  'Corporate',
  'Budget',
  'Luxury',
  'Repeat Customer',
  'High Value',
] as const;

const optionalDate = (label: string) =>
  z
    .preprocess(
      blankToNull,
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date`)
        .refine((value) => !Number.isNaN(Date.parse(value)), `${label} must be a real date`)
        .nullable(),
    )
    .optional();

const optionalPhone = (label: string) =>
  z
    .preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .min(6, `${label} looks too short`)
        .max(24, `${label} looks too long`)
        .regex(/^[+]?[\d\s()-]+$/, `${label} may only contain digits, spaces and + ( ) -`)
        .nullable(),
    )
    .optional();

const optionalEmail = z
  .preprocess(
    blankToNull,
    z.string().trim().toLowerCase().email('Enter a valid email address').nullable(),
  )
  .optional();

/**
 * A lead as the consultant fills it in: the customer, what they want, and how
 * we are handling it. The stage is deliberately absent — a lead always starts
 * at NEW and moves through `PATCH /leads/:id/stage`, which is the only place
 * that can demand a lost reason and write the timeline entry.
 */
export const leadSchema = z
  .object({
    // --- Customer ----------------------------------------------------------
    /** Set to attach this trip to somebody already in the book. */
    customerId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
    customerName: z.preprocess(
      blankToNull,
      z.string().trim().min(2, "Enter the customer's name").max(120),
    ),
    phone: optionalPhone('Phone'),
    whatsapp: optionalPhone('WhatsApp number'),
    email: optionalEmail,
    preferredContact: z.preprocess(blankToNull, z.enum(CONTACT_METHODS).nullable()).optional(),
    city: optionalText(80),
    country: optionalText(80),

    // --- Travel requirements ------------------------------------------------
    destination: optionalText(120),
    departureCity: optionalText(120),
    travelStart: optionalDate('Travel start'),
    travelEnd: optionalDate('Travel end'),
    adults: optionalCount(0, 'Adults'),
    children: optionalCount(0, 'Children'),
    childAges: z.array(z.coerce.number().int().min(0).max(17)).max(12).optional(),
    tripType: optionalText(60),
    hotelCategory: optionalText(60),
    mealPreference: optionalText(60),
    transportRequired: z.coerce.boolean().optional(),
    flightRequired: z.coerce.boolean().optional(),
    activityRequirements: optionalText(2000),
    specialRequirements: optionalText(2000),
    budget: optionalCount(0, 'Budget'),
    currency: z.enum(CURRENCIES).optional(),

    /** What the customer actually said, and the tidied-up version of it. */
    rawRequirement: optionalText(8000),
    requirementSummary: optionalText(8000),

    // --- CRM ----------------------------------------------------------------
    source: z.enum(LEAD_SOURCES).optional(),
    priority: z.enum(LEAD_PRIORITIES).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    /** Employees may only assign to themselves; the API enforces that. */
    assignedToId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
    nextAction: optionalText(200),
    nextFollowUpAt: optionalDate('Next follow-up'),
    notes: optionalText(5000),
  })
  .refine(
    (value) =>
      !value.travelStart ||
      !value.travelEnd ||
      Date.parse(value.travelEnd) >= Date.parse(value.travelStart),
    { path: ['travelEnd'], message: 'The return date cannot be before the departure date' },
  )
  .refine((value) => (value.childAges?.length ?? 0) <= (value.children ?? 0), {
    path: ['childAges'],
    message: 'There are more child ages than children',
  })
  .refine((value) => Boolean(value.phone || value.whatsapp || value.email), {
    path: ['phone'],
    message: 'Give at least one way to reach the customer — phone, WhatsApp or email',
  });

export type LeadRequest = z.infer<typeof leadSchema>;
export type LeadInput = z.input<typeof leadSchema>;

/**
 * Moving a lead through the pipeline. A lost deal must say why: the reason is
 * the only thing that turns a loss into something the business can learn from.
 */
export const leadStageSchema = z
  .object({
    stage: z.enum(LEAD_STAGES, { required_error: 'Choose a stage' }),
    lostReason: z.preprocess(blankToNull, z.enum(LOST_REASONS).nullable()).optional(),
    lostNotes: optionalText(1000),
  })
  .refine((value) => value.stage !== 'LOST' || Boolean(value.lostReason), {
    path: ['lostReason'],
    message: 'Choose why this lead was lost',
  });

export type LeadStageRequest = z.infer<typeof leadStageSchema>;

export const leadAssignSchema = z.object({
  assignedToId: z.preprocess(blankToNull, z.string().uuid().nullable()),
});

export type LeadAssignRequest = z.infer<typeof leadAssignSchema>;

export const leadNoteSchema = z.object({
  note: z.string().trim().min(1, 'Write something before saving').max(4000),
});

export type LeadNoteRequest = z.infer<typeof leadNoteSchema>;

/** Everything the lead list can be narrowed by. All optional. */
export const leadQuerySchema = z.object({
  search: optionalText(120),
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assignedToId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  destination: optionalText(120),
  createdFrom: optionalDate('From'),
  createdTo: optionalDate('To'),
  /** Only leads whose follow-up date has passed. */
  overdue: z.coerce.boolean().optional(),
  sort: z.enum(['createdAt', 'lastActivityAt', 'nextFollowUpAt', 'budget']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type LeadQuery = z.infer<typeof leadQuerySchema>;

// --- Proposals -------------------------------------------------------------

export const PROPOSAL_STATUSES = [
  'DRAFT',
  'GENERATED',
  'SENT',
  'FOLLOW_UP',
  'NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
] as const;

/** Money the consultant types. Whole units, never negative. */
const money = (label: string) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(0, `${label} cannot be negative`)
      .max(1_000_000_000, `${label} is implausibly large`),
  );

/**
 * A proposal as the consultant writes it.
 *
 * `sellingPrice` and `actualCost` are the only two figures anyone enters.
 * Gross profit and margin are never accepted from a client — they are derived
 * from these two, so there is exactly one place either number can come from.
 */
export const proposalSchema = z
  .object({
    title: z.preprocess(
      blankToNull,
      z.string().trim().min(1, 'Give the proposal a title').max(160),
    ),
    destination: optionalText(120),
    travelStart: optionalDate('Travel start'),
    travelEnd: optionalDate('Travel end'),
    adults: optionalCount(0, 'Adults'),
    children: optionalCount(0, 'Children'),

    executiveSummary: optionalText(4000),
    itinerary: optionalText(20000),
    inclusions: optionalText(4000),
    exclusions: optionalText(4000),
    hotelInfo: optionalText(4000),
    transportInfo: optionalText(4000),
    activities: optionalText(4000),
    terms: optionalText(8000),

    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid-until date')
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a valid-until date'),

    currency: z.enum(CURRENCIES, { required_error: 'Choose a currency' }),
    /** What the customer pays. Appears on the PDF. */
    sellingPrice: money('Package price'),
    /** What it costs us. Never appears on anything customer-facing. */
    actualCost: money('Actual cost'),
  })
  .refine(
    (value) =>
      !value.travelStart ||
      !value.travelEnd ||
      Date.parse(value.travelEnd) >= Date.parse(value.travelStart),
    { path: ['travelEnd'], message: 'The return date cannot be before the departure date' },
  );

export type ProposalRequest = z.infer<typeof proposalSchema>;
export type ProposalInput = z.input<typeof proposalSchema>;

/**
 * Moving a proposal along. SENT is not here on purpose: submitting is its own
 * endpoint, because it stamps who and when and starts the follow-up workflow.
 */
export const proposalStatusSchema = z.object({
  status: z.enum(['FOLLOW_UP', 'NEGOTIATION', 'ACCEPTED', 'REJECTED'], {
    required_error: 'Choose a status',
  }),
});

export type ProposalStatusRequest = z.infer<typeof proposalStatusSchema>;

/** Filters for the proposals list. */
export const proposalQuerySchema = z.object({
  status: z.enum(PROPOSAL_STATUSES).optional(),
  leadId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  search: optionalText(120),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type ProposalQuery = z.infer<typeof proposalQuerySchema>;

/** Filters for the customer book. */
export const customerQuerySchema = z.object({
  search: optionalText(120),
  /** Only customers with more than one lead on file. */
  repeatOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type CustomerQuery = z.infer<typeof customerQuerySchema>;

/**
 * How money moved, either in or out. Shared by payments against an invoice and
 * by company expenses — declared here because both sections below use it.
 */
export const PAYMENT_METHODS = ['BANK_TRANSFER', 'UPI', 'CASH', 'CARD', 'OTHER'] as const;

// --- Staff administration --------------------------------------------------

export const ROLES = ['ADMIN', 'EMPLOYEE'] as const;

/** Creating a colleague's account. */
export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: passwordSchema,
  role: z.enum(ROLES, { required_error: 'Choose a role' }),
  /** Whether they may see cost and margin on their own proposals. */
  canViewOwnProfitability: z.coerce.boolean().optional(),
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;

/**
 * Editing one. The password is not here — resetting it is its own endpoint, so
 * a careless "save" on this form can never silently change somebody's
 * credentials.
 */
export const updateUserSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(ROLES, { required_error: 'Choose a role' }),
  active: z.coerce.boolean(),
  canViewOwnProfitability: z.coerce.boolean(),
});

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });

export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

// --- Reporting -------------------------------------------------------------

/**
 * The reporting window. Both the dashboard and the performance report take the
 * same shape, and both cover one currency — see Dashboard for why.
 */
export const reportQuerySchema = z.object({
  from: optionalDate('From'),
  to: optionalDate('To'),
  currency: z.enum(CURRENCIES).optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

// --- Expenses --------------------------------------------------------------

/** What the company spent, and on what. */
export const expenseSchema = z.object({
  spentAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date it was spent')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose the date it was spent'),
  categoryId: z.string().uuid('Choose a category'),
  description: z.preprocess(blankToNull, z.string().trim().min(2, 'Say what it was for').max(500)),
  amount: z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: 'Amount must be a number' })
      .int('Amount must be a whole number')
      .min(1, 'An expense of nothing is not an expense')
      .max(1_000_000_000, 'That amount is implausibly large'),
  ),
  currency: z.enum(CURRENCIES, { required_error: 'Choose a currency' }),
  /** Null means the company account paid, rather than a person. */
  paidById: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  method: z.enum(PAYMENT_METHODS, { required_error: 'How was it paid?' }),
  vendor: optionalText(160),
  externalReference: optionalText(120),
  notes: optionalText(2000),
});

export type ExpenseRequest = z.infer<typeof expenseSchema>;
export type ExpenseInput = z.input<typeof expenseSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name the category').max(60),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export type ExpenseCategoryRequest = z.infer<typeof expenseCategorySchema>;

export const expenseQuerySchema = z.object({
  from: optionalDate('From'),
  to: optionalDate('To'),
  categoryId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  currency: z.enum(CURRENCIES).optional(),
  paidById: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  search: optionalText(120),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;

/** The dashboard covers one period and one currency; see ExpenseSummary. */
export const expenseSummaryQuerySchema = z.object({
  from: optionalDate('From'),
  to: optionalDate('To'),
  currency: z.enum(CURRENCIES).optional(),
});

export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;

/** Receipts. Anything else is either not a receipt or not safe to accept. */
export const RECEIPT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

// --- Invoices & payments ---------------------------------------------------

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'CANCELLED'] as const;
export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] as const;

/** Common Indian GST rates, offered as a shortcut. Any rate can be typed. */
export const TAX_PRESETS = [
  { label: 'No tax', bps: null },
  { label: '5% GST', bps: 500 },
  { label: '12% GST', bps: 1200 },
  { label: '18% GST', bps: 1800 },
] as const;

/**
 * An invoice as the consultant fills it in.
 *
 * Only three money inputs exist: the package amount, the discount and the tax
 * *rate*. The tax figure and the total are computed by `invoiceTotals()` and
 * are never accepted from a client — a bill whose total came from the browser
 * is not a bill anybody should trust.
 */
export const invoiceSchema = z
  .object({
    /** Links the invoice back to what was accepted, when there was a proposal. */
    proposalId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),

    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an issue date')
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose an issue date'),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date')
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a due date'),

    packageTitle: z.preprocess(
      blankToNull,
      z.string().trim().min(1, 'Give the package a name').max(160),
    ),
    destination: optionalText(120),
    travelStart: optionalDate('Travel start'),
    travelEnd: optionalDate('Travel end'),
    description: optionalText(4000),

    currency: z.enum(CURRENCIES, { required_error: 'Choose a currency' }),
    packageAmount: money('Package amount'),
    discountAmount: money('Discount'),
    /**
     * Basis points — 1800 is 18%. Null means no tax applies, which is a real
     * answer: GST is not charged on every travel service, and defaulting to a
     * rate would silently overbill.
     */
    taxRateBps: z
      .preprocess(
        blankToNull,
        z.coerce
          .number({ invalid_type_error: 'Tax rate must be a number' })
          .int('Tax rate must be a whole number of basis points')
          .min(0, 'Tax rate cannot be negative')
          .max(10_000, 'Tax rate cannot exceed 100%')
          .nullable(),
      )
      .optional(),

    billingName: z.preprocess(
      blankToNull,
      z.string().trim().min(1, 'Enter who this is billed to').max(160),
    ),
    billingAddress: optionalText(500),
    billingEmail: z
      .preprocess(
        blankToNull,
        z.string().trim().toLowerCase().email('Enter a valid email address').nullable(),
      )
      .optional(),
    billingPhone: optionalText(24),
    billingTaxId: optionalText(40),

    paymentTerms: optionalText(500),
    notes: optionalText(2000),
  })
  .refine((value) => value.discountAmount <= value.packageAmount, {
    path: ['discountAmount'],
    message: 'The discount cannot be more than the package amount',
  })
  .refine((value) => Date.parse(value.dueDate) >= Date.parse(value.issueDate), {
    path: ['dueDate'],
    message: 'The due date cannot be before the issue date',
  });

export type InvoiceRequest = z.infer<typeof invoiceSchema>;
export type InvoiceInput = z.input<typeof invoiceSchema>;

/** Recording money received. */
export const paymentSchema = z.object({
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date it was received')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose the date it was received'),
  amount: z.preprocess(
    blankToNull,
    z.coerce
      .number({ invalid_type_error: 'Amount must be a number' })
      .int('Amount must be a whole number')
      .min(1, 'A payment of nothing is not a payment')
      .max(1_000_000_000, 'That amount is implausibly large'),
  ),
  method: z.enum(PAYMENT_METHODS, { required_error: 'How was it paid?' }),
  externalReference: optionalText(120),
  notes: optionalText(1000),
});

export type PaymentRequest = z.infer<typeof paymentSchema>;
export type PaymentInput = z.input<typeof paymentSchema>;

export const invoiceQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  leadId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  search: optionalText(120),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

/** Filters for the payments ledger. Declared here because it needs the methods. */
export const paymentQuerySchema = z.object({
  from: optionalDate('From'),
  to: optionalDate('To'),
  method: z.enum(PAYMENT_METHODS).optional(),
  invoiceId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  search: optionalText(120),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;

// --- Follow-ups ------------------------------------------------------------

export const FOLLOW_UP_STATUSES = ['PENDING', 'DUE', 'COMPLETED', 'MISSED', 'CANCELLED'] as const;

export const FOLLOW_UP_OUTCOMES = [
  'NO_RESPONSE',
  'INTERESTED',
  'NEEDS_TIME',
  'NEGOTIATING',
  'REQUESTED_CHANGES',
  'READY_TO_BOOK',
  'NOT_INTERESTED',
  'OTHER',
] as const;

/** Recording what happened. The comment is required — "done" is not a record. */
export const followUpCompleteSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(3, 'Write what happened — a note now saves an argument later')
    .max(4000),
  contactMethod: z.enum(CONTACT_METHODS, { required_error: 'How did you contact them?' }),
  outcome: z.enum(FOLLOW_UP_OUTCOMES, { required_error: 'What was the outcome?' }),
  nextAction: optionalText(200),
  /** Overrides the schedule when the customer asked to be called on a date. */
  nextFollowUpAt: optionalDate('Next follow-up'),
});

export type FollowUpCompleteRequest = z.infer<typeof followUpCompleteSchema>;
export type FollowUpCompleteInput = z.input<typeof followUpCompleteSchema>;

export const followUpQuerySchema = z.object({
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  assignedToId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  leadId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  due: z.enum(['today', 'upcoming', 'overdue']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type FollowUpQuery = z.infer<typeof followUpQuerySchema>;

/** The configurable schedule. Admin-only. */
export const followUpRuleSchema = z.object({
  name: z.string().trim().min(1, 'Name the schedule').max(80),
  offsetDays: z
    .array(z.coerce.number().int().min(0).max(365))
    .min(1, 'Add at least one follow-up')
    .max(12, 'Twelve follow-ups is already too many')
    .refine(
      (days) => new Set(days).size === days.length,
      'Two follow-ups cannot fall on the same day',
    )
    .refine(
      (days) => days.every((day, index) => index === 0 || day > days[index - 1]!),
      'Put the days in order, soonest first',
    ),
  notifyAssignee: z.coerce.boolean(),
  graceHours: z.coerce.number().int().min(1).max(168),
  mandatory: z.coerce.boolean(),
  escalateAfterMissed: z
    .preprocess(blankToNull, z.coerce.number().int().min(1).max(12).nullable())
    .optional(),
  isDefault: z.coerce.boolean(),
  active: z.coerce.boolean(),
});

export type FollowUpRuleRequest = z.infer<typeof followUpRuleSchema>;
export type FollowUpRuleInput = z.input<typeof followUpRuleSchema>;

// --- Email -----------------------------------------------------------------

export const SMTP_SECURITY = ['NONE', 'STARTTLS', 'SSL'] as const;

export const smtpSchema = z.object({
  host: z.string().trim().min(1, 'Enter the SMTP host').max(255),
  port: z.coerce
    .number({ invalid_type_error: 'Port must be a number' })
    .int()
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535'),
  username: z.string().trim().min(1, 'Enter the SMTP username').max(255),
  /**
   * Optional on update: leaving it blank keeps the stored password, so the
   * port can be changed without retyping the secret.
   */
  password: z.preprocess(blankToNull, z.string().min(1).max(255).nullable()).optional(),
  security: z.enum(SMTP_SECURITY, { required_error: 'Choose an encryption mode' }),
  fromEmail: z.string().trim().toLowerCase().email('Enter a valid from address'),
  fromName: z.string().trim().min(1, 'Enter a from name').max(80),
  active: z.coerce.boolean().optional(),
});

export type SmtpRequest = z.infer<typeof smtpSchema>;
export type SmtpInput = z.input<typeof smtpSchema>;

export const smtpTestSchema = z.object({
  to: z.string().trim().toLowerCase().email('Enter an address to send the test to'),
});

export type SmtpTestRequest = z.infer<typeof smtpTestSchema>;

// --- Quotes ----------------------------------------------------------------

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

export type QuoteRequest = z.infer<typeof quoteSchema>;
export type QuoteInput = z.input<typeof quoteSchema>;

// --- AI assistant ----------------------------------------------------------

/** Every AI action works from a conversation the salesperson has open. */
export const aiRequestSchema = z.object({
  conversationId: z.string().uuid(),
});

/** Rough notes a consultant pastes in, to be tidied into a lead. */
export const aiRequirementRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(10, 'Write a little more for the assistant to work from')
    .max(8000, 'That is too long — paste the relevant part'),
  /** Today, so relative dates ("next December") can be resolved by the server. */
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type AiRequirementRequest = z.infer<typeof aiRequirementRequestSchema>;

/**
 * The shape the model must return, and the guard the API applies to whatever
 * actually comes back. Everything is nullable: the model is told to use null
 * for anything the customer did not say, and never to guess.
 *
 * Note what is absent — there is no price, no cost, no tax and no discount.
 * `budget` is the only money here, and it is a figure the customer stated
 * about themselves, not one the assistant worked out.
 */
export const leadRequirementDraftSchema = z.object({
  /** A tidy, customer-facing restatement of the requirement. */
  summary: z.string().trim().min(1).max(4000),
  fields: z.object({
    destination: z.string().trim().max(120).nullable(),
    departureCity: z.string().trim().max(120).nullable(),
    travelStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    travelEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    adults: z.number().int().min(0).max(99).nullable(),
    children: z.number().int().min(0).max(99).nullable(),
    childAges: z.array(z.number().int().min(0).max(17)).max(12),
    tripType: z.string().trim().max(60).nullable(),
    hotelCategory: z.string().trim().max(60).nullable(),
    mealPreference: z.string().trim().max(60).nullable(),
    transportRequired: z.boolean(),
    flightRequired: z.boolean(),
    activityRequirements: z.string().trim().max(2000).nullable(),
    specialRequirements: z.string().trim().max(2000).nullable(),
    /** The customer's own stated budget. Never a price the assistant computed. */
    budget: z.number().int().min(0).nullable(),
  }),
});

export type LeadRequirementDraft = z.infer<typeof leadRequirementDraftSchema>;

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
