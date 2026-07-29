import { PageContainer } from '@travel-crm/ui';
import type { Metadata } from 'next';

import { PasswordForm } from '@/features/settings/password-form';
import { ProfileForm } from '@/features/settings/profile-form';
import { CompanyInformation } from '@/features/system/company-information';
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
        <CompanyInformation />
        <SystemInformation />
      </div>
    </PageContainer>
  );
}
