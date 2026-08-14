import type { Metadata } from 'next';

import { requireUser } from '@/features/auth/require-user';
import { PerformanceWorkspace } from '@/features/reports/performance-workspace';

export const metadata: Metadata = { title: 'Performance' };

export default async function PerformancePage() {
  const user = await requireUser();

  // Open to everyone: the API gives an employee exactly their own row, with
  // margin withheld unless they have been given permission to see it.
  return <PerformanceWorkspace isAdmin={user.role === 'ADMIN'} />;
}
