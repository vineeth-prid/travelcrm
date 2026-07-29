import * as React from 'react';

import { cn } from '../lib/cn';

export interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Leading slot — mobile menu trigger, breadcrumbs, … */
  leading?: React.ReactNode;
  /** Trailing slot — user menu, actions, … */
  trailing?: React.ReactNode;
}

export function Header({ leading, trailing, className, children, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80',
        className,
      )}
      {...props}
    >
      {leading}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing ? <div className="flex items-center gap-2">{trailing}</div> : null}
    </header>
  );
}
