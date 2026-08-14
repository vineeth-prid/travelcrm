import type {
  Customer as CustomerRecord,
  Invoice as InvoiceRecord,
  Lead as LeadRecord,
  Payment as PaymentRecord,
  Proposal as ProposalRecord,
} from '@prisma/client';
import { paymentStatusOf, type Invoice, type Payment } from '@travel-crm/sdk';

import { toDateOnly } from '../leads/leads.mappers';
import { toUserSummary, userSummarySelect, type UserSummaryRecord } from '../users/users.service';

/** What every invoice query selects. */
export const invoiceInclude = {
  lead: true,
  customer: true,
  proposal: true,
  createdBy: { select: userSummarySelect },
  payments: {
    include: { recordedBy: { select: userSummarySelect } },
    orderBy: { paidAt: 'asc' },
  },
} as const;

export type PaymentWithRecorder = PaymentRecord & { recordedBy: UserSummaryRecord | null };

export type InvoiceWithRelations = InvoiceRecord & {
  lead: LeadRecord;
  customer: CustomerRecord;
  proposal: ProposalRecord | null;
  createdBy: UserSummaryRecord | null;
  payments: PaymentWithRecorder[];
};

export function toPayment(record: PaymentWithRecorder): Payment {
  return {
    id: record.id,
    reference: record.reference,
    invoiceId: record.invoiceId,
    paidAt: toDateOnly(record.paidAt) ?? '',
    amount: record.amount,
    method: record.method,
    externalReference: record.externalReference,
    notes: record.notes,
    recordedBy: record.recordedBy ? toUserSummary(record.recordedBy) : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Total received against an invoice. */
export function amountPaidOn(payments: { amount: number }[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

export function toInvoice(record: InvoiceWithRelations): Invoice {
  const amountPaid = amountPaidOn(record.payments);
  const dueDate = toDateOnly(record.dueDate) ?? '';

  return {
    id: record.id,
    reference: record.reference,
    leadId: record.leadId,
    leadReference: record.lead.reference,
    customerId: record.customerId,
    proposalId: record.proposalId,
    proposalReference: record.proposal?.reference ?? null,

    status: record.status,
    issueDate: toDateOnly(record.issueDate) ?? '',
    dueDate,

    packageTitle: record.packageTitle,
    destination: record.destination,
    travelStart: toDateOnly(record.travelStart),
    travelEnd: toDateOnly(record.travelEnd),
    description: record.description,

    currency: record.currency,
    // The stored figures, not recomputed: an issued document must keep the
    // numbers it was issued with even if a tax rate changes later.
    totals: {
      packageAmount: record.packageAmount,
      discountAmount: record.discountAmount,
      netAmount: record.packageAmount - record.discountAmount,
      taxRateBps: record.taxRateBps,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
    },

    billingName: record.billingName,
    billingAddress: record.billingAddress,
    billingEmail: record.billingEmail,
    billingPhone: record.billingPhone,
    billingTaxId: record.billingTaxId,

    paymentTerms: record.paymentTerms,
    notes: record.notes,

    amountPaid,
    outstanding: Math.max(0, record.totalAmount - amountPaid),
    // Derived, so "overdue" is true the moment it becomes true rather than
    // whenever a job last ran.
    paymentStatus: paymentStatusOf({
      totalAmount: record.totalAmount,
      amountPaid,
      dueDate,
      status: record.status,
    }),
    payments: record.payments.map(toPayment),

    hasPdf: record.pdfPath !== null,
    createdBy: record.createdBy ? toUserSummary(record.createdBy) : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
