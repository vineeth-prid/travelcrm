import type { IncomingMessage } from '../communication/message-ingest.service';
import { asArray, asRecord, asString, readPath, toDate } from './payload.utils';

export interface LeadNotification {
  leadgenId: string;
  createdAt: Date;
}

/**
 * Extracts direct messages from an Instagram webhook.
 *
 * Skipped on purpose: echoes of our own replies, deletions, and anything
 * without a text body (images, audio, stickers, reactions) — out of scope.
 */
export function parseInstagramMessages(payload: unknown): IncomingMessage[] {
  const messages: IncomingMessage[] = [];

  for (const entry of asArray(readPath(payload, 'entry'))) {
    for (const event of asArray(readPath(entry, 'messaging'))) {
      const message = asRecord(readPath(event, 'message'));
      if (!message || message.is_echo === true || message.is_deleted === true) continue;

      const externalMessageId = asString(message.mid);
      const content = asString(message.text);
      const senderId = asString(readPath(event, 'sender', 'id'));
      if (!externalMessageId || !content || !senderId) continue;

      messages.push({
        channel: 'INSTAGRAM',
        contactExternalId: senderId,
        // Instagram does not include the display name on the messaging webhook.
        contactName: `Instagram ${senderId.slice(-6)}`,
        externalMessageId,
        content,
        messageType: 'TEXT',
        sentAt: toDate(readPath(event, 'timestamp')),
      });
    }
  }

  return messages;
}

/** Extracts Lead Ads notifications. The answers require a follow-up API call. */
export function parseInstagramLeads(payload: unknown): LeadNotification[] {
  const leads: LeadNotification[] = [];

  for (const entry of asArray(readPath(payload, 'entry'))) {
    for (const change of asArray(readPath(entry, 'changes'))) {
      if (asString(readPath(change, 'field')) !== 'leadgen') continue;

      const leadgenId = asString(readPath(change, 'value', 'leadgen_id'));
      if (!leadgenId) continue;

      leads.push({ leadgenId, createdAt: toDate(readPath(change, 'value', 'created_time')) });
    }
  }

  return leads;
}
