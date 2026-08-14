import type {
  AiRequirementRequest,
  ChangePasswordRequest,
  CustomerQuery,
  CreateUserRequest,
  ExtractedDetails,
  ResetPasswordRequest,
  UpdateUserRequest,
  FollowUpCompleteRequest,
  FollowUpQuery,
  FollowUpRuleRequest,
  ExpenseCategoryRequest,
  ExpenseQuery,
  ExpenseRequest,
  ExpenseSummaryQuery,
  InvoiceQuery,
  InvoiceRequest,
  PaymentRequest,
  ReportQuery,
  SmtpRequest,
  SmtpTestRequest,
  LeadRequirementDraft,
  LeadAssignRequest,
  LeadNoteRequest,
  LeadQuery,
  LeadRequest,
  LeadStageRequest,
  LoginRequest,
  PaymentQuery,
  ProposalQuery,
  ProposalRequest,
  ProposalStatusRequest,
  QuoteRequest,
  SendMessageRequest,
  UpdateConversationRequest,
  UpdateProfileRequest,
} from './schemas';
import type {
  AiStatus,
  AppInfo,
  ApiErrorBody,
  AuditEntry,
  Exportable,
  Conversation,
  CustomerDetail,
  CustomerSummary,
  ConversationSummary,
  Dashboard,
  DuplicateCheck,
  PerformanceReport,
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  FollowUp,
  FollowUpRule,
  HealthResponse,
  Invoice,
  InvoiceWithPdf,
  NotificationRecord,
  SmtpStatus,
  Lead,
  LeadActivity,
  LeadPage,
  LoginResponse,
  Message,
  MessageResponse,
  PaymentEntry,
  Proposal,
  ProposalWithHistory,
  ProposalWithPdf,
  Quote,
  QuoteWithPdf,
  SuggestedReply,
  User,
  UserSummary,
} from './types';

/** Drops empty values so the URL only carries filters that are actually set. */
function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

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

  /** Colleagues, for the "assigned to" picker. Employees see only themselves. */
  readonly staff = {
    list: (signal?: AbortSignal) => this.request<UserSummary[]>('/staff', { signal }),
  };

  readonly leads = {
    list: (query: LeadQuery = {}, signal?: AbortSignal) =>
      this.request<LeadPage>(`/leads${toQuery(query)}`, { signal }),
    get: (id: string, signal?: AbortSignal) => this.request<Lead>(`/leads/${id}`, { signal }),
    /**
     * Rejected with 409 and a `duplicates` payload when the customer looks like
     * somebody already on file. Re-send with `allowDuplicate` to go ahead.
     */
    create: (input: LeadRequest, options: { allowDuplicate?: boolean } = {}) =>
      this.request<Lead>(`/leads${toQuery({ allowDuplicate: options.allowDuplicate })}`, {
        method: 'POST',
        body: input,
      }),
    update: (id: string, input: LeadRequest) =>
      this.request<Lead>(`/leads/${id}`, { method: 'PATCH', body: input }),
    /** The only way the stage moves — a LOST lead must carry a reason. */
    changeStage: (id: string, input: LeadStageRequest) =>
      this.request<Lead>(`/leads/${id}/stage`, { method: 'PATCH', body: input }),
    assign: (id: string, input: LeadAssignRequest) =>
      this.request<Lead>(`/leads/${id}/assign`, { method: 'PATCH', body: input }),
    activities: (id: string, signal?: AbortSignal) =>
      this.request<LeadActivity[]>(`/leads/${id}/activities`, { signal }),
    addNote: (id: string, input: LeadNoteRequest) =>
      this.request<LeadActivity>(`/leads/${id}/activities`, { method: 'POST', body: input }),
    /** Called as the consultant types, before anything is saved. */
    checkDuplicates: (
      params: { phone?: string | null; whatsapp?: string | null; email?: string | null },
      signal?: AbortSignal,
    ) => this.request<DuplicateCheck>(`/leads/duplicates${toQuery(params)}`, { signal }),
  };

  /** The customer book. Read-only — customers are created by their lead. */
  readonly customers = {
    list: (query: CustomerQuery = {}, signal?: AbortSignal) =>
      this.request<CustomerSummary[]>(`/customers${toQuery(query)}`, { signal }),
    get: (id: string, signal?: AbortSignal) =>
      this.request<CustomerDetail>(`/customers/${id}`, { signal }),
  };

  readonly proposals = {
    /** Across every lead, for the proposals workspace. */
    list: (query: ProposalQuery = {}, signal?: AbortSignal) =>
      this.request<Proposal[]>(`/proposals${toQuery(query)}`, { signal }),
    listFor: (leadId: string, signal?: AbortSignal) =>
      this.request<Proposal[]>(`/leads/${leadId}/proposals`, { signal }),
    /** The proposal with every version it has been through. */
    get: (id: string, signal?: AbortSignal) =>
      this.request<ProposalWithHistory>(`/proposals/${id}`, { signal }),
    create: (leadId: string, input: ProposalRequest) =>
      this.request<Proposal>(`/leads/${leadId}/proposals`, { method: 'POST', body: input }),
    /**
     * Edits the current version while it is still a draft. Once a proposal has
     * been sent, use `reviseFrom` — history is never rewritten.
     */
    update: (id: string, input: ProposalRequest) =>
      this.request<Proposal>(`/proposals/${id}`, { method: 'PATCH', body: input }),
    /** Adds a new version, leaving every earlier one exactly as it was. */
    revise: (id: string, input: ProposalRequest) =>
      this.request<Proposal>(`/proposals/${id}/versions`, { method: 'POST', body: input }),
    generatePdf: (id: string) =>
      this.request<ProposalWithPdf>(`/proposals/${id}/generate`, { method: 'POST' }),
    /** A time-limited link to a specific version's stored PDF. */
    versionPdf: (id: string, version: number, signal?: AbortSignal) =>
      this.request<ProposalWithPdf>(`/proposals/${id}/versions/${version}/pdf`, { signal }),
    /** Records who sent it and when, and starts the follow-up workflow. */
    submit: (id: string) => this.request<Proposal>(`/proposals/${id}/submit`, { method: 'POST' }),
    setStatus: (id: string, input: ProposalStatusRequest) =>
      this.request<Proposal>(`/proposals/${id}/status`, { method: 'PATCH', body: input }),
  };

  /** Staff administration. Administrators only, enforced by the API. */
  readonly admin = {
    users: (signal?: AbortSignal) => this.request<User[]>('/users', { signal }),
    createUser: (input: CreateUserRequest) =>
      this.request<User>('/users', { method: 'POST', body: input }),
    updateUser: (id: string, input: UpdateUserRequest) =>
      this.request<User>(`/users/${id}`, { method: 'PATCH', body: input }),
    resetPassword: (id: string, input: ResetPasswordRequest) =>
      this.request<MessageResponse>(`/users/${id}/password`, { method: 'POST', body: input }),

    audit: (
      query: { entity?: string; entityId?: string; actorId?: string; limit?: number } = {},
      signal?: AbortSignal,
    ) => this.request<AuditEntry[]>(`/audit${toQuery(query)}`, { signal }),

    /**
     * The URL of a CSV export. Not fetched through this client: the browser
     * needs to navigate to it so the download lands as a file.
     */
    exportUrl: (what: Exportable, query: { from?: string; to?: string } = {}) =>
      `${this.baseUrl}/exports/${what}.csv${toQuery(query)}`,
  };

  readonly reports = {
    /** The admin dashboard. Administrators only, enforced by the API. */
    dashboard: (query: ReportQuery = {}, signal?: AbortSignal) =>
      this.request<Dashboard>(`/reports/dashboard${toQuery(query)}`, { signal }),
    /** Every consultant for an admin; only themselves for an employee. */
    performance: (query: ReportQuery = {}, signal?: AbortSignal) =>
      this.request<PerformanceReport>(`/reports/performance${toQuery(query)}`, { signal }),
  };

  /** Company spending. Administrators only, enforced by the API. */
  readonly expenses = {
    list: (query: ExpenseQuery = {}, signal?: AbortSignal) =>
      this.request<Expense[]>(`/expenses${toQuery(query)}`, { signal }),
    /** The dashboard: totals, categories and the monthly trend. */
    summary: (query: ExpenseSummaryQuery = {}, signal?: AbortSignal) =>
      this.request<ExpenseSummary>(`/expenses/summary${toQuery(query)}`, { signal }),
    create: (input: ExpenseRequest) =>
      this.request<Expense>('/expenses', { method: 'POST', body: input }),
    update: (id: string, input: ExpenseRequest) =>
      this.request<Expense>(`/expenses/${id}`, { method: 'PATCH', body: input }),
    remove: (id: string) => this.request<MessageResponse>(`/expenses/${id}`, { method: 'DELETE' }),
    /** A time-limited link to the stored receipt. */
    receiptUrl: (id: string, signal?: AbortSignal) =>
      this.request<{ url: string; name: string | null }>(`/expenses/${id}/receipt`, { signal }),

    categories: (signal?: AbortSignal) =>
      this.request<ExpenseCategory[]>('/expenses/categories', { signal }),
    createCategory: (input: ExpenseCategoryRequest) =>
      this.request<ExpenseCategory>('/expenses/categories', { method: 'POST', body: input }),
    updateCategory: (id: string, input: ExpenseCategoryRequest) =>
      this.request<ExpenseCategory>(`/expenses/categories/${id}`, {
        method: 'PATCH',
        body: input,
      }),
  };

  readonly invoices = {
    list: (query: InvoiceQuery = {}, signal?: AbortSignal) =>
      this.request<Invoice[]>(`/invoices${toQuery(query)}`, { signal }),
    get: (id: string, signal?: AbortSignal) => this.request<Invoice>(`/invoices/${id}`, { signal }),
    /** Raises an invoice against a lead, optionally from an accepted proposal. */
    create: (leadId: string, input: InvoiceRequest) =>
      this.request<Invoice>(`/leads/${leadId}/invoices`, { method: 'POST', body: input }),
    /** Drafts only. An issued invoice is a financial document. */
    update: (id: string, input: InvoiceRequest) =>
      this.request<Invoice>(`/invoices/${id}`, { method: 'PATCH', body: input }),
    /** Freezes the invoice and starts the clock on its due date. */
    issue: (id: string) => this.request<Invoice>(`/invoices/${id}/issue`, { method: 'POST' }),
    cancel: (id: string) => this.request<Invoice>(`/invoices/${id}/cancel`, { method: 'POST' }),
    generatePdf: (id: string) =>
      this.request<InvoiceWithPdf>(`/invoices/${id}/generate`, { method: 'POST' }),
    recordPayment: (id: string, input: PaymentRequest) =>
      this.request<Invoice>(`/invoices/${id}/payments`, { method: 'POST', body: input }),
  };

  /** The payment ledger: receipts across every invoice. */
  readonly payments = {
    list: (query: PaymentQuery = {}, signal?: AbortSignal) =>
      this.request<PaymentEntry[]>(`/payments${toQuery(query)}`, { signal }),
  };

  readonly followUps = {
    list: (query: FollowUpQuery = {}, signal?: AbortSignal) =>
      this.request<FollowUp[]>(`/follow-ups${toQuery(query)}`, { signal }),
    /** Recording the outcome is the only thing that closes a follow-up. */
    complete: (id: string, input: FollowUpCompleteRequest) =>
      this.request<FollowUp>(`/follow-ups/${id}/complete`, { method: 'POST', body: input }),
    rules: (signal?: AbortSignal) => this.request<FollowUpRule[]>('/follow-ups/rules', { signal }),
    saveRule: (id: string | null, input: FollowUpRuleRequest) =>
      id
        ? this.request<FollowUpRule>(`/follow-ups/rules/${id}`, { method: 'PATCH', body: input })
        : this.request<FollowUpRule>('/follow-ups/rules', { method: 'POST', body: input }),
  };

  /** Mail configuration. Admin-only, and the password is never returned. */
  readonly smtp = {
    status: (signal?: AbortSignal) => this.request<SmtpStatus>('/settings/smtp', { signal }),
    save: (input: SmtpRequest) =>
      this.request<SmtpStatus>('/settings/smtp', { method: 'PUT', body: input }),
    sendTest: (input: SmtpTestRequest) =>
      this.request<MessageResponse>('/settings/smtp/test', { method: 'POST', body: input }),
    notifications: (signal?: AbortSignal) =>
      this.request<NotificationRecord[]>('/settings/notifications', { signal }),
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
    /**
     * Tidies pasted notes into a lead draft. The only AI action that works
     * without a conversation, and the only one used before a lead exists.
     */
    requirement: (input: AiRequirementRequest) =>
      this.request<LeadRequirementDraft>('/ai/requirement', { method: 'POST', body: input }),
    status: (signal?: AbortSignal) => this.request<AiStatus>('/ai/status', { signal }),
  };

  readonly system = {
    health: (signal?: AbortSignal) => this.request<HealthResponse>('/health', { signal }),
    appInfo: (signal?: AbortSignal) => this.request<AppInfo>('/settings/app-info', { signal }),
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
