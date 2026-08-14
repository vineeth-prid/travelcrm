import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';

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
 * Everything the customer proposal PDF is allowed to know.
 *
 * This type is the security boundary for §38: it has no `actualCost`, no
 * `grossProfit`, no `marginPercent` and no internal notes, so a renderer that
 * only ever sees one of these *cannot* print them however it is written. The
 * service builds it field by field from the database record — never by
 * spreading the record — so a column added later is absent by default rather
 * than quietly published to customers.
 */
export interface CustomerProposalPdfData {
  reference: string;
  version: number;
  generatedAt: Date;

  customerName: string;
  title: string;
  destination: string | null;
  travelStart: Date | null;
  travelEnd: Date | null;
  adults: number | null;
  children: number | null;

  executiveSummary: string | null;
  itinerary: string | null;
  hotelInfo: string | null;
  transportInfo: string | null;
  activities: string | null;
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;

  currency: string;
  /** The only figure on the document. What the customer is asked to pay. */
  sellingPrice: number;
  validUntil: Date;
}

/** "5 Nights / 6 Days", the way a travel document says it. */
function duration(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (nights < 0) return null;
  if (nights === 0) return 'Day trip';
  return `${nights} ${nights === 1 ? 'Night' : 'Nights'} / ${nights + 1} Days`;
}

function travellers(adults: number | null, children: number | null): string | null {
  const parts: string[] = [];
  if (adults) parts.push(`${adults} ${adults === 1 ? 'Adult' : 'Adults'}`);
  if (children) parts.push(`${children} ${children === 1 ? 'Child' : 'Children'}`);
  return parts.length > 0 ? parts.join(' + ') : null;
}

/**
 * Renders a proposal as a branded, customer-facing A4 document.
 *
 * Separate from QuotePdfService on purpose: that renders the inbox's quick
 * line-item quote, which is a different document with a different layout and a
 * different audience. Sharing one renderer between them would mean a branch on
 * every second line.
 */
@Injectable()
export class ProposalPdfService {
  private readonly logger = new Logger(ProposalPdfService.name);
  constructor(private readonly config: ConfigService<Env, true>) {}

  async render(data: CustomerProposalPdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      // Page "n of m" cannot be written until the total is known.
      bufferPages: true,
      info: {
        Title: `${data.title} — ${data.reference}`,
        Author: this.config.get('COMPANY_NAME', { infer: true }),
        Subject: `Travel proposal for ${data.customerName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    registerBrandFonts(doc);

    this.cover(doc, data);
    this.section(doc, 'Your requirement', data.executiveSummary);
    this.section(doc, 'Itinerary', data.itinerary);
    this.section(doc, 'Hotels', data.hotelInfo);
    this.section(doc, 'Transport', data.transportInfo);
    this.section(doc, 'Activities', data.activities);
    this.twoColumns(doc, 'Inclusions', data.inclusions, 'Exclusions', data.exclusions);
    this.pricing(doc, data);
    this.section(doc, 'Terms & conditions', data.terms, 8.5);
    this.contact(doc);
    this.footers(doc, data);

    doc.end();
    return finished;
  }

  private cover(doc: PDFKit.PDFDocument, data: CustomerProposalPdfData): void {
    // A Pale Sky wash behind the masthead, full bleed.
    doc.rect(0, 0, PAGE_WIDTH, 188).fill(BRAND.sky);

    const logo = brandLogoPath(this.config.get('COMPANY_LOGO_PATH', { infer: true }));
    if (logo) {
      try {
        doc.image(logo, MARGIN, 38, { fit: [170, 56] });
      } catch (error) {
        // A broken logo file must never stop a consultant sending a proposal.
        this.logger.warn(`Could not render the company logo: ${String(error)}`);
      }
    } else {
      doc
        .fillColor(BRAND.slate)
        .font('brand-heading-bold')
        .fontSize(18)
        .text(this.config.get('COMPANY_NAME', { infer: true }), MARGIN, 52);
    }

    doc
      .fillColor(BRAND.slate)
      .font('brand-body')
      .fontSize(9)
      .text('TRAVEL PROPOSAL', PAGE_WIDTH - MARGIN - 200, 52, {
        width: 200,
        align: 'right',
        characterSpacing: 1.2,
      });
    doc
      .font('brand-heading')
      .fontSize(11)
      .text(data.reference, PAGE_WIDTH - MARGIN - 200, 66, { width: 200, align: 'right' });
    doc
      .font('brand-body')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`Version ${data.version}`, PAGE_WIDTH - MARGIN - 200, 82, {
        width: 200,
        align: 'right',
      });

    doc
      .fillColor(BRAND.slate)
      .font('brand-heading-bold')
      .fontSize(24)
      .text(data.title, MARGIN, 118, { width: CONTENT_WIDTH - 20, lineGap: 2 });

    doc.y = 200;

    // Prepared-for block, then the facts of the trip.
    doc
      .fillColor(MUTED)
      .font('brand-body')
      .fontSize(8.5)
      .text('PREPARED FOR', MARGIN, doc.y, { characterSpacing: 1 });
    doc
      .fillColor(BRAND.slate)
      .font('brand-heading')
      .fontSize(15)
      .text(data.customerName, MARGIN, doc.y + 3);

    doc.y += 14;

    const facts: [string, string][] = [
      ['Destination', data.destination ?? '—'],
      ['Duration', duration(data.travelStart, data.travelEnd) ?? 'To be confirmed'],
      [
        'Travel dates',
        data.travelStart
          ? `${longDate(data.travelStart)}${data.travelEnd ? ` — ${longDate(data.travelEnd)}` : ''}`
          : 'To be confirmed',
      ],
      ['Travellers', travellers(data.adults, data.children) ?? 'To be confirmed'],
    ];

    const columnWidth = CONTENT_WIDTH / 2;
    const top = doc.y;
    facts.forEach(([label, value], index) => {
      const x = MARGIN + (index % 2) * columnWidth;
      const y = top + Math.floor(index / 2) * 46;
      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(8)
        .text(label.toUpperCase(), x, y, {
          width: columnWidth - 16,
          characterSpacing: 0.8,
        });
      doc
        .fillColor(BRAND.slate)
        .font('brand-body-bold')
        .fontSize(10.5)
        .text(value, x, y + 12, { width: columnWidth - 16 });
    });

    doc.y = top + 46 * Math.ceil(facts.length / 2) + 6;
    this.pricePill(doc, data);
  }

  /** The headline figure, in Sun Yellow — the one accent on the page. */
  private pricePill(doc: PDFKit.PDFDocument, data: CustomerProposalPdfData): void {
    const height = 58;
    const y = doc.y;

    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 8).fill(BRAND.yellow);
    doc
      .fillColor(BRAND.slate)
      .font('brand-body')
      .fontSize(8.5)
      .text('PACKAGE PRICE', MARGIN + 18, y + 13, { characterSpacing: 1 });
    doc
      .font('brand-heading-bold')
      .fontSize(20)
      .text(money(data.currency, data.sellingPrice), MARGIN + 18, y + 26);
    doc
      .font('brand-body')
      .fontSize(8.5)
      .fillColor(BRAND.slate)
      .text(`Valid until ${longDate(data.validUntil)}`, PAGE_WIDTH - MARGIN - 218, y + 34, {
        width: 200,
        align: 'right',
      });

    doc.y = y + height + 22;
  }

  /** A titled block of prose. Skipped entirely when there is nothing to say. */
  private section(
    doc: PDFKit.PDFDocument,
    title: string,
    body: string | null,
    fontSize = 10,
  ): void {
    if (!body?.trim()) return;

    this.heading(doc, title);
    doc
      .fillColor(BRAND.slate)
      .font('brand-body')
      .fontSize(fontSize)
      .text(body.trim(), MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 3, align: 'left' });
    doc.y += 18;
  }

  private twoColumns(
    doc: PDFKit.PDFDocument,
    leftTitle: string,
    left: string | null,
    rightTitle: string,
    right: string | null,
  ): void {
    if (!left?.trim() && !right?.trim()) return;

    // Side by side only when both have content; otherwise the lone column
    // would sit oddly at half width.
    if (!left?.trim() || !right?.trim()) {
      this.section(doc, left?.trim() ? leftTitle : rightTitle, left?.trim() ? left : right);
      return;
    }

    this.heading(doc, `${leftTitle} & ${rightTitle.toLowerCase()}`);

    const gutter = 24;
    const columnWidth = (CONTENT_WIDTH - gutter) / 2;
    const top = doc.y;

    const column = (title: string, body: string, x: number): number => {
      doc.fillColor(BRAND.teal).font('brand-body-bold').fontSize(9).text(title, x, top, {
        width: columnWidth,
      });
      doc
        .fillColor(BRAND.slate)
        .font('brand-body')
        .fontSize(9.5)
        .text(body.trim(), x, top + 15, { width: columnWidth, lineGap: 2.5 });
      return doc.y;
    };

    const leftBottom = column(leftTitle, left, MARGIN);
    const rightBottom = column(rightTitle, right, MARGIN + columnWidth + gutter);

    doc.y = Math.max(leftBottom, rightBottom) + 18;
  }

  private pricing(doc: PDFKit.PDFDocument, data: CustomerProposalPdfData): void {
    this.heading(doc, 'Pricing');

    const y = doc.y;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 52, 6).fillAndStroke(BRAND.canvas, RULE);

    doc
      .fillColor(BRAND.slate)
      .font('brand-body-bold')
      .fontSize(10.5)
      .text('Total package price', MARGIN + 16, y + 20, { width: CONTENT_WIDTH / 2 });

    doc
      .fillColor(BRAND.teal)
      .font('brand-heading-bold')
      .fontSize(16)
      .text(money(data.currency, data.sellingPrice), PAGE_WIDTH - MARGIN - 216, y + 16, {
        width: 200,
        align: 'right',
      });

    doc.y = y + 52 + 8;
    doc
      .fillColor(MUTED)
      .font('brand-body')
      .fontSize(8.5)
      .text(
        `This price is valid until ${longDate(data.validUntil)} and is subject to availability at the time of booking.`,
        MARGIN,
        doc.y,
        { width: CONTENT_WIDTH },
      );
    doc.y += 18;
  }

  private contact(doc: PDFKit.PDFDocument): void {
    const contact = this.config.get('COMPANY_CONTACT', { infer: true });
    if (!contact) return;

    this.space(doc, 86);

    const y = doc.y;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 70, 8).fill(BRAND.aqua);
    doc
      .fillColor(BRAND.slate)
      .font('brand-heading-bold')
      .fontSize(12)
      .text('Ready to book, or have a question?', MARGIN + 18, y + 16, {
        width: CONTENT_WIDTH - 36,
      });
    doc
      .font('brand-body')
      .fontSize(9.5)
      .text(contact, MARGIN + 18, y + 36, { width: CONTENT_WIDTH - 36 });

    doc.y = y + 70 + 10;
  }

  private heading(doc: PDFKit.PDFDocument, title: string): void {
    this.space(doc, 62);

    doc
      .fillColor(BRAND.slate)
      .font('brand-heading')
      .fontSize(13)
      .text(title, MARGIN, doc.y, { width: CONTENT_WIDTH });

    const y = doc.y + 5;
    // A short teal underline rather than a full rule: quieter, and it reads as
    // a deliberate mark instead of a table border.
    doc.rect(MARGIN, y, 34, 2).fill(BRAND.teal);
    doc.y = y + 14;
  }

  /** Starts a new page when `needed` points would run into the footer. */
  private space(doc: PDFKit.PDFDocument, needed: number): void {
    if (doc.y + needed > CONTENT_BOTTOM) {
      doc.addPage();
      doc.y = MARGIN;
    }
  }

  /**
   * Drawn last, over buffered pages, because "page 2 of 5" cannot be written
   * before the fifth page exists.
   */
  private footers(doc: PDFKit.PDFDocument, data: CustomerProposalPdfData): void {
    const company = this.config.get('COMPANY_NAME', { infer: true });
    const range = doc.bufferedPageRange();

    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);

      const y = PAGE_HEIGHT - MARGIN - 22;
      doc
        .strokeColor(RULE)
        .lineWidth(0.75)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke();

      doc
        .fillColor(MUTED)
        .font('brand-body')
        .fontSize(7.5)
        .text(`${company} · ${data.reference} · ${longDate(data.generatedAt)}`, MARGIN, y + 8, {
          width: CONTENT_WIDTH * 0.7,
        });

      doc.text(`Page ${index + 1} of ${range.count}`, PAGE_WIDTH - MARGIN - 140, y + 8, {
        width: 140,
        align: 'right',
      });
    }

    // Leaving the buffer on a switched-to page confuses pdfkit's flush.
    doc.flushPages();
  }
}
