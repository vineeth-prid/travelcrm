import type { Metadata } from 'next';

import { requireUser } from '@/features/auth/require-user';
import { AdminDashboard } from '@/features/reports/admin-dashboard';
import { EmployeeDashboard } from '@/features/reports/employee-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();

  // Two genuinely different pages rather than one with half of it blanked out:
  // company revenue, margin and expenses are not an employee's to see, and a
  // dashboard full of hidden panels is worse than one built for the reader.
  return user.role === 'ADMIN' ? (
    <AdminDashboard name={user.name} />
  ) : (
    <EmployeeDashboard name={user.name} />
  );
}
