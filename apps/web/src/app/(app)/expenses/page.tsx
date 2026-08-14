import { EmptyState, PageContainer } from '@travel-crm/ui';
import type { Metadata } from 'next';

import { requireUser } from '@/features/auth/require-user';
import { ExpensesWorkspace } from '@/features/expenses/expenses-workspace';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage() {
  const user = await requireUser();

  // The API refuses an employee on every expense route; this is so they get a
  // sentence rather than a screen of failed requests.
  if (user.role !== 'ADMIN') {
    return (
      <PageContainer title="Expenses">
        <EmptyState
          title="Not available"
          description="Company expenses are visible to administrators only."
        />
      </PageContainer>
    );
  }

  return <ExpensesWorkspace />;
}
