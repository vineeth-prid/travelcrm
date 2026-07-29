import 'server-only';

import { createApiClient, type ApiClient } from '@travel-crm/sdk';
import { cookies } from 'next/headers';

import { serverApiUrl } from './env';

/**
 * API client for server components: forwards the caller's cookies so the API
 * sees the same session the browser has.
 */
export async function getServerApi(): Promise<ApiClient> {
  const cookieHeader = (await cookies()).toString();

  return createApiClient({
    baseUrl: serverApiUrl(),
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}
