/**
 * Instagram Direct, over "Instagram API with Instagram Login".
 *
 * Covers the things that silently break this integration: signature
 * verification, the payload shapes Meta actually sends, deduplicated
 * redelivery, and — the one most easily got wrong — that outbound calls go to
 * graph.instagram.com and never to graph.facebook.com.
 *
 * `fetch` is stubbed; everything else is the real application.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import request from 'supertest';

const IG_APP_SECRET = 'instagram-app-secret-for-tests';
const VERIFY_TOKEN = 'TravelCRM2026Webhook';
const IG_TOKEN = 'IGAA-cold-start-token';
const IGSID = 'igsid_17841400000000000';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';
// Deliberately different from META_APP_SECRET: an Instagram Login app is its
// own app, and the guard must reach for the Instagram one.
process.env.META_APP_SECRET = 'facebook-app-secret-for-tests';
process.env.INSTAGRAM_APP_SECRET = IG_APP_SECRET;
process.env.INSTAGRAM_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.INSTAGRAM_ACCESS_TOKEN = IG_TOKEN;
process.env.INSTAGRAM_BUSINESS_ID = '17841408350798788';

interface Call {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

const calls: Call[] = [];

/** Queued responses, matched in order against outbound requests. */
const responses: unknown[] = [];

const realFetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  // Only Meta traffic is stubbed; the SSE part of other suites needs real HTTP.
  if (!url.includes('graph.instagram.com') && !url.includes('graph.facebook.com')) {
    return realFetch(input as Parameters<typeof realFetch>[0], init);
  }

  const headers = new Headers(init?.headers);
  calls.push({
    url,
    method: init?.method ?? 'GET',
    authorization: headers.get('authorization'),
    body: init?.body ? JSON.parse(String(init.body)) : null,
  });

  const payload = responses.shift() ?? {};
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}) as typeof fetch;

function sign(body: string, secret = IG_APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function dm(mid: string, extra: Record<string, unknown> = {}, timestamp = Date.now()) {
  return JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: '17841408350798788',
        time: timestamp,
        messaging: [
          {
            sender: { id: IGSID },
            recipient: { id: '17841408350798788' },
            timestamp,
            message: { mid, text: 'Hello', ...extra },
          },
        ],
      },
    ],
  });
}

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');
  const { WebhooksService } = await import('../src/webhooks/webhooks.service');
  const { InstagramService } = await import('../src/integrations/instagram.service');

  const { app, prisma, base } = await bootApp();
  const http = app.getHttpServer() as Parameters<typeof request>[0];
  const webhooks = app.get(WebhooksService);
  const instagram = app.get(InstagramService);

  /** Posts a signed delivery and waits for the work queued behind the 200. */
  const deliver = async (body: string, signature = sign(body)) => {
    await request(http)
      .post(`${base}/webhooks/instagram`)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(body)
      .expect(200);
    await webhooks.settled;
  };

  const login = await request(http)
    .post(`${base}/login`)
    .send({ email: 'admin@travelcrm.test', password: ADMIN_PASSWORD })
    .expect(200);
  const cookie = sessionCookieFrom(login.headers);
  assert.ok(cookie);

  // --- verification handshake ----------------------------------------------
  const handshake = await request(http)
    .get(`${base}/webhooks/instagram`)
    .query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '9137364929',
    })
    .expect(200);
  assert.equal(handshake.text, '9137364929', 'Meta compares the challenge as a literal string');
  assert.match(handshake.headers['content-type'], /text\/plain/);

  await request(http)
    .get(`${base}/webhooks/instagram`)
    .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'x' })
    .expect(403);

  await request(http)
    .get(`${base}/webhooks/instagram`)
    .query({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'x' })
    .expect(403);

  // --- signature verification ----------------------------------------------
  const first = dm('mid.text.1');

  // Missing header.
  await request(http)
    .post(`${base}/webhooks/instagram`)
    .set('Content-Type', 'application/json')
    .send(first)
    .expect(401);

  // Body tampered with after signing.
  await request(http)
    .post(`${base}/webhooks/instagram`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(first))
    .send(dm('mid.injected'))
    .expect(401);

  // Signed with the Facebook app secret rather than the Instagram one.
  await request(http)
    .post(`${base}/webhooks/instagram`)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', sign(first, process.env.META_APP_SECRET))
    .send(first)
    .expect(401);

  assert.equal(prisma.messages.length, 0, 'nothing unverified may be stored');

  // --- a text message, with the profile lookup that names the contact ------
  responses.push({
    name: 'Anita Desai',
    username: 'anita.wanders',
    profile_pic: 'https://cdn/a.jpg',
  });
  await deliver(first);

  assert.equal(prisma.messages.length, 1);
  assert.equal(prisma.messages[0].content, 'Hello');
  assert.equal(prisma.messages[0].direction, 'INCOMING');
  assert.equal(prisma.messages[0].externalMessageId, 'mid.text.1');

  const profileCall = calls.at(-1);
  assert.ok(profileCall);
  assert.equal(
    profileCall.url,
    `https://graph.instagram.com/v23.0/${IGSID}?fields=name,username,profile_pic`,
  );

  const contact = prisma.contacts[0];
  assert.equal(contact.name, 'Anita Desai');
  assert.equal(contact.username, 'anita.wanders');
  assert.equal(contact.profilePicture, 'https://cdn/a.jpg');
  assert.equal(contact.externalId, IGSID, 'the IGSID identifies the contact');

  // --- deduplication --------------------------------------------------------
  await deliver(first);
  assert.equal(prisma.messages.length, 1, 'a redelivered mid must not create a second message');

  // --- echoes, other objects, other event types -----------------------------
  await deliver(dm('mid.echo', { is_echo: true }));
  assert.equal(prisma.messages.length, 1, 'our own messages come back as echoes; skip them');

  const messengerShaped = JSON.stringify({
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        messaging: [
          {
            sender: { id: 'psid_1' },
            recipient: { id: 'PAGE_ID' },
            timestamp: Date.now(),
            message: { mid: 'mid.page', text: 'From Messenger' },
          },
        ],
      },
    ],
  });
  await deliver(messengerShaped);
  assert.equal(prisma.messages.length, 1, 'only object === "instagram" belongs in this handler');

  const postback = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: '17841408350798788',
        messaging: [
          {
            sender: { id: IGSID },
            recipient: { id: '17841408350798788' },
            timestamp: Date.now(),
            postback: { mid: 'mid.postback', title: 'Get started', payload: 'START' },
          },
        ],
      },
    ],
  });
  await deliver(postback);
  assert.equal(prisma.messages.length, 1, 'postbacks are logged, not stored');

  // --- an attachment reaches the inbox with its link ------------------------
  await deliver(
    dm('mid.image', {
      text: undefined,
      attachments: [{ type: 'image', payload: { url: 'https://cdn/photo.jpg' } }],
    }),
  );
  assert.equal(prisma.messages.length, 2);
  assert.equal(prisma.messages[1].content, '[image] https://cdn/photo.jpg');

  // --- outbound: right host, right auth, right body -------------------------
  const list = (await request(http).get(`${base}/conversations`).set('Cookie', cookie).expect(200))
    .body;
  const conversationId: string = list[0].id;
  assert.ok(list[0].lastInboundAt, 'the reply window needs the last inbound timestamp');

  responses.push({ message_id: 'mid.out.1' });
  const reply = await request(http)
    .post(`${base}/conversations/${conversationId}/messages`)
    .set('Cookie', cookie)
    .send({ content: 'Yes — sending options now.' })
    .expect(201);

  assert.equal(reply.body.direction, 'OUTGOING');
  assert.equal(reply.body.externalMessageId, 'mid.out.1');

  const send = calls.at(-1);
  assert.ok(send);
  assert.equal(send.url, 'https://graph.instagram.com/v23.0/me/messages');
  assert.equal(send.method, 'POST');
  assert.equal(send.authorization, `Bearer ${IG_TOKEN}`);
  assert.deepEqual(send.body, {
    recipient: { id: IGSID },
    message: { text: 'Yes — sending options now.' },
  });
  assert.ok(
    !calls.some((call) => call.url.includes('graph.facebook.com')),
    'Instagram messaging never touches graph.facebook.com',
  );

  // --- outside the 24-hour window, a reply is tagged ------------------------
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
  prisma.conversations[0].lastInboundAt = stale;

  responses.push({ message_id: 'mid.out.2' });
  await request(http)
    .post(`${base}/conversations/${conversationId}/messages`)
    .set('Cookie', cookie)
    .send({ content: 'Following up on your enquiry.' })
    .expect(201);

  const tagged = calls.at(-1);
  assert.equal(
    tagged?.body && (tagged.body as Record<string, unknown>).messaging_type,
    'MESSAGE_TAG',
  );
  assert.equal(tagged?.body && (tagged.body as Record<string, unknown>).tag, 'HUMAN_AGENT');

  // --- an attachment send ---------------------------------------------------
  responses.push({ message_id: 'mid.out.3' });
  await instagram.sendAttachment(IGSID, 'image', 'https://cdn/quote.jpg', new Date());
  assert.deepEqual(calls.at(-1)?.body, {
    recipient: { id: IGSID },
    message: { attachment: { type: 'image', payload: { url: 'https://cdn/quote.jpg' } } },
  });

  // --- health check ---------------------------------------------------------
  responses.push({ data: [{ subscribed_fields: ['messages'] }] });
  const healthy = (
    await request(http).get(`${base}/health/instagram`).set('Cookie', cookie).expect(200)
  ).body;
  assert.equal(healthy.healthy, true);
  assert.deepEqual(healthy.subscribedFields, ['messages']);
  assert.equal(calls.at(-1)?.url, 'https://graph.instagram.com/v23.0/me/subscribed_apps');

  responses.push({ data: [] });
  const dropped = (
    await request(http).get(`${base}/health/instagram`).set('Cookie', cookie).expect(200)
  ).body;
  assert.equal(dropped.healthy, false, 'an empty data array means no DM will ever arrive');

  await request(http).get(`${base}/health/instagram`).expect(401);

  // --- token refresh --------------------------------------------------------
  responses.push({ access_token: 'IGAA-refreshed-token', expires_in: 5_184_000 });
  await instagram.refreshAccessToken();

  const refresh = calls.at(-1);
  assert.equal(
    refresh?.url,
    'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token',
  );
  assert.equal(refresh?.authorization, `Bearer ${IG_TOKEN}`, 'refresh presents the current token');
  assert.equal(prisma.integrationTokens[0]?.accessToken, 'IGAA-refreshed-token');
  assert.ok(prisma.integrationTokens[0]?.expiresAt, 'the expiry is stored with the token');

  // The refreshed token, not the environment's, is what the next send uses.
  responses.push({ message_id: 'mid.out.4' });
  await instagram.sendText(IGSID, 'After the refresh', new Date());
  assert.equal(calls.at(-1)?.authorization, 'Bearer IGAA-refreshed-token');

  // A failed refresh must not overwrite a working token.
  responses.push({ error: { message: 'expired', code: 190 } });
  await instagram.refreshAccessToken();
  assert.equal(prisma.integrationTokens[0]?.accessToken, 'IGAA-refreshed-token');

  await app.close();
  console.log('All Instagram smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
