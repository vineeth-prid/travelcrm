import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Tour De India Holidays look, shared by every customer-facing document.
 *
 * Extracted once there were two of them. Proposals and invoices are different
 * documents with different layouts, but the palette, the typefaces, the logo
 * and the way money and dates are written must not drift apart between them.
 */

export const BRAND = {
  teal: '#00B48F',
  slate: '#2F3B47',
  yellow: '#F5D94F',
  aqua: '#78C0C0',
  sky: '#B4D8E4',
  canvas: '#FCFCFB',
} as const;

export const MUTED = '#6B7A86';
export const RULE = '#E4EBEE';

// A4 at 72dpi.
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const FOOTER_HEIGHT = 46;
/** Content must stop here so it never collides with the footer. */
export const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

/**
 * Poppins for headings and Inter for body, per the brand. Both are optional:
 * drop the four .ttf files into apps/api/assets/fonts and they are picked up
 * automatically. Without them documents fall back to Helvetica, which is
 * off-brand but still produces a correct, sendable PDF rather than crashing.
 */
const FONT_FILES: Record<string, string> = {
  'brand-heading': 'Poppins-SemiBold.ttf',
  'brand-heading-bold': 'Poppins-Bold.ttf',
  'brand-body': 'Inter-Regular.ttf',
  'brand-body-bold': 'Inter-SemiBold.ttf',
};

const FALLBACK: Record<string, string> = {
  'brand-heading': 'Helvetica-Bold',
  'brand-heading-bold': 'Helvetica-Bold',
  'brand-body': 'Helvetica',
  'brand-body-bold': 'Helvetica-Bold',
};

/** apps/api/assets, from either src/… or dist/… */
export const ASSETS = join(__dirname, '..', '..', 'assets');

const logger = new Logger('PdfBrand');
let warnedAboutFonts = false;

export function registerBrandFonts(doc: PDFKit.PDFDocument): void {
  const missing: string[] = [];

  for (const [name, file] of Object.entries(FONT_FILES)) {
    const path = join(ASSETS, 'fonts', file);
    if (existsSync(path)) {
      try {
        doc.registerFont(name, path);
        continue;
      } catch (error) {
        logger.warn(`Could not load ${file}: ${String(error)}`);
      }
    }
    missing.push(file);
    doc.registerFont(name, FALLBACK[name]);
  }

  // Once per process, not once per PDF: this would otherwise log on every
  // download for the entire life of the deployment.
  if (missing.length > 0 && !warnedAboutFonts) {
    warnedAboutFonts = true;
    logger.warn(
      `Brand fonts not found in ${join(ASSETS, 'fonts')} (${missing.join(', ')}). ` +
        'Documents will render in Helvetica. Add the .ttf files to use Poppins and Inter.',
    );
  }
}

/** The transparent brand logo, if it is where we expect it. */
export function brandLogoPath(configuredPath: string): string | null {
  if (configuredPath && existsSync(configuredPath)) return configuredPath;

  const bundled = join(ASSETS, 'brand', 'tour-de-india-logo-transparent.png');
  return existsSync(bundled) ? bundled : null;
}

/** Indian grouping: 150000 reads as "1,50,000", which is what customers expect. */
export function money(currency: string, amount: number): string {
  return `${currency} ${new Intl.NumberFormat('en-IN').format(amount)}`;
}

export function longDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
