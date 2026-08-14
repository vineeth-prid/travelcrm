import { PageContainer } from '@travel-crm/ui';
import type { Metadata } from 'next';

import { requireUser } from '@/features/auth/require-user';
import { AuditPanel } from '@/features/settings/audit-panel';
import { EmailLog } from '@/features/settings/email-log';
import { ExportPanel } from '@/features/settings/export-panel';
import { PasswordForm } from '@/features/settings/password-form';
import { ProfileForm } from '@/features/settings/profile-form';
import { SmtpForm } from '@/features/settings/smtp-form';
import { UsersPanel } from '@/features/settings/users-panel';
import { AiStatusCard } from '@/features/system/ai-status';
import { CompanyInformation } from '@/features/system/company-information';
import { SystemInformation } from '@/features/system/system-information';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <PageContainer
      title="Settings"
      description="Manage your account and review how the workspace is running."
      /* Wider than a settings page usually needs, because the admin panels
         below carry tables. */
      width={user.role === 'ADMIN' ? 'default' : 'narrow'}
    >
      <div className="flex flex-col gap-6">
        <ProfileForm />
        <PasswordForm />
        <CompanyInformation />
        {/* Hidden for employees as a courtesy; the API refuses them regardless. */}
        {user.role === 'ADMIN' ? (
          <>
            <UsersPanel />
            <SmtpForm />
            <EmailLog />
            <ExportPanel />
            <AuditPanel />
          </>
        ) : null}
        <AiStatusCard />
        <SystemInformation />
      </div>
    </PageContainer>
  );
}
