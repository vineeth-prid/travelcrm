import { Plane } from 'lucide-react';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Plane className="size-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Travel CRM</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
