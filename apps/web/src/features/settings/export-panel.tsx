'use client';

import type { Exportable } from '@travel-crm/sdk';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from '@travel-crm/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';

import { api } from '@/lib/api';

const EXPORTS: { what: Exportable; label: string; note: string }[] = [
  { what: 'leads', label: 'Leads', note: 'Customer, requirement, stage and owner' },
  { what: 'proposals', label: 'Proposals', note: 'Includes cost and margin — internal only' },
  { what: 'payments', label: 'Payments', note: 'Every receipt against every invoice' },
  { what: 'expenses', label: 'Expenses', note: 'Company expenses by category' },
];

/**
 * CSV exports (§30). The browser navigates to the endpoint rather than
 * fetching it, so the file lands in Downloads instead of in memory — and the
 * session cookie travels with the navigation.
 */
export function ExportPanel() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const download = (what: Exportable) => {
    const url = api.admin.exportUrl(what, { from: from || undefined, to: to || undefined });
    window.open(url, '_blank', 'noopener');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export to CSV</CardTitle>
        <CardDescription>
          Opens in Excel. These files carry cost and margin, so treat them the way you would the
          books.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="export-from" label="From" hint="Leave both blank for everything.">
            <Input
              id="export-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </FormField>
          <FormField id="export-to" label="To">
            <Input
              id="export-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </FormField>
        </div>

        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {EXPORTS.map((item) => (
            <li key={item.what} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.note}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => download(item.what)}>
                <Download aria-hidden />
                Download
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
