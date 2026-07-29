import 'server-only';

import { ApiError, type User } from '@travel-crm/sdk';
import { redirect } from 'next/navigation';

import { getServerApi } from '@/lib/server-api';

/**
 * Resolves the signed-in user or redirects to the login page. The middleware
 * only checks that a cookie exists; this is where the session is really proven.
 */
export async function requireUser(): Promise<User> {
  const api = await getServerApi();

  try {
    return await api.users.me();
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      redirect('/login');
    }
    throw error;
  }
}
