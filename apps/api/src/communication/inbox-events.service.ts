import { Injectable } from '@nestjs/common';
import type { Conversation, InboxEvent, Message } from '@travel-crm/sdk';
import { Observable, Subject } from 'rxjs';

/**
 * Fan-out for live inbox updates.
 *
 * ponytail: in-process only — a second API instance would not see these events.
 * Swap the Subject for Redis pub/sub (already running in Compose) when the API
 * is scaled horizontally.
 */
@Injectable()
export class InboxEventsService {
  private readonly events = new Subject<InboxEvent>();

  get stream(): Observable<InboxEvent> {
    return this.events.asObservable();
  }

  messageAdded(message: Message): void {
    this.events.next({ type: 'message', conversationId: message.conversationId, message });
  }

  conversationChanged(conversation: Conversation): void {
    this.events.next({ type: 'conversation', conversation });
  }
}
