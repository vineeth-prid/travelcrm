/**
 * Response contract shared by the API (apps/api) and the web client (apps/web).
 * Request shapes live in `schemas.ts`, derived from their Zod schema.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: User;
}

export interface MessageResponse {
  message: string;
}

export type ServiceState = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  services: {
    api: ServiceState;
    database: ServiceState;
  };
}

export interface AppInfo {
  name: string;
  version: string;
  buildNumber: string;
  environment: string;
  apiVersion: string;
  nodeVersion: string;
  startedAt: string;
  /** Company identity used on quote PDFs. */
  companyName: string;
  companyLogoConfigured: boolean;
}

// --- Communication ---------------------------------------------------------

export type Channel = 'INSTAGRAM' | 'INSTAGRAM_LEAD' | 'WHATSAPP';
export type MessageDirection = 'INCOMING' | 'OUTGOING';
export type MessageType = 'TEXT' | 'LEAD';

/** Channels a salesperson can reply on. Lead ads are inbound-only. */
export const REPLYABLE_CHANNELS: readonly Channel[] = ['INSTAGRAM', 'WHATSAPP'];

/**
 * How long after the customer's last message a free-form reply is allowed.
 * Instagram and WhatsApp both use 24 hours.
 */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Milliseconds of reply window left, or null when the channel has no window. */
export function replyWindowRemainingMs(conversation: {
  channel: Channel;
  lastInboundAt: string | null;
}): number | null {
  if (!REPLYABLE_CHANNELS.includes(conversation.channel)) return null;
  if (!conversation.lastInboundAt) return 0;

  const elapsed = Date.now() - new Date(conversation.lastInboundAt).getTime();
  return Math.max(0, REPLY_WINDOW_MS - elapsed);
}

export interface Contact {
  id: string;
  channel: Channel;
  externalId: string;
  name: string;
  /** Instagram handle, when the profile lookup returned one. */
  username: string | null;
  phone: string | null;
  email: string | null;
  profilePicture: string | null;
}

/** Every conversation is a lead; this is where it sits in its lifecycle. */
export type LeadStatus = 'NEW' | 'QUALIFIED' | 'QUOTE_SENT' | 'WON' | 'LOST';

export interface Conversation {
  id: string;
  channel: Channel;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /**
   * When the customer last wrote in. Instagram and WhatsApp only allow a
   * free-form reply for 24 hours after this; see REPLY_WINDOW_MS.
   */
  lastInboundAt: string | null;
  unreadCount: number;
  contact: Contact;

  // Lead details, captured by the salesperson from the inbox.
  destination: string | null;
  travelMonth: string | null;
  adults: number | null;
  children: number | null;
  budget: number | null;
  status: LeadStatus;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  messageType: MessageType;
  content: string;
  externalMessageId: string | null;
  sentAt: string;
  deliveredAt: string | null;
}

// --- Quotes ----------------------------------------------------------------

export type QuoteStatus = 'DRAFT' | 'SENT';

export interface QuoteItem {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder: number;
}

export interface Quote {
  id: string;
  conversationId: string;
  version: number;
  status: QuoteStatus;
  title: string;
  currency: string;
  totalAmount: number;
  /** ISO date, `YYYY-MM-DD`. */
  validUntil: string;
  notes: string | null;
  /** True once a PDF has been generated and stored. */
  hasPdf: boolean;
  sentAt: string | null;
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteWithPdf {
  quote: Quote;
  /** Time-limited link to the stored PDF, or null if none has been generated. */
  pdfUrl: string | null;
}

/** Channels a quote PDF can actually be delivered on. */
export const QUOTE_SENDABLE_CHANNELS: readonly Channel[] = ['INSTAGRAM', 'WHATSAPP'];

// --- AI assistant ----------------------------------------------------------

export interface ConversationSummary {
  summary: string;
}

export interface SuggestedReply {
  reply: string;
}

/** Pushed over the inbox event stream. */
export type InboxEvent =
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'conversation'; conversation: Conversation };

/** Body returned by the API's global exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error: string;
  path: string;
  timestamp: string;
  /** Field-level validation problems, keyed by dot-path. */
  details?: Record<string, string[]>;
}
