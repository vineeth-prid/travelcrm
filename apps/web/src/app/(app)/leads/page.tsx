import type { Metadata } from 'next';

import { LeadsWorkspace } from '@/features/leads/leads-workspace';

export const metadata: Metadata = { title: 'Leads' };

export default function LeadsPage() {
  return <LeadsWorkspace />;
}
