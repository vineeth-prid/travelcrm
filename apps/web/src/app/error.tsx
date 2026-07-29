'use client';

import { Button, EmptyState } from '@travel-crm/ui';
import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <EmptyState
        icon={<TriangleAlert aria-hidden />}
        title="Something went wrong"
        description="The page could not be loaded. Try again, and check that the API is running."
        action={
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
