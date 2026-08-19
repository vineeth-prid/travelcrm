'use client';

import { ApiError } from '@travel-crm/sdk';
import { Toaster } from '@travel-crm/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * A minute.
         *
         * Every navigation used to re-request what it had just shown, which is
         * what the blank "Loading…" flash between pages was. Anything that
         * changes because *this* user changed it is invalidated explicitly by
         * the mutation that changed it, so a longer window costs nothing in
         * freshness and removes the flicker.
         */
        staleTime: 60_000,
        /** Kept for ten minutes, so going back is instant rather than a refetch. */
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry an expired session — the middleware handles the redirect.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
