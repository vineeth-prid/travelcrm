'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/** Mount once, near the application root. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-border bg-surface text-foreground shadow-md text-sm gap-3',
          description: 'text-muted-foreground',
          success: 'text-success-foreground',
          error: 'text-danger-foreground',
        },
      }}
    />
  );
}

export { toast };
