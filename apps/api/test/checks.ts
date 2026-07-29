/**
 * Minimal self-checks for the non-trivial pure logic in the API.
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';

import { changePasswordSchema } from '@travel-crm/sdk';

import { parseExtraction } from '../src/ai/extraction.parser';
import { durationToMs } from '../src/auth/auth.service';
import { validateEnv } from '../src/config/env';
import { ZodValidationPipe } from '../src/shared/zod';

// --- durationToMs -----------------------------------------------------------
assert.equal(durationToMs('30s'), 30_000);
assert.equal(durationToMs('15m'), 900_000);
assert.equal(durationToMs('12h'), 43_200_000);
assert.equal(durationToMs('7d'), 604_800_000);
assert.throws(() => durationToMs('7w'), /Unsupported duration/);
assert.throws(() => durationToMs('forever'), /Unsupported duration/);

// --- environment validation -------------------------------------------------
const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};
assert.equal(validateEnv(baseEnv).PORT, 3001, 'PORT should default to 3001');
assert.equal(validateEnv({ ...baseEnv, COOKIE_SECURE: 'true' }).COOKIE_SECURE, true);
assert.throws(
  () => validateEnv({ ...baseEnv, JWT_SECRET: 'too-short' }),
  /at least 32 characters/,
  'a weak JWT secret must not boot the API',
);

// --- validation pipe --------------------------------------------------------
const pipe = new ZodValidationPipe(changePasswordSchema);

assert.deepEqual(pipe.transform({ currentPassword: 'old-pass', newPassword: 'newpassword1' }), {
  currentPassword: 'old-pass',
  newPassword: 'newpassword1',
});

try {
  pipe.transform({ currentPassword: 'same-password1', newPassword: 'same-password1' });
  assert.fail('reusing the current password should be rejected');
} catch (error) {
  assert.ok(error instanceof BadRequestException);
  const body = error.getResponse() as { details: Record<string, string[]> };
  assert.ok(body.details.newPassword?.[0]?.includes('different'));
}

try {
  pipe.transform({ currentPassword: 'old', newPassword: 'short' });
  assert.fail('short passwords should be rejected');
} catch (error) {
  assert.ok(error instanceof BadRequestException);
  const body = error.getResponse() as { details: Record<string, string[]> };
  assert.ok(body.details.newPassword?.length);
}

// --- AI extraction parsing --------------------------------------------------
const EMPTY = {
  destination: null,
  travelMonth: null,
  adults: null,
  children: null,
  budget: null,
};

assert.deepEqual(
  parseExtraction(
    '{"destination":"Bali","travelMonth":"December","adults":4,"children":1,"budget":180000}',
  ),
  { destination: 'Bali', travelMonth: 'December', adults: 4, children: 1, budget: 180000 },
);

assert.deepEqual(
  parseExtraction(
    '```json\n{"destination":"Goa","travelMonth":null,' +
      '"adults":"2","children":"0","budget":"₹1,50,000"}\n```',
  ),
  { destination: 'Goa', travelMonth: null, adults: 2, children: 0, budget: 150000 },
  'fenced JSON, numeric strings and formatted currency must all be handled',
);

assert.deepEqual(
  parseExtraction('{"destination":"unknown","travelMonth":"  ","adults":"N/A","children":null}'),
  EMPTY,
  'a model that writes "unknown" instead of null must still yield null',
);

assert.deepEqual(
  parseExtraction('{"destination":"Bali","adults":0,"budget":-5}'),
  { ...EMPTY, destination: 'Bali' },
  'out-of-range values are dropped, the valid ones survive',
);

assert.equal(parseExtraction('Sorry, I cannot help with that.'), null);
assert.equal(parseExtraction('[1,2,3]'), null);
assert.equal(parseExtraction(''), null);

console.log('All API checks passed.');
