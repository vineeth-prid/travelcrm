import { Card, CardContent, CardHeader, CardTitle, PageContainer } from '@travel-crm/ui';
import type { Metadata } from 'next';

import { ProfileForm } from '@/features/settings/profile-form';
import { PasswordForm } from '@/features/settings/password-form';
import { ApiStatusCard } from '@/features/system/api-status-card';
import { SystemInformation } from '@/features/system/system-information';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <PageContainer
      title="Settings"
      description="Manage your account and review how the workspace is running."
      width="narrow"
    >
      <div className="flex flex-col gap-6">
        <ProfileForm />
        <PasswordForm />

        <section aria-labelledby="application-information">
          <h2 id="application-information" className="sr-only">
            Application information
          </h2>
          <SystemInformation />
        </section>

        <ApiStatusCard />

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Travel CRM is the operations workspace for your travel business. This is Phase 1 — the
              foundation: authentication, the application shell and the design system.
            </p>
            <p>
              The unified inbox, CRM and quotation modules arrive in later phases and already have
              their places reserved in the navigation.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
