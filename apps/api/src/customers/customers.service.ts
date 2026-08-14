import { Injectable, NotFoundException } from '@nestjs/common';
import type { Customer as CustomerRecord, Prisma } from '@prisma/client';
import type { CustomerDetail, CustomerQuery, CustomerSummary } from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { toCustomer, toDateOnly } from '../leads/leads.mappers';
import { scopeFor as leadScopeFor } from '../leads/leads.repository';
import { PrismaService } from '../shared/prisma.service';
import { userSummarySelect, toUserSummary } from '../users/users.service';

/**
 * The customer book.
 *
 * A customer is created with their first lead and never separately, so this is
 * a read-only view over what the pipeline already knows — there is no "add
 * customer" here on purpose: a customer with no enquiry is a contact, and the
 * inbox already has those.
 *
 * Visibility follows the leads: an employee sees the customers behind the leads
 * they are allowed to see, and nobody else's. Without that, the customer list
 * would be a way to read the whole client book around the lead scope.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerQuery, actor: AuthenticatedUser): Promise<CustomerSummary[]> {
    const and: Prisma.CustomerWhereInput[] = [{ leads: { some: leadScopeFor(actor) } }];

    if (query.search) {
      const digits = query.search.replace(/\D/g, '');
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { city: { contains: query.search, mode: 'insensitive' } },
          ...(digits ? [{ phone: { contains: digits } }, { whatsapp: { contains: digits } }] : []),
        ],
      });
    }

    const rows = await this.prisma.customer.findMany({
      where: { AND: and },
      include: {
        leads: {
          where: leadScopeFor(actor),
          select: { stage: true, destination: true, createdAt: true },
        },
        invoices: {
          where: { status: { not: 'CANCELLED' } },
          select: { currency: true, totalAmount: true, payments: { select: { amount: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 200,
    });

    return rows
      .filter((row) => (query.repeatOnly ? row.leads.length > 1 : true))
      .map((row) => this.summarise(row));
  }

  async get(id: string, actor: AuthenticatedUser): Promise<CustomerDetail> {
    const scope = leadScopeFor(actor);

    const record = await this.prisma.customer.findFirst({
      where: { id, leads: { some: scope } },
      include: {
        leads: {
          where: scope,
          select: {
            id: true,
            reference: true,
            destination: true,
            stage: true,
            createdAt: true,
            assignedTo: { select: userSummarySelect },
          },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          select: {
            id: true,
            reference: true,
            status: true,
            currency: true,
            totalAmount: true,
            issueDate: true,
            payments: { select: { amount: true } },
          },
          orderBy: { issueDate: 'desc' },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('That customer is not on your list.');
    }

    return {
      customer: this.summarise({
        ...record,
        leads: record.leads.map((lead) => ({
          stage: lead.stage,
          destination: lead.destination,
          createdAt: lead.createdAt,
        })),
        invoices: record.invoices.filter((invoice) => invoice.status !== 'CANCELLED'),
      }),
      leads: record.leads.map((lead) => ({
        id: lead.id,
        reference: lead.reference,
        destination: lead.destination,
        stage: lead.stage,
        createdAt: lead.createdAt.toISOString(),
        assignedTo: lead.assignedTo ? toUserSummary(lead.assignedTo) : null,
      })),
      invoices: record.invoices.map((invoice) => ({
        id: invoice.id,
        reference: invoice.reference,
        status: invoice.status,
        currency: invoice.currency,
        totalAmount: invoice.totalAmount,
        amountPaid: invoice.payments.reduce((sum, payment) => sum + payment.amount, 0),
        issueDate: toDateOnly(invoice.issueDate) ?? '',
      })),
    };
  }

  /**
   * Money is summed in the currency of the customer's most recent invoice.
   * Mixing currencies into one figure is how a total becomes a lie; a customer
   * billed in two currencies is rare enough to read the invoices for.
   */
  private summarise(
    row: CustomerRecord & {
      leads: { stage: string; destination: string | null; createdAt: Date }[];
      invoices: { currency: string; totalAmount: number; payments: { amount: number }[] }[];
    },
  ): CustomerSummary {
    const currency = row.invoices[0]?.currency ?? 'INR';
    const inCurrency = row.invoices.filter((invoice) => invoice.currency === currency);

    const lastLead = row.leads
      .map((lead) => lead.createdAt.getTime())
      .sort((a, b) => b - a)
      .at(0);

    return {
      ...toCustomer(row),
      leadCount: row.leads.length,
      wonCount: row.leads.filter((lead) => lead.stage === 'WON').length,
      invoicedAmount: inCurrency.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
      collectedAmount: inCurrency.reduce(
        (sum, invoice) =>
          sum + invoice.payments.reduce((paid, payment) => paid + payment.amount, 0),
        0,
      ),
      currency,
      lastLeadAt: lastLead ? new Date(lastLead).toISOString() : null,
      destinations: [
        ...new Set(
          row.leads
            .map((lead) => lead.destination)
            .filter((destination): destination is string => Boolean(destination)),
        ),
      ].slice(0, 6),
    };
  }
}
