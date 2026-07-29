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

  APP_VERSION: z.string().default('0.1.0'),
  BUILD_NUMBER: z.string().default('local'),

  // --- Meta (Instagram + WhatsApp Cloud) ------------------------------------
  // All optional: the app boots without them, and the affected channel reports
  // itself as unconfigured instead of failing at startup.
  META_GRAPH_VERSION: z.string().default('v21.0'),
  /** Used to verify the X-Hub-Signature-256 header on every webhook. */
  META_APP_SECRET: z.string().default(''),

  INSTAGRAM_VERIFY_TOKEN: z.string().default(''),
  INSTAGRAM_ACCOUNT_ID: z.string().default(''),
  INSTAGRAM_ACCESS_TOKEN: z.string().default(''),

  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),

  // --- OpenAI ---------------------------------------------------------------
  // Optional like the channels above: without a key the AI assistant reports
  // itself as unavailable rather than blocking startup.
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),

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
