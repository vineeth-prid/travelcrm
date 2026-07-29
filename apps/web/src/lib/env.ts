/**
 * Public configuration. `NEXT_PUBLIC_*` values are inlined at build time, so
 * they must be referenced literally rather than through a dynamic lookup.
 */
export const publicEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
  buildNumber: process.env.NEXT_PUBLIC_BUILD_NUMBER ?? 'local',
} as const;

/** Base URL used from the Next.js server (middleware, server components). */
export function serverApiUrl(): string {
  return process.env.API_INTERNAL_URL ?? publicEnv.apiUrl;
}
