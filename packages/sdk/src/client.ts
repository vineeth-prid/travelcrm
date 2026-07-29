import type {
  ChangePasswordRequest,
  ExtractedDetails,
  LoginRequest,
  QuoteRequest,
  SendMessageRequest,
  UpdateConversationRequest,
  UpdateProfileRequest,
} from './schemas';
import type {
  AppInfo,
  ApiErrorBody,
  Conversation,
  ConversationSummary,
  HealthResponse,
  LoginResponse,
  Message,
  MessageResponse,
  Quote,
  QuoteWithPdf,
  SuggestedReply,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the caller is not (or no longer) authenticated. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Extra headers merged into every request (e.g. forwarded cookies on the server). */
  headers?: Record<string, string>;
  /** Injectable for tests / server runtimes. Defaults to global fetch. */
  fetch?: typeof fetch;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'statusCode' in value;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly doFetch: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = options.headers ?? {};
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, signal } = options;

    let response: Response;
    try {
      response = await this.doFetch(`${this.baseUrl}${path}`, {
        method,
        signal,
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...this.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Unable to reach the server. Check your connection and try again.');
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = isErrorBody(payload) ? payload.message : response.statusText;
      const details = isErrorBody(payload) ? payload.details : undefined;
      throw new ApiError(response.status, message || 'Request failed', details);
    }

    return payload as T;
  }

  readonly auth = {
    login: (input: LoginRequest) =>
      this.request<LoginResponse>('/login', { method: 'POST', body: input }),
    logout: () => this.request<MessageResponse>('/logout', { method: 'POST' }),
  };

  readonly users = {
    me: (signal?: AbortSignal) => this.request<User>('/me', { signal }),
    updateProfile: (input: UpdateProfileRequest) =>
      this.request<User>('/me', { method: 'PATCH', body: input }),
    changePassword: (input: ChangePasswordRequest) =>
      this.request<MessageResponse>('/me/password', { method: 'POST', body: input }),
  };

  readonly conversations = {
    list: (params: { search?: string } = {}, signal?: AbortSignal) => {
      const query = params.search ? `?search=${encodeURIComponent(params.search)}` : '';
      return this.request<Conversation[]>(`/conversations${query}`, { signal });
    },
    /** Opening a conversation also clears its unread count. */
    get: (id: string, signal?: AbortSignal) =>
      this.request<Conversation>(`/conversations/${id}`, { signal }),
    /** Saves the lead details; returns the updated conversation. */
    update: (id: string, input: UpdateConversationRequest) =>
      this.request<Conversation>(`/conversations/${id}`, { method: 'PATCH', body: input }),
    messages: (id: string, signal?: AbortSignal) =>
      this.request<Message[]>(`/conversations/${id}/messages`, { signal }),
    send: (id: string, input: SendMessageRequest) =>
      this.request<Message>(`/conversations/${id}/messages`, { method: 'POST', body: input }),
    /** URL for an EventSource carrying live inbox updates. */
    eventsUrl: () => `${this.baseUrl}/conversations/events`,
  };

  readonly quotes = {
    listFor: (conversationId: string, signal?: AbortSignal) =>
      this.request<Quote[]>(`/conversations/${conversationId}/quotes`, { signal }),
    get: (id: string, signal?: AbortSignal) =>
      this.request<QuoteWithPdf>(`/quotes/${id}`, { signal }),
    /** Creates the next version for a conversation. */
    create: (conversationId: string, input: QuoteRequest) =>
      this.request<Quote>(`/conversations/${conversationId}/quotes`, {
        method: 'POST',
        body: input,
      }),
    /** Drafts only — sent quotes are immutable. */
    update: (id: string, input: QuoteRequest) =>
      this.request<Quote>(`/quotes/${id}`, { method: 'PATCH', body: input }),
    generatePdf: (id: string) =>
      this.request<QuoteWithPdf>(`/quotes/${id}/generate`, { method: 'POST' }),
    send: (id: string) => this.request<QuoteWithPdf>(`/quotes/${id}/send`, { method: 'POST' }),
  };

  /**
   * AI assistance. Every call is triggered by the salesperson and returns a
   * draft for them to review — nothing here writes or sends anything.
   */
  readonly ai = {
    summary: (conversationId: string) =>
      this.request<ConversationSummary>('/ai/summary', {
        method: 'POST',
        body: { conversationId },
      }),
    extract: (conversationId: string) =>
      this.request<ExtractedDetails>('/ai/extract', {
        method: 'POST',
        body: { conversationId },
      }),
    reply: (conversationId: string) =>
      this.request<SuggestedReply>('/ai/reply', { method: 'POST', body: { conversationId } }),
  };

  readonly system = {
    health: (signal?: AbortSignal) => this.request<HealthResponse>('/health', { signal }),
    appInfo: (signal?: AbortSignal) => this.request<AppInfo>('/settings/app-info', { signal }),
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
