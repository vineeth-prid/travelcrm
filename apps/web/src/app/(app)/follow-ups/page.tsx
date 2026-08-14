import type { Metadata } from 'next';

import { requireUser } from '@/features/auth/require-user';
import { FollowUpsWorkspace } from '@/features/follow-ups/follow-ups-workspace';

export const metadata: Metadata = { title: 'Follow-ups' };

export default async function FollowUpsPage() {
  const user = await requireUser();

  // The schedules are admin configuration; the list itself is everybody's.
  return <FollowUpsWorkspace showRules={user.role === 'ADMIN'} />;
}
