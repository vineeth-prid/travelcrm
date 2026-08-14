/**
 * CSV writing, with the two things people forget.
 *
 * One: quoting. A destination of `Dubai, UAE` or a note containing a newline
 * has to be quoted or the file silently gains a column.
 *
 * Two: formula injection. Excel and Sheets treat a cell beginning `=`, `+`,
 * `-`, `@`, tab or carriage return as a formula, so a customer name of
 * `=HYPERLINK("http://evil","click")` becomes executable in whoever's
 * spreadsheet opens the export. Prefixing with an apostrophe neuters it while
 * still reading correctly.
 */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (value instanceof Date) {
    text = value.toISOString().slice(0, 10);
  } else if (typeof value === 'boolean') {
    text = value ? 'yes' : 'no';
  } else if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'bigint') {
    text = value.toString();
  } else {
    // Anything else is a caller mistake. JSON beats "[object Object]" filling
    // a column nobody can read.
    text = JSON.stringify(value) ?? '';
  }

  const safe = DANGEROUS_PREFIX.test(text) ? `'${text}` : text;

  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Rows to a CSV document.
 *
 * A BOM is prepended: without it Excel on Windows reads UTF-8 as the local
 * codepage, and every customer name with an accent in it arrives mangled.
 */
/** U+FEFF, written as an escape so it is visible in the source. */
const BOM = '\ufeff';

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** `leads-2026-08-14.csv` */
export function csvFilename(what: string): string {
  return `${what}-${new Date().toISOString().slice(0, 10)}.csv`;
}
