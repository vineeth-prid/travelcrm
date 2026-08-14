import type { ChatMessage, CompletionRequest } from '../chat.client';

const SYSTEM: ChatMessage = {
  role: 'system',
  content: [
    'You extract travel enquiry details from a sales conversation for a travel agency.',
    'Respond with a JSON object and nothing else — no markdown, no explanation.',
    'The object has exactly these keys: destination, travelMonth, adults, children, budget.',
    'destination: the place the customer wants to travel to, as a string.',
    'travelMonth: when they want to travel, as they said it (for example "December" or "March 2027").',
    'adults: a whole number of adult travellers.',
    'children: a whole number of children travelling.',
    'budget: the total budget as a whole number, digits only, with no currency symbol or separators.',
    'Use null for anything the customer did not clearly state. Never guess, estimate or infer a value.',
    'If the customer says a couple, that is 2 adults; if they say no children, that is 0.',
  ].join(' '),
};

export function buildExtractPrompt(transcript: string): CompletionRequest {
  return {
    messages: [SYSTEM, { role: 'user', content: `Conversation:\n${transcript}` }],
    maxTokens: 200,
    // Extraction should be reproducible, not creative.
    temperature: 0,
    json: true,
  };
}
