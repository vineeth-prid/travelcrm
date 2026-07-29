import type { ChatMessage, CompletionRequest } from '../openai.client';

const SYSTEM: ChatMessage = {
  role: 'system',
  content: [
    'You draft replies for a salesperson at a travel agency.',
    'Write the message the salesperson will send to the customer, in first person plural ("we").',
    'Be warm, professional and brief — two or three sentences at most.',
    'Move the enquiry forward: acknowledge what they asked, then ask for the most useful detail still missing.',
    'Never invent prices, availability, itineraries or policies.',
    'Never promise anything the agency has not confirmed.',
    'Reply with the message text only — no greeting placeholders, no subject line, no markdown, no quotes.',
  ].join(' '),
};

/** Only the CRM fields that change what a good reply asks for. */
export interface ReplyContext {
  destination: string | null;
  travelMonth: string | null;
  adults: number | null;
  children: number | null;
  budget: number | null;
}

function knownDetails(context: ReplyContext): string {
  const lines = Object.entries(context)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `- ${key}: ${String(value)}`);

  return lines.length > 0
    ? `Details already recorded (do not ask for these again):\n${lines.join('\n')}`
    : 'No details have been recorded yet.';
}

export function buildReplyPrompt(transcript: string, context: ReplyContext): CompletionRequest {
  return {
    messages: [
      SYSTEM,
      { role: 'user', content: `${knownDetails(context)}\n\nConversation:\n${transcript}` },
    ],
    maxTokens: 220,
    temperature: 0.4,
  };
}
