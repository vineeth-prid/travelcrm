import {
  extractedDetailsSchema,
  leadRequirementDraftSchema,
  type ExtractedDetails,
  type LeadRequirementDraft,
} from '@travel-crm/sdk';

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

/**
 * Accepts 180000, "180000", "₹1,80,000", "1.5 lakh", "2 crore".
 *
 * The Indian units matter: a customer writes "budget around 1.5 lakh", and
 * stripping to digits alone would read that as 15 — a number wrong by four
 * orders of magnitude that still looks like a plausible field value. The
 * prompt asks the model to convert; this is the guard for when it does not.
 */
function numberValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '' || UNKNOWN.test(trimmed)) return null;

  const scale = /\bcrore?s?\b|\bcr\b/i.test(trimmed)
    ? 10_000_000
    : /\blakh?s?\b|\blac s?\b|\bl\b/i.test(trimmed)
      ? 100_000
      : 1;

  const digits = trimmed.replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? Math.round(parsed * scale) : null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && /^(true|yes|required|y)$/i.test(value.trim());
}

/** `YYYY-MM-DD` only. Anything the model improvises becomes null. */
function dateValue(value: unknown): string | null {
  const text = textValue(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
}

function ageListValue(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(numberValue)
    .filter((age): age is number => age !== null && age >= 0 && age <= 17)
    .slice(0, 12);
}

/** Parses a model response as JSON, tolerating a code fence around it. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let payload: unknown;
  try {
    payload = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

/**
 * Turns a model response into reviewable form values.
 *
 * Returns null when the response is not JSON at all. Individual fields that
 * fail validation are dropped to null rather than failing the whole request —
 * a salesperson reviewing four good values beats an error over the fifth.
 */
export function parseExtraction(raw: string): ExtractedDetails | null {
  const record = parseJsonObject(raw);
  if (!record) return null;

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

/**
 * Turns a model response into a reviewable lead draft.
 *
 * Same forgiving rule as above: a field that fails validation is dropped to
 * null rather than failing the request, because a consultant reviewing twelve
 * good values beats an error over the thirteenth. A missing summary *is* fatal
 * — without it there is nothing to show.
 *
 * Fields are also whitelisted rather than spread: whatever else the model
 * decided to include — a helpfully invented "estimatedPrice", say — is dropped
 * here and can never reach a form field or the database.
 */
export function parseRequirement(raw: string): LeadRequirementDraft | null {
  const record = parseJsonObject(raw);
  if (!record) return null;

  const fields = (
    typeof record.fields === 'object' && record.fields !== null ? record.fields : {}
  ) as Record<string, unknown>;

  const candidate = {
    summary: textValue(record.summary) ?? '',
    fields: {
      destination: textValue(fields.destination),
      departureCity: textValue(fields.departureCity),
      travelStart: dateValue(fields.travelStart),
      travelEnd: dateValue(fields.travelEnd),
      adults: numberValue(fields.adults),
      children: numberValue(fields.children),
      childAges: ageListValue(fields.childAges),
      tripType: textValue(fields.tripType),
      hotelCategory: textValue(fields.hotelCategory),
      mealPreference: textValue(fields.mealPreference),
      transportRequired: booleanValue(fields.transportRequired),
      flightRequired: booleanValue(fields.flightRequired),
      activityRequirements: textValue(fields.activityRequirements),
      specialRequirements: textValue(fields.specialRequirements),
      budget: numberValue(fields.budget),
    },
  };

  if (candidate.summary === '') return null;

  // A return date before the departure date is worse than no date at all.
  const { travelStart, travelEnd } = candidate.fields;
  if (travelStart && travelEnd && Date.parse(travelEnd) < Date.parse(travelStart)) {
    candidate.fields.travelEnd = null;
  }

  const result = leadRequirementDraftSchema.safeParse(candidate);
  if (result.success) {
    return result.data;
  }

  // Three fields are not nullable, so "drop it" means their empty value.
  const EMPTY: Record<string, unknown> = {
    childAges: [],
    transportRequired: false,
    flightRequired: false,
  };

  for (const issue of result.error.issues) {
    // Paths look like ['fields', 'destination']; only field-level problems are
    // recoverable, and a bad summary has already been ruled out above.
    const key = issue.path[0] === 'fields' ? issue.path[1] : undefined;
    if (typeof key === 'string') {
      (candidate.fields as Record<string, unknown>)[key] = EMPTY[key] ?? null;
    }
  }

  const retry = leadRequirementDraftSchema.safeParse(candidate);
  return retry.success ? retry.data : null;
}
