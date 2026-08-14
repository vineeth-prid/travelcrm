import type { InvoiceStatus, PaymentMethod, PaymentStatus } from '@travel-crm/sdk';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  CANCELLED: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
};

export const PAYMENT_STATUS_VARIANTS: Record<
  PaymentStatus,
  'neutral' | 'warning' | 'success' | 'danger'
> = {
  UNPAID: 'neutral',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CASH: 'Cash',
  CARD: 'Card',
  OTHER: 'Other',
};

/** Basis points to something a person reads: 1800 → "18%", 750 → "7.5%". */
export function formatTaxRate(bps: number | null): string {
  if (bps === null || bps === 0) return 'No tax';
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0+$/, '')}%`;
}
