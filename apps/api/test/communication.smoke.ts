/**
 * End-to-end smoke test of the communication engine: webhook verification and
 * signature checking, ingestion of Instagram DMs, Instagram lead ads and
 * WhatsApp messages, deduplication, the inbox endpoints and outbound replies.
 *
 * The Meta HTTP calls are stubbed; everything else is the real application.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import request from 'supertest';

const APP_SECRET = 'meta-app-secret-for-tests';
const VERIFY_TOKEN = 'verify-me';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';
process.env.META_APP_SECRET = APP_SECRET;
process.env.INSTAGRAM_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;

/** Records what we would have sent to Meta. */
const sent: { channel: string; to: string; content: string }[] = [];

function sign(body: string): string {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
}

function whatsappMessage(id: string, text: string, from = '919812345678') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Rahul Sharma' }, wa_id: from }],
              messages: [
                {
                  from,
                  id,
                  timestamp: '1780000000',
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function conversationRow(prisma: { conversations: { id: string }[] }, id: string) {
  const row = prisma.conversations.find((item) => item.id === id);
  if (!row) throw new Error(`conversation ${id} missing from the store`);
  return row as { id: string; unreadCount: number; channel: string };
}

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');
  const { InstagramService } = await import('../src/integrations/instagram.service');
  const { WhatsAppService } = await import('../src/integrations/whatsapp.service');

  let outgoingCounter = 0;

  const { app, prisma, base } = await bootApp((builder) =>
    builder
      .overrideProvider(InstagramService)
      .useValue({
        isConfigured: true,
        sendText: (to: string, content: string) => {
          sent.push({ channel: 'INSTAGRAM', to, content });
          return Promise.resolve(`ig-out-${++outgoingCounter}`);
        },
        fetchLead: (leadgenId: string) =>
          Promise.resolve({
            leadgenId,
            name: 'Priya Nair',
            phone: '+919800000000',
            fields: [
              { label: 'full_name', value: 'Priya Nair' },
              { label: 'phone_number', value: '+919800000000' },
              { label: 'destination', value: 'Bali' },
            ],
          }),
      })
      .overrideProvider(WhatsAppService)
      .useValue({
        isConfigured: true,
        sendText: (to: string, content: string) => {
          sent.push({ channel: 'WHATSAPP', to, content });
          return Promise.resolve(`wamid.out-${++outgoingCounter}`);
        },
      }),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  // --- inbox requires authentication ---------------------------------------
  await request(http).get(`${base}/conversations`).expect(401);

  const login = await request(http)
    .post(`${base}/login`)
    .send({ email: 'admin@travelcrm.test', password: ADMIN_PASSWORD })
    .expect(200);
  const cookie = sessionCookieFrom(login.headers);
  assert.ok(cookie);

  // --- webhook subscription handshake --------------------------------------
  await request(http)
    .get(`${base}/webhooks/whatsapp`)
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1234' })
    .expect(403);

  const handshake = await request(http)
    .get(`${base}/webhooks/whatsapp`)
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1234' })
    .expect(200);
  assert.equal(handshake.text, '1234');

  const igHandshake = await request(http)
    .get(`${base}/webhooks/instagram`)
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'abcd' })
    .expect(200);
  assert.equal(igHandshake.text, 'abcd');

  // --- signature enforcement -----------------------------------------------
  const firstBody = JSON.stringify(whatsappMessage('wamid.1', 'Hi, is Bali available in March?'));

  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', 'sha256=deadbeef')
    .send(firstBody)
    .expect(401);

  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .send(firstBody)
    .expect(401);

  assert.equal(prisma.messages.length, 0, 'unsigned webhooks must not be stored');

  // --- WhatsApp ingestion ---------------------------------------------------
  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(firstBody))
    .send(firstBody)
    .expect(200);

  let list = (await request(http).get(`${base}/conversations`).set('Cookie', cookie).expect(200))
    .body;
  assert.equal(list.length, 1);
  assert.equal(list[0].channel, 'WHATSAPP');
  assert.equal(list[0].contact.name, 'Rahul Sharma');
  assert.equal(list[0].contact.phone, '919812345678');
  assert.equal(list[0].unreadCount, 1);
  assert.equal(list[0].lastMessage, 'Hi, is Bali available in March?');

  const whatsappConversationId: string = list[0].id;

  // --- redelivery of the same message is a no-op ---------------------------
  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(firstBody))
    .send(firstBody)
    .expect(200);
  assert.equal(prisma.messages.length, 1, 'duplicate provider message ids must be ignored');

  // --- non-text messages are ignored ---------------------------------------
  const imageBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ profile: { name: 'Rahul Sharma' }, wa_id: '919812345678' }],
              messages: [
                { from: '919812345678', id: 'wamid.img', type: 'image', image: { id: 'x' } },
              ],
            },
          },
        ],
      },
    ],
  });
  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(imageBody))
    .send(imageBody)
    .expect(200);
  assert.equal(prisma.messages.length, 1, 'attachments are out of scope and must be skipped');

  // --- malformed payloads are acknowledged, not retried --------------------
  const junkBody = JSON.stringify({ object: 'whatsapp_business_account', entry: 'not-an-array' });
  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(junkBody))
    .send(junkBody)
    .expect(200);

  // --- Instagram DM ingestion ----------------------------------------------
  const igBody = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: 'IG_ACCOUNT',
        messaging: [
          {
            sender: { id: 'igsid_998877' },
            recipient: { id: 'IG_ACCOUNT' },
            timestamp: 1780000100000,
            message: { mid: 'ig.mid.1', text: 'Do you have Maldives packages?' },
          },
          {
            // Echo of our own reply — must be skipped.
            sender: { id: 'IG_ACCOUNT' },
            recipient: { id: 'igsid_998877' },
            timestamp: 1780000200000,
            message: { mid: 'ig.mid.echo', text: 'ignored', is_echo: true },
          },
        ],
      },
    ],
  });
  await request(http)
    .post(`${base}/webhooks/instagram`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(igBody))
    .send(igBody)
    .expect(200);

  assert.equal(prisma.messages.length, 2, 'echoes of our own messages must not be stored');

  // --- Instagram lead ad ----------------------------------------------------
  const leadBody = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: 'IG_ACCOUNT',
        changes: [
          {
            field: 'leadgen',
            value: { leadgen_id: 'lead_555', created_time: 1780000300, form_id: 'form_1' },
          },
        ],
      },
    ],
  });
  await request(http)
    .post(`${base}/webhooks/instagram`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(leadBody))
    .send(leadBody)
    .expect(200);

  list = (await request(http).get(`${base}/conversations`).set('Cookie', cookie).expect(200)).body;
  assert.equal(list.length, 3, 'DM, lead ad and WhatsApp each get a conversation');

  const lead = list.find((row: { channel: string }) => row.channel === 'INSTAGRAM_LEAD');
  assert.ok(lead, 'the lead ad must appear in the same inbox');
  assert.equal(lead.contact.name, 'Priya Nair');
  assert.equal(lead.contact.phone, '+919800000000');
  assert.match(lead.lastMessage, /Destination: Bali/);

  const leadMessages = (
    await request(http).get(`${base}/conversations/${lead.id}/messages`).set('Cookie', cookie)
  ).body;
  assert.equal(leadMessages[0].messageType, 'LEAD');

  // --- lead ads cannot be replied to ---------------------------------------
  const leadReply = await request(http)
    .post(`${base}/conversations/${lead.id}/messages`)
    .set('Cookie', cookie)
    .send({ content: 'Hello!' })
    .expect(400);
  assert.match(leadReply.body.message, /cannot receive replies/i);

  // --- search ---------------------------------------------------------------
  const byName = (
    await request(http).get(`${base}/conversations?search=rahul`).set('Cookie', cookie).expect(200)
  ).body;
  assert.equal(byName.length, 1);
  assert.equal(byName[0].contact.name, 'Rahul Sharma');

  const byPhone = (
    await request(http).get(`${base}/conversations?search=98123`).set('Cookie', cookie).expect(200)
  ).body;
  assert.equal(byPhone.length, 1);

  const noMatch = (
    await request(http)
      .get(`${base}/conversations?search=nobody-here`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.equal(noMatch.length, 0);

  // --- opening a conversation clears its unread count ----------------------
  const opened = (
    await request(http)
      .get(`${base}/conversations/${whatsappConversationId}`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.equal(opened.unreadCount, 0);

  // --- replying -------------------------------------------------------------
  const reply = await request(http)
    .post(`${base}/conversations/${whatsappConversationId}/messages`)
    .set('Cookie', cookie)
    .send({ content: 'Yes! Sending you options now.' })
    .expect(201);

  assert.equal(reply.body.direction, 'OUTGOING');
  assert.equal(reply.body.externalMessageId, 'wamid.out-1');
  assert.deepEqual(sent.at(-1), {
    channel: 'WHATSAPP',
    to: '919812345678',
    content: 'Yes! Sending you options now.',
  });

  const thread = (
    await request(http)
      .get(`${base}/conversations/${whatsappConversationId}/messages`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.equal(thread.length, 2);
  assert.equal(thread[0].direction, 'INCOMING');
  assert.equal(thread[1].direction, 'OUTGOING');

  const emptyReply = await request(http)
    .post(`${base}/conversations/${whatsappConversationId}/messages`)
    .set('Cookie', cookie)
    .send({ content: '   ' })
    .expect(400);
  assert.ok(emptyReply.body.details.content?.length);

  // --- delivery receipts ----------------------------------------------------
  const statusBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              statuses: [
                { id: 'wamid.out-1', status: 'delivered', timestamp: '1780000400' },
                { id: 'wamid.out-1', status: 'read', timestamp: '1780000500' },
              ],
            },
          },
        ],
      },
    ],
  });
  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(statusBody))
    .send(statusBody)
    .expect(200);

  const delivered = prisma.messages.find((row) => row.externalMessageId === 'wamid.out-1');
  assert.ok(delivered?.deliveredAt, 'delivery receipts must be recorded');

  // --- replying on Instagram ------------------------------------------------
  const igConversation = list.find((row: { channel: string }) => row.channel === 'INSTAGRAM');
  await request(http)
    .post(`${base}/conversations/${igConversation.id}/messages`)
    .set('Cookie', cookie)
    .send({ content: 'We do! Which dates suit you?' })
    .expect(201);
  assert.equal(sent.at(-1)?.channel, 'INSTAGRAM');
  assert.equal(sent.at(-1)?.to, 'igsid_998877');

  // --- missing conversation -------------------------------------------------
  const missing = await request(http)
    .get(`${base}/conversations/11111111-2222-4333-8444-555555555555`)
    .set('Cookie', cookie)
    .expect(404);
  assert.match(missing.body.message, /no longer exists/i);

  await request(http)
    .post(`${base}/conversations/11111111-2222-4333-8444-555555555555/messages`)
    .set('Cookie', cookie)
    .send({ content: 'Hello?' })
    .expect(404);

  // --- lead details (Phase 3) ----------------------------------------------
  const beforeSave = (
    await request(http)
      .get(`${base}/conversations/${whatsappConversationId}`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.equal(beforeSave.status, 'NEW', 'every conversation starts as a NEW lead');
  assert.equal(beforeSave.destination, null);
  assert.equal(beforeSave.contact.email, null);

  const saved = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({
      destination: '  Bali  ',
      travelMonth: 'March 2027',
      adults: '2',
      children: '1',
      budget: '180000',
      status: 'QUALIFIED',
      notes: 'Honeymoon. Prefers a beach resort.',
      email: '  Rahul@Example.com ',
    })
    .expect(200);

  assert.equal(saved.body.destination, 'Bali', 'text fields are trimmed');
  assert.equal(saved.body.travelMonth, 'March 2027');
  assert.equal(saved.body.adults, 2, 'numeric strings are coerced');
  assert.equal(saved.body.children, 1);
  assert.equal(saved.body.budget, 180000);
  assert.equal(saved.body.status, 'QUALIFIED');
  assert.equal(saved.body.notes, 'Honeymoon. Prefers a beach resort.');
  assert.equal(saved.body.contact.email, 'rahul@example.com', 'email is normalised');

  // Blank fields clear the value rather than storing an empty string.
  const cleared = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ travelMonth: '', children: '', email: '', status: 'QUALIFIED' })
    .expect(200);
  assert.equal(cleared.body.travelMonth, null);
  assert.equal(cleared.body.children, null, 'a blank number is cleared, not coerced to 0');
  assert.equal(cleared.body.contact.email, null);
  assert.equal(cleared.body.destination, 'Bali', 'omitted fields are left untouched');

  // --- validation -----------------------------------------------------------
  const badAdults = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ adults: 0, status: 'NEW' })
    .expect(400);
  assert.ok(badAdults.body.details.adults?.length);

  const badChildren = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ children: -1, status: 'NEW' })
    .expect(400);
  assert.ok(badChildren.body.details.children?.length);

  const badBudget = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ budget: -5, status: 'NEW' })
    .expect(400);
  assert.ok(badBudget.body.details.budget?.length);

  const badEmail = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ email: 'not-an-email', status: 'NEW' })
    .expect(400);
  assert.ok(badEmail.body.details.email?.length);

  const missingStatus = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ destination: 'Goa' })
    .expect(400);
  assert.ok(missingStatus.body.details.status?.length, 'status is required');

  const badStatus = await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ status: 'ARCHIVED' })
    .expect(400);
  assert.ok(badStatus.body.details.status?.length);

  // Fields outside the allowed set must not reach the database.
  await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ status: 'QUALIFIED', unreadCount: 99, channel: 'INSTAGRAM' })
    .expect(200);
  const untouched = conversationRow(prisma, whatsappConversationId);
  assert.equal(untouched.unreadCount, 0, 'unreadCount is not writable through PATCH');
  assert.equal(untouched.channel, 'WHATSAPP', 'channel is not writable through PATCH');

  await request(http)
    .patch(`${base}/conversations/11111111-2222-4333-8444-555555555555`)
    .set('Cookie', cookie)
    .send({ status: 'NEW' })
    .expect(404);

  // --- search by the new fields --------------------------------------------
  const byDestination = (
    await request(http).get(`${base}/conversations?search=bali`).set('Cookie', cookie).expect(200)
  ).body;
  assert.equal(byDestination.length, 1);
  assert.equal(byDestination[0].id, whatsappConversationId);

  await request(http)
    .patch(`${base}/conversations/${whatsappConversationId}`)
    .set('Cookie', cookie)
    .send({ email: 'rahul@example.com', status: 'QUALIFIED' })
    .expect(200);

  const byEmail = (
    await request(http)
      .get(`${base}/conversations?search=rahul@example`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.equal(byEmail.length, 1);
  assert.equal(byEmail[0].id, whatsappConversationId);

  // --- realtime stream ------------------------------------------------------
  // Needs a real socket, so this part runs against a listening server. It also
  // proves `/conversations/events` wins the route match over `/conversations/:id`.
  await app.listen(0);
  const origin = await app.getUrl();

  const stream = await fetch(`${origin}${base}/conversations/events`, {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);

  const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  // A new inbound message must reach a connected client without polling.
  const liveBody = JSON.stringify(whatsappMessage('wamid.live', 'Any update?'));
  await request(http)
    .post(`${base}/webhooks/whatsapp`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(liveBody))
    .send(liveBody)
    .expect(200);

  let received = '';
  while (!received.includes('wamid.live')) {
    const { value, done } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }

  assert.match(received, /"type":"message"/, 'the stream must push new messages');
  assert.match(received, /wamid\.live/);
  assert.match(received, /"type":"conversation"/, 'the stream must push conversation updates');

  await reader.cancel();

  await app.close();
  console.log('All communication smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
