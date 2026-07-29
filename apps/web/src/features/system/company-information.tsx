'use client';

import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@travel-crm/ui';
import { ServerCrash } from 'lucide-react';

import { useAppInfo } from './use-system';

/**
 * The identity printed on quote PDFs. Read-only: it comes from the API's
 * environment (COMPANY_NAME, COMPANY_LOGO_PATH, COMPANY_CONTACT).
 */
export function CompanyInformation() {
  const { data, isPending, isError } = useAppInfo();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company information</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={<ServerCrash aria-hidden />}
            title="Company information is unavailable"
            description="The API did not respond. Check that it is running and try again."
            className="py-6"
          />
        ) : (
          <>
            <dl>
              <div className="flex items-center justify-between gap-4 border-b border-border py-2.5">
                <dt className="text-sm text-muted-foreground">Name</dt>
                <dd className="truncate text-sm font-medium">{data.companyName}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Logo</dt>
                <dd className="truncate text-sm">
                  {data.companyLogoConfigured ? 'Configured' : 'Not configured'}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Shown at the top of every quote PDF. Change it with the{' '}
              <code className="font-mono">COMPANY_*</code> environment variables and restart the
              API.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
