import { NextResponse, type NextRequest } from 'next/server';

import { absoluteRedirect, resolveRedirect } from './lib/redirects';

const AUTH_COOKIE = 'travel_crm_session';

/**
 * The origin this app is reached on, when the deployment knows it.
 *
 * Behind a reverse proxy the incoming request carries the internal bind address
 * (localhost:3030), so redirects built from it send users somewhere they cannot
 * reach. Deriving the host from `X-Forwarded-Host` would fix that but trust a
 * header any client can set, turning the login redirect into an open redirect.
 * A configured origin avoids both: it is fixed at deploy time and never
 * influenced by the request.
 *
 * Left unset in local development, where the request's own origin is correct.
 * `NEXT_PUBLIC_*` values are inlined at build time, so changing the domain
 * means rebuilding the web image.
 */
const PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_APP_URL;

/**
 * Cheap edge gate: presence of the session cookie decides which half of the app
 * you may see. The API still verifies the JWT on every request.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const target = resolveRedirect(pathname, search, request.cookies.has(AUTH_COOKIE));

  if (!target) {
    return NextResponse.next();
  }

  return NextResponse.redirect(absoluteRedirect(target, PUBLIC_ORIGIN, request.url));
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
