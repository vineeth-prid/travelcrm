import type { Quote as QuoteRow, QuoteItem as QuoteItemRow } from '@prisma/client';
import type { Quote, QuoteItem } from '@travel-crm/sdk';

export type QuoteWithItems = QuoteRow & { items: QuoteItemRow[] };

function toQuoteItem(row: QuoteItemRow): QuoteItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
    sortOrder: row.sortOrder,
  };
}

export function toQuote(row: QuoteWithItems): Quote {
  return {
    id: row.id,
    conversationId: row.conversationId,
    version: row.version,
    status: row.status,
    title: row.title,
    currency: row.currency,
    totalAmount: row.totalAmount,
    // A date, not a moment: the browser's date input expects YYYY-MM-DD.
    validUntil: row.validUntil.toISOString().slice(0, 10),
    notes: row.notes,
    hasPdf: row.pdfPath !== null,
    sentAt: row.sentAt?.toISOString() ?? null,
    items: [...row.items].sort((a, b) => a.sortOrder - b.sortOrder).map(toQuoteItem),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
