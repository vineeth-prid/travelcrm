import { Card, CardContent, CardHeader, CardTitle } from '@travel-crm/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign in to your workspace</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* useSearchParams needs a Suspense boundary during prerendering. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <Link
          href="/forgot-password"
          className="text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </CardContent>
    </Card>
  );
}
