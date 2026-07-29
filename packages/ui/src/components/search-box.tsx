'use client';

import { Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Input, type InputProps } from './input';

export interface SearchBoxProps extends Omit<InputProps, 'icon' | 'type'> {
  /** Shown on the right of the field, e.g. "⌘K". */
  shortcutHint?: string;
}

export const SearchBox = React.forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { className, placeholder = 'Search…', shortcutHint, ...props },
  ref,
) {
  return (
    <div className="relative">
      <Input
        ref={ref}
        type="search"
        role="searchbox"
        aria-label={props['aria-label'] ?? 'Search'}
        placeholder={placeholder}
        icon={<Search aria-hidden />}
        className={cn(shortcutHint && 'pr-14', className)}
        {...props}
      />
      {shortcutHint ? (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {shortcutHint}
        </kbd>
      ) : null}
    </div>
  );
});
