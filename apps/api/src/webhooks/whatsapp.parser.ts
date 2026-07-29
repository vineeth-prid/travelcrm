import type { IncomingMessage } from '../communication/message-ingest.service';
import { asArray, asRecord, asString, readPath, toDate } from './payload.utils';

export interface DeliveryNotification {
  externalMessageId: string;
  deliveredAt: Date;
}

/**
 * Extracts text messages from a WhatsApp Cloud API webhook. Non-text types
 * (image, audio, document, location, reaction…) are ignored by design.
 */
export function parseWhatsAppMessages(payload: unknown): IncomingMessage[] {
  const messages: IncomingMessage[] = [];

  for (const entry of asArray(readPath(payload, 'entry'))) {
    for (const change of asArray(readPath(entry, 'changes'))) {
      const value = asRecord(readPath(change, 'value'));
      if (!value) continue;

      // wa_id -> display name, so a message can be attributed to a person.
      const names = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const waId = asString(readPath(contact, 'wa_id'));
        const name = asString(readPath(contact, 'profile', 'name'));
        if (waId) names.set(waId, name ?? waId);
      }

      for (const message of asArray(value.messages)) {
        if (asString(readPath(message, 'type')) !== 'text') continue;

        const externalMessageId = asString(readPath(message, 'id'));
        const from = asString(readPath(message, 'from'));
        const content = asString(readPath(message, 'text', 'body'));
        if (!externalMessageId || !from || !content) continue;

        messages.push({
          channel: 'WHATSAPP',
          contactExternalId: from,
          contactName: names.get(from) ?? from,
          contactPhone: from,
          externalMessageId,
          content,
          messageType: 'TEXT',
          sentAt: toDate(readPath(message, 'timestamp')),
        });
      }
    }
  }

  return messages;
}

/** Delivery receipts for messages we sent. Read receipts are out of scope. */
export function parseWhatsAppDeliveries(payload: unknown): DeliveryNotification[] {
  const deliveries: DeliveryNotification[] = [];

  for (const entry of asArray(readPath(payload, 'entry'))) {
    for (const change of asArray(readPath(entry, 'changes'))) {
      for (const status of asArray(readPath(change, 'value', 'statuses'))) {
        if (asString(readPath(status, 'status')) !== 'delivered') continue;

        const externalMessageId = asString(readPath(status, 'id'));
        if (!externalMessageId) continue;

        deliveries.push({
          externalMessageId,
          deliveredAt: toDate(readPath(status, 'timestamp')),
        });
      }
    }
  }

  return deliveries;
}
