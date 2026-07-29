/**
 * Tiny readers for provider payloads. Webhook bodies are untrusted input from
 * a third party, so every access goes through these rather than a cast.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function readPath(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

/**
 * Meta sends timestamps as seconds (WhatsApp, as a string) or milliseconds
 * (Instagram messaging). Anything unparseable falls back to now.
 */
export function toDate(value: unknown): Date {
  const numeric =
    typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return new Date();
  }
  // Below ~Nov 2286 in seconds; anything larger is already milliseconds.
  return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
}
