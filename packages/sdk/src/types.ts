/**
 * Response contract shared by the API (apps/api) and the web client (apps/web).
 * Request shapes live in `schemas.ts`, derived from their Zod schema.
 */

export type Role = 'ADMIN' | 'EMPLOYEE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** Whether this employee may see cost and margin on their own proposals. */
  canViewOwnProfitability: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Just enough of a user to render an "assigned to" cell or picker. */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export function isAdmin(user: { role: Role }): boolean {
  return user.role === 'ADMIN';
}

export interface LoginResponse {
  user: User;
}

export interface MessageResponse {
  message: string;
}

export type ServiceState = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  services: {
    api: ServiceState;
    database: ServiceState;
  };
}

export interface AppInfo {
  name: string;
  version: string;
  buildNumber: string;
  environment: string;
  apiVersion: string;
  nodeVersion: string;
  startedAt: string;
  /** Company identity used on quote PDFs. */
  companyName: string;
  companyLogoConfigured: boolean;
}

// --- Communication ---------------------------------------------------------

export type Channel = 'INSTAGRAM' | 'INSTAGRAM_LEAD' | 'WHATSAPP';
export type MessageDirection = 'INCOMING' | 'OUTGOING';
export type MessageType = 'TEXT' | 'LEAD';

/** Channels a salesperson can reply on. Lead ads are inbound-only. */
export const REPLYABLE_CHANNELS: readonly Channel[] = ['INSTAGRAM', 'WHATSAPP'];

/**
 * How long after the customer's last message a free-form reply is allowed.
 * Instagram and WhatsApp both use 24 hours.
 */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Milliseconds of reply window left, or null when the channel has no window. */
export function replyWindowRemainingMs(conversation: {
  channel: Channel;
  lastInboundAt: string | null;
}): number | null {
  if (!REPLYABLE_CHANNELS.includes(conversation.channel)) return null;
  if (!conversation.lastInboundAt) return 0;

  const elapsed = Date.now() - new Date(conversation.lastInboundAt).getTime();
  return Math.max(0, REPLY_WINDOW_MS - elapsed);
}

export interface Contact {
  id: string;
  channel: Channel;
  externalId: string;
  name: string;
  /** Instagram handle, when the profile lookup returned one. */
  username: string | null;
  phone: string | null;
  email: string | null;
  profilePicture: string | null;
}

/** Every conversation is a lead; this is where it sits in its lifecycle. */
export type LeadStatus = 'NEW' | 'QUALIFIED' | 'QUOTE_SENT' | 'WON' | 'LOST';

export interface Conversation {
  id: string;
  channel: Channel;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /**
   * When the customer last wrote in. Instagram and WhatsApp only allow a
   * free-form reply for 24 hours after this; see REPLY_WINDOW_MS.
   */
  lastInboundAt: string | null;
  unreadCount: number;
  contact: Contact;

  // Lead details, captured by the salesperson from the inbox.
  destination: string | null;
  travelMonth: string | null;
  adults: number | null;
  children: number | null;
  budget: number | null;
  status: LeadStatus;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  messageType: MessageType;
  content: string;
  externalMessageId: string | null;
  sentAt: string;
  deliveredAt: string | null;
}

// --- CRM -------------------------------------------------------------------

export type LeadSource =
  | 'MANUAL'
  | 'INSTAGRAM'
  | 'WHATSAPP'
  | 'WEBSITE'
  | 'REFERRAL'
  | 'PHONE'
  | 'EMAIL'
  | 'WALK_IN'
  | 'OTHER';

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'PROPOSAL_PREPARING'
  | 'PROPOSAL_SENT'
  | 'FOLLOW_UP'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'
  | 'ON_HOLD';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type LostReason =
  | 'BUDGET'
  | 'CHOSE_COMPETITOR'
  | 'DATES_CHANGED'
  | 'TRIP_CANCELLED'
  | 'NO_RESPONSE'
  | 'NOT_INTERESTED'
  | 'OTHER';

export type ContactMethod = 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'IN_PERSON' | 'OTHER';

export type ActivityType =
  | 'LEAD_CREATED'
  | 'STAGE_CHANGED'
  | 'ASSIGNED'
  | 'NOTE'
  | 'REQUIREMENT_UPDATED'
  | 'AI_SUMMARY'
  | 'FOLLOW_UP_SCHEDULED'
  | 'FOLLOW_UP_COMPLETED'
  | 'FOLLOW_UP_MISSED'
  | 'PROPOSAL_GENERATED'
  | 'PROPOSAL_SENT'
  | 'INVOICE_GENERATED'
  | 'PAYMENT_RECEIVED';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  preferredContact: ContactMethod | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A customer as the customer book shows them: the record plus what the agency
 * has actually done with them. `leadCount > 1` is the whole point of the page —
 * a repeat customer is worth knowing about before you quote them again.
 */
export interface CustomerSummary extends Customer {
  leadCount: number;
  wonCount: number;
  /** Total invoiced, cancelled invoices excluded, in `currency`. */
  invoicedAmount: number;
  collectedAmount: number;
  currency: string;
  /** ISO timestamp of the most recent lead, or null if somehow none. */
  lastLeadAt: string | null;
  destinations: string[];
}

/** One customer with the trail behind them. */
export interface CustomerDetail {
  customer: CustomerSummary;
  leads: {
    id: string;
    reference: string;
    destination: string | null;
    stage: LeadStage;
    createdAt: string;
    assignedTo: UserSummary | null;
  }[];
  invoices: {
    id: string;
    reference: string;
    status: InvoiceStatus;
    currency: string;
    totalAmount: number;
    amountPaid: number;
    issueDate: string;
  }[];
}

export interface Lead {
  id: string;
  /** Human-facing identifier, e.g. "TDH-L-00042". */
  reference: string;
  customer: Customer;

  destination: string | null;
  departureCity: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  travelStart: string | null;
  travelEnd: string | null;
  adults: number | null;
  children: number | null;
  childAges: number[];
  tripType: string | null;
  hotelCategory: string | null;
  mealPreference: string | null;
  transportRequired: boolean;
  flightRequired: boolean;
  activityRequirements: string | null;
  specialRequirements: string | null;
  budget: number | null;
  currency: string;
  rawRequirement: string | null;
  requirementSummary: string | null;

  source: LeadSource;
  stage: LeadStage;
  priority: LeadPriority;
  tags: string[];
  assignedTo: UserSummary | null;
  createdBy: UserSummary | null;
  lostReason: LostReason | null;
  lostNotes: string | null;
  nextAction: string | null;
  nextFollowUpAt: string | null;
  lastActivityAt: string;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: ActivityType;
  summary: string;
  detail: string | null;
  actor: UserSummary | null;
  createdAt: string;
}

export interface LeadPage {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

/** A lead or customer already on file that looks like the one being created. */
export interface DuplicateMatch {
  customerId: string;
  customerName: string;
  /** Which field matched — shown so the consultant can judge for themselves. */
  matchedOn: ('phone' | 'whatsapp' | 'email')[];
  leadCount: number;
  latestLeadReference: string | null;
  latestLeadStage: LeadStage | null;
}

export interface DuplicateCheck {
  matches: DuplicateMatch[];
}

/** True once the follow-up date has passed and the lead is still open. */
export function isFollowUpOverdue(lead: {
  nextFollowUpAt: string | null;
  stage: LeadStage;
}): boolean {
  if (!lead.nextFollowUpAt) return false;
  if (lead.stage === 'WON' || lead.stage === 'LOST') return false;
  return new Date(lead.nextFollowUpAt).getTime() < Date.now();
}

// --- Proposals -------------------------------------------------------------

export type ProposalStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'SENT'
  | 'FOLLOW_UP'
  | 'NEGOTIATION'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Internal money. Present only when the viewer is allowed to see it: an admin
 * always, an employee on their own proposal if they have been given
 * permission, nobody else. When they may not, the field is `null` — the
 * numbers never leave the server rather than being hidden in the interface.
 */
export interface ProposalFinancials {
  actualCost: number;
  grossProfit: number;
  /** To one decimal place. */
  marginPercent: number;
}

/** `Selling price − actual cost`. */
export function grossProfit(sellingPrice: number, actualCost: number): number {
  return sellingPrice - actualCost;
}

/**
 * `Gross profit ÷ selling price × 100`, to one decimal place.
 *
 * A proposal priced at zero has no margin to speak of, and dividing by it
 * would produce Infinity or NaN and poison every total it is added to.
 */
export function marginPercent(sellingPrice: number, actualCost: number): number {
  if (sellingPrice <= 0) return 0;
  return Math.round((grossProfit(sellingPrice, actualCost) / sellingPrice) * 1000) / 10;
}

/**
 * Margin across many proposals, weighted by value.
 *
 * This is not the average of the individual margins, and the difference
 * matters: one ₹10,000 trip at 50% and one ₹500,000 trip at 10% average to 30%,
 * but the business actually kept 10.8%. Averaging margins lets a scattering of
 * tiny high-margin deals flatter a quarter that was carried by thin big ones.
 */
export function weightedMarginPercent(
  proposals: { sellingPrice: number; actualCost: number }[],
): number {
  const revenue = proposals.reduce((sum, item) => sum + item.sellingPrice, 0);
  const cost = proposals.reduce((sum, item) => sum + item.actualCost, 0);
  return marginPercent(revenue, cost);
}

export interface ProposalVersion {
  id: string;
  version: number;

  // Customer-facing content.
  title: string;
  destination: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  travelStart: string | null;
  travelEnd: string | null;
  adults: number | null;
  children: number | null;
  executiveSummary: string | null;
  itinerary: string | null;
  inclusions: string | null;
  exclusions: string | null;
  hotelInfo: string | null;
  transportInfo: string | null;
  activities: string | null;
  terms: string | null;
  validUntil: string;

  currency: string;
  /** What the customer is asked to pay. Safe to show anyone. */
  sellingPrice: number;
  /** Null when the viewer may not see cost and margin. */
  financials: ProposalFinancials | null;

  /** True once a PDF has been generated and stored. */
  hasPdf: boolean;
  createdBy: UserSummary | null;
  createdAt: string;
}

export interface Proposal {
  id: string;
  /** Human-facing identifier, e.g. "TDH-P-00042". Stable across versions. */
  reference: string;
  leadId: string;
  leadReference: string;
  customerName: string;
  status: ProposalStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  createdBy: UserSummary | null;
  submittedBy: UserSummary | null;
  /** The highest-numbered version. There is no other "active" marker. */
  currentVersion: ProposalVersion;
  versionCount: number;
  /** Derived from the current version's validity, not stored. */
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalWithHistory {
  proposal: Proposal;
  /** Every version, newest first. Historical versions are never rewritten. */
  versions: ProposalVersion[];
}

export interface ProposalWithPdf {
  proposal: Proposal;
  /** Time-limited link to the stored PDF, or null if none has been generated. */
  pdfUrl: string | null;
}

/** Statuses after which the content is history and must not be edited. */
export const LOCKED_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'SENT',
  'FOLLOW_UP',
  'NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
];

/** One line of the audit trail. Read-only, everywhere. */
export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string | null;
  action: string;
  summary: string;
  actorName: string;
  actorRole: string;
  ip: string | null;
  /** The HTTP result, so refused attempts are legible. */
  status: number;
  createdAt: string;
}

/** What the admin export endpoints can produce. */
export const EXPORTABLE = ['leads', 'proposals', 'payments', 'expenses'] as const;
export type Exportable = (typeof EXPORTABLE)[number];

// --- Reporting -------------------------------------------------------------

/**
 * Which proposals a margin figure was calculated over.
 *
 * §25 asks for this to be stated rather than implied, and it matters: the
 * margin on everything offered and the margin on what was actually won are
 * different numbers that answer different questions.
 */
export type MarginPopulation = 'SUBMITTED' | 'ACCEPTED';

export interface MarginStats {
  population: MarginPopulation;
  proposalCount: number;
  sellingTotal: number;
  costTotal: number;
  grossProfit: number;
  /**
   * The mean of the individual proposal margins. Flattering when a scattering
   * of small high-margin trips sits beside a few thin large ones.
   */
  averageMarginPercent: number;
  /**
   * Total profit ÷ total revenue. What the business actually kept, and the
   * figure to trust when the two disagree.
   */
  weightedMarginPercent: number;
}

export interface SalesFunnel {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  proposalsCreated: number;
  proposalsSent: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  wonLeads: number;
  lostLeads: number;
  /** Won ÷ (won + lost), as a percentage of decided leads. */
  conversionRate: number;
}

export interface RevenueStats {
  /** Everything offered, at the current version of each proposal. */
  proposedValue: number;
  acceptedValue: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  /** Of the outstanding, the part already past its due date. */
  overdueAmount: number;
}

export interface FollowUpStats {
  dueToday: number;
  upcoming: number;
  overdue: number;
  missed: number;
}

export interface ExpenseStats {
  currentMonth: number;
  previousMonth: number;
  periodTotal: number;
  byCategory: ExpenseCategoryTotal[];
}

/**
 * The whole admin dashboard, over one period and one currency.
 *
 * Single-currency for the same reason as the expense dashboard: adding rupees
 * to dollars needs a rate per transaction date, which this application does
 * not have. `otherCurrencies` names anything excluded.
 */
export interface Dashboard {
  from: string;
  to: string;
  currency: string;
  otherCurrencies: string[];

  sales: SalesFunnel;
  revenue: RevenueStats;
  profitability: {
    submitted: MarginStats;
    accepted: MarginStats;
  };
  /** Monthly gross profit and revenue, for the trend. */
  profitTrend: { month: string; revenue: number; grossProfit: number }[];
  followUps: FollowUpStats;
  expenses: ExpenseStats;
}

/**
 * One consultant's numbers.
 *
 * `averageMarginPercent` is null when the viewer may not see margin — an
 * employee without `canViewOwnProfitability` gets their own row with the
 * money they generated but not the margin on it.
 */
export interface EmployeePerformance {
  user: UserSummary;
  leadsAssigned: number;
  leadsContacted: number;
  proposalsCreated: number;
  proposalValue: number;
  proposalsAccepted: number;
  /** Won ÷ decided, over this consultant's leads. */
  conversionRate: number;
  revenueGenerated: number;
  collected: number;
  outstanding: number;
  missedFollowUps: number;
  averageMarginPercent: number | null;
}

export interface PerformanceReport {
  from: string;
  to: string;
  currency: string;
  rows: EmployeePerformance[];
}

// --- Expenses --------------------------------------------------------------

export interface ExpenseCategory {
  id: string;
  name: string;
  /** Stable across renames, so reporting survives an edit. */
  slug: string;
  active: boolean;
  sortOrder: number;
}

export interface Expense {
  id: string;
  reference: string;
  /** ISO date, `YYYY-MM-DD`. The day the money went out. */
  spentAt: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  /** The staff member who disbursed it; null means the company account. */
  paidBy: UserSummary | null;
  method: PaymentMethod;
  vendor: string | null;
  externalReference: string | null;
  /** True once a receipt has been attached. The file itself is fetched separately. */
  hasReceipt: boolean;
  receiptName: string | null;
  notes: string | null;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategoryTotal {
  categoryId: string;
  name: string;
  total: number;
  count: number;
  /** Of the period's total, to one decimal place. */
  share: number;
}

export interface ExpenseMonthTotal {
  /** `YYYY-MM`. */
  month: string;
  total: number;
}

/**
 * The expense dashboard, over one period and **one currency**.
 *
 * Deliberately single-currency: adding rupees to dollars needs exchange rates
 * on the date of each expense, which is a genuine problem this application does
 * not solve. The summary says which currency it is reporting, and
 * `otherCurrencies` names any that were excluded so nothing is silently
 * dropped from view.
 */
export interface ExpenseSummary {
  from: string;
  to: string;
  currency: string;
  total: number;
  count: number;
  byCategory: ExpenseCategoryTotal[];
  byMonth: ExpenseMonthTotal[];
  currentMonthTotal: number;
  previousMonthTotal: number;
  /** Currencies present in the period but not included in these figures. */
  otherCurrencies: string[];
}

// --- Invoices & payments ---------------------------------------------------

/** The document's own state. Whether it is paid is a separate question. */
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

/** Derived from the payments against an invoice; never stored. */
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

export type PaymentMethod = 'BANK_TRANSFER' | 'UPI' | 'CASH' | 'CARD' | 'OTHER';

export interface InvoiceTotals {
  packageAmount: number;
  discountAmount: number;
  /** After discount, before tax. */
  netAmount: number;
  /** Basis points: 1800 is 18%. Null when no tax applies. */
  taxRateBps: number | null;
  taxAmount: number;
  totalAmount: number;
}

/**
 * The whole of invoice arithmetic, in one place.
 *
 * Used by the server on write and by the form as you type, so what a
 * consultant sees while entering a discount is exactly what will be billed.
 * Nothing accepts a total from a client.
 */
export function invoiceTotals(input: {
  packageAmount: number;
  discountAmount: number;
  taxRateBps: number | null;
}): InvoiceTotals {
  const packageAmount = Math.max(0, Math.round(input.packageAmount));
  // A discount cannot exceed what is being discounted.
  const discountAmount = Math.min(packageAmount, Math.max(0, Math.round(input.discountAmount)));
  const netAmount = packageAmount - discountAmount;

  // Tax applies after the discount — billing tax on money nobody paid would
  // overcharge the customer.
  const taxRateBps = input.taxRateBps ?? null;
  const taxAmount = taxRateBps === null ? 0 : Math.round((netAmount * taxRateBps) / 10_000);

  return {
    packageAmount,
    discountAmount,
    netAmount,
    taxRateBps,
    taxAmount,
    totalAmount: netAmount + taxAmount,
  };
}

/**
 * Where an invoice stands with the customer.
 *
 * `OVERDUE` outranks unpaid and part-paid, because "they owe us and the date
 * has passed" is the thing somebody needs to act on. A fully paid invoice is
 * never overdue, whatever the date says.
 */
export function paymentStatusOf(input: {
  totalAmount: number;
  amountPaid: number;
  /** ISO date, `YYYY-MM-DD`. */
  dueDate: string;
  status: InvoiceStatus;
  now?: Date;
}): PaymentStatus {
  if (input.amountPaid >= input.totalAmount && input.totalAmount > 0) return 'PAID';

  // A draft has not been given to anybody yet, so it cannot be late.
  const now = input.now ?? new Date();
  const pastDue =
    input.status === 'ISSUED' &&
    new Date(`${input.dueDate}T23:59:59.999Z`).getTime() < now.getTime();

  if (pastDue) return 'OVERDUE';
  return input.amountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}

export interface Payment {
  id: string;
  reference: string;
  invoiceId: string;
  /** ISO date, `YYYY-MM-DD`. */
  paidAt: string;
  amount: number;
  method: PaymentMethod;
  externalReference: string | null;
  notes: string | null;
  recordedBy: UserSummary | null;
  createdAt: string;
}

/**
 * A payment as the ledger lists it: the receipt, plus enough of the invoice
 * and the customer to be readable without opening anything.
 */
export interface PaymentEntry extends Payment {
  invoiceReference: string;
  invoiceTotal: number;
  currency: string;
  customerName: string;
  leadId: string;
}

export interface Invoice {
  id: string;
  reference: string;
  leadId: string;
  leadReference: string;
  customerId: string;
  proposalId: string | null;
  proposalReference: string | null;

  status: InvoiceStatus;
  /** ISO dates, `YYYY-MM-DD`. */
  issueDate: string;
  dueDate: string;

  packageTitle: string;
  destination: string | null;
  travelStart: string | null;
  travelEnd: string | null;
  description: string | null;

  currency: string;
  totals: InvoiceTotals;

  billingName: string;
  billingAddress: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  billingTaxId: string | null;

  paymentTerms: string | null;
  notes: string | null;

  // --- Derived from the payments -------------------------------------------
  amountPaid: number;
  outstanding: number;
  paymentStatus: PaymentStatus;
  payments: Payment[];

  hasPdf: boolean;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceWithPdf {
  invoice: Invoice;
  /** Time-limited link to the stored PDF, or null if none has been generated. */
  pdfUrl: string | null;
}

// --- Follow-ups ------------------------------------------------------------

export type FollowUpStatus = 'PENDING' | 'DUE' | 'COMPLETED' | 'MISSED' | 'CANCELLED';

export type FollowUpOutcome =
  | 'NO_RESPONSE'
  | 'INTERESTED'
  | 'NEEDS_TIME'
  | 'NEGOTIATING'
  | 'REQUESTED_CHANGES'
  | 'READY_TO_BOOK'
  | 'NOT_INTERESTED'
  | 'OTHER';

export type FollowUpKind = 'LEAD' | 'PROPOSAL' | 'INVOICE';

export interface FollowUp {
  id: string;
  kind: FollowUpKind;
  /** Null unless `kind` is PROPOSAL. */
  proposalId: string | null;
  proposalReference: string | null;
  /** Null unless `kind` is INVOICE. */
  invoiceId: string | null;
  invoiceReference: string | null;
  leadId: string;
  leadReference: string;
  customerName: string;
  destination: string | null;
  /** Why it was raised. Only ever set on one somebody raised by hand. */
  reason: string | null;
  /** 1-based position in the schedule; 0 when raised by hand. */
  sequence: number;
  dueAt: string;
  status: FollowUpStatus;
  assignedTo: UserSummary | null;

  completedAt: string | null;
  completedBy: UserSummary | null;
  comment: string | null;
  contactMethod: ContactMethod | null;
  outcome: FollowUpOutcome | null;
  nextAction: string | null;

  currency: string;
  /**
   * What is at stake: the proposal's selling price, the invoice's outstanding
   * balance, or the lead's budget. Customer-facing figures only — never cost
   * or margin.
   */
  proposalValue: number;

  /** Whole days past due; 0 when not yet due or already done. */
  daysOverdue: number;
  createdAt: string;
}

export interface FollowUpRule {
  id: string;
  name: string;
  /** Days after submission, one entry per follow-up. */
  offsetDays: number[];
  notifyAssignee: boolean;
  graceHours: number;
  mandatory: boolean;
  escalateAfterMissed: number | null;
  isDefault: boolean;
  active: boolean;
  updatedAt: string;
}

// --- Documents -------------------------------------------------------------

export type TemplateKind = 'PROPOSAL' | 'INVOICE';

export interface CompanyProfile {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  bankDetails: string | null;
  updatedAt: string | null;
}

export interface DocumentTemplate {
  kind: TemplateKind;
  terms: string | null;
  inclusions: string | null;
  exclusions: string | null;
  paymentTerms: string | null;
  footerNote: string | null;
  /** Proposal: how long a quote stays valid. Invoice: days until due. */
  validityDays: number;
  updatedAt: string | null;
}

// --- Email -----------------------------------------------------------------

export type SmtpSecurity = 'NONE' | 'STARTTLS' | 'SSL';

/**
 * The SMTP configuration as the API will report it.
 *
 * There is deliberately no password field. It is not masked or starred out —
 * it is never serialised at all, so no response can leak it.
 */
export interface SmtpStatus {
  configured: boolean;
  host: string | null;
  port: number | null;
  username: string | null;
  security: SmtpSecurity | null;
  fromEmail: string | null;
  fromName: string | null;
  active: boolean;
  /**
   * False when the stored password can no longer be decrypted, which happens
   * if JWT_SECRET was rotated. The settings survive; the password must be
   * entered again.
   */
  passwordReadable: boolean;
}

export type NotificationType =
  'FOLLOW_UP_DUE' | 'FOLLOW_UP_MISSED' | 'FOLLOW_UP_ESCALATED' | 'LEAD_ASSIGNED';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  recipientEmail: string;
  subject: string;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
}

// --- Quotes ----------------------------------------------------------------

export type QuoteStatus = 'DRAFT' | 'SENT';

export interface QuoteItem {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
}

export interface Quote {
  id: string;
  conversationId: string;
  version: number;
  status: QuoteStatus;
  title: string;
  currency: string;
  totalAmount: number;
  /** ISO date, `YYYY-MM-DD`. */
  validUntil: string;
  notes: string | null;
  /** True once a PDF has been generated and stored. */
  hasPdf: boolean;
  sentAt: string | null;
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteWithPdf {
  quote: Quote;
  /** Time-limited link to the stored PDF, or null if none has been generated. */
  pdfUrl: string | null;
}

/** Channels a quote PDF can actually be delivered on. */
export const QUOTE_SENDABLE_CHANNELS: readonly Channel[] = ['INSTAGRAM', 'WHATSAPP'];

// --- AI assistant ----------------------------------------------------------

export interface ConversationSummary {
  summary: string;
}

export interface SuggestedReply {
  reply: string;
}

/** Where the assistant points, and what that server has installed. */
export interface AiStatus {
  /** True once a model has been named in the environment. */
  configured: boolean;
  baseUrl: string;
  model: string;
  /** Models the server reports, or null when it could not be asked. */
  availableModels: string[] | null;
  reachable: boolean;
}

/** Pushed over the inbox event stream. */
export type InboxEvent =
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'conversation'; conversation: Conversation };

/** Body returned by the API's global exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error: string;
  path: string;
  timestamp: string;
  /** Field-level validation problems, keyed by dot-path. */
  details?: Record<string, string[]>;
}
