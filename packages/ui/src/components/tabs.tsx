'use client';

import * as React from 'react';

import { cn } from '../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  /** Shown after the label, e.g. a count. */
  badge?: React.ReactNode;
}

export interface TabsProps {
  /** Readonly so a caller can declare its tabs `as const` and keep the ids typed. */
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * A row of tabs.
 *
 * Hand-rolled rather than another Radix dependency: this is a list of buttons
 * and a roving `aria-selected`, and the arrow-key behaviour below is the only
 * thing Radix would have added.
 *
 * The panels are not rendered here — the caller decides what belongs under the
 * selected tab, which keeps this usable for a detail page whose sections are
 * whole components.
 */
export function Tabs({ items, value, onValueChange, className, ...props }: TabsProps) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (from: string, delta: number) => {
    const index = items.findIndex((item) => item.id === from);
    if (index < 0) return;

    const next = items[(index + delta + items.length) % items.length]!;
    onValueChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={props['aria-label']}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-border pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;

        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(item.id, 1);
              if (event.key === 'ArrowLeft') move(item.id, -1);
            }}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {item.label}
            {item.badge === undefined ? null : (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs',
                  selected ? 'bg-primary-subtle text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
