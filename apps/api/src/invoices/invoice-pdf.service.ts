import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';

import type { CompanyProfile } from '@travel-crm/sdk';

import type { Env } from '../config/env';
import {
  BRAND,
  brandLogoPath,
  CONTENT_BOTTOM,
  CONTENT_WIDTH,
  longDate,
  MARGIN,
  money,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  registerBrandFonts,
  RULE,
} from '../shared/pdf-brand';

/**
 * Everything the customer invoice is allowed to know.
 *
 * As with the proposal, this type is the boundary rather than the discipline:
 * there is no field here that could carry an internal cost or a margin, so a
 * renderer that only ever sees one of these cannot print them. Built field by
 * field from the record — never by spreading it.
 */
export interface CustomerInvoicePdfData {
  reference: string;
  issueDate: Date;
  dueDate: Date;
  generatedAt: Date;

  billingName: string;
  billingAddress: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  billingTaxId: string | null;

  packageTitle: string;
  destination: string | null;
  travelStart: Date | null;
  travelEnd: Date | null;
  description: string | null;

  currency: string;
  packageAmount: number;
  discountAmount: number;
  /** Basis points; null when no tax applies. */
  taxRateBps: number | null;
  taxAmount: number;
  totalAmount: number;

  /** Receipts already recorded, so the document shows what is actually owed. */
  payments: { paidAt: Date; amount: number; method: string; reference: string | null }[];
  amountPaid: number;
  outstanding: number;

  paymentTerms: string | null;
  notes: string | null;

  /**
   * Whose invoice this is — name, contact, tax registration and where to send
   * the money. From the company profile in settings rather than the
   * environment, because a changed bank account should not need a redeploy.
   */
  company: CompanyProfile;
  /** Printed at the foot of the document. From the invoice template. */
  footerNote: string | null;
}

/** The contact line under the company name: whichever details are filled in. */
function contactLine(company: CompanyProfile): string | null {
  const parts = [company.phone, company.email, company.website].filter(Boolean);
  return parts.length > 0 ? parts.join('  ·  ') : null;
}

/**
 * One type scale for the whole document.
 *
 * Sizes were picked per block before, which is why the same kind of thing —
 * a label, a total, a line of body text — came out at 8, 8.5 and 9pt in
 * different places on the same page.
 */
const SIZE = {
  title: 26,
  company: 17,
  total: 16,
  heading: 13,
  subheading: 12,
  lead: 11,
  body: 9.5,
  small: 8.5,
  label: 8,
  footer: 7.5,
} as const;

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CASH: 'Cash',
  CARD: 'Card',
  OTHER: 'Other',
};

/** 1800 → "18%", 750 → "7.5%". */
function percent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2).replace(/\.?0+$/, '')}%`;
}

/**
 * Renders an invoice as a branded, print-friendly A4 document.
 *
 * Deliberately plainer than the proposal. A proposal is selling something and
 * can afford to look it; an invoice needs to be read, checked and paid, so the
 * money is the loudest thing on the page and nothing competes with it.
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async render(data: CustomerInvoicePdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Invoice ${data.reference}`,
        Author: data.company.name,
        Subject: `Invoice for ${data.billingName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    registerBrandFonts(doc);

    this.header(doc, data);
    this.parties(doc, data);
    this.lineItem(doc, data);
    this.summary(doc, data);
    this.receipts(doc, data);
    this.paymentDetails(doc, data);
    this.terms(doc, data);
    this.footers(doc, data);

    doc.end();
    return finished;
  }

  private header(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    const logo = brandLogoPath(this.config.get('COMPANY_LOGO_PATH', { infer: true }));

    if (logo) {
      try {
        doc.image(logo, MARGIN, MARGIN - 6, { fit: [210, 68] });
      } catch (error) {
        this.logger.warn(`Could not render the company logo: ${String(error)}`);
      }
    } else {
      doc
        .fillColor(BRAND.slate)
        .font('brand-heading-bold')
        .fontSize(SIZE.company)
        .text(data.company.name, MARGIN, MARGIN + 12);
    }

    doc
      .fillColor(BRAND.teal)
      .font('brand-heading-bold')
      .fontSize(SIZE.title)
      .text('INVOICE', PAGE_WIDTH - MARGIN - 220, MARGIN + 2, { width: 220, align: 'right' });

    const rows: [string, string][] = [
      ['Invoice number', data.reference],
      ['Issue date', longDate(data.issueDate)],
      ['Due date', longDate(data.dueDate)],
    ];

    let y = MARGIN + 36;
    for (const [label, value] of rows) {
      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(SIZE.small)
        .text(label, PAGE_WIDTH - MARGIN - 220, y, { width: 120, align: 'right' });
      doc
        .fillColor(BRAND.slate)
        .font('brand-body-bold')
        .fontSize(SIZE.body)
        .text(value, PAGE_WIDTH - MARGIN - 96, y - 1, { width: 96, align: 'right' });
      y += 15;
    }

    doc.y = Math.max(MARGIN + 92, y + 8);
    this.rule(doc);
  }

  private parties(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    const columnWidth = CONTENT_WIDTH / 2 - 12;
    const top = doc.y;

    const block = (title: string, lines: (string | null)[], x: number): number => {
      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(SIZE.label)
        .text(title.toUpperCase(), x, top, { width: columnWidth, characterSpacing: 1 });

      let cursor = top + 13;
      const present = lines.filter((line): line is string => Boolean(line?.trim()));

      present.forEach((line, index) => {
        doc
          .fillColor(BRAND.slate)
          .font(index === 0 ? 'brand-body-bold' : 'brand-body')
          .fontSize(index === 0 ? SIZE.lead : SIZE.body)
          .text(line, x, cursor, { width: columnWidth });
        cursor = doc.y + 2;
      });

      return cursor;
    };

    const fromBottom = block(
      'From',
      [
        data.company.name,
        contactLine(data.company),
        data.company.address,
        data.company.taxId ? `GST: ${data.company.taxId}` : null,
      ],
      MARGIN,
    );

    const toBottom = block(
      'Bill to',
      [
        data.billingName,
        data.billingAddress,
        data.billingPhone,
        data.billingEmail,
        data.billingTaxId ? `GST: ${data.billingTaxId}` : null,
      ],
      MARGIN + CONTENT_WIDTH / 2 + 12,
    );

    doc.y = Math.max(fromBottom, toBottom) + 6;
    this.rule(doc);
  }

  /** What is being billed for. One line, because one trip is one thing. */
  private lineItem(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    doc
      .fillColor(MUTED)
      .font('brand-body')
      .fontSize(SIZE.label)
      .text('DESCRIPTION', MARGIN, doc.y, { characterSpacing: 1 });

    doc
      .fillColor(BRAND.slate)
      .font('brand-heading')
      .fontSize(SIZE.heading)
      .text(data.packageTitle, MARGIN, doc.y + 4, { width: CONTENT_WIDTH });

    const facts = [
      data.destination,
      data.travelStart
        ? `${longDate(data.travelStart)}${data.travelEnd ? ` — ${longDate(data.travelEnd)}` : ''}`
        : null,
    ].filter((value): value is string => Boolean(value));

    if (facts.length > 0) {
      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(SIZE.body)
        .text(facts.join(' · '), MARGIN, doc.y + 3, { width: CONTENT_WIDTH });
    }

    if (data.description?.trim()) {
      doc
        .fillColor(BRAND.slate)
        .font('brand-body')
        .fontSize(SIZE.body)
        .text(data.description.trim(), MARGIN, doc.y + 6, { width: CONTENT_WIDTH, lineGap: 2.5 });
    }

    doc.y += 14;
  }

  /** The arithmetic, shown so the customer can check it. */
  private summary(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    this.space(doc, 150);

    const labelX = PAGE_WIDTH - MARGIN - 300;
    const valueX = PAGE_WIDTH - MARGIN - 150;
    const width = 150;

    const line = (label: string, value: string, emphasis = false): void => {
      doc
        .fillColor(emphasis ? BRAND.slate : MUTED)
        .font(emphasis ? 'brand-body-bold' : 'brand-body')
        .fontSize(emphasis ? 10 : 9.5)
        .text(label, labelX, doc.y, { width: 140, align: 'right' });

      const y = doc.y - (emphasis ? 12 : 11.5);
      doc
        .fillColor(BRAND.slate)
        .font(emphasis ? 'brand-body-bold' : 'brand-body')
        .fontSize(emphasis ? 10 : 9.5)
        .text(value, valueX, y, { width, align: 'right' });

      doc.y += 3;
    };

    line('Package amount', money(data.currency, data.packageAmount));

    if (data.discountAmount > 0) {
      line('Discount', `− ${money(data.currency, data.discountAmount)}`);
      line('Net amount', money(data.currency, data.packageAmount - data.discountAmount), true);
    }

    // Only shown when tax actually applies. A "Tax: 0" line on a document for a
    // service that is not taxed invites a question that has no good answer.
    if (data.taxRateBps !== null && data.taxRateBps > 0) {
      line(`GST (${percent(data.taxRateBps)})`, money(data.currency, data.taxAmount));
    }

    // The total, in the brand accent — the one thing that must be unmissable.
    const y = doc.y + 6;
    doc.roundedRect(labelX - 10, y, PAGE_WIDTH - MARGIN - labelX + 10, 42, 6).fill(BRAND.yellow);
    doc
      .fillColor(BRAND.slate)
      .font('brand-body-bold')
      .fontSize(10)
      .text('TOTAL DUE', labelX, y + 10, { width: 140, align: 'right' });
    doc
      .font('brand-heading-bold')
      .fontSize(SIZE.total)
      .text(money(data.currency, data.totalAmount), valueX, y + 20, { width, align: 'right' });

    doc.y = y + 42 + 14;
  }

  /** What has already been received, and what is therefore still owed. */
  private receipts(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    if (data.payments.length === 0) return;

    this.space(doc, 120);
    this.heading(doc, 'Payments received');

    for (const payment of data.payments) {
      doc
        .fillColor(BRAND.slate)
        .font('brand-body')
        .fontSize(SIZE.body)
        .text(
          `${longDate(payment.paidAt)} · ${METHOD_LABELS[payment.method] ?? payment.method}${
            payment.reference ? ` · ${payment.reference}` : ''
          }`,
          MARGIN,
          doc.y,
          { width: CONTENT_WIDTH - 160 },
        );

      doc
        .font('brand-body-bold')
        .text(money(data.currency, payment.amount), PAGE_WIDTH - MARGIN - 150, doc.y - 11.5, {
          width: 150,
          align: 'right',
        });

      doc.y += 4;
    }

    doc.y += 4;
    this.rule(doc);

    const labelX = PAGE_WIDTH - MARGIN - 300;
    doc
      .fillColor(MUTED)
      .font('brand-body')
      .fontSize(SIZE.body)
      .text('Paid to date', labelX, doc.y, { width: 140, align: 'right' });
    doc
      .fillColor(BRAND.slate)
      .font('brand-body-bold')
      .text(money(data.currency, data.amountPaid), PAGE_WIDTH - MARGIN - 150, doc.y - 11.5, {
        width: 150,
        align: 'right',
      });

    doc.y += 5;
    doc
      .fillColor(BRAND.teal)
      .font('brand-body-bold')
      .fontSize(SIZE.lead)
      .text('Balance outstanding', labelX, doc.y, { width: 140, align: 'right' });
    doc.text(money(data.currency, data.outstanding), PAGE_WIDTH - MARGIN - 150, doc.y - 13, {
      width: 150,
      align: 'right',
    });

    doc.y += 16;
  }

  private paymentDetails(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    const bank = data.company.bankDetails;
    if (!bank && !data.paymentTerms) return;

    this.space(doc, 110);
    this.heading(doc, 'How to pay');

    const y = doc.y;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 4, 2).fill(BRAND.aqua);
    doc.y = y + 12;

    if (bank) {
      doc
        .fillColor(BRAND.slate)
        .font('brand-body')
        .fontSize(SIZE.body)
        .text(bank, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2.5 });
      doc.y += 6;
    }

    if (data.paymentTerms) {
      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(SIZE.body)
        .text(data.paymentTerms, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
      doc.y += 6;
    }
  }

  private terms(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    if (!data.notes?.trim()) return;

    this.space(doc, 90);
    this.heading(doc, 'Notes');
    doc
      .fillColor(BRAND.slate)
      .font('brand-body')
      .fontSize(SIZE.body)
      .text(data.notes.trim(), MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2.5 });
    doc.y += 10;
  }

  private heading(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .fillColor(BRAND.slate)
      .font('brand-heading')
      .fontSize(SIZE.subheading)
      .text(title, MARGIN, doc.y, { width: CONTENT_WIDTH });

    const y = doc.y + 4;
    doc.rect(MARGIN, y, 28, 2).fill(BRAND.teal);
    doc.y = y + 12;
  }

  private rule(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .strokeColor(RULE)
      .lineWidth(0.75)
      .moveTo(MARGIN, y)
      .lineTo(PAGE_WIDTH - MARGIN, y)
      .stroke();
    doc.y = y + 14;
  }

  /**
   * Makes room for a block, or starts a page if there is not enough.
   *
   * Called *after* the caller has decided it has something to draw. It used to
   * be called first, which is how an invoice with no payment details and no
   * terms still ended with a blank page: the reservation was made, the block
   * then rendered nothing, and the empty page was already there.
   */
  private space(doc: PDFKit.PDFDocument, needed: number): void {
    if (doc.y + needed > CONTENT_BOTTOM) {
      doc.addPage();
      doc.y = MARGIN;
    }
  }

  private footers(doc: PDFKit.PDFDocument, data: CustomerInvoicePdfData): void {
    const company = data.company.name;
    const contact = contactLine(data.company) ?? '';
    const range = doc.bufferedPageRange();

    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);

      // The footer sits below the bottom margin by design. Without this,
      // pdfkit treats writing there as running out of room and helpfully
      // starts a new page — which is where the blank last page came from.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const y = PAGE_HEIGHT - MARGIN - 26;
      doc
        .strokeColor(RULE)
        .lineWidth(0.75)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke();

      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(SIZE.footer)
        .text(
          `${company}${contact ? ` · ${contact}` : ''} · Invoice ${data.reference}`,
          MARGIN,
          y + 8,
          { width: CONTENT_WIDTH * 0.72 },
        );

      doc.text(`Page ${index + 1} of ${range.count}`, PAGE_WIDTH - MARGIN - 140, y + 8, {
        width: 140,
        align: 'right',
      });

      if (index === range.count - 1) {
        doc
          .fillColor(BRAND.slate)
          .font('brand-body')
          .fontSize(SIZE.small)
          .text('Thank you for travelling with us.', MARGIN, y + 20, {
            width: CONTENT_WIDTH,
            align: 'center',
          });
      }
      doc.page.margins.bottom = bottomMargin;
    }

    doc.flushPages();
  }
}
