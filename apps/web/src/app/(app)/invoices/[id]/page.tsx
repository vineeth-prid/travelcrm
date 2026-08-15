import type { Metadata } from 'next';

import { InvoiceDetail } from '@/features/invoices/invoice-detail';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetail invoiceId={id} />;
}
