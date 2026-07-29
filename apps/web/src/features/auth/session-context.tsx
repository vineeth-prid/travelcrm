'use client';

import type { User } from '@travel-crm/sdk';
import { createContext, useContext, type ReactNode } from 'react';

const SessionContext = createContext<User | null>(null);

/** Seeded by the server layout, so the shell never renders without a user. */
export function SessionProvider({ user, children }: { user: User; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): User {
  const user = useContext(SessionContext);
  if (!user) {
    throw new Error('useSession must be used inside the authenticated layout');
  }
  return user;
}
