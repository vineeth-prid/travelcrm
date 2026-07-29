'use client';

import * as React from 'react';

import { cn } from '../lib/cn';

export const inputClassName =
  'flex h-9 w-full rounded-lg border border-border bg-surface px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional leading icon, rendered inside the field. */
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', icon, ...props },
  ref,
) {
  if (!icon) {
    return <input ref={ref} type={type} className={cn(inputClassName, className)} {...props} />;
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <input ref={ref} type={type} className={cn(inputClassName, 'pl-9', className)} {...props} />
    </div>
  );
});
