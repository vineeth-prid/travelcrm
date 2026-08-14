'use client';

import { useQuery } from '@tanstack/react-query';
import type { AiStatus } from '@travel-crm/sdk';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@travel-crm/ui';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Where the assistant points and what that server has installed.
 *
 * This exists because AI_MODEL has no default and must not: the name has to
 * match a model the server really has. Rather than making an administrator go
 * and run `ollama list` on the box, the application asks and shows the answer.
 */
export function AiStatusCard() {
  const status = useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: ({ signal }) => api.ai.status(signal),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI assistant</CardTitle>
        <CardDescription>
          Used to tidy customer notes into a requirement. It never sets prices, costs or margins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.isPending ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : status.isError ? (
          <p className="text-sm text-muted-foreground">The status could not be read.</p>
        ) : (
          <Details status={status.data} />
        )}
      </CardContent>
    </Card>
  );
}

function Details({ status }: { status: AiStatus }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <Row label="Status">
        {status.configured ? (
          <Badge variant="success">Switched on</Badge>
        ) : (
          <Badge variant="warning">Not switched on</Badge>
        )}
      </Row>

      <Row label="Server">
        <span className="font-mono text-xs">{status.baseUrl}</span>{' '}
        {status.reachable ? null : (
          <Badge variant="danger" className="ml-1">
            Unreachable
          </Badge>
        )}
      </Row>

      <Row label="Model">
        {status.model ? (
          <span className="font-mono text-xs">{status.model}</span>
        ) : (
          <span className="text-muted-foreground">
            Not set. Choose one below and put it in <code className="font-mono">AI_MODEL</code>.
          </span>
        )}
      </Row>

      <Row label="Installed">
        {status.availableModels === null ? (
          <span className="text-muted-foreground">
            The server did not answer, so its models could not be listed.
          </span>
        ) : status.availableModels.length === 0 ? (
          <span className="text-muted-foreground">
            The server has no models installed. Pull one with{' '}
            <code className="font-mono">ollama pull</code>.
          </span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {status.availableModels.map((model) => (
              <Badge key={model} variant={model === status.model ? 'primary' : 'neutral'}>
                {model}
              </Badge>
            ))}
          </span>
        )}
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
