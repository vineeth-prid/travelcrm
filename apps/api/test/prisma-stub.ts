/**
 * In-memory stand-in for PrismaService, covering exactly the queries the API
 * issues. It lets the smoke tests boot the real application without a database.
 */
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

export const ADMIN_PASSWORD = 'CorrectHorse1';
export const EMPLOYEE_PASSWORD = 'StapleBattery2';
export const EMPLOYEE_EMAIL = 'rahul@travelcrm.test';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
  canViewOwnProfitability: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerRow {
  convertedAt: Date | null;
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  preferredContact: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadRow {
  id: string;
  reference: string;
  customerId: string;
  destination: string | null;
  departureCity: string | null;
  travelStart: Date | null;
  travelEnd: Date | null;
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
  source: string;
  stage: string;
  priority: string;
  tags: string[];
  assignedToId: string | null;
  createdById: string | null;
  lostReason: string | null;
  lostNotes: string | null;
  nextAction: string | null;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalRow {
  id: string;
  reference: string;
  leadId: string;
  status: string;
  createdById: string | null;
  submittedById: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalVersionRow {
  id: string;
  proposalId: string;
  version: number;
  title: string;
  destination: string | null;
  travelStart: Date | null;
  travelEnd: Date | null;
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
  validUntil: Date;
  currency: string;
  sellingPrice: number;
  actualCost: number;
  pdfPath: string | null;
  createdById: string | null;
  createdAt: Date;
}

export interface InvoiceRow {
  id: string;
  reference: string;
  leadId: string;
  customerId: string;
  proposalId: string | null;
  status: string;
  issueDate: Date;
  dueDate: Date;
  packageTitle: string;
  destination: string | null;
  travelStart: Date | null;
  travelEnd: Date | null;
  description: string | null;
  currency: string;
  packageAmount: number;
  discountAmount: number;
  taxRateBps: number | null;
  taxAmount: number;
  totalAmount: number;
  billingName: string;
  billingAddress: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  billingTaxId: string | null;
  paymentTerms: string | null;
  notes: string | null;
  pdfPath: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRow {
  id: string;
  reference: string;
  invoiceId: string;
  paidAt: Date;
  amount: number;
  method: string;
  externalReference: string | null;
  notes: string | null;
  recordedById: string | null;
  createdAt: Date;
}

export interface AuditLogRow {
  id: string;
  seq: number;
  entity: string;
  entityId: string | null;
  action: string;
  summary: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  ip: string | null;
  status: number;
  createdAt: Date;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseRow {
  id: string;
  reference: string;
  spentAt: Date;
  categoryId: string;
  description: string;
  amount: number;
  currency: string;
  paidById: string | null;
  method: string;
  vendor: string | null;
  externalReference: string | null;
  receiptPath: string | null;
  receiptName: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUpRuleRow {
  id: string;
  name: string;
  offsetDays: number[];
  notifyAssignee: boolean;
  graceHours: number;
  mandatory: boolean;
  escalateAfterMissed: number | null;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUpRow {
  id: string;
  kind: string;
  proposalId: string | null;
  invoiceId: string | null;
  reason: string | null;
  leadId: string;
  ruleId: string | null;
  sequence: number;
  dueAt: Date;
  status: string;
  assignedToId: string | null;
  completedAt: Date | null;
  completedById: string | null;
  comment: string | null;
  contactMethod: string | null;
  outcome: string | null;
  nextAction: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationRow {
  id: string;
  type: string;
  status: string;
  dedupeKey: string;
  recipientId: string | null;
  recipientEmail: string;
  subject: string;
  body: string;
  sentAt: Date | null;
  error: string | null;
  createdAt: Date;
}

export interface SmtpSettingsRow {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  security: string;
  fromEmail: string;
  fromName: string;
  active: boolean;
  updatedAt: Date;
}

export interface LeadActivityRow {
  id: string;
  seq: number;
  leadId: string;
  type: string;
  summary: string;
  detail: string | null;
  actorId: string | null;
  createdAt: Date;
}

/**
 * A small interpreter for the subset of Prisma's `where` grammar the API uses:
 * AND / OR, equality, and the handful of operators the lead filters need.
 *
 * Worth the 40 lines — the alternative is re-implementing every filter in the
 * repository a second time here, and then keeping the two in step by hand.
 */
const OPERATORS = new Set([
  'contains',
  'equals',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'notIn',
  'not',
  'mode',
]);

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).some((key) => OPERATORS.has(key))
  );
}

function compare(actual: unknown, condition: Record<string, unknown>): boolean {
  const insensitive = condition.mode === 'insensitive';
  const fold = (value: unknown) =>
    insensitive && typeof value === 'string' ? value.toLowerCase() : value;
  const time = (value: unknown) => (value instanceof Date ? value.getTime() : value);

  for (const [operator, expected] of Object.entries(condition)) {
    switch (operator) {
      case 'mode':
        break;
      case 'contains':
        if (actual === null || actual === undefined) return false;
        if (!String(fold(actual)).includes(String(fold(expected)))) return false;
        break;
      case 'equals':
        if (fold(actual) !== fold(expected)) return false;
        break;
      case 'not':
        if (fold(actual) === fold(expected)) return false;
        break;
      case 'lt':
        if (!((time(actual) as number) < (time(expected) as number))) return false;
        break;
      case 'lte':
        if (!((time(actual) as number) <= (time(expected) as number))) return false;
        break;
      case 'gt':
        if (!((time(actual) as number) > (time(expected) as number))) return false;
        break;
      case 'gte':
        if (!((time(actual) as number) >= (time(expected) as number))) return false;
        break;
      case 'in':
        if (!(expected as unknown[]).includes(actual)) return false;
        break;
      case 'notIn':
        if ((expected as unknown[]).includes(actual)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

/** Everything a follow-up row has before the caller's data is merged in. */
function blankFollowUp(): FollowUpRow {
  return {
    id: randomUUID(),
    kind: 'PROPOSAL',
    proposalId: null,
    invoiceId: null,
    reason: null,
    leadId: '',
    ruleId: null,
    sequence: 0,
    dueAt: new Date(),
    status: 'PENDING',
    assignedToId: null,
    completedAt: null,
    completedById: null,
    comment: null,
    contactMethod: null,
    outcome: null,
    nextAction: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export type OrderBy = 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls?: 'first' | 'last' };

/**
 * Columns Prisma will **not** accept `nulls:` on, because they are required.
 *
 * The real engine throws `PrismaClientValidationError` for
 * `orderBy: { createdAt: { sort, nulls } }`, and a stub that quietly accepted
 * it let exactly that ship: the leads list 500'd on its default sort while
 * every test passed. Prisma's own types express this; this is the runtime half.
 */
const NON_NULLABLE_LEAD_COLUMNS = new Set(['createdAt', 'updatedAt', 'lastActivityAt', 'stage']);

/** Reads an orderBy the way Prisma does, and refuses what Prisma refuses. */
export function readOrderBy(
  orderBy: Record<string, OrderBy> | undefined,
  nonNullable: Set<string>,
): [string, 'asc' | 'desc'] {
  const [field, value] = Object.entries(orderBy ?? {})[0] ?? ['createdAt', 'desc' as const];

  if (typeof value === 'object' && value.nulls !== undefined && nonNullable.has(field)) {
    throw new Error(
      `Prisma would reject this: \`nulls\` is only valid on a nullable column, and "${field}" is required.`,
    );
  }

  return [field, typeof value === 'object' ? value.sort : value];
}

export function matchesWhere(row: Record<string, unknown>, where: unknown): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, condition] of Object.entries(where as Record<string, unknown>)) {
    if (condition === undefined) continue;

    if (key === 'AND') {
      if (!(condition as unknown[]).every((clause) => matchesWhere(row, clause))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(condition as unknown[]).some((clause) => matchesWhere(row, clause))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchesWhere(row, condition)) return false;
      continue;
    }

    const actual = row[key];

    if (isOperatorObject(condition)) {
      if (!compare(actual, condition)) return false;
      continue;
    }

    // A plain object here is a relation filter, e.g. `customer: { name: ... }`
    // — or, on a list relation, `versions: { some: { … } }`.
    if (typeof condition === 'object' && condition !== null && !(condition instanceof Date)) {
      const clause = condition as Record<string, unknown>;

      if (Array.isArray(actual) && ('some' in clause || 'every' in clause || 'none' in clause)) {
        const rows = actual as Record<string, unknown>[];
        if ('some' in clause && !rows.some((item) => matchesWhere(item, clause.some))) return false;
        if ('every' in clause && !rows.every((item) => matchesWhere(item, clause.every))) {
          return false;
        }
        if ('none' in clause && rows.some((item) => matchesWhere(item, clause.none))) return false;
        continue;
      }

      if (!actual || typeof actual !== 'object') return false;
      if (!matchesWhere(actual as Record<string, unknown>, condition)) return false;
      continue;
    }

    if (actual !== condition) return false;
  }

  return true;
}

export interface ContactRow {
  id: string;
  channel: string;
  externalId: string;
  name: string;
  username: string | null;
  phone: string | null;
  email: string | null;
  profilePicture: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationRow {
  id: string;
  contactId: string;
  channel: string;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
  unreadCount: number;
  destination: string | null;
  travelMonth: string | null;
  adults: number | null;
  children: number | null;
  budget: number | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  direction: string;
  messageType: string;
  content: string;
  externalMessageId: string | null;
  sentAt: Date;
  deliveredAt: Date | null;
  createdAt: Date;
}

/** Mirrors the OR clause the repository builds for search. */
interface SearchClause {
  contact?: {
    name?: { contains?: string };
    phone?: { contains?: string };
    email?: { contains?: string };
  };
  destination?: { contains?: string };
}

interface SearchWhere {
  OR?: SearchClause[];
}

export interface QuoteRow {
  id: string;
  conversationId: string;
  version: number;
  status: string;
  title: string;
  currency: string;
  totalAmount: number;
  validUntil: Date;
  notes: string | null;
  pdfPath: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteItemRow {
  id: string;
  quoteId: string;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
}

export interface IntegrationTokenRow {
  provider: string;
  accessToken: string;
  expiresAt: Date | null;
  updatedAt: Date;
}

class UniqueViolation extends Error {
  readonly code = 'P2002';
}

/**
 * A real `PrismaClientKnownRequestError`, not a look-alike.
 *
 * The notification service decides whether a duplicate is an error or a
 * no-op with `instanceof Prisma.PrismaClientKnownRequestError`, so a stub that
 * threw its own class would take the wrong branch and the dedupe test would
 * pass for the wrong reason.
 */
function uniqueViolation(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'stub',
    meta: { target },
  });
}

export function createPrismaStub() {
  const users: UserRow[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ada Lovelace',
      email: 'admin@travelcrm.test',
      password: bcrypt.hashSync(ADMIN_PASSWORD, 4),
      role: 'ADMIN',
      active: true,
      canViewOwnProfitability: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Rahul Sharma',
      email: 'rahul@travelcrm.test',
      password: bcrypt.hashSync(EMPLOYEE_PASSWORD, 4),
      role: 'EMPLOYEE',
      active: true,
      canViewOwnProfitability: false,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];
  const contacts: ContactRow[] = [];
  const customers: CustomerRow[] = [];
  /** Settings singletons: empty until something writes them. */
  const companyProfiles: Record<string, unknown>[] = [];
  const documentTemplates: Record<string, unknown>[] = [];
  const leads: LeadRow[] = [];
  const leadActivities: LeadActivityRow[] = [];
  const proposals: ProposalRow[] = [];
  const proposalVersions: ProposalVersionRow[] = [];
  const followUps: FollowUpRow[] = [];
  const notifications: NotificationRow[] = [];
  const smtpSettings: SmtpSettingsRow[] = [];
  /** The Day 1/3/5/7 rule the migration seeds. */
  const followUpRules: FollowUpRuleRow[] = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Standard proposal follow-up',
      offsetDays: [1, 3, 5, 7],
      notifyAssignee: true,
      graceHours: 24,
      mandatory: false,
      escalateAfterMissed: null,
      isDefault: true,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const invoices: InvoiceRow[] = [];
  const payments: PaymentRow[] = [];
  const auditLogs: AuditLogRow[] = [];
  let auditSeq = 0;
  const expenses: ExpenseRow[] = [];
  /** The categories the migration seeds. */
  const expenseCategories: ExpenseCategoryRow[] = [
    ['Advertising', 'advertising', 10],
    ['Marketing', 'marketing', 20],
    ['Office', 'office', 30],
    ['Salaries', 'salaries', 40],
    ['Travel', 'travel', 50],
    ['Software', 'software', 60],
    ['Vendor', 'vendor', 70],
    ['Operations', 'operations', 80],
    ['Bank & payment fees', 'bank-fees', 90],
    ['Miscellaneous', 'misc', 100],
  ].map(([name, slug, sortOrder]) => ({
    id: randomUUID(),
    name: name as string,
    slug: slug as string,
    active: true,
    sortOrder: sortOrder as number,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }));
  let expenseCounter = 0;
  let leadCounter = 0;
  let proposalCounter = 0;
  let invoiceCounter = 0;
  let paymentCounter = 0;
  let activitySeq = 0;
  const conversations: ConversationRow[] = [];
  const messages: MessageRow[] = [];
  const quotes: QuoteRow[] = [];
  const quoteItems: QuoteItemRow[] = [];
  const integrationTokens: IntegrationTokenRow[] = [];

  const findUser = (where: { id?: string; email?: string }): UserRow | null =>
    users.find((row) => (where.id ? row.id === where.id : row.email === where.email)) ?? null;

  const withContact = (row: ConversationRow) => ({
    ...row,
    contact: contacts.find((contact) => contact.id === row.contactId),
  });

  const stub = {
    users,
    customers,
    leads,
    leadActivities,
    proposals,
    proposalVersions,
    followUps,
    followUpRules,
    notifications,
    smtpSettings,
    invoices,
    payments,
    expenses,
    expenseCategories,
    auditLogs,
    contacts,
    conversations,
    messages,
    quotes,
    quoteItems,
    integrationTokens,

    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
    isReachable: () => Promise.resolve(true),
    // Interactive transactions run against the same store; there is nothing to
    // isolate in a single-threaded stub. The array form is used for the
    // "rows and total in one round trip" pattern in LeadsRepository.
    $transaction: <T>(work: ((tx: typeof stub) => Promise<T>) | Promise<unknown>[]) =>
      Array.isArray(work) ? Promise.all(work) : work(stub),

    user: {
      findMany: ({ where, orderBy }: { where?: unknown; orderBy?: unknown } = {}) =>
        Promise.resolve(
          users
            .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
            .sort((a, b) => {
              // The admin listing orders by active first, then name; every
              // other caller just wants them alphabetical.
              const byActive = Array.isArray(orderBy) ? Number(b.active) - Number(a.active) : 0;
              return byActive !== 0 ? byActive : a.name.localeCompare(b.name);
            }),
        ),

      create: ({ data }: { data: Partial<UserRow> & { email: string } }) => {
        if (users.some((row) => row.email === data.email)) {
          throw uniqueViolation('users_email_key');
        }
        const row: UserRow = {
          id: randomUUID(),
          name: '',
          password: '',
          role: 'EMPLOYEE',
          active: true,
          canViewOwnProfitability: false,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(row);
        return Promise.resolve(row);
      },

      findUnique: ({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(findUser(where)),
      update: ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = findUser(where);
        if (!row) throw new Error('user not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve(row);
      },
    },

    contact: {
      findUnique: ({
        where,
      }: {
        where: { channel_externalId: { channel: string; externalId: string } };
      }) => {
        const key = where.channel_externalId;
        return Promise.resolve(
          contacts.find(
            (row) => row.channel === key.channel && row.externalId === key.externalId,
          ) ?? null,
        );
      },

      upsert: ({
        where,
        update,
        create,
      }: {
        where: { channel_externalId: { channel: string; externalId: string } };
        update: Partial<ContactRow>;
        create: Omit<ContactRow, 'id' | 'createdAt' | 'updatedAt'>;
      }) => {
        const key = where.channel_externalId;
        const existing = contacts.find(
          (row) => row.channel === key.channel && row.externalId === key.externalId,
        );

        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return Promise.resolve(existing);
        }

        const row: ContactRow = {
          id: randomUUID(),
          username: null,
          phone: null,
          email: null,
          profilePicture: null,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        contacts.push(row);
        return Promise.resolve(row);
      },
    },

    conversation: {
      findMany: ({ where }: { where?: SearchWhere } = {}) => {
        const clauses = where?.OR;

        const matched = conversations.filter((row) => {
          if (!clauses) return true;
          const contact = contacts.find((item) => item.id === row.contactId);
          if (!contact) return false;

          const includes = (haystack: string | null, needle: string) =>
            (haystack ?? '').toLowerCase().includes(needle.toLowerCase());

          return clauses.some((clause) => {
            if (clause.contact?.name?.contains) {
              return includes(contact.name, clause.contact.name.contains);
            }
            if (clause.contact?.phone?.contains) {
              return (contact.phone ?? '').includes(clause.contact.phone.contains);
            }
            if (clause.contact?.email?.contains) {
              return includes(contact.email, clause.contact.email.contains);
            }
            if (clause.destination?.contains) {
              return includes(row.destination, clause.destination.contains);
            }
            return false;
          });
        });

        // lastMessageAt desc, nulls last, then createdAt desc.
        const sorted = [...matched].sort((a, b) => {
          const left = a.lastMessageAt?.getTime();
          const right = b.lastMessageAt?.getTime();
          if (left === undefined && right === undefined) {
            return b.createdAt.getTime() - a.createdAt.getTime();
          }
          if (left === undefined) return 1;
          if (right === undefined) return -1;
          return right - left;
        });

        return Promise.resolve(sorted.map(withContact));
      },

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = conversations.find((item) => item.id === where.id);
        return Promise.resolve(row ? withContact(row) : null);
      },

      upsert: ({
        where,
        create,
      }: {
        where: { contactId: string };
        create: { contactId: string; channel: string };
      }) => {
        const existing = conversations.find((row) => row.contactId === where.contactId);
        if (existing) return Promise.resolve(withContact(existing));

        const row: ConversationRow = {
          id: randomUUID(),
          contactId: create.contactId,
          channel: create.channel,
          lastMessage: null,
          lastMessageAt: null,
          lastInboundAt: null,
          unreadCount: 0,
          destination: null,
          travelMonth: null,
          adults: null,
          children: null,
          budget: null,
          status: 'NEW',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        conversations.push(row);
        return Promise.resolve(withContact(row));
      },

      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Omit<ConversationRow, 'unreadCount'>> & {
          unreadCount?: number | { increment: number };
          contact?: { update: { email?: string | null } };
        };
      }) => {
        const row = conversations.find((item) => item.id === where.id);
        if (!row) throw new Error('conversation not found');

        const { unreadCount, contact: contactUpdate, ...fields } = data;

        // Prisma skips `undefined`; only explicit values are written.
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            (row as unknown as Record<string, unknown>)[key] = value;
          }
        }

        if (typeof unreadCount === 'number') row.unreadCount = unreadCount;
        else if (unreadCount) row.unreadCount += unreadCount.increment;

        if (contactUpdate) {
          const contact = contacts.find((item) => item.id === row.contactId);
          if (contact && contactUpdate.update.email !== undefined) {
            contact.email = contactUpdate.update.email;
          }
        }

        row.updatedAt = new Date();
        return Promise.resolve(withContact(row));
      },
    },

    message: {
      create: ({ data }: { data: Omit<MessageRow, 'id' | 'createdAt' | 'deliveredAt'> }) => {
        if (
          data.externalMessageId &&
          messages.some((row) => row.externalMessageId === data.externalMessageId)
        ) {
          throw new UniqueViolation('duplicate externalMessageId');
        }

        const row: MessageRow = {
          id: randomUUID(),
          deliveredAt: null,
          ...data,
          createdAt: new Date(),
        };
        messages.push(row);
        return Promise.resolve(row);
      },

      findMany: ({ where }: { where: { conversationId: string } }) =>
        Promise.resolve(
          messages
            .filter((row) => row.conversationId === where.conversationId)
            .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime()),
        ),

      findUnique: ({ where }: { where: { externalMessageId: string } }) =>
        Promise.resolve(
          messages.find((row) => row.externalMessageId === where.externalMessageId) ?? null,
        ),

      updateMany: ({
        where,
        data,
      }: {
        where: { externalMessageId: string; deliveredAt: null };
        data: { deliveredAt: Date };
      }) => {
        const matched = messages.filter(
          (row) => row.externalMessageId === where.externalMessageId && row.deliveredAt === null,
        );
        for (const row of matched) row.deliveredAt = data.deliveredAt;
        return Promise.resolve({ count: matched.length });
      },
    },

    quote: {
      findMany: ({ where }: { where: { conversationId: string } }) =>
        Promise.resolve(
          quotes
            .filter((row) => row.conversationId === where.conversationId)
            .sort((a, b) => b.version - a.version)
            .map(withQuoteItems),
        ),

      findFirst: ({ where }: { where: { conversationId: string } }) => {
        const latest = quotes
          .filter((row) => row.conversationId === where.conversationId)
          .sort((a, b) => b.version - a.version)[0];
        return Promise.resolve(latest ?? null);
      },

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = quotes.find((item) => item.id === where.id);
        return Promise.resolve(row ? withQuoteItems(row) : null);
      },

      create: ({
        data,
      }: {
        data: Omit<QuoteRow, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'pdfPath' | 'sentAt'> & {
          items: { create: Omit<QuoteItemRow, 'id' | 'quoteId'>[] };
        };
      }) => {
        const { items, ...fields } = data;
        const row: QuoteRow = {
          id: randomUUID(),
          status: 'DRAFT',
          pdfPath: null,
          sentAt: null,
          currency: 'INR',
          ...fields,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        quotes.push(row);
        for (const item of items.create) {
          quoteItems.push({ id: randomUUID(), quoteId: row.id, ...item });
        }
        return Promise.resolve(withQuoteItems(row));
      },

      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<QuoteRow> & { items?: { create: Omit<QuoteItemRow, 'id' | 'quoteId'>[] } };
      }) => {
        const row = quotes.find((item) => item.id === where.id);
        if (!row) throw new Error('quote not found');

        const { items, ...fields } = data;
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            (row as unknown as Record<string, unknown>)[key] = value;
          }
        }
        for (const item of items?.create ?? []) {
          quoteItems.push({ id: randomUUID(), quoteId: row.id, ...item });
        }

        row.updatedAt = new Date();
        return Promise.resolve(withQuoteItems(row));
      },
    },

    customer: {
      create: ({ data }: { data: Partial<CustomerRow> & { name: string } }) => {
        const row: CustomerRow = {
          id: randomUUID(),
          convertedAt: null,
          convertedAt: null,
          phone: null,
          whatsapp: null,
          email: null,
          preferredContact: null,
          city: null,
          country: null,
          notes: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        customers.push(row);
        return Promise.resolve(row);
      },

      /** How a lead's customer is marked converted when the first invoice lands. */
      updateMany: ({ where, data }: { where: unknown; data: Partial<CustomerRow> }) => {
        const matched = customers.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: matched.length });
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<CustomerRow> }) => {
        const row = customers.find((item) => item.id === where.id);
        if (!row) throw new Error('customer not found');
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        row.updatedAt = new Date();
        return Promise.resolve(row);
      },

      /**
       * Serves both duplicate detection and the customer book. Relations are
       * attached before filtering so `where: { leads: { some: … } }` works, and
       * the include's own `where` is honoured because that is what scopes a
       * customer's lead count to the leads the viewer may see.
       */
      findMany: ({
        where,
        include,
        take,
      }: {
        where?: unknown;
        include?: { leads?: { where?: unknown } };
        take?: number;
      } = {}) => {
        const scope = include?.leads?.where;

        const matched = customers
          .map((row) => withCustomerRelations(row, scope))
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
          .slice(0, take ?? undefined);

        return Promise.resolve(matched);
      },

      findFirst: ({
        where,
        include,
      }: {
        where?: unknown;
        include?: { leads?: { where?: unknown } };
      } = {}) => {
        const row = customers
          .map((item) => withCustomerRelations(item, include?.leads?.where))
          .find((item) => matchesWhere(item as unknown as Record<string, unknown>, where));

        return Promise.resolve(row ?? null);
      },
    },

    lead: {
      findMany: ({
        where,
        orderBy,
        skip,
        take,
      }: {
        where?: unknown;
        orderBy?: Record<string, OrderBy>;
        skip?: number;
        take?: number;
      } = {}) => {
        const matched = leads
          .map(withLeadRelations)
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where));

        const [field, order] = readOrderBy(orderBy, NON_NULLABLE_LEAD_COLUMNS);
        const sorted = [...matched].sort((a, b) => {
          const left = (a as unknown as Record<string, unknown>)[field];
          const right = (b as unknown as Record<string, unknown>)[field];
          // Nulls last, as the repository asks for.
          if (left == null && right == null) return 0;
          if (left == null) return 1;
          if (right == null) return -1;

          const value = (input: unknown) => (input instanceof Date ? input.getTime() : input);
          const l = value(left) as number | string;
          const r = value(right) as number | string;
          const direction = l < r ? -1 : l > r ? 1 : 0;
          return order === 'desc' ? -direction : direction;
        });

        const from = skip ?? 0;
        return Promise.resolve(sorted.slice(from, take === undefined ? undefined : from + take));
      },

      count: ({ where }: { where?: unknown } = {}) =>
        Promise.resolve(
          leads
            .map(withLeadRelations)
            .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where)).length,
        ),

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = leads.find((item) => item.id === where.id);
        return Promise.resolve(row ? withLeadRelations(row) : null);
      },

      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const row = leads.find((item) => item.id === where.id);
        if (!row) throw new Error('lead not found');
        return Promise.resolve(withLeadRelations(row));
      },

      create: ({ data }: { data: Partial<LeadRow> & { customerId: string } }) => {
        leadCounter += 1;
        const row: LeadRow = {
          id: randomUUID(),
          reference: `TDH-L-${String(leadCounter).padStart(5, '0')}`,
          destination: null,
          departureCity: null,
          travelStart: null,
          travelEnd: null,
          adults: null,
          children: null,
          childAges: [],
          tripType: null,
          hotelCategory: null,
          mealPreference: null,
          transportRequired: false,
          flightRequired: false,
          activityRequirements: null,
          specialRequirements: null,
          budget: null,
          currency: 'INR',
          rawRequirement: null,
          requirementSummary: null,
          source: 'MANUAL',
          stage: 'NEW',
          priority: 'MEDIUM',
          tags: [],
          assignedToId: null,
          createdById: null,
          lostReason: null,
          lostNotes: null,
          nextAction: null,
          nextFollowUpAt: null,
          lastActivityAt: new Date(),
          notes: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        leads.push(row);
        return Promise.resolve(withLeadRelations(row));
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<LeadRow> }) => {
        const row = leads.find((item) => item.id === where.id);
        if (!row) throw new Error('lead not found');
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        row.updatedAt = new Date();
        return Promise.resolve(withLeadRelations(row));
      },

      updateMany: ({ where, data }: { where: unknown; data: Partial<LeadRow> }) => {
        const matched = leads.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        for (const row of matched) {
          Object.assign(row, data, { updatedAt: new Date() });
        }
        return Promise.resolve({ count: matched.length });
      },
    },

    proposal: {
      updateMany: ({ where, data }: { where: unknown; data: Partial<ProposalRow> }) => {
        const matched = proposals.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: matched.length });
      },

      // Handles the lead's proposal list, the workspace list (which filters
      // through the lead relation) and the scheduler's expiry sweep. Relations
      // are attached *before* filtering, so `where: { lead: … }` can match.
      findMany: ({ where, take }: { where?: unknown; take?: number } = {}) => {
        const matched = proposals
          .map(withProposalRelations)
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return Promise.resolve(take === undefined ? matched : matched.slice(0, take));
      },

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = proposals.find((item) => item.id === where.id);
        return Promise.resolve(row ? withProposalRelations(row) : null);
      },

      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const row = proposals.find((item) => item.id === where.id);
        if (!row) throw new Error('proposal not found');
        return Promise.resolve(withProposalRelations(row));
      },

      create: ({
        data,
      }: {
        data: Partial<ProposalRow> & {
          leadId: string;
          versions: { create: Partial<ProposalVersionRow> & { version: number } };
        };
      }) => {
        proposalCounter += 1;
        const { versions, ...fields } = data;
        const row: ProposalRow = {
          id: randomUUID(),
          reference: `TDH-P-${String(proposalCounter).padStart(5, '0')}`,
          status: 'DRAFT',
          createdById: null,
          submittedById: null,
          submittedAt: null,
          decidedAt: null,
          ...fields,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        proposals.push(row);
        addVersion(row.id, versions.create);
        return Promise.resolve(withProposalRelations(row));
      },

      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ProposalRow> & {
          versions?: { create: Partial<ProposalVersionRow> & { version: number } };
        };
      }) => {
        const row = proposals.find((item) => item.id === where.id);
        if (!row) throw new Error('proposal not found');

        const { versions, ...fields } = data;
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        if (versions) addVersion(row.id, versions.create);

        row.updatedAt = new Date();
        return Promise.resolve(withProposalRelations(row));
      },
    },

    proposalVersion: {
      update: ({ where, data }: { where: { id: string }; data: Partial<ProposalVersionRow> }) => {
        const row = proposalVersions.find((item) => item.id === where.id);
        if (!row) throw new Error('proposal version not found');
        // pdfPath is deliberately settable to null, so `undefined` is the only
        // value Prisma would skip.
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        return Promise.resolve(row);
      },
    },

    leadActivity: {
      create: ({ data }: { data: Omit<LeadActivityRow, 'id' | 'seq'> }) => {
        activitySeq += 1;
        const row: LeadActivityRow = { id: randomUUID(), seq: activitySeq, ...data };
        leadActivities.push(row);
        return Promise.resolve({
          ...row,
          actor: users.find((user) => user.id === row.actorId) ?? null,
        });
      },

      findMany: ({ where }: { where: { leadId: string } }) =>
        Promise.resolve(
          leadActivities
            .filter((row) => row.leadId === where.leadId)
            .sort((a, b) => b.seq - a.seq)
            .map((row) => ({
              ...row,
              actor: users.find((user) => user.id === row.actorId) ?? null,
            })),
        ),
    },

    auditLog: {
      // Only create and findMany exist here, mirroring the application: there
      // is no update and no delete anywhere for the audit trail.
      create: ({ data }: { data: Omit<AuditLogRow, 'id' | 'seq' | 'createdAt'> }) => {
        auditSeq += 1;
        const row: AuditLogRow = {
          id: randomUUID(),
          seq: auditSeq,
          ...data,
          createdAt: new Date(),
        };
        auditLogs.push(row);
        return Promise.resolve(row);
      },

      findMany: ({ where, take }: { where?: unknown; take?: number } = {}) =>
        Promise.resolve(
          auditLogs
            .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
            .sort((a, b) => b.seq - a.seq)
            .slice(0, take ?? undefined),
        ),
    },

    expenseCategory: {
      findMany: ({ orderBy }: { orderBy?: unknown } = {}) =>
        Promise.resolve(
          orderBy
            ? [...expenseCategories].sort(
                (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
              )
            : [...expenseCategories],
        ),

      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(expenseCategories.find((row) => row.id === where.id) ?? null),

      create: ({
        data,
      }: {
        data: Partial<ExpenseCategoryRow> & { name: string; slug: string };
      }) => {
        if (expenseCategories.some((row) => row.name === data.name)) {
          throw uniqueViolation('expense_categories_name_key');
        }
        if (expenseCategories.some((row) => row.slug === data.slug)) {
          throw uniqueViolation('expense_categories_slug_key');
        }
        const row: ExpenseCategoryRow = {
          id: randomUUID(),
          active: true,
          sortOrder: 500,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expenseCategories.push(row);
        return Promise.resolve(row);
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<ExpenseCategoryRow> }) => {
        const row = expenseCategories.find((item) => item.id === where.id);
        if (!row) throw new Error('category not found');
        if (data.name && expenseCategories.some((c) => c.name === data.name && c.id !== row.id)) {
          throw uniqueViolation('expense_categories_name_key');
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve(row);
      },
    },

    expense: {
      findMany: ({
        where,
        take,
        orderBy,
      }: { where?: unknown; take?: number; orderBy?: { spentAt?: 'asc' | 'desc' } } = {}) => {
        const matched = expenses
          .map(withExpenseRelations)
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
          .sort((a, b) =>
            orderBy?.spentAt === 'asc'
              ? a.spentAt.getTime() - b.spentAt.getTime()
              : b.spentAt.getTime() - a.spentAt.getTime(),
          );
        return Promise.resolve(matched.slice(0, take ?? undefined));
      },

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = expenses.find((item) => item.id === where.id);
        return Promise.resolve(row ? withExpenseRelations(row) : null);
      },

      create: ({
        data,
      }: {
        data: Partial<ExpenseRow> & { categoryId: string; amount: number };
      }) => {
        expenseCounter += 1;
        const row: ExpenseRow = {
          id: randomUUID(),
          reference: `TDH-EXP-${String(expenseCounter).padStart(5, '0')}`,
          spentAt: new Date(),
          description: '',
          currency: 'INR',
          paidById: null,
          method: 'OTHER',
          vendor: null,
          externalReference: null,
          receiptPath: null,
          receiptName: null,
          notes: null,
          createdById: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expenses.push(row);
        return Promise.resolve(withExpenseRelations(row));
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<ExpenseRow> }) => {
        const row = expenses.find((item) => item.id === where.id);
        if (!row) throw new Error('expense not found');
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        row.updatedAt = new Date();
        return Promise.resolve(withExpenseRelations(row));
      },

      delete: ({ where }: { where: { id: string } }) => {
        const index = expenses.findIndex((item) => item.id === where.id);
        if (index === -1) throw new Error('expense not found');
        const [row] = expenses.splice(index, 1);
        return Promise.resolve(row);
      },

      aggregate: ({ where }: { where?: unknown } = {}) => {
        const matched = expenses.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        return Promise.resolve({
          _sum: { amount: matched.reduce((sum, row) => sum + row.amount, 0) },
          _count: matched.length,
        });
      },

      groupBy: ({ by, where }: { by: string[]; where?: unknown }) => {
        const matched = expenses.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        const key = by[0]!;
        const groups = new Map<string, ExpenseRow[]>();

        for (const row of matched) {
          const value = String((row as unknown as Record<string, unknown>)[key]);
          groups.set(value, [...(groups.get(value) ?? []), row]);
        }

        return Promise.resolve(
          [...groups.entries()].map(([value, rows]) => ({
            [key]: value,
            _sum: { amount: rows.reduce((sum, row) => sum + row.amount, 0) },
            _count: rows.length,
          })),
        );
      },
    },

    invoice: {
      findMany: ({ where, take }: { where?: unknown; take?: number } = {}) =>
        Promise.resolve(
          invoices
            .map(withInvoiceRelations)
            .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, take ?? undefined),
        ),

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = invoices.find((item) => item.id === where.id);
        return Promise.resolve(row ? withInvoiceRelations(row) : null);
      },

      create: ({ data }: { data: Partial<InvoiceRow> & { leadId: string } }) => {
        invoiceCounter += 1;
        const row: InvoiceRow = {
          id: randomUUID(),
          reference: `TDH-INV-${String(invoiceCounter).padStart(5, '0')}`,
          customerId: '',
          proposalId: null,
          status: 'DRAFT',
          issueDate: new Date(),
          dueDate: new Date(),
          packageTitle: '',
          destination: null,
          travelStart: null,
          travelEnd: null,
          description: null,
          currency: 'INR',
          packageAmount: 0,
          discountAmount: 0,
          taxRateBps: null,
          taxAmount: 0,
          totalAmount: 0,
          billingName: '',
          billingAddress: null,
          billingEmail: null,
          billingPhone: null,
          billingTaxId: null,
          paymentTerms: null,
          notes: null,
          pdfPath: null,
          createdById: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        invoices.push(row);
        return Promise.resolve(withInvoiceRelations(row));
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<InvoiceRow> }) => {
        const row = invoices.find((item) => item.id === where.id);
        if (!row) throw new Error('invoice not found');
        // pdfPath is deliberately settable to null on edit.
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        row.updatedAt = new Date();
        return Promise.resolve(withInvoiceRelations(row));
      },
    },

    payment: {
      create: ({ data }: { data: Partial<PaymentRow> & { invoiceId: string; amount: number } }) => {
        paymentCounter += 1;
        const row: PaymentRow = {
          id: randomUUID(),
          reference: `TDH-PAY-${String(paymentCounter).padStart(5, '0')}`,
          paidAt: new Date(),
          method: 'OTHER',
          externalReference: null,
          notes: null,
          recordedById: null,
          ...data,
          createdAt: new Date(),
        };
        payments.push(row);
        return Promise.resolve(row);
      },

      /** The ledger. Relations first, so `where: { invoice: … }` can match. */
      findMany: ({ where, take }: { where?: unknown; take?: number } = {}) => {
        const matched = payments
          .map((row) => ({
            ...row,
            recordedBy: users.find((item) => item.id === row.recordedById) ?? null,
            invoice: invoices.find((item) => item.id === row.invoiceId) ?? null,
          }))
          .map((row) => ({
            ...row,
            invoice: row.invoice
              ? {
                  ...row.invoice,
                  lead: leads.find((item) => item.id === row.invoice!.leadId) ?? null,
                }
              : null,
          }))
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
          .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

        return Promise.resolve(take === undefined ? matched : matched.slice(0, take));
      },
    },

    followUpRule: {
      findFirst: ({ where }: { where?: unknown } = {}) =>
        Promise.resolve(
          followUpRules.find((row) =>
            matchesWhere(row as unknown as Record<string, unknown>, where),
          ) ?? null,
        ),

      findMany: () => Promise.resolve([...followUpRules]),

      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(followUpRules.find((row) => row.id === where.id) ?? null),

      create: ({ data }: { data: Partial<FollowUpRuleRow> & { name: string } }) => {
        const row: FollowUpRuleRow = {
          id: randomUUID(),
          offsetDays: [],
          notifyAssignee: true,
          graceHours: 24,
          mandatory: false,
          escalateAfterMissed: null,
          isDefault: false,
          active: true,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        followUpRules.push(row);
        return Promise.resolve(row);
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<FollowUpRuleRow> }) => {
        const row = followUpRules.find((item) => item.id === where.id);
        if (!row) throw new Error('rule not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve(row);
      },

      updateMany: ({ where, data }: { where: unknown; data: Partial<FollowUpRuleRow> }) => {
        const matched = followUpRules.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: matched.length });
      },
    },

    followUp: {
      createMany: ({
        data,
        skipDuplicates,
      }: {
        data: (Partial<FollowUpRow> & { proposalId: string; sequence: number })[];
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const input of data) {
          const clash = followUps.some(
            (row) => row.proposalId === input.proposalId && row.sequence === input.sequence,
          );
          // Mirrors the (proposalId, sequence) unique constraint, which is what
          // makes re-submitting a proposal safe.
          if (clash) {
            if (skipDuplicates) continue;
            throw uniqueViolation('follow_ups_proposalId_sequence_key');
          }

          followUps.push({ ...blankFollowUp(), ...input });
          count += 1;
        }
        return Promise.resolve({ count });
      },

      /** How a hand-raised follow-up is written. */
      create: ({ data }: { data: Partial<FollowUpRow> & { leadId: string } }) => {
        const row: FollowUpRow = { ...blankFollowUp(), ...data };
        followUps.push(row);
        return Promise.resolve(withFollowUpRelations(row));
      },

      findMany: ({
        where,
        orderBy,
        take,
      }: {
        where?: unknown;
        orderBy?: { dueAt?: 'asc' | 'desc' };
        take?: number;
      } = {}) => {
        const matched = followUps
          .map(withFollowUpRelations)
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
          .sort((a, b) =>
            orderBy?.dueAt === 'desc'
              ? b.dueAt.getTime() - a.dueAt.getTime()
              : a.dueAt.getTime() - b.dueAt.getTime(),
          );
        return Promise.resolve(matched.slice(0, take ?? undefined));
      },

      findFirst: ({ where }: { where?: unknown } = {}) => {
        const matched = followUps
          .map(withFollowUpRelations)
          .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where))
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
        return Promise.resolve(matched[0] ?? null);
      },

      findUnique: ({ where }: { where: { id: string } }) => {
        const row = followUps.find((item) => item.id === where.id);
        return Promise.resolve(row ? withFollowUpRelations(row) : null);
      },

      count: ({ where }: { where?: unknown } = {}) =>
        Promise.resolve(
          followUps
            .map(withFollowUpRelations)
            .filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where)).length,
        ),

      update: ({ where, data }: { where: { id: string }; data: Partial<FollowUpRow> }) => {
        const row = followUps.find((item) => item.id === where.id);
        if (!row) throw new Error('follow-up not found');
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        }
        row.updatedAt = new Date();
        return Promise.resolve(withFollowUpRelations(row));
      },

      updateMany: ({ where, data }: { where: unknown; data: Partial<FollowUpRow> }) => {
        const matched = followUps.filter((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where),
        );
        for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: matched.length });
      },
    },

    notification: {
      create: ({ data }: { data: Partial<NotificationRow> & { dedupeKey: string } }) => {
        // The real unique index is what makes "one email per event" true, so
        // the stub has to refuse duplicates the same way — with an error the
        // service will actually recognise.
        if (notifications.some((row) => row.dedupeKey === data.dedupeKey)) {
          throw uniqueViolation('notifications_dedupeKey_key');
        }

        const row: NotificationRow = {
          id: randomUUID(),
          type: 'FOLLOW_UP_DUE',
          status: 'PENDING',
          recipientId: null,
          recipientEmail: '',
          subject: '',
          body: '',
          sentAt: null,
          error: null,
          ...data,
          createdAt: new Date(),
        };
        notifications.push(row);
        return Promise.resolve(row);
      },

      update: ({ where, data }: { where: { id: string }; data: Partial<NotificationRow> }) => {
        const row = notifications.find((item) => item.id === where.id);
        if (!row) throw new Error('notification not found');
        Object.assign(row, data);
        return Promise.resolve(row);
      },

      findMany: ({ take }: { take?: number } = {}) =>
        Promise.resolve(
          [...notifications]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, take ?? undefined),
        ),
    },

    companyProfile: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(companyProfiles.find((row) => row.id === where.id) ?? null),

      upsert: ({
        where,
        create,
        update,
      }: {
        where: { id: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = companyProfiles.find((row) => row.id === where.id);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return Promise.resolve(existing);
        }
        const row = { ...create, id: where.id, updatedAt: new Date() } as Record<string, unknown>;
        companyProfiles.push(row);
        return Promise.resolve(row);
      },
    },

    documentTemplate: {
      findUnique: ({ where }: { where: { kind: string } }) =>
        Promise.resolve(documentTemplates.find((row) => row.kind === where.kind) ?? null),

      upsert: ({
        where,
        create,
        update,
      }: {
        where: { kind: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = documentTemplates.find((row) => row.kind === where.kind);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return Promise.resolve(existing);
        }
        const row = {
          ...create,
          id: randomUUID(),
          kind: where.kind,
          updatedAt: new Date(),
        } as Record<string, unknown>;
        documentTemplates.push(row);
        return Promise.resolve(row);
      },
    },

    smtpSettings: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(smtpSettings.find((row) => row.id === where.id) ?? null),

      upsert: ({
        where,
        update,
        create,
      }: {
        where: { id: string };
        update: Partial<SmtpSettingsRow>;
        create: Partial<SmtpSettingsRow> & { id: string };
      }) => {
        const existing = smtpSettings.find((row) => row.id === where.id);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return Promise.resolve(existing);
        }

        const row = {
          security: 'STARTTLS',
          active: true,
          ...create,
          updatedAt: new Date(),
        } as SmtpSettingsRow;
        smtpSettings.push(row);
        return Promise.resolve(row);
      },
    },

    integrationToken: {
      findUnique: ({ where }: { where: { provider: string } }) =>
        Promise.resolve(integrationTokens.find((row) => row.provider === where.provider) ?? null),

      upsert: ({
        where,
        update,
        create,
      }: {
        where: { provider: string };
        update: Partial<IntegrationTokenRow>;
        create: Omit<IntegrationTokenRow, 'updatedAt'>;
      }) => {
        const existing = integrationTokens.find((row) => row.provider === where.provider);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return Promise.resolve(existing);
        }

        const row: IntegrationTokenRow = { ...create, updatedAt: new Date() };
        integrationTokens.push(row);
        return Promise.resolve(row);
      },
    },

    quoteItem: {
      deleteMany: ({ where }: { where: { quoteId: string } }) => {
        const remaining = quoteItems.filter((item) => item.quoteId !== where.quoteId);
        const removed = quoteItems.length - remaining.length;
        quoteItems.length = 0;
        quoteItems.push(...remaining);
        return Promise.resolve({ count: removed });
      },
    },
  };

  function withExpenseRelations(row: ExpenseRow) {
    return {
      ...row,
      category: expenseCategories.find((item) => item.id === row.categoryId) ?? null,
      paidBy: users.find((item) => item.id === row.paidById) ?? null,
      createdBy: users.find((item) => item.id === row.createdById) ?? null,
    };
  }

  function withInvoiceRelations(row: InvoiceRow) {
    return {
      ...row,
      lead: leads.find((item) => item.id === row.leadId) ?? null,
      customer: customers.find((item) => item.id === row.customerId) ?? null,
      proposal: proposals.find((item) => item.id === row.proposalId) ?? null,
      createdBy: users.find((item) => item.id === row.createdById) ?? null,
      payments: payments
        .filter((item) => item.invoiceId === row.id)
        .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
        .map((payment) => ({
          ...payment,
          recordedBy: users.find((item) => item.id === payment.recordedById) ?? null,
        })),
    };
  }

  function withFollowUpRelations(row: FollowUpRow) {
    const lead = leads.find((item) => item.id === row.leadId);
    const proposal = proposals.find((item) => item.id === row.proposalId);
    const invoice = invoices.find((item) => item.id === row.invoiceId);
    return {
      ...row,
      assignedTo: users.find((item) => item.id === row.assignedToId) ?? null,
      completedBy: users.find((item) => item.id === row.completedById) ?? null,
      lead: lead
        ? { ...lead, customer: customers.find((item) => item.id === lead.customerId) ?? null }
        : null,
      proposal: proposal
        ? {
            ...proposal,
            versions: proposalVersions
              .filter((item) => item.proposalId === proposal.id)
              .sort((a, b) => b.version - a.version)
              .slice(0, 1),
          }
        : null,
      invoice: invoice ? { ...invoice, payments: paymentsFor(invoice.id) } : null,
    };
  }

  function paymentsFor(invoiceId: string) {
    return payments.filter((payment) => payment.invoiceId === invoiceId);
  }

  function addVersion(
    proposalId: string,
    input: Partial<ProposalVersionRow> & { version: number },
  ): void {
    proposalVersions.push({
      id: randomUUID(),
      proposalId,
      title: '',
      destination: null,
      travelStart: null,
      travelEnd: null,
      adults: null,
      children: null,
      executiveSummary: null,
      itinerary: null,
      inclusions: null,
      exclusions: null,
      hotelInfo: null,
      transportInfo: null,
      activities: null,
      terms: null,
      validUntil: new Date(),
      currency: 'INR',
      sellingPrice: 0,
      actualCost: 0,
      pdfPath: null,
      createdById: null,
      ...input,
      createdAt: new Date(),
    });
  }

  /**
   * A customer with the leads and invoices the book reads. `scope` is the
   * include's own `where`, so an employee's lead count covers their leads only.
   */
  function withCustomerRelations(row: CustomerRow, scope?: unknown) {
    const theirLeads = leads
      .filter((lead) => lead.customerId === row.id)
      .filter((lead) =>
        scope === undefined
          ? true
          : matchesWhere(withLeadRelations(lead) as unknown as Record<string, unknown>, scope),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((lead) => ({
        ...lead,
        assignedTo: users.find((item) => item.id === lead.assignedToId) ?? null,
      }));

    return {
      ...row,
      leads: theirLeads,
      invoices: invoices
        .filter((invoice) => invoice.customerId === row.id)
        .sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime())
        .map((invoice) => ({
          ...invoice,
          payments: payments.filter((payment) => payment.invoiceId === invoice.id),
        })),
    };
  }

  function withProposalRelations(row: ProposalRow) {
    const lead = leads.find((item) => item.id === row.leadId);
    return {
      ...row,
      lead: lead
        ? { ...lead, customer: customers.find((item) => item.id === lead.customerId) ?? null }
        : null,
      createdBy: users.find((item) => item.id === row.createdById) ?? null,
      submittedBy: users.find((item) => item.id === row.submittedById) ?? null,
      // What the service reads to answer "has this been billed?" and
      // "may a follow-up be added?".
      invoices: invoices.filter((item) => item.proposalId === row.id),
      followUps: followUps.filter((item) => item.proposalId === row.id),
      // Newest first, matching the `orderBy: { version: 'desc' }` in the include.
      versions: proposalVersions
        .filter((item) => item.proposalId === row.id)
        .sort((a, b) => b.version - a.version)
        .map((version) => ({
          ...version,
          createdBy: users.find((item) => item.id === version.createdById) ?? null,
        })),
    };
  }

  function withLeadRelations(row: LeadRow) {
    return {
      ...row,
      customer: customers.find((item) => item.id === row.customerId) ?? null,
      assignedTo: users.find((item) => item.id === row.assignedToId) ?? null,
      createdBy: users.find((item) => item.id === row.createdById) ?? null,
    };
  }

  function withQuoteItems(row: QuoteRow) {
    return {
      ...row,
      items: quoteItems
        .filter((item) => item.quoteId === row.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  return stub;
}

export type PrismaStub = ReturnType<typeof createPrismaStub>;
