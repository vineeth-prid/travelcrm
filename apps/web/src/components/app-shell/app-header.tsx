'use client';

import { Button, Header } from '@travel-crm/ui';
import { Menu } from 'lucide-react';

import { useUiStore } from '@/stores/ui-store';
import { GlobalSearch } from './global-search';
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
      <GlobalSearch />
    </Header>
  );
}
