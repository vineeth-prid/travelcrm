import type { Metadata } from 'next';

import { CustomersWorkspace } from '@/features/customers/customers-workspace';

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage() {
  return <CustomersWorkspace />;
}
