import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE = 'travel_crm_session';
const PUBLIC_ROUTES = ['/login', '/forgot-password'];

/**
 * Cheap edge gate: presence of the session cookie decides which half of the app
 * you may see. The API still verifies the JWT on every request.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(AUTH_COOKIE);
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!hasSession && !isPublic) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') {
      url.searchParams.set('next', `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
