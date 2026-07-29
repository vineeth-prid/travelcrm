/**
 * Redirect targets, kept free of any host.
 *
 * Everything here returns a path, never an absolute URL. Browsers resolve a
 * relative `Location` against the address the user actually visited, so
 * redirects work behind any reverse proxy without the app reading — or
 * trusting — `X-Forwarded-Host`, which a client can set to anything.
 */

const PUBLIC_ROUTES = ['/login', '/forgot-password'];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Where a visitor belongs, or null to let the request through.
 * Pure: the same inputs always give the same answer, whatever the deployment.
 */
export function resolveRedirect(
  pathname: string,
  search: string,
  hasSession: boolean,
): string | null {
  const isPublic = isPublicRoute(pathname);

  if (!hasSession && !isPublic) {
    if (pathname === '/') return '/login';
    const params = new URLSearchParams({ next: `${pathname}${search}` });
    return `/login?${params.toString()}`;
  }

  if (hasSession && isPublic) {
    return '/dashboard';
  }

  return null;
}

/**
 * Makes a redirect target absolute. Next resolves a `Location` header through
 * `new URL()` and throws on a relative value, so this is not optional.
 *
 * `configuredOrigin` wins when set, which is what makes redirects correct
 * behind a reverse proxy without consulting `X-Forwarded-Host`. When it is not
 * set the request's own address is used, and Next drops the origin again on the
 * way out because it matches.
 */
export function absoluteRedirect(
  target: string,
  configuredOrigin: string | undefined,
  requestUrl: string,
): string {
  // `||`, not `??`: an unset environment variable arrives as an empty string,
  // which is not nullish and would be used as a base URL and throw.
  return new URL(target, configuredOrigin || requestUrl).toString();
}

/**
 * Sanitises the `?next=` parameter before it is followed after sign-in.
 *
 * Without this an attacker can hand out `/login?next=https://evil.com` and have
 * the app bounce a freshly authenticated user onto a lookalike site. Only
 * same-origin absolute paths are accepted; anything else falls back.
 */
export function safeNextPath(value: string | null, fallback = '/dashboard'): string {
  if (!value) return fallback;

  // Must be an absolute path, and must not be protocol-relative. Browsers treat
  // both "//evil.com" and "/\evil.com" as scheme-relative URLs.
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;

  // A back-slash can still smuggle a host past a naive check in some browsers.
  if (value.includes('\\')) return fallback;

  return value;
}
