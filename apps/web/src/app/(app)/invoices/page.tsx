import type { Metadata } from 'next';

import { InvoicesWorkspace } from '@/features/invoices/invoices-workspace';

export const metadata: Metadata = { title: 'Invoices' };

export default function InvoicesPage() {
  return <InvoicesWorkspace />;
}
