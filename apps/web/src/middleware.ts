import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE = 'travel_crm_session';
const PUBLIC_ROUTES = ['/login', '/forgot-password'];

/**
 * request.url does not honor X-Forwarded-Host by default, so behind nginx
 * it resolves to the internal bind address (localhost:3030) instead of the
 * public domain. Build the base URL from the forwarded headers explicitly.
 */
function resolveBaseUrl(request: NextRequest): string | URL {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.url;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(AUTH_COOKIE);
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const base = resolveBaseUrl(request);

  if (!hasSession && !isPublic) {
    const url = new URL('/login', base);
    if (pathname !== '/') {
      url.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', base));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
