import type { Metadata } from 'next';

import { requireUser } from '@/features/auth/require-user';
import { SettingsWorkspace } from '@/features/settings/settings-workspace';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();

  // Which sections exist is decided here; the API refuses the admin-only ones
  // regardless of what the navigation shows.
  return <SettingsWorkspace isAdmin={user.role === 'ADMIN'} />;
}
