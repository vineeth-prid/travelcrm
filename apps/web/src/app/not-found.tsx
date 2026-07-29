import { Button, EmptyState } from '@travel-crm/ui';
import { Compass } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <EmptyState
        icon={<Compass aria-hidden />}
        title="Page not found"
        description="That page does not exist, or it belongs to a module that has not shipped yet."
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
