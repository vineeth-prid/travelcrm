/**
 * Minimal self-checks for the non-trivial pure logic in the API.
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { changePasswordSchema, leadSchema } from '@travel-crm/sdk';

import { parseExtraction } from '../src/ai/extraction.parser';
import { durationToMs } from '../src/auth/auth.service';
import { validateEnv, type Env } from '../src/config/env';
import { ZodValidationPipe } from '../src/shared/zod';
import { StorageService } from '../src/storage/storage.service';

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

// --- phone numbers ---------------------------------------------------------
//
// The rule is on the digits, not the formatting: a consultant should be able
// to type a number the way it was given to them.
{
  const withPhone = (phone: string) =>
    leadSchema.safeParse({ customerName: 'Priya Nair', phone, currency: 'INR' });

  for (const good of ['9876543210', '+91 98765 43210', '098765 43210', '(0987) 654-3210']) {
    assert.ok(withPhone(good).success, `${good} is ten digits however it is written`);
  }

  for (const bad of ['98765432', '987654321', '+91 9876 5432']) {
    const result = withPhone(bad);
    assert.ok(!result.success, `${bad} is too short to be a number`);
  }

  assert.ok(
    !withPhone('+91 98765 43210 9999').success,
    'and a country code is not licence for sixteen digits',
  );

  // A blank number is still fine, as long as there is some other way to reach
  // them — which the lead schema enforces separately.
  assert.ok(
    leadSchema.safeParse({
      customerName: 'Priya Nair',
      phone: '',
      email: 'priya@example.com',
      currency: 'INR',
    }).success,
  );
}

// --- object storage --------------------------------------------------------
//
// Both minio clients must be built with an explicit region. Without one the
// client resolves the bucket's region lazily, the first time it signs a URL,
// with a `GET /bucket?location` call that fails against MinIO inside the
// client's own XML parsing — surfacing as a bare `S3Error` with no message.
// The upload succeeds, the link does not, and every PDF appears broken.
{
  const ENV: Record<string, unknown> = {
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_REGION: 'ap-south-1',
    MINIO_BUCKET: 'travel-crm',
    MINIO_ENDPOINT: 'http://minio:9000',
    MINIO_PUBLIC_URL: 'http://localhost:9000',
    STORAGE_DIR: 'storage',
    API_URL: 'http://localhost:3001',
  };

  const config = { get: (key: string) => ENV[key] } as unknown as ConfigService<Env, true>;
  const storage = new StorageService(config);

  // Reaching into the clients on purpose: the region is the whole point, and
  // it is not otherwise observable without a server to talk to.
  const clients = storage as unknown as {
    internal: { region?: string };
    public: { region?: string };
  };

  assert.equal(clients.internal.region, 'ap-south-1', 'the upload client must know its region');
  assert.equal(clients.public.region, 'ap-south-1', 'and so must the one that signs links');
}

console.log('All API checks passed.');
