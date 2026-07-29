import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';

import type { Env } from '../config/env';
import type { QuoteWithItems } from './quotes.mappers';

/** A4 at 72dpi, with a comfortable margin. */
const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLUMNS = {
  title: { x: MARGIN, width: 210 },
  quantity: { x: MARGIN + 220, width: 50 },
  unitPrice: { x: MARGIN + 280, width: 100 },
  total: { x: MARGIN + 390, width: 105 },
};

const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e2e8f0';

export interface PdfCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  destination: string | null;
}

function money(currency: string, amount: number): string {
  // Intl handles grouping per locale; the currency code is shown as-is so the
  // consultant always sees which currency they quoted in.
  return `${currency} ${new Intl.NumberFormat('en-IN').format(amount)}`;
}

function longDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Renders a quote to a PDF. Layout is fixed — there is no template system. */
@Injectable()
export class QuotePdfService {
  private readonly logger = new Logger(QuotePdfService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async render(quote: QuoteWithItems, customer: PdfCustomer): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: quote.title } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.header(doc);
    this.customerBlock(doc, customer);
    this.titleBlock(doc, quote);
    this.itemsTable(doc, quote);
    this.totalRow(doc, quote);
    this.footer(doc, quote);

    doc.end();
    return finished;
  }

  private header(doc: PDFKit.PDFDocument): void {
    const logoPath = this.config.get('COMPANY_LOGO_PATH', { infer: true });
    const name = this.config.get('COMPANY_NAME', { infer: true });
    const contact = this.config.get('COMPANY_CONTACT', { infer: true });

    if (logoPath && existsSync(logoPath)) {
      try {
        doc.image(logoPath, MARGIN, MARGIN, { fit: [140, 48] });
        doc.y = MARGIN + 56;
      } catch (error) {
        // A broken logo file must never stop a consultant sending a quote.
        this.logger.warn(`Could not render the company logo: ${String(error)}`);
      }
    }

    doc.fillColor(INK).fontSize(18).font('Helvetica-Bold').text(name, MARGIN, doc.y);

    if (contact) {
      doc.moveDown(0.2).fillColor(MUTED).fontSize(9).font('Helvetica').text(contact);
    }

    this.rule(doc, 16);
  }

  private customerBlock(doc: PDFKit.PDFDocument, customer: PdfCustomer): void {
    const rows: [string, string][] = [
      ['Prepared for', customer.name],
      ...(customer.phone ? ([['Phone', customer.phone]] as [string, string][]) : []),
      ...(customer.email ? ([['Email', customer.email]] as [string, string][]) : []),
      ...(customer.destination
        ? ([['Destination', customer.destination]] as [string, string][])
        : []),
    ];

    for (const [label, value] of rows) {
      doc
        .fillColor(MUTED)
        .fontSize(9)
        .font('Helvetica')
        .text(label, MARGIN, doc.y, { continued: true, width: 110 });
      doc.fillColor(INK).fontSize(10).font('Helvetica').text(`   ${value}`);
      doc.moveDown(0.25);
    }

    this.rule(doc, 12);
  }

  private titleBlock(doc: PDFKit.PDFDocument, quote: QuoteWithItems): void {
    doc.fillColor(INK).fontSize(15).font('Helvetica-Bold').text(quote.title, MARGIN, doc.y);
    doc
      .moveDown(0.2)
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text(`Quote version ${quote.version} · ${longDate(quote.createdAt)}`);

    this.rule(doc, 14);
  }

  private itemsTable(doc: PDFKit.PDFDocument, quote: QuoteWithItems): void {
    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
    const headerY = doc.y;
    doc.text('Item', COLUMNS.title.x, headerY, { width: COLUMNS.title.width });
    doc.text('Qty', COLUMNS.quantity.x, headerY, { width: COLUMNS.quantity.width, align: 'right' });
    doc.text('Unit price', COLUMNS.unitPrice.x, headerY, {
      width: COLUMNS.unitPrice.width,
      align: 'right',
    });
    doc.text('Total', COLUMNS.total.x, headerY, { width: COLUMNS.total.width, align: 'right' });

    doc.y = headerY + 14;
    this.rule(doc, 0);

    for (const item of quote.items) {
      // Keep a row whole: start a new page rather than split it across the fold.
      if (doc.y > 700) {
        doc.addPage();
      }

      const rowY = doc.y + 6;
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold');
      doc.text(item.title, COLUMNS.title.x, rowY, { width: COLUMNS.title.width });

      const afterTitle = doc.y;
      doc.font('Helvetica');
      doc.text(String(item.quantity), COLUMNS.quantity.x, rowY, {
        width: COLUMNS.quantity.width,
        align: 'right',
      });
      doc.text(money(quote.currency, item.unitPrice), COLUMNS.unitPrice.x, rowY, {
        width: COLUMNS.unitPrice.width,
        align: 'right',
      });
      doc.text(money(quote.currency, item.totalPrice), COLUMNS.total.x, rowY, {
        width: COLUMNS.total.width,
        align: 'right',
      });

      doc.y = afterTitle;
      if (item.description) {
        doc
          .fillColor(MUTED)
          .fontSize(9)
          .font('Helvetica')
          .text(item.description, COLUMNS.title.x, doc.y + 2, { width: COLUMNS.title.width + 120 });
      }

      this.rule(doc, 8);
    }
  }

  private totalRow(doc: PDFKit.PDFDocument, quote: QuoteWithItems): void {
    const y = doc.y + 4;
    doc.fillColor(MUTED).fontSize(10).font('Helvetica-Bold');
    doc.text('Total', COLUMNS.unitPrice.x, y, { width: COLUMNS.unitPrice.width, align: 'right' });
    doc.fillColor(INK).fontSize(13).font('Helvetica-Bold');
    doc.text(money(quote.currency, quote.totalAmount), COLUMNS.total.x, y - 2, {
      width: COLUMNS.total.width,
      align: 'right',
    });

    doc.y = y + 24;
  }

  private footer(doc: PDFKit.PDFDocument, quote: QuoteWithItems): void {
    if (quote.notes) {
      this.rule(doc, 4);
      doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('Notes', MARGIN, doc.y);
      doc
        .moveDown(0.3)
        .fillColor(INK)
        .fontSize(10)
        .font('Helvetica')
        .text(quote.notes, { width: CONTENT_WIDTH });
    }

    this.rule(doc, 14);
    doc
      .fillColor(INK)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`Valid until ${longDate(quote.validUntil)}`, MARGIN, doc.y);
    doc
      .moveDown(0.6)
      .fillColor(MUTED)
      .fontSize(10)
      .font('Helvetica')
      .text('Thank you for considering us for your trip.');
  }

  private rule(doc: PDFKit.PDFDocument, spacingBefore: number): void {
    const y = doc.y + spacingBefore;
    doc
      .strokeColor(RULE)
      .lineWidth(0.75)
      .moveTo(MARGIN, y)
      .lineTo(PAGE_WIDTH - MARGIN, y)
      .stroke();
    doc.y = y + 12;
  }
}
