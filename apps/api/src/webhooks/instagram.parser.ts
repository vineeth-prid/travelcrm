import type { IncomingMessage } from '../communication/message-ingest.service';
import { asArray, asRecord, asString, readPath, toDate } from './payload.utils';

export interface LeadNotification {
  leadgenId: string;
  createdAt: Date;
}

/** Events we recognise but do not store yet, reported by the caller. */
export interface IgnoredEvent {
  kind: 'postback' | 'reaction';
  senderId: string | null;
}

export interface InstagramEvents {
  messages: IncomingMessage[];
  ignored: IgnoredEvent[];
}

/**
 * Extracts direct messages from an Instagram webhook (`object: "instagram"`,
 * events under `entry[].messaging[]`).
 *
 * Skipped on purpose: echoes of our own replies — Instagram delivers those back
 * to us, and storing them duplicates every message the CRM sends — and
 * deletions.
 */
export function parseInstagramEvents(payload: unknown): InstagramEvents {
  const messages: IncomingMessage[] = [];
  const ignored: IgnoredEvent[] = [];

  // A Facebook Page / Messenger payload would parse almost identically and
  // produce contacts keyed by the wrong kind of id. Only Instagram belongs here.
  if (asString(readPath(payload, 'object')) !== 'instagram') {
    return { messages, ignored };
  }

  for (const entry of asArray(readPath(payload, 'entry'))) {
    for (const event of asArray(readPath(entry, 'messaging'))) {
      // `sender.id` is the IGSID: stable for this person on this app, which is
      // what makes it usable as the contact's external id.
      const senderId = asString(readPath(event, 'sender', 'id'));

      if (readPath(event, 'postback') !== undefined) {
        ignored.push({ kind: 'postback', senderId });
        continue;
      }
      if (readPath(event, 'reaction') !== undefined) {
        ignored.push({ kind: 'reaction', senderId });
        continue;
      }

      const message = asRecord(readPath(event, 'message'));
      if (!message || message.is_echo === true || message.is_deleted === true) continue;

      const externalMessageId = asString(message.mid);
      const content = asString(message.text) ?? describeAttachments(message.attachments);
      if (!externalMessageId || !content || !senderId) continue;

      messages.push({
        channel: 'INSTAGRAM',
        contactExternalId: senderId,
        // Replaced with the real profile name once we look the IGSID up.
        contactName: `Instagram ${senderId.slice(-6)}`,
        externalMessageId,
        content,
        messageType: 'TEXT',
        sentAt: toDate(readPath(event, 'timestamp')),
      });
    }
  }

  return { messages, ignored };
}

/**
 * Renders attachments as text so an image or voice note still reaches the
 * inbox with its link intact.
 *
 * ponytail: attachments are stored as a text line, not as typed media. Add an
 * IMAGE/VIDEO/AUDIO MessageType and inline rendering when the inbox needs to
 * show thumbnails rather than links.
 */
function describeAttachments(value: unknown): string | null {
  const lines = asArray(value)
    .map((attachment) => {
      const type = asString(readPath(attachment, 'type')) ?? 'file';
      const url = asString(readPath(attachment, 'payload', 'url'));
      return url ? `[${type}] ${url}` : `[${type}]`;
    })
    .filter(Boolean);

  return lines.length ? lines.join('\n') : null;
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
