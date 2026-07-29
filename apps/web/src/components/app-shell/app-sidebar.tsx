'use client';

import { Sidebar, SidebarNavItem } from '@travel-crm/ui';
import { Plane } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { publicEnv } from '@/lib/env';
import { navItems } from './nav-items';

interface AppSidebarProps {
  onNavigate?: () => void;
  /** The mobile drawer supplies its own title, so the brand is hidden there. */
  showBrand?: boolean;
}

export function AppSidebar({ onNavigate, showBrand = true }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar
      className="w-full border-r-0 lg:w-60 lg:border-r"
      brand={
        showBrand ? (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Plane className="size-4" aria-hidden />
            </span>
            Travel CRM
          </Link>
        ) : null
      }
      footer={
        <p className="px-3 text-xs text-muted-foreground">
          v{publicEnv.appVersion} · build {publicEnv.buildNumber}
        </p>
      }
    >
      {navItems.map(({ label, href, icon: Icon }) => (
        <SidebarNavItem key={href} asChild active={pathname.startsWith(href)}>
          <Link href={href} onClick={onNavigate}>
            <Icon aria-hidden />
            {label}
          </Link>
        </SidebarNavItem>
      ))}
    </Sidebar>
  );
}
