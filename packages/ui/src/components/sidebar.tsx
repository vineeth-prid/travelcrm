'use client';

import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import { cn } from '../lib/cn';

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  brand?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Sidebar({ brand, footer, className, children, ...props }: SidebarProps) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface',
        className,
      )}
      {...props}
    >
      {brand ? (
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">{brand}</div>
      ) : null}
      <div className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-0.5">{children}</ul>
      </div>
      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </nav>
  );
}

export function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="mt-4 first:mt-0">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </li>
  );
}

export interface SidebarNavItemProps extends React.HTMLAttributes<HTMLElement> {
  active?: boolean;
  disabled?: boolean;
  /** Render the child (e.g. a Next.js <Link>) instead of an <a>. */
  asChild?: boolean;
  /** Text shown at the trailing edge, e.g. "Soon". */
  hint?: string;
}

export function SidebarNavItem({
  active = false,
  disabled = false,
  asChild = false,
  hint,
  className,
  children,
  ...props
}: SidebarNavItemProps) {
  const classes = cn(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    disabled
      ? 'cursor-not-allowed text-muted-foreground/60'
      : active
        ? 'bg-primary-subtle text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    className,
  );

  const content = (
    <>
      {children}
      {hint ? (
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <li>
        <span className={classes} aria-disabled="true" {...props}>
          {content}
        </span>
      </li>
    );
  }

  const Comp = asChild ? Slot : 'a';

  return (
    <li>
      <Comp className={classes} aria-current={active ? 'page' : undefined} {...props}>
        {asChild ? children : content}
      </Comp>
    </li>
  );
}
