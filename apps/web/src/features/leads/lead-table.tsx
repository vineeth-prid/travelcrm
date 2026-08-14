'use client';

import { isFollowUpOverdue, type Lead } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@travel-crm/ui';
import { Mail, MessageCircle, MoreHorizontal, Phone } from 'lucide-react';
import Link from 'next/link';

import {
  formatDay,
  formatMoney,
  formatRelative,
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  STAGE_LABELS,
  STAGE_VARIANTS,
} from './lead-labels';

interface LeadTableProps {
  leads: Lead[];
}

/** `tel:` and `mailto:` need the raw value; WhatsApp wants digits only. */
function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}`;
}

export function LeadTable({ leads }: LeadTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Travel</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead>Next follow-up</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const overdue = isFollowUpOverdue(lead);

          return (
            <TableRow key={lead.id}>
              <TableCell>
                <Link
                  href={`/leads/${lead.id}`}
                  className="font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {lead.customer.name}
                </Link>
                <span className="block text-xs text-muted-foreground">{lead.reference}</span>
              </TableCell>

              <TableCell>{lead.destination ?? '—'}</TableCell>

              <TableCell className="whitespace-nowrap text-sm">
                {formatDay(lead.travelStart)}
              </TableCell>

              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={STAGE_VARIANTS[lead.stage]}>{STAGE_LABELS[lead.stage]}</Badge>
                  {lead.priority === 'HIGH' || lead.priority === 'URGENT' ? (
                    <Badge variant={PRIORITY_VARIANTS[lead.priority]}>
                      {PRIORITY_LABELS[lead.priority]}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm">
                {lead.assignedTo?.name ?? <span className="text-muted-foreground">Unassigned</span>}
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm">
                {overdue ? (
                  <Badge variant="danger">{formatRelative(lead.nextFollowUpAt)}</Badge>
                ) : (
                  formatDay(lead.nextFollowUpAt)
                )}
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatRelative(lead.lastActivityAt)}
              </TableCell>

              <TableCell className="text-right">
                {lead.budget === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <Badge variant="accent">{formatMoney(lead.budget, lead.currency)}</Badge>
                )}
              </TableCell>

              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${lead.customer.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/leads/${lead.id}`}>View</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/leads/${lead.id}/edit`}>Edit</Link>
                    </DropdownMenuItem>
                    {lead.customer.phone ? (
                      <DropdownMenuItem asChild>
                        <a href={`tel:${lead.customer.phone}`}>
                          <Phone aria-hidden />
                          Call
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    {lead.customer.whatsapp ? (
                      <DropdownMenuItem asChild>
                        <a
                          href={whatsappLink(lead.customer.whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle aria-hidden />
                          WhatsApp
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    {lead.customer.email ? (
                      <DropdownMenuItem asChild>
                        <a href={`mailto:${lead.customer.email}`}>
                          <Mail aria-hidden />
                          Email
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
