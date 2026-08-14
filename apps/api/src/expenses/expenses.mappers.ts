import type {
  Expense as ExpenseRecord,
  ExpenseCategory as ExpenseCategoryRecord,
} from '@prisma/client';
import type { Expense, ExpenseCategory } from '@travel-crm/sdk';

import { toDateOnly } from '../leads/leads.mappers';
import { toUserSummary, userSummarySelect, type UserSummaryRecord } from '../users/users.service';

export const expenseInclude = {
  category: true,
  paidBy: { select: userSummarySelect },
  createdBy: { select: userSummarySelect },
} as const;

export type ExpenseWithRelations = ExpenseRecord & {
  category: ExpenseCategoryRecord;
  paidBy: UserSummaryRecord | null;
  createdBy: UserSummaryRecord | null;
};

export function toExpenseCategory(record: ExpenseCategoryRecord): ExpenseCategory {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    active: record.active,
    sortOrder: record.sortOrder,
  };
}

export function toExpense(record: ExpenseWithRelations): Expense {
  return {
    id: record.id,
    reference: record.reference,
    spentAt: toDateOnly(record.spentAt) ?? '',
    category: toExpenseCategory(record.category),
    description: record.description,
    amount: record.amount,
    currency: record.currency,
    paidBy: record.paidBy ? toUserSummary(record.paidBy) : null,
    method: record.method,
    vendor: record.vendor,
    externalReference: record.externalReference,
    // The path is never exposed: a client that knew the object key could try
    // to reach around the authorisation check on the download endpoint.
    hasReceipt: record.receiptPath !== null,
    receiptName: record.receiptName,
    notes: record.notes,
    createdBy: record.createdBy ? toUserSummary(record.createdBy) : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** "Marketing budget" → "marketing-budget", for a stable category slug. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'category'
  );
}
