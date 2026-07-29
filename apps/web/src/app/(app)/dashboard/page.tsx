import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageContainer,
} from '@travel-crm/ui';
import { Activity, ArrowUpRight, BookOpen, Settings, TerminalSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { requireUser } from '@/features/auth/require-user';
import { StatusCards } from '@/features/system/status-cards';
import { SystemInformation } from '@/features/system/system-information';
import { publicEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Dashboard' };

const quickLinks = [
  {
    label: 'API documentation',
    description: 'Swagger UI for every endpoint',
    href: publicEnv.apiUrl.replace(/\/api\/v1\/?$/, '/docs'),
    icon: TerminalSquare,
    external: true,
  },
  {
    label: 'Settings',
    description: 'Profile, password and application details',
    href: '/settings',
    icon: Settings,
    external: false,
  },
  {
    label: 'Health check',
    description: 'Live API and database status',
    href: `${publicEnv.apiUrl}/health`,
    icon: Activity,
    external: true,
  },
];

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <PageContainer
      title={`Welcome back, ${user.name.split(' ')[0]}`}
      description="A quick look at the state of your workspace."
    >
      <div className="flex flex-col gap-6">
        <StatusCards />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<BookOpen aria-hidden />}
                title="Nothing here yet"
                description="Conversations, quotes and bookings will appear here as the workspace fills up."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {quickLinks.map(({ label, description, href, icon: Icon, external }) => (
                <Link
                  key={label}
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {description}
                    </span>
                  </span>
                  {external ? (
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <SystemInformation />
      </div>
    </PageContainer>
  );
}
