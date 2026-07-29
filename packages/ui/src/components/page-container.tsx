import * as React from 'react';

import { cn } from '../lib/cn';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  /** Buttons or controls aligned to the right of the page title. */
  actions?: React.ReactNode;
  width?: 'default' | 'narrow' | 'full';
}

const widths = {
  default: 'max-w-6xl',
  narrow: 'max-w-3xl',
  full: 'max-w-none',
} as const;

export function PageContainer({
  title,
  description,
  actions,
  width = 'default',
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:py-8', widths[width], className)}
      {...props}
    >
      {title || actions ? (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            {title ? (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            ) : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
