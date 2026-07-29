import { Button, Card, CardContent, CardHeader, CardTitle, FormField, Input } from '@travel-crm/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reset your password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Password recovery is not wired up yet. Ask your administrator to reset the account, or
          change your password from Settings once you are signed in.
        </p>

        {/* Interface only — there is no recovery endpoint in this phase. */}
        <FormField id="email" label="Email" hint="Recovery emails are not sent yet.">
          <Input id="email" type="email" placeholder="you@company.com" disabled />
        </FormField>
        <Button disabled className="w-full">
          Send reset link
        </Button>

        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
