import type { Message } from '@travel-crm/sdk';

/**
 * Prompts should carry the conversation and nothing else, so the transcript is
 * capped at both ends: the most recent exchanges, each trimmed to a sane length.
 */
const MAX_MESSAGES = 40;
const MAX_CHARS_PER_MESSAGE = 800;

function label(message: Message): string {
  if (message.messageType === 'LEAD') return 'Lead form';
  return message.direction === 'INCOMING' ? 'Customer' : 'Agent';
}

export function buildTranscript(messages: Message[]): string {
  return messages
    .slice(-MAX_MESSAGES)
    .map((message) => {
      const content = message.content.slice(0, MAX_CHARS_PER_MESSAGE).replace(/\s+/g, ' ').trim();
      return `${label(message)}: ${content}`;
    })
    .join('\n');
}
