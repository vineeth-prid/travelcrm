/**
 * In-memory stand-in for PrismaService, covering exactly the queries the API
 * issues. It lets the smoke tests boot the real application without a database.
 */
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

export const ADMIN_PASSWORD = 'CorrectHorse1';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
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

export function createPrismaStub() {
  const users: UserRow[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ada Lovelace',
      email: 'admin@travelcrm.test',
      password: bcrypt.hashSync(ADMIN_PASSWORD, 4),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const contacts: ContactRow[] = [];
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
    // isolate in a single-threaded stub.
    $transaction: <T>(work: (tx: typeof stub) => Promise<T>): Promise<T> => work(stub),

    user: {
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
