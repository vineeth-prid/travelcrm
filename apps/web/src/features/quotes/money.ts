/** Matches how amounts are rendered on the PDF, so the two never disagree. */
export function formatMoney(currency: string, amount: number): string {
  return `${currency} ${new Intl.NumberFormat('en-IN').format(amount)}`;
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
