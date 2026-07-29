import { extractedDetailsSchema, type ExtractedDetails } from '@travel-crm/sdk';

/** Words a model reaches for instead of returning null. */
const UNKNOWN = /^(null|undefined|unknown|n\/?a|none|not specified|not mentioned|tbd|-{1,2})$/i;

/** Models sometimes wrap JSON in a fenced block despite being told not to. */
function stripCodeFence(raw: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw.trim());
  return (fenced?.[1] ?? raw).trim();
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || UNKNOWN.test(trimmed) ? null : trimmed;
}

/** Accepts 180000, "180000", "₹1,80,000" — anything else becomes null. */
function numberValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '' || UNKNOWN.test(trimmed)) return null;

  const digits = trimmed.replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Turns a model response into reviewable form values.
 *
 * Returns null when the response is not JSON at all. Individual fields that
 * fail validation are dropped to null rather than failing the whole request —
 * a salesperson reviewing four good values beats an error over the fifth.
 */
export function parseExtraction(raw: string): ExtractedDetails | null {
  let payload: unknown;
  try {
    payload = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidate = {
    destination: textValue(record.destination),
    travelMonth: textValue(record.travelMonth),
    adults: numberValue(record.adults),
    children: numberValue(record.children),
    budget: numberValue(record.budget),
  };

  const result = extractedDetailsSchema.safeParse(candidate);
  if (result.success) {
    return result.data;
  }

  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && key in candidate) {
      (candidate as Record<string, unknown>)[key] = null;
    }
  }

  const retry = extractedDetailsSchema.safeParse(candidate);
  return retry.success ? retry.data : null;
}
