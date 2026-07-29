'use client';

import { Button, Header, SearchBox } from '@travel-crm/ui';
import { Menu } from 'lucide-react';

import { useUiStore } from '@/stores/ui-store';
import { UserMenu } from './user-menu';

export function AppHeader() {
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);

  return (
    <Header
      leading={
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu aria-hidden />
        </Button>
      }
      trailing={<UserMenu />}
    >
      {/* Nothing is searchable until the CRM module lands in Phase 2. */}
      <SearchBox
        className="max-w-sm"
        placeholder="Search…"
        disabled
        title="Search becomes available with the CRM module"
      />
    </Header>
  );
}
