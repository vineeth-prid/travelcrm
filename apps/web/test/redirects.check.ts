/**
 * Self-checks for the redirect logic behind the auth gate. Pure functions, so
 * no Next runtime is needed.
 *
 * Run with: npm run check -w @travel-crm/web
 */
import assert from 'node:assert/strict';

import { absoluteRedirect, resolveRedirect, safeNextPath } from '../src/lib/redirects';

// --- gate decisions ---------------------------------------------------------
assert.equal(resolveRedirect('/dashboard', '', true), null, 'a signed-in user passes through');
assert.equal(resolveRedirect('/inbox', '?c=1', true), null);

assert.equal(resolveRedirect('/', '', false), '/login', 'the root does not round-trip itself');
assert.equal(
  resolveRedirect('/dashboard', '', false),
  '/login?next=%2Fdashboard',
  'the intended destination is preserved',
);
assert.equal(
  resolveRedirect('/inbox', '?c=abc', false),
  '/login?next=%2Finbox%3Fc%3Dabc',
  'the query string travels with it, encoded',
);

assert.equal(resolveRedirect('/login', '', false), null, 'the login page stays reachable');
assert.equal(resolveRedirect('/forgot-password', '', false), null);
assert.equal(
  resolveRedirect('/login', '', true),
  '/dashboard',
  'a signed-in user is moved off the login page',
);

// Every target is host-free, which is what makes it safe behind a proxy.
for (const [path, hasSession] of [
  ['/dashboard', false],
  ['/', false],
  ['/login', true],
] as const) {
  const target = resolveRedirect(path, '', hasSession);
  assert.ok(target, 'a redirect is expected for this case');
  assert.ok(target.startsWith('/'), 'redirect targets must be relative paths');
  assert.ok(!target.startsWith('//'), 'and must not be protocol-relative');
}

// --- making the target absolute ---------------------------------------------
// Next rejects a relative Location, so this must always produce a full URL.
assert.equal(
  absoluteRedirect('/login?next=%2Fdashboard', 'https://app.example.com', 'http://10.0.0.4:3030/x'),
  'https://app.example.com/login?next=%2Fdashboard',
  'a configured origin wins over the internal request address',
);

assert.equal(
  absoluteRedirect('/login', undefined, 'http://localhost:3000/dashboard'),
  'http://localhost:3000/login',
  'without one, the request address is used',
);

// The regression this pins: an unset env var is '' — falsy but not nullish, so
// `??` would hand an empty string to new URL() and throw on every redirect.
assert.equal(
  absoluteRedirect('/login', '', 'http://localhost:3000/dashboard'),
  'http://localhost:3000/login',
  'a blank origin must behave as unset, not as an empty base URL',
);

assert.doesNotThrow(() => absoluteRedirect('/login', '', 'http://localhost:3000/'));

// --- ?next= sanitising ------------------------------------------------------
assert.equal(safeNextPath('/inbox'), '/inbox', 'same-origin paths are followed');
assert.equal(safeNextPath('/inbox?c=abc'), '/inbox?c=abc');

assert.equal(safeNextPath(null), '/dashboard', 'a missing value falls back');
assert.equal(safeNextPath(''), '/dashboard');

// The reason this function exists: none of these may be followed.
for (const hostile of [
  'https://evil.com',
  'http://evil.com/login',
  '//evil.com',
  '/\\evil.com',
  '/\\/evil.com',
  '\\\\evil.com',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
]) {
  assert.equal(
    safeNextPath(hostile),
    '/dashboard',
    `"${hostile}" must never be used as a redirect target`,
  );
}

console.log('All web redirect checks passed.');
