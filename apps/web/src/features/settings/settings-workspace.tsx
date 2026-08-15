'use client';

import { PageContainer } from '@travel-crm/ui';
import { Building2, FileText, History, Mail, ScrollText, Server, User, Users } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';

import { AiStatusCard } from '@/features/system/ai-status';
import { CompanyInformation } from '@/features/system/company-information';
import { SystemInformation } from '@/features/system/system-information';

import { AuditPanel } from './audit-panel';
import { CompanyForm } from './company-form';
import { EmailLog } from './email-log';
import { ExportPanel } from './export-panel';
import { PasswordForm } from './password-form';
import { ProfileForm } from './profile-form';
import { SmtpForm } from './smtp-form';
import { TemplateForm } from './template-form';
import { UsersPanel } from './users-panel';

interface Section {
  id: string;
  label: string;
  icon: ComponentType<{ 'aria-hidden'?: boolean }>;
  adminOnly?: boolean;
  render: () => ReactNode;
}

/**
 * Settings, one section at a time.
 *
 * Everything used to be stacked on a single page, which by the time it held
 * users, mail, exports and the audit trail meant scrolling past four screens
 * to change a password.
 */
const SECTIONS: Section[] = [
  {
    id: 'account',
    label: 'Your account',
    icon: User,
    render: () => (
      <>
        <ProfileForm />
        <PasswordForm />
      </>
    ),
  },
  {
    id: 'company',
    label: 'Company',
    icon: Building2,
    render: () => (
      <>
        <CompanyForm />
        <CompanyInformation />
      </>
    ),
  },
  {
    id: 'proposal-template',
    label: 'Proposal template',
    icon: FileText,
    adminOnly: true,
    render: () => <TemplateForm kind="PROPOSAL" />,
  },
  {
    id: 'invoice-template',
    label: 'Invoice template',
    icon: ScrollText,
    adminOnly: true,
    render: () => <TemplateForm kind="INVOICE" />,
  },
  {
    id: 'users',
    label: 'Users & roles',
    icon: Users,
    adminOnly: true,
    render: () => <UsersPanel />,
  },
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    adminOnly: true,
    render: () => (
      <>
        <SmtpForm />
        <EmailLog />
      </>
    ),
  },
  {
    id: 'audit',
    label: 'Audit & exports',
    icon: History,
    adminOnly: true,
    render: () => (
      <>
        <ExportPanel />
        <AuditPanel />
      </>
    ),
  },
  {
    id: 'system',
    label: 'System',
    icon: Server,
    render: () => (
      <>
        <AiStatusCard />
        <SystemInformation />
      </>
    ),
  },
];

export function SettingsWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const sections = SECTIONS.filter((section) => isAdmin || !section.adminOnly);
  const [active, setActive] = useState(sections[0]!.id);
  const current = sections.find((section) => section.id === active) ?? sections[0]!;

  return (
    <PageContainer
      title="Settings"
      description="Manage your account, your company's documents and how the workspace runs."
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav aria-label="Settings sections" className="lg:w-56 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((section) => {
              const Icon = section.icon;
              const selected = section.id === current.id;

              return (
                <li key={section.id}>
                  <button
                    type="button"
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => setActive(section.id)}
                    className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? 'bg-primary-subtle font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon aria-hidden />
                    {section.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">{current.render()}</div>
      </div>
    </PageContainer>
  );
}
