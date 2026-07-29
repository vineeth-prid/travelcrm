/**
 * End-to-end smoke test of the AI assistant. The real Nest application is
 * booted with the database stubbed and the OpenAI client replaced by a fake,
 * so the prompts, parsing, error translation and the "never writes anything"
 * guarantee are all exercised over HTTP.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';

/** What the fake OpenAI client will return, and what it was asked. */
interface FakeCall {
  system: string;
  user: string;
  json: boolean;
}

const calls: FakeCall[] = [];
let nextResponse: string | (() => never) = '';

function createOpenAiFake() {
  return {
    isConfigured: true,
    complete: (request_: {
      messages: { role: string; content: string }[];
      json?: boolean;
    }): Promise<string> => {
      calls.push({
        system: request_.messages.find((m) => m.role === 'system')?.content ?? '',
        user: request_.messages.find((m) => m.role === 'user')?.content ?? '',
        json: request_.json === true,
      });
      if (typeof nextResponse === 'function') nextResponse();
      return Promise.resolve(nextResponse);
    },
  };
}

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');
  const { OpenAiClient } = await import('../src/ai/openai.client');
  const { AiError } = await import('../src/ai/ai.error');
  const { MessageIngestService } = await import('../src/communication/message-ingest.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(OpenAiClient).useValue(createOpenAiFake()),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  // --- AI endpoints require a session --------------------------------------
  await request(http)
    .post(`${base}/ai/summary`)
    .send({ conversationId: '11111111-2222-4333-8444-555555555555' })
    .expect(401);

  const login = await request(http)
    .post(`${base}/login`)
    .send({ email: 'admin@travelcrm.test', password: ADMIN_PASSWORD })
    .expect(200);
  const cookie = sessionCookieFrom(login.headers);
  assert.ok(cookie);

  // --- seed a conversation through the real ingest path --------------------
  const ingest = app.get(MessageIngestService);
  await ingest.ingest({
    channel: 'WHATSAPP',
    contactExternalId: '919812345678',
    contactName: 'Rahul Sharma',
    contactPhone: '919812345678',
    externalMessageId: 'wamid.a1',
    content: 'Hi, we want a Bali family trip in December. 4 adults and 1 child.',
    messageType: 'TEXT',
    sentAt: new Date('2026-07-01T09:00:00.000Z'),
  });
  await ingest.ingest({
    channel: 'WHATSAPP',
    contactExternalId: '919812345678',
    contactName: 'Rahul Sharma',
    externalMessageId: 'wamid.a2',
    content: 'Budget is around 180000. We would like a 5 star hotel.',
    messageType: 'TEXT',
    sentAt: new Date('2026-07-01T09:05:00.000Z'),
  });

  const conversationId = prisma.conversations[0]?.id;
  assert.ok(conversationId);

  // --- validation -----------------------------------------------------------
  const badId = await request(http)
    .post(`${base}/ai/summary`)
    .set('Cookie', cookie)
    .send({ conversationId: 'not-a-uuid' })
    .expect(400);
  assert.ok(badId.body.details.conversationId?.length);

  await request(http)
    .post(`${base}/ai/summary`)
    .set('Cookie', cookie)
    .send({ conversationId: '11111111-2222-4333-8444-555555555555' })
    .expect(404);

  // --- summary --------------------------------------------------------------
  calls.length = 0;
  nextResponse = 'Customer is planning a Bali family vacation.\nTravel Month: December';

  const summary = await request(http)
    .post(`${base}/ai/summary`)
    .set('Cookie', cookie)
    .send({ conversationId })
    .expect(200);

  assert.match(summary.body.summary, /Bali family vacation/);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.user, /Customer: Hi, we want a Bali family trip/);
  assert.match(calls[0]!.user, /Customer: Budget is around 180000/);
  assert.equal(calls[0]!.json, false, 'summaries are plain text, not JSON mode');

  // Summaries are generated on demand and never persisted.
  assert.equal(
    prisma.conversations[0]?.notes,
    null,
    'a summary must not be written to the conversation',
  );

  // --- extraction -----------------------------------------------------------
  calls.length = 0;
  nextResponse =
    '{"destination":"Bali","travelMonth":"December","adults":4,"children":1,"budget":180000}';

  const extracted = await request(http)
    .post(`${base}/ai/extract`)
    .set('Cookie', cookie)
    .send({ conversationId })
    .expect(200);

  assert.deepEqual(extracted.body, {
    destination: 'Bali',
    travelMonth: 'December',
    adults: 4,
    children: 1,
    budget: 180000,
  });
  assert.equal(calls[0]!.json, true, 'extraction must ask the model for JSON');

  // The headline guarantee: extraction fills the form, it does not save.
  const stored = prisma.conversations[0];
  assert.equal(stored?.destination, null, 'extraction must not write to the database');
  assert.equal(stored?.adults, null);
  assert.equal(stored?.budget, null);
  assert.equal(stored?.status, 'NEW');

  // A model that cannot determine a value returns null rather than guessing.
  nextResponse = '{"destination":null,"travelMonth":"unknown","adults":"N/A","budget":""}';
  const sparse = await request(http)
    .post(`${base}/ai/extract`)
    .set('Cookie', cookie)
    .send({ conversationId })
    .expect(200);
  assert.deepEqual(sparse.body, {
    destination: null,
    travelMonth: null,
    adults: null,
    children: null,
    budget: null,
  });

  // Prose instead of JSON is a provider failure, reported as one.
  nextResponse = 'I am sorry, I cannot determine those details.';
  const unreadable = await request(http)
    .post(`${base}/ai/extract`)
    .set('Cookie', cookie)
    .send({ conversationId })
    .expect(502);
  assert.match(unreadable.body.message, /could not read/i);
  assert.ok(
    !JSON.stringify(unreadable.body).includes('I am sorry'),
    'the raw model output must not leak to the client',
  );

  // --- suggested reply ------------------------------------------------------
  calls.length = 0;
  nextResponse = 'Thank you for contacting us. Could you confirm your preferred travel dates?';

  const reply = await request(http)
    .post(`${base}/ai/reply`)
    .set('Cookie', cookie)
    .send({ conversationId })
    .expect(200);

  assert.match(reply.body.reply, /Thank you for contacting us/);
  assert.equal(
    prisma.messages.length,
    2,
    'a suggested reply must never be stored or sent as a message',
  );

  // Saved CRM fields are passed to the prompt so the draft does not re-ask.
  await request(http)
    .patch(`${base}/conversations/${conversationId}`)
    .set('Cookie', cookie)
    .send({ destination: 'Bali', adults: 4, status: 'QUALIFIED' })
    .expect(200);

  calls.length = 0;
  nextResponse = 'Happy to help with Bali.';
  await request(http)
    .post(`${base}/ai/reply`)
    .set('Cookie', cookie)
    .send({ conversationId })
    .expect(200);
  assert.match(calls[0]!.user, /destination: Bali/);
  assert.match(calls[0]!.user, /adults: 4/);
  assert.ok(!calls[0]!.user.includes('travelMonth'), 'unknown fields are left out of the prompt');

  // --- provider failures become friendly errors ----------------------------
  const faults: [string, number, RegExp][] = [
    ['timeout', 504, /took too long/i],
    ['rate_limited', 429, /busy right now/i],
    ['not_configured', 503, /not connected yet/i],
    ['unreachable', 502, /could not reach/i],
  ];

  for (const [fault, status, expected] of faults) {
    nextResponse = () => {
      throw new AiError(fault as 'timeout', 'sk-secret-key-leaked-in-detail');
    };
    const failure = await request(http)
      .post(`${base}/ai/summary`)
      .set('Cookie', cookie)
      .send({ conversationId })
      .expect(status);
    assert.match(failure.body.message, expected);
    assert.ok(
      !JSON.stringify(failure.body).includes('sk-secret'),
      'provider detail must never reach the client',
    );
  }

  // --- a conversation with no messages -------------------------------------
  nextResponse = 'unused';
  await ingest.ingest({
    channel: 'INSTAGRAM',
    contactExternalId: 'igsid_1',
    contactName: 'Empty Thread',
    externalMessageId: 'ig.only',
    content: 'hi',
    messageType: 'TEXT',
    sentAt: new Date(),
  });
  const emptyConversation = prisma.conversations[1];
  assert.ok(emptyConversation);
  prisma.messages.length = 1; // drop the only message, leaving an empty thread

  const noMessages = await request(http)
    .post(`${base}/ai/summary`)
    .set('Cookie', cookie)
    .send({ conversationId: emptyConversation.id })
    .expect(400);
  assert.match(noMessages.body.message, /no messages/i);

  await app.close();
  console.log('All AI smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
