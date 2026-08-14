'use client';

import { Drawer } from '@travel-crm/ui';

import { useUiStore } from '@/stores/ui-store';
import { AppSidebar } from './app-sidebar';

export function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <Drawer
      open={mobileNavOpen}
      onOpenChange={setMobileNavOpen}
      side="left"
      title="Tour De India Holidays"
      description="Main navigation"
      className="max-w-64 lg:hidden"
    >
      <div className="-m-6 h-full">
        <AppSidebar showBrand={false} onNavigate={() => setMobileNavOpen(false)} />
      </div>
    </Drawer>
  );
}
