/**
 * End-to-end smoke test of the AI assistant. The real Nest application is
 * booted with the database stubbed and the AI client replaced by a fake,
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

/** What the fake AI client will return, and what it was asked. */
interface FakeCall {
  system: string;
  user: string;
  json: boolean;
}

const calls: FakeCall[] = [];
let nextResponse: string | (() => never) = '';

function createChatFake() {
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
    status: () =>
      Promise.resolve({
        configured: true,
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.1:8b',
        availableModels: ['llama3.1:8b', 'qwen2.5:7b'],
        reachable: true,
      }),
  };
}

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');
  const { ChatClient } = await import('../src/ai/chat.client');
  const { AiError } = await import('../src/ai/ai.error');
  const { MessageIngestService } = await import('../src/communication/message-ingest.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(ChatClient).useValue(createChatFake()),
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

  // --- status ---------------------------------------------------------------
  // How an administrator finds out which model name to configure.
  await request(http).get(`${base}/ai/status`).expect(401);

  const status = await request(http).get(`${base}/ai/status`).set('Cookie', cookie).expect(200);
  assert.equal(status.body.configured, true);
  assert.equal(status.body.model, 'llama3.1:8b');
  assert.deepEqual(status.body.availableModels, ['llama3.1:8b', 'qwen2.5:7b']);
  assert.ok(!JSON.stringify(status.body).includes('apiKey'), 'the key is never reported');

  // --- requirement drafting -------------------------------------------------
  // The Phase 2 feature: rough notes in, structured lead draft out.
  const NOTES =
    'Family of 4, two adults and two kids aged 8 and 12. Want Dubai for 5 nights in ' +
    'December. Budget around 1.5 lakh. Need hotel and airport transfers and desert safari.';

  await request(http).post(`${base}/ai/requirement`).send({ text: NOTES }).expect(401);

  const tooShort = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: 'Dubai' })
    .expect(400);
  assert.ok(tooShort.body.details.text?.length);

  calls.length = 0;
  nextResponse = JSON.stringify({
    summary: 'Dubai, 5 nights in December for 2 adults and 2 children aged 8 and 12.',
    fields: {
      destination: 'Dubai',
      departureCity: null,
      travelStart: '2026-12-01',
      travelEnd: '2026-12-06',
      adults: 2,
      children: 2,
      childAges: [8, 12],
      tripType: 'Family',
      hotelCategory: null,
      mealPreference: null,
      transportRequired: true,
      flightRequired: false,
      activityRequirements: 'Desert safari',
      specialRequirements: null,
      budget: 150000,
    },
  });

  const draft = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES, today: '2026-08-13' })
    .expect(200);

  assert.match(draft.body.summary, /Dubai/);
  assert.equal(draft.body.fields.destination, 'Dubai');
  assert.equal(draft.body.fields.adults, 2);
  assert.deepEqual(draft.body.fields.childAges, [8, 12]);
  assert.equal(draft.body.fields.transportRequired, true);
  assert.equal(draft.body.fields.budget, 150000);
  assert.equal(calls[0]!.json, true, 'drafting must ask the model for JSON');
  assert.match(calls[0]!.user, /2026-08-13/, "today's date is given so relative dates resolve");
  assert.match(calls[0]!.system, /never invent or calculate money/i);

  // Nothing is written: this is the guarantee that makes the button safe.
  assert.equal(prisma.leads.length, 0, 'drafting must not create a lead');
  assert.equal(prisma.customers.length, 0, 'drafting must not create a customer');

  // A model that returns extra keys — an invented price, most dangerously —
  // has them dropped. Only whitelisted fields survive the parser.
  nextResponse = JSON.stringify({
    summary: 'Dubai package.',
    fields: {
      destination: 'Dubai',
      childAges: [],
      transportRequired: false,
      flightRequired: false,
      packagePrice: 185000,
      estimatedCost: 140000,
      taxAmount: 9250,
      discount: 5000,
    },
  });
  const sanitised = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES })
    .expect(200);

  const serialised = JSON.stringify(sanitised.body);
  for (const invented of ['packagePrice', 'estimatedCost', 'taxAmount', 'discount', '185000']) {
    assert.ok(
      !serialised.includes(invented),
      `the model's "${invented}" must not reach the client`,
    );
  }
  assert.equal(sanitised.body.fields.budget, null, 'no budget was stated, so none is returned');

  // Indian numbering: "1.5 lakh" is 150000, not 2. Stripping to digits alone
  // would be wrong by four orders of magnitude and still look plausible.
  nextResponse = JSON.stringify({
    summary: 'Dubai trip.',
    fields: { destination: 'Dubai', childAges: [], budget: '1.5 lakh' },
  });
  const lakhs = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES })
    .expect(200);
  assert.equal(lakhs.body.fields.budget, 150000);

  // Individual bad fields are dropped rather than failing the whole draft.
  nextResponse = JSON.stringify({
    summary: 'Dubai trip.',
    fields: {
      destination: 'Dubai',
      travelStart: 'sometime in December',
      travelEnd: '2026-12-06',
      adults: 'a couple',
      childAges: 'two kids',
      budget: 'unknown',
    },
  });
  const partial = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES })
    .expect(200);
  assert.equal(partial.body.fields.destination, 'Dubai', 'the good field survives');
  assert.equal(partial.body.fields.travelStart, null, 'a non-date is dropped');
  assert.equal(partial.body.fields.adults, null);
  assert.deepEqual(partial.body.fields.childAges, []);
  assert.equal(partial.body.fields.budget, null);

  // A return date before departure is worse than no date at all.
  nextResponse = JSON.stringify({
    summary: 'Dubai trip.',
    fields: {
      destination: 'Dubai',
      travelStart: '2026-12-10',
      travelEnd: '2026-12-01',
      childAges: [],
    },
  });
  const backwards = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES })
    .expect(200);
  assert.equal(backwards.body.fields.travelStart, '2026-12-10');
  assert.equal(backwards.body.fields.travelEnd, null);

  // No summary means there is nothing to show, so the whole draft fails.
  nextResponse = JSON.stringify({ fields: { destination: 'Dubai', childAges: [] } });
  await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES })
    .expect(502);

  // Prose instead of JSON is a provider failure, not a lead.
  nextResponse = 'Sure! Here is a lovely Dubai package for 185,000 rupees.';
  const prose = await request(http)
    .post(`${base}/ai/requirement`)
    .set('Cookie', cookie)
    .send({ text: NOTES })
    .expect(502);
  assert.ok(
    !JSON.stringify(prose.body).includes('185,000'),
    'an invented price must never reach the client, even in an error',
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
    ['not_configured', 503, /not switched on/i],
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
