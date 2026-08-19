'use client';

import { Sidebar, SidebarNavItem, SidebarSection } from '@travel-crm/ui';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useSession } from '@/features/auth/session-context';
import { publicEnv } from '@/lib/env';
import { visibleSections, type NavItem } from './nav-items';

interface AppSidebarProps {
  onNavigate?: () => void;
  /** The mobile drawer supplies its own title, so the brand is hidden there. */
  showBrand?: boolean;
}

/** `/leads` must not light up while `/leads-something-else` is open. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate, showBrand = true }: AppSidebarProps) {
  const pathname = usePathname();
  const user = useSession();
  const sections = visibleSections(user.role === 'ADMIN');

  const renderItem = ({ label, href, icon: Icon, soon }: NavItem) =>
    soon ? (
      <SidebarNavItem key={href} disabled hint="Soon">
        <Icon aria-hidden />
        {label}
      </SidebarNavItem>
    ) : (
      <SidebarNavItem key={href} asChild active={isActive(pathname, href)}>
        <Link href={href} onClick={onNavigate}>
          <Icon aria-hidden />
          {label}
        </Link>
      </SidebarNavItem>
    );

  return (
    <Sidebar
      className="w-full border-r-0 lg:w-60 lg:border-r"
      brand={
        showBrand ? (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            // Centred over the navigation rather than tucked into the corner,
            // and half again as large: at h-9 in the top-left it read as a
            // favicon rather than the company's mark.
            className="flex items-center justify-center rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/brand/tour-de-india-logo-transparent.png"
              alt="Tour De India Holidays"
              width={640}
              height={414}
              priority
              className="h-14 w-auto"
            />
          </Link>
        ) : null
      }
      footer={
        <p className="px-3 text-xs text-muted-foreground">
          v{publicEnv.appVersion} · build {publicEnv.buildNumber}
        </p>
      }
    >
      {sections.map((section) =>
        section.label ? (
          <SidebarSection key={section.label} label={section.label}>
            {section.items.map(renderItem)}
          </SidebarSection>
        ) : (
          // Unlabelled groups are rendered flat, not wrapped in a section.
          section.items.map(renderItem)
        ),
      )}
    </Sidebar>
  );
}
