'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge, SearchBox } from '@travel-crm/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { STAGE_LABELS } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Long enough that typing a name does not fire a request per keystroke. */
const DEBOUNCE_MS = 250;

/**
 * Search from anywhere: a customer's name, a destination, a phone number or a
 * reference.
 *
 * Backed by the lead search, which already understands all four and is already
 * scoped to what the viewer may see — so this cannot become a way around the
 * lead scope. Converted enquiries are included, because somebody searching for
 * a name means that person whether or not they have booked.
 */
export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Clicking anywhere else puts the results away.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const results = useQuery({
    queryKey: queryKeys.leads({ search: debounced, pageSize: 6, includeConverted: true }),
    queryFn: ({ signal }) =>
      api.leads.list({ search: debounced, pageSize: 6, includeConverted: true }, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const leads = results.data?.leads ?? [];

  return (
    <div ref={container} className="relative w-full max-w-sm">
      <SearchBox
        placeholder="Customer, destination or phone…"
        aria-label="Search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />

      {open && debounced.length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {results.isPending ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : leads.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Nothing matches “{debounced}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}`}
                    onClick={() => {
                      setOpen(false);
                      setTerm('');
                    }}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {lead.customer.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[lead.reference, lead.destination, lead.customer.phone]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Badge variant="neutral">{STAGE_LABELS[lead.stage]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
