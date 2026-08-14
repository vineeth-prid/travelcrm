import type { ChatMessage, CompletionRequest } from '../chat.client';

/**
 * Turns a consultant's rough notes into a structured requirement plus a tidy
 * customer-facing summary.
 *
 * The instructions are blunt about money on purpose. The only figure the model
 * may return is a budget the customer stated about themselves; every price,
 * cost, tax and margin in this application is worked out by application code
 * from numbers a human typed. A model that helpfully "estimates" a package
 * price would be producing a financial figure nobody can account for.
 */
const SYSTEM: ChatMessage = {
  role: 'system',
  content: [
    "You work for a travel agency. You are given a consultant's rough notes about a customer enquiry.",
    'You do two things: restate the requirement in clean professional English, and pull out structured fields.',
    '',
    'Respond with a JSON object and nothing else — no markdown, no explanation.',
    'The object has exactly two keys: "summary" and "fields".',
    '',
    '"summary" is a short professional restatement of what the customer wants, suitable to show the customer.',
    'Write it as prose or short labelled lines. Do not invent anything that is not in the notes.',
    '',
    '"fields" is an object with exactly these keys:',
    'destination, departureCity, travelStart, travelEnd, adults, children, childAges,',
    'tripType, hotelCategory, mealPreference, transportRequired, flightRequired,',
    'activityRequirements, specialRequirements, budget.',
    '',
    'travelStart and travelEnd are calendar dates formatted YYYY-MM-DD, or null.',
    'adults and children are whole numbers. childAges is an array of whole numbers, in years — use [] if none.',
    'transportRequired and flightRequired are true or false.',
    'budget is a whole number of currency units, digits only, no symbol and no separators.',
    '',
    'Use null for any field the notes do not clearly state. Never guess, estimate or infer.',
    'A couple means 2 adults. "No kids" means 0 children.',
    'Indian numbering may appear: 1 lakh is 100000, 1.5 lakh is 150000, 1 crore is 10000000.',
    '',
    'CRITICAL: you must never invent or calculate money, availability or inclusions.',
    'Do not produce a package price, a cost, a per-person rate, a tax, a discount or a total.',
    'The only number you may put in "budget" is a budget the customer themselves stated.',
    'Do not name hotels, airlines or flights unless the notes name them.',
    'Do not claim anything is available, confirmed or bookable.',
  ].join('\n'),
};

export function buildRequirementPrompt(notes: string, today: string): CompletionRequest {
  return {
    messages: [
      SYSTEM,
      {
        role: 'user',
        content: [
          `Today's date is ${today}. Resolve relative dates such as "next December" against it.`,
          'If the customer gave a month but no day, use the first of that month for travelStart',
          'and leave travelEnd null unless a duration was stated.',
          '',
          'Notes:',
          notes,
        ].join('\n'),
      },
    ],
    maxTokens: 900,
    // Extraction should be reproducible, not creative.
    temperature: 0,
    json: true,
  };
}
