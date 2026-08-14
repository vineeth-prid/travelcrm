import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  invoiceTotals,
  type Invoice,
  type InvoiceQuery,
  type InvoiceRequest,
  type InvoiceWithPdf,
  type PaymentRequest,
} from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { Env } from '../config/env';
import { LeadActivityService } from '../leads/lead-activity.service';
import { fromDateOnly } from '../leads/leads.mappers';
import { LeadsRepository } from '../leads/leads.repository';
import { money } from '../shared/pdf-brand';
import { PrismaService } from '../shared/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InvoicePdfService, type CustomerInvoicePdfData } from './invoice-pdf.service';
import {
  amountPaidOn,
  invoiceInclude,
  toInvoice,
  type InvoiceWithRelations,
} from './invoices.mappers';

function objectKey(invoiceId: string): string {
  return `invoices/${invoiceId}.pdf`;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsRepository,
    private readonly activities: LeadActivityService,
    private readonly pdf: InvoicePdfService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(query: InvoiceQuery, actor: AuthenticatedUser): Promise<Invoice[]> {
    const where: Prisma.InvoiceWhereInput = { AND: [this.scopeFor(actor)] };
    const and = where.AND as Prisma.InvoiceWhereInput[];

    if (query.status) and.push({ status: query.status });
    if (query.leadId) and.push({ leadId: query.leadId });
    if (query.search) {
      and.push({
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { billingName: { contains: query.search, mode: 'insensitive' } },
          { packageTitle: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const rows = await this.prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 200,
    });

    const invoices = rows.map(toInvoice);

    // Payment status is derived rather than stored, so it cannot be a SQL
    // filter. Filtering here is honest about that; the alternative is a stored
    // column that goes stale the moment a due date passes.
    return query.paymentStatus
      ? invoices.filter((invoice) => invoice.paymentStatus === query.paymentStatus)
      : invoices;
  }

  async get(id: string, actor: AuthenticatedUser): Promise<Invoice> {
    return toInvoice(await this.findVisible(id, actor));
  }

  /**
   * Raises an invoice against a lead.
   *
   * The customer already exists — they were created with the lead — so
   * converting a lead to a booking creates no second customer record. That is
   * the whole of §35F: there is nothing to deduplicate because nothing is
   * duplicated.
   */
  async create(leadId: string, input: InvoiceRequest, actor: AuthenticatedUser): Promise<Invoice> {
    const lead = await this.visibleLead(leadId, actor);

    if (input.proposalId) {
      const proposal = await this.prisma.proposal.findUnique({
        where: { id: input.proposalId },
        select: { leadId: true },
      });
      // A bill can only cite a proposal belonging to the same customer.
      if (!proposal || proposal.leadId !== leadId) {
        throw new BadRequestException('That proposal does not belong to this lead.');
      }
    }

    const record = await this.prisma.invoice.create({
      data: {
        leadId,
        customerId: lead.customerId,
        proposalId: input.proposalId ?? null,
        createdById: actor.id,
        ...this.bodyOf(input),
      },
      include: invoiceInclude,
    });

    await this.activities.record({
      leadId,
      type: 'INVOICE_GENERATED',
      summary: `Invoice ${record.reference} raised — ${money(record.currency, record.totalAmount)}`,
      actorId: actor.id,
    });

    return toInvoice(record);
  }

  /** Drafts only. An issued invoice is a financial document, not a form. */
  async update(id: string, input: InvoiceRequest, actor: AuthenticatedUser): Promise<Invoice> {
    const record = await this.findVisible(id, actor);
    this.assertDraft(record);

    const updated = await this.prisma.invoice.update({
      where: { id },
      // A change invalidates any PDF built from the old figures.
      data: { ...this.bodyOf(input), pdfPath: null },
      include: invoiceInclude,
    });

    return toInvoice(updated);
  }

  /**
   * Issues the invoice: it stops being editable and its due date starts to
   * count. Requires a PDF, so nothing is issued that nobody could send.
   */
  async issue(id: string, actor: AuthenticatedUser): Promise<Invoice> {
    const record = await this.findVisible(id, actor);

    if (record.status === 'CANCELLED') {
      throw new BadRequestException('That invoice was cancelled.');
    }
    if (record.status === 'ISSUED') {
      return toInvoice(record);
    }
    if (!record.pdfPath) {
      throw new BadRequestException('Generate the PDF before issuing this invoice.');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'ISSUED' },
      include: invoiceInclude,
    });

    await this.activities.record({
      leadId: record.leadId,
      type: 'INVOICE_GENERATED',
      summary: `Invoice ${record.reference} issued — ${money(record.currency, record.totalAmount)}`,
      actorId: actor.id,
    });

    // A customer being billed has been won, whatever the pipeline still says.
    await this.leads.setStageIfOpen(record.leadId, 'WON');

    return toInvoice(updated);
  }

  /**
   * Cancels an invoice. Refused once money has been taken against it: that
   * needs a credit note, which this application does not have, and quietly
   * voiding a paid bill would lose the receipt.
   */
  async cancel(id: string, actor: AuthenticatedUser): Promise<Invoice> {
    const record = await this.findVisible(id, actor);

    if (amountPaidOn(record.payments) > 0) {
      throw new BadRequestException(
        'This invoice has payments recorded against it and cannot be cancelled.',
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: invoiceInclude,
    });

    await this.activities.record({
      leadId: record.leadId,
      type: 'INVOICE_GENERATED',
      summary: `Invoice ${record.reference} cancelled`,
      actorId: actor.id,
    });

    return toInvoice(updated);
  }

  /** Renders the PDF and stores it. Rebuilt only while the invoice is a draft. */
  async generatePdf(id: string, actor: AuthenticatedUser): Promise<InvoiceWithPdf> {
    const record = await this.findVisible(id, actor);

    if (record.pdfPath && record.status !== 'DRAFT') {
      return this.withPdfUrl(record);
    }

    const document = await this.pdf.render(this.toPdfData(record));
    const key = objectKey(record.id);
    await this.storage.put(key, document, 'application/pdf');
    this.logger.log(`Stored invoice PDF ${key} (${document.length} bytes)`);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { pdfPath: key },
      include: invoiceInclude,
    });

    return this.withPdfUrl(updated);
  }

  /**
   * Records money received.
   *
   * Refuses to take more than is outstanding. An overpayment is almost always
   * a typo, and a wrong receipt is far more expensive to unpick than a rejected
   * one — the consultant can see the outstanding figure and correct it.
   */
  async recordPayment(
    id: string,
    input: PaymentRequest,
    actor: AuthenticatedUser,
  ): Promise<Invoice> {
    const record = await this.findVisible(id, actor);

    if (record.status === 'DRAFT') {
      throw new BadRequestException('Issue the invoice before recording a payment against it.');
    }
    if (record.status === 'CANCELLED') {
      throw new BadRequestException('That invoice was cancelled.');
    }

    const alreadyPaid = amountPaidOn(record.payments);
    const outstanding = record.totalAmount - alreadyPaid;

    if (outstanding <= 0) {
      throw new BadRequestException('That invoice is already paid in full.');
    }
    if (input.amount > outstanding) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: {
          amount: [
            `That is more than the ${money(record.currency, outstanding)} outstanding on this invoice.`,
          ],
        },
      });
    }

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: id,
        paidAt: fromDateOnly(input.paidAt)!,
        amount: input.amount,
        method: input.method,
        externalReference: input.externalReference ?? null,
        notes: input.notes ?? null,
        recordedById: actor.id,
      },
    });

    const paidNow = alreadyPaid + input.amount;
    const settled = paidNow >= record.totalAmount;
    const remaining = record.totalAmount - paidNow;

    await this.activities.record({
      leadId: record.leadId,
      type: 'PAYMENT_RECEIVED',
      summary: `Payment ${payment.reference} — ${money(record.currency, input.amount)} against ${record.reference}${
        settled ? ' (paid in full)' : ` (${money(record.currency, remaining)} outstanding)`
      }`,
      detail: input.notes,
      actorId: actor.id,
    });

    return toInvoice(await this.findOrFail(id));
  }

  /** Prefills a new invoice. Every one of these is editable per invoice. */
  defaults(): { dueDays: number; taxRateBps: number | null; paymentTerms: string } {
    return {
      dueDays: this.config.get('INVOICE_DUE_DAYS', { infer: true }),
      taxRateBps: this.config.get('INVOICE_DEFAULT_TAX_BPS', { infer: true }),
      paymentTerms: this.config.get('INVOICE_PAYMENT_TERMS', { infer: true }),
    };
  }

  /**
   * The editable body of an invoice, with every money figure recomputed.
   *
   * Totals come from the shared `invoiceTotals()` — the same function the form
   * runs as you type — so a client that posts its own `totalAmount` is ignored
   * rather than trusted.
   */
  private bodyOf(input: InvoiceRequest) {
    const totals = invoiceTotals({
      packageAmount: input.packageAmount,
      discountAmount: input.discountAmount,
      taxRateBps: input.taxRateBps ?? null,
    });

    return {
      issueDate: fromDateOnly(input.issueDate)!,
      dueDate: fromDateOnly(input.dueDate)!,
      packageTitle: input.packageTitle,
      destination: input.destination ?? null,
      travelStart: fromDateOnly(input.travelStart),
      travelEnd: fromDateOnly(input.travelEnd),
      description: input.description ?? null,
      currency: input.currency,
      packageAmount: totals.packageAmount,
      discountAmount: totals.discountAmount,
      taxRateBps: totals.taxRateBps,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      billingName: input.billingName,
      billingAddress: input.billingAddress ?? null,
      billingEmail: input.billingEmail ?? null,
      billingPhone: input.billingPhone ?? null,
      billingTaxId: input.billingTaxId ?? null,
      paymentTerms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
    };
  }

  /** Built field by field. See CustomerInvoicePdfData for why. */
  private toPdfData(record: InvoiceWithRelations): CustomerInvoicePdfData {
    const amountPaid = amountPaidOn(record.payments);

    return {
      reference: record.reference,
      issueDate: record.issueDate,
      dueDate: record.dueDate,
      generatedAt: new Date(),

      billingName: record.billingName,
      billingAddress: record.billingAddress,
      billingEmail: record.billingEmail,
      billingPhone: record.billingPhone,
      billingTaxId: record.billingTaxId,

      packageTitle: record.packageTitle,
      destination: record.destination,
      travelStart: record.travelStart,
      travelEnd: record.travelEnd,
      description: record.description,

      currency: record.currency,
      packageAmount: record.packageAmount,
      discountAmount: record.discountAmount,
      taxRateBps: record.taxRateBps,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,

      payments: record.payments.map((payment) => ({
        paidAt: payment.paidAt,
        amount: payment.amount,
        method: payment.method,
        reference: payment.externalReference,
      })),
      amountPaid,
      outstanding: Math.max(0, record.totalAmount - amountPaid),

      paymentTerms: record.paymentTerms,
      notes: record.notes,
    };
  }

  private async withPdfUrl(record: InvoiceWithRelations): Promise<InvoiceWithPdf> {
    return {
      invoice: toInvoice(record),
      pdfUrl: record.pdfPath ? await this.storage.presignedUrl(record.pdfPath) : null,
    };
  }

  private assertDraft(record: InvoiceWithRelations): void {
    if (record.status !== 'DRAFT') {
      throw new BadRequestException(
        'This invoice has been issued and cannot be changed. Cancel it and raise a new one instead.',
      );
    }
  }

  private scopeFor(actor: AuthenticatedUser): Prisma.InvoiceWhereInput {
    if (actor.role === 'ADMIN') return {};
    return { OR: [{ lead: { assignedToId: actor.id } }, { lead: { createdById: actor.id } }] };
  }

  private async findOrFail(id: string): Promise<InvoiceWithRelations> {
    const record = await this.prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!record) throw new NotFoundException('That invoice no longer exists.');
    return record;
  }

  private async findVisible(id: string, actor: AuthenticatedUser): Promise<InvoiceWithRelations> {
    const record = await this.prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });

    const visible =
      record &&
      (actor.role === 'ADMIN' ||
        record.lead.assignedToId === actor.id ||
        record.lead.createdById === actor.id);

    if (!record || !visible) {
      throw new NotFoundException('That invoice no longer exists.');
    }

    return record;
  }

  private async visibleLead(leadId: string, actor: AuthenticatedUser) {
    const lead = await this.leads.findById(leadId);
    const visible =
      lead &&
      (actor.role === 'ADMIN' || lead.assignedToId === actor.id || lead.createdById === actor.id);

    if (!lead || !visible) {
      throw new NotFoundException('That lead no longer exists.');
    }
    return lead;
  }
}
