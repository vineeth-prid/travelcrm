import type { ReactNode } from 'react';

import { AppHeader } from '@/components/app-shell/app-header';
import { AppSidebar } from '@/components/app-shell/app-sidebar';
import { MobileNav } from '@/components/app-shell/mobile-nav';
import { PageTransition } from '@/components/page-transition';
import { requireUser } from '@/features/auth/require-user';
import { SessionProvider } from '@/features/auth/session-context';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <SessionProvider user={user}>
      <div className="flex min-h-screen">
        <div className="hidden lg:block">
          <AppSidebar />
        </div>
        <MobileNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
