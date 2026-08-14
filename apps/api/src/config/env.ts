import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .or(z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: booleanish.default(false),

  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),

  /**
   * Requests per minute per IP address.
   *
   * Generous on purpose: an office behind one public address shares a single
   * counter, and every page in the CRM makes several calls. Set too low, this
   * throttles the staff rather than an attacker. Brute force is held back at
   * the sign-in endpoint specifically, where a tight limit belongs.
   */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(30).max(10_000).default(600),

  APP_VERSION: z.string().default('0.1.0'),
  BUILD_NUMBER: z.string().default('local'),

  /** Where the links in notification emails point. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  // --- Meta (Instagram + WhatsApp Cloud) ------------------------------------
  // All optional: the app boots without them, and the affected channel reports
  // itself as unconfigured instead of failing at startup.
  META_GRAPH_VERSION: z.string().default('v21.0'),
  /** Used to verify the X-Hub-Signature-256 header on every webhook. */
  META_APP_SECRET: z.string().default(''),

  /**
   * Logs the full body of every webhook Meta delivers. Off by default: those
   * payloads carry customer names, phone numbers and message text, which has no
   * business sitting in a log file permanently. Turn on to diagnose a channel,
   * then turn off.
   */
  WEBHOOK_LOG_PAYLOADS: booleanish.default(false),

  // --- Instagram (API with Instagram Login) ---------------------------------
  // A different API from the Facebook Page / Messenger flow: its own host, its
  // own token, no Page and no Page Access Token anywhere.
  /** Host + version for every Instagram call. Never graph.facebook.com. */
  INSTAGRAM_GRAPH_URL: z.string().url().default('https://graph.instagram.com'),
  INSTAGRAM_GRAPH_VERSION: z.string().default('v23.0'),
  INSTAGRAM_VERIFY_TOKEN: z.string().default(''),
  /** Instagram app secret, used to verify X-Hub-Signature-256 on IG webhooks. */
  INSTAGRAM_APP_SECRET: z.string().default(''),
  /** The Instagram professional account that owns the inbox. */
  INSTAGRAM_BUSINESS_ID: z.string().default(''),
  /** Instagram *user* access token. Cold-start value; refreshes are stored. */
  INSTAGRAM_ACCESS_TOKEN: z.string().default(''),

  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),

  // --- AI assistant ---------------------------------------------------------
  // Speaks the OpenAI chat-completions protocol, which Ollama serves on /v1.
  // Optional like the channels above: without a model the assistant reports
  // itself as unavailable rather than blocking startup.
  /** The `/v1` base of an Ollama server, or any OpenAI-compatible gateway. */
  AI_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  /**
   * Deliberately empty by default. There is no sensible guess: the name has to
   * match a model the server actually has installed, which `GET /ai/status`
   * will list. Setting this is what switches the assistant on.
   */
  AI_MODEL: z.string().default(''),
  /** Unused by Ollama; required by hosted gateways. */
  AI_API_KEY: z.string().default(''),
  /** Local models on modest hardware are slower than a hosted API. */
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // --- Object storage (MinIO) ----------------------------------------------
  /** Reached by the API. Inside Docker this is the service name. */
  MINIO_ENDPOINT: z.string().url().default('http://localhost:9000'),
  /**
   * Reached by the browser and by WhatsApp when it fetches a quote PDF, so
   * presigned links are signed against this host.
   */
  MINIO_PUBLIC_URL: z.string().url().default('http://localhost:9000'),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('travel-crm'),

  // --- Company identity, used on the quote PDF ------------------------------
  COMPANY_NAME: z.string().default('Travel CRM'),
  /** Absolute path to a PNG or JPEG logo. Omitted from the PDF when blank. */
  COMPANY_LOGO_PATH: z.string().default(''),
  COMPANY_CONTACT: z.string().default(''),
  /** The agency's own tax registration, printed on invoices when set. */
  COMPANY_TAX_ID: z.string().default(''),
  /** Free text: account name, number, IFSC, UPI ID — whatever customers need. */
  COMPANY_BANK_DETAILS: z.string().default(''),

  // --- Invoice defaults -----------------------------------------------------
  // Prefilled into a new invoice; every one of them is editable per invoice.
  /** Days from issue to due. */
  INVOICE_DUE_DAYS: z.coerce.number().int().min(0).max(365).default(14),
  /**
   * Basis points — 1800 is 18% GST. Empty means no tax by default, which is
   * deliberate: GST does not apply to every travel service, and a default rate
   * would silently overbill.
   */
  INVOICE_DEFAULT_TAX_BPS: z
    .string()
    .default('')
    .transform((value) => (value.trim() === '' ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 10_000),
      'INVOICE_DEFAULT_TAX_BPS must be a whole number of basis points between 0 and 10000',
    ),
  INVOICE_PAYMENT_TERMS: z
    .string()
    .default('Payment is due by the date shown above. Please quote the invoice number.'),
});

export type Env = z.infer<typeof envSchema>;

/** Fails fast at boot when the environment is misconfigured. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return result.data;
}
