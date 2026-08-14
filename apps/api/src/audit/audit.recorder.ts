import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '@prisma/client';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../shared/prisma.service';

/**
 * A route pattern and what it means in English.
 *
 * Matched in order, so more specific entries come first. `:id` matches one
 * path segment.
 */
interface Rule {
  method: string;
  pattern: string;
  entity: string;
  action: AuditAction;
  describe: (id: string | null) => string;
}

const rule = (
  method: string,
  pattern: string,
  entity: string,
  action: AuditAction,
  describe: (id: string | null) => string,
): Rule => ({ method, pattern, entity, action, describe });

const RULES: Rule[] = [
  // --- Authentication ------------------------------------------------------
  rule('POST', '/login', 'auth', 'AUTH', () => 'Signed in'),
  rule('POST', '/logout', 'auth', 'AUTH', () => 'Signed out'),
  rule('POST', '/me/password', 'user', 'UPDATE', () => 'Changed their own password'),
  rule('PATCH', '/me', 'user', 'UPDATE', () => 'Updated their own profile'),

  // --- Staff ---------------------------------------------------------------
  rule('POST', '/users', 'user', 'CREATE', () => 'Created a user account'),
  rule(
    'POST',
    '/users/:id/password',
    'user',
    'UPDATE',
    (id) => `Reset the password for user ${id}`,
  ),
  rule('PATCH', '/users/:id', 'user', 'UPDATE', (id) => `Updated user ${id}`),

  // --- Leads ---------------------------------------------------------------
  rule('PATCH', '/leads/:id/assign', 'lead', 'ASSIGN', (id) => `Reassigned lead ${id}`),
  rule(
    'PATCH',
    '/leads/:id/stage',
    'lead',
    'STATUS_CHANGE',
    (id) => `Changed the stage of lead ${id}`,
  ),
  rule('POST', '/leads/:id/activities', 'lead', 'UPDATE', (id) => `Added a note to lead ${id}`),
  rule('POST', '/leads', 'lead', 'CREATE', () => 'Created a lead'),
  rule('PATCH', '/leads/:id', 'lead', 'UPDATE', (id) => `Updated lead ${id}`),

  // --- Proposals -----------------------------------------------------------
  rule(
    'POST',
    '/leads/:id/proposals',
    'proposal',
    'CREATE',
    (id) => `Created a proposal on lead ${id}`,
  ),
  rule('POST', '/proposals/:id/versions', 'proposal', 'UPDATE', (id) => `Revised proposal ${id}`),
  rule(
    'POST',
    '/proposals/:id/submit',
    'proposal',
    'SUBMIT',
    (id) => `Submitted proposal ${id} to the customer`,
  ),
  rule(
    'POST',
    '/proposals/:id/generate',
    'proposal',
    'UPDATE',
    (id) => `Generated the PDF for proposal ${id}`,
  ),
  rule(
    'PATCH',
    '/proposals/:id/status',
    'proposal',
    'STATUS_CHANGE',
    (id) => `Recorded the customer response on proposal ${id}`,
  ),
  rule('PATCH', '/proposals/:id', 'proposal', 'UPDATE', (id) => `Updated proposal ${id}`),

  // --- Invoices and money --------------------------------------------------
  rule(
    'POST',
    '/leads/:id/invoices',
    'invoice',
    'CREATE',
    (id) => `Raised an invoice on lead ${id}`,
  ),
  rule(
    'POST',
    '/invoices/:id/payments',
    'payment',
    'PAYMENT',
    (id) => `Recorded a payment against invoice ${id}`,
  ),
  rule('POST', '/invoices/:id/issue', 'invoice', 'STATUS_CHANGE', (id) => `Issued invoice ${id}`),
  rule(
    'POST',
    '/invoices/:id/cancel',
    'invoice',
    'STATUS_CHANGE',
    (id) => `Cancelled invoice ${id}`,
  ),
  rule(
    'POST',
    '/invoices/:id/generate',
    'invoice',
    'UPDATE',
    (id) => `Generated the PDF for invoice ${id}`,
  ),
  rule('PATCH', '/invoices/:id', 'invoice', 'UPDATE', (id) => `Updated invoice ${id}`),

  // --- Expenses ------------------------------------------------------------
  rule('POST', '/expenses/categories', 'expense', 'CONFIG', () => 'Added an expense category'),
  rule(
    'PATCH',
    '/expenses/categories/:id',
    'expense',
    'CONFIG',
    (id) => `Updated expense category ${id}`,
  ),
  rule(
    'POST',
    '/expenses/:id/receipt',
    'expense',
    'UPDATE',
    (id) => `Attached a receipt to expense ${id}`,
  ),
  rule('POST', '/expenses', 'expense', 'CREATE', () => 'Recorded an expense'),
  rule('PATCH', '/expenses/:id', 'expense', 'UPDATE', (id) => `Updated expense ${id}`),
  rule('DELETE', '/expenses/:id', 'expense', 'DELETE', (id) => `Deleted expense ${id}`),

  // --- Configuration -------------------------------------------------------
  rule('PUT', '/settings/smtp', 'smtp', 'CONFIG', () => 'Changed the SMTP configuration'),
  rule('POST', '/settings/smtp/test', 'smtp', 'CONFIG', () => 'Sent a test email'),
  rule('POST', '/follow-ups/rules', 'follow-up', 'CONFIG', () => 'Created a follow-up schedule'),
  rule(
    'PATCH',
    '/follow-ups/rules/:id',
    'follow-up',
    'CONFIG',
    (id) => `Updated follow-up schedule ${id}`,
  ),
  rule(
    'POST',
    '/follow-ups/:id/complete',
    'follow-up',
    'UPDATE',
    (id) => `Recorded follow-up ${id}`,
  ),

  // --- Exports -------------------------------------------------------------
  // A GET, but one worth recording: somebody taking the whole customer list
  // out of the building is exactly what an audit trail is for.
  rule('GET', '/exports/leads.csv', 'export', 'CONFIG', () => 'Exported the lead list'),
  rule(
    'GET',
    '/exports/proposals.csv',
    'export',
    'CONFIG',
    () => 'Exported proposals, with margin',
  ),
  rule('GET', '/exports/payments.csv', 'export', 'CONFIG', () => 'Exported payments'),
  rule('GET', '/exports/expenses.csv', 'export', 'CONFIG', () => 'Exported expenses'),
];

/** Strips the version prefix so rules are written against clean paths. */
function normalise(url: string): string {
  return url.split('?')[0]!.replace(/^\/api\/v\d+/, '');
}

/** `/leads/abc/stage` against `/leads/:id/stage` → the captured id. */
function match(pattern: string, path: string): { matched: boolean; id: string | null } {
  const wanted = pattern.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);

  if (wanted.length !== actual.length) return { matched: false, id: null };

  let id: string | null = null;
  for (const [index, segment] of wanted.entries()) {
    if (segment === ':id') {
      id = actual[index] ?? null;
      continue;
    }
    if (segment !== actual[index]) return { matched: false, id: null };
  }

  return { matched: true, id };
}

/**
 * Writes the audit trail.
 *
 * Shared by two callers because one is not enough: an interceptor never sees a
 * request a **guard** rejected — guards run first — so 401, 403 and 429 would
 * be invisible, which are the entries a security-minded reader most wants.
 * The interceptor records what succeeded; the exception filter records what
 * did not. Between them every audited route is covered exactly once.
 */
@Injectable()
export class AuditRecorder {
  private readonly logger = new Logger(AuditRecorder.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The rule for a request, or null when the route is not audited. */
  ruleFor(method: string, url: string): { rule: Rule; id: string | null } | null {
    const path = normalise(url);

    for (const candidate of RULES) {
      if (candidate.method !== method) continue;
      const { matched, id } = match(candidate.pattern, path);
      if (matched) return { rule: candidate, id };
    }

    return null;
  }

  async record(request: Request, status: number): Promise<void> {
    const found = this.ruleFor(request.method, request.url);
    if (!found) return;

    const { rule: matched, id } = found;
    const user = request.user as AuthenticatedUser | undefined;

    // A failed sign-in has no user, which is precisely when it is worth
    // recording — so the actor falls back to whatever was attempted.
    const attempted =
      matched.entity === 'auth' && !user
        ? ((request.body as { email?: string } | undefined)?.email ?? null)
        : null;

    try {
      await this.prisma.auditLog.create({
        data: {
          entity: matched.entity,
          entityId: id,
          action: matched.action,
          summary: status >= 400 ? `${matched.describe(id)} — refused` : matched.describe(id),
          actorId: user?.id ?? null,
          actorName: user?.name ?? attempted ?? 'anonymous',
          actorRole: user?.role ?? 'NONE',
          ip: request.ip ?? null,
          status,
        },
      });
    } catch (error) {
      // A failure to write the audit trail must not fail the request that was
      // being audited — but it is a serious thing and says so loudly.
      this.logger.error(
        `Could not write the audit trail for ${request.method} ${request.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
