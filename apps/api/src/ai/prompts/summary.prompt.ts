import type { ChatMessage, CompletionRequest } from '../openai.client';

const SYSTEM: ChatMessage = {
  role: 'system',
  content: [
    'You summarise sales conversations for a travel agency.',
    'Write a short brief for the salesperson who is about to reply.',
    'Start with one sentence describing what the customer wants.',
    'Then list only the details the customer actually stated, one per line, as "Label: value".',
    'Useful labels: Destination, Travel Month, Adults, Children, Approximate Budget.',
    'Finish with one sentence on any preference or concern worth remembering.',
    'Never invent or estimate anything the customer did not say. Omit unknown details entirely.',
    'Reply with plain text only — no markdown, no headings, no bullet characters.',
  ].join(' '),
};

export function buildSummaryPrompt(transcript: string): CompletionRequest {
  return {
    messages: [SYSTEM, { role: 'user', content: `Conversation:\n${transcript}` }],
    maxTokens: 300,
    temperature: 0.2,
  };
}
