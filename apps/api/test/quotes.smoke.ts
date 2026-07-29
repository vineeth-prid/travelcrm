/**
 * End-to-end smoke test of quote generation: versioning, server-side pricing,
 * immutability once sent, PDF rendering and storage, delivery through the
 * existing communication engine, and the lead status change that follows.
 *
 * Object storage and the Meta providers are faked; the PDF is really rendered
 * by pdfkit, so a broken layout shows up here.
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
process.env.COMPANY_NAME = 'Wanderlust Travel';

/** Everything the API "uploaded", and everything it "sent". */
const stored = new Map<string, Buffer>();
const sent: { channel: string; to: string; payload: unknown }[] = [];
/** Providers hand back a fresh message id every time; so does the fake. */
let outgoingCounter = 0;

function createStorageFake() {
  return {
    put: (key: string, body: Buffer) => {
      stored.set(key, body);
      return Promise.resolve();
    },
    presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}?signature=abc`),
  };
}

const VALID_UNTIL = '2027-03-31';

const QUOTE_BODY = {
  title: 'Bali Holiday Package',
  currency: 'INR',
  validUntil: VALID_UNTIL,
  notes: 'Price subject to availability.',
  items: [
    { title: '5-star hotel, 4 nights', description: 'Sea view', quantity: '2', unitPrice: '45000' },
    { title: 'Private airport transfer', description: '', quantity: '1', unitPrice: '6000' },
  ],
};

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');
  const { InstagramService } = await import('../src/integrations/instagram.service');
  const { WhatsAppService } = await import('../src/integrations/whatsapp.service');
  const { MessageIngestService } = await import('../src/communication/message-ingest.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder
      .overrideProvider(StorageService)
      .useValue(createStorageFake())
      .overrideProvider(WhatsAppService)
      .useValue({
        isConfigured: true,
        sendText: () => Promise.resolve('wamid.text'),
        sendDocument: (to: string, payload: unknown) => {
          sent.push({ channel: 'WHATSAPP', to, payload });
          return Promise.resolve(`wamid.doc-${++outgoingCounter}`);
        },
      })
      .overrideProvider(InstagramService)
      .useValue({
        isConfigured: true,
        sendText: (to: string, content: string) => {
          sent.push({ channel: 'INSTAGRAM', to, payload: content });
          return Promise.resolve(`ig.doc-${++outgoingCounter}`);
        },
        fetchLead: () => Promise.resolve(null),
      }),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  const login = await request(http)
    .post(`${base}/login`)
    .send({ email: 'admin@travelcrm.test', password: ADMIN_PASSWORD })
    .expect(200);
  const cookie = sessionCookieFrom(login.headers);
  assert.ok(cookie);

  // --- a WhatsApp conversation to quote on ---------------------------------
  const ingest = app.get(MessageIngestService);
  await ingest.ingest({
    channel: 'WHATSAPP',
    contactExternalId: '919812345678',
    contactName: 'Rahul Sharma',
    contactPhone: '919812345678',
    externalMessageId: 'wamid.in-1',
    content: 'Need a Bali package for December.',
    messageType: 'TEXT',
    sentAt: new Date('2026-07-01T09:00:00.000Z'),
  });
  const conversationId = prisma.conversations[0]!.id;

  // --- authentication -------------------------------------------------------
  await request(http).get(`${base}/conversations/${conversationId}/quotes`).expect(401);

  const empty = await request(http)
    .get(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .expect(200);
  assert.deepEqual(empty.body, []);

  // --- validation -----------------------------------------------------------
  const noTitle = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, title: '' })
    .expect(400);
  assert.ok(noTitle.body.details.title?.length);

  const noItems = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, items: [] })
    .expect(400);
  assert.ok(noItems.body.details.items?.length, 'at least one item is required');

  const badQuantity = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, items: [{ title: 'Hotel', quantity: 0, unitPrice: 100 }] })
    .expect(400);
  assert.ok(badQuantity.body.details['items.0.quantity']?.length);

  const badPrice = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, items: [{ title: 'Hotel', quantity: 1, unitPrice: -1 }] })
    .expect(400);
  assert.ok(badPrice.body.details['items.0.unitPrice']?.length);

  const noValidUntil = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, validUntil: '' })
    .expect(400);
  assert.ok(noValidUntil.body.details.validUntil?.length);

  // --- create ---------------------------------------------------------------
  const created = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send(QUOTE_BODY)
    .expect(201);

  const quoteId: string = created.body.id;
  assert.equal(created.body.version, 1, 'versions start at 1');
  assert.equal(created.body.status, 'DRAFT');
  assert.equal(created.body.hasPdf, false);
  assert.equal(created.body.validUntil, VALID_UNTIL);
  assert.equal(created.body.items.length, 2);
  assert.equal(created.body.items[0].totalPrice, 90000, 'line totals are calculated server-side');
  assert.equal(created.body.totalAmount, 96000, '2×45000 + 1×6000');

  // A client-supplied total must never be trusted.
  const tampered = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({
      ...QUOTE_BODY,
      totalAmount: 1,
      items: [{ title: 'Hotel', quantity: 2, unitPrice: 500 }],
    })
    .expect(201);
  assert.equal(tampered.body.totalAmount, 1000, 'the total is recalculated, not accepted');
  assert.equal(tampered.body.version, 2);

  // --- editing a draft ------------------------------------------------------
  const edited = await request(http)
    .patch(`${base}/quotes/${quoteId}`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, title: 'Bali Holiday Package (revised)' })
    .expect(200);
  assert.equal(edited.body.title, 'Bali Holiday Package (revised)');
  assert.equal(edited.body.version, 1, 'editing a draft does not bump the version');
  assert.equal(edited.body.items.length, 2, 'items are replaced, not duplicated');

  // --- generating the PDF ---------------------------------------------------
  const notGenerated = await request(http)
    .post(`${base}/quotes/${quoteId}/send`)
    .set('Cookie', cookie)
    .expect(400);
  assert.match(notGenerated.body.message, /generate the pdf/i);
  assert.equal(sent.length, 0, 'nothing is sent before a PDF exists');

  const generated = await request(http)
    .post(`${base}/quotes/${quoteId}/generate`)
    .set('Cookie', cookie)
    .expect(200);

  assert.equal(generated.body.quote.hasPdf, true);
  assert.match(generated.body.pdfUrl, /^https:\/\/files\.test\//);
  assert.equal(stored.size, 1, 'the PDF is uploaded to object storage');

  const [key, pdf] = [...stored.entries()][0]!;
  assert.match(key, new RegExp(`^quotes/${conversationId}/${quoteId}-v1\\.pdf$`));
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-', 'a real PDF was rendered');
  assert.ok(pdf.length > 800, 'the PDF has content');

  // Editing after generating invalidates the stale PDF.
  await request(http)
    .patch(`${base}/quotes/${quoteId}`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, title: 'Bali Holiday Package' })
    .expect(200);
  const afterEdit = await request(http)
    .get(`${base}/quotes/${quoteId}`)
    .set('Cookie', cookie)
    .expect(200);
  assert.equal(afterEdit.body.quote.hasPdf, false, 'an edit clears the previously generated PDF');
  assert.equal(afterEdit.body.pdfUrl, null);

  await request(http).post(`${base}/quotes/${quoteId}/generate`).set('Cookie', cookie).expect(200);

  // --- sending --------------------------------------------------------------
  const sentQuote = await request(http)
    .post(`${base}/quotes/${quoteId}/send`)
    .set('Cookie', cookie)
    .expect(200);

  assert.equal(sentQuote.body.quote.status, 'SENT');
  assert.ok(sentQuote.body.quote.sentAt);

  assert.equal(sent.length, 1, 'the quote goes out through the existing communication engine');
  assert.equal(sent[0]!.channel, 'WHATSAPP');
  assert.equal(sent[0]!.to, '919812345678');
  const document = sent[0]!.payload as { url: string; filename: string; caption: string };
  assert.match(document.url, /^https:\/\/files\.test\//);
  assert.match(document.filename, /\.pdf$/);
  assert.match(document.caption, /Bali Holiday Package/);

  // The outgoing message is persisted like any other reply.
  const thread = (
    await request(http)
      .get(`${base}/conversations/${conversationId}/messages`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.equal(thread.length, 2);
  assert.equal(thread[1].direction, 'OUTGOING');
  assert.match(thread[1].content, /Bali Holiday Package/);

  // The lead moves to QUOTE_SENT.
  const conversation = (
    await request(http).get(`${base}/conversations/${conversationId}`).set('Cookie', cookie)
  ).body;
  assert.equal(conversation.status, 'QUOTE_SENT');

  // --- immutability ---------------------------------------------------------
  const editSent = await request(http)
    .patch(`${base}/quotes/${quoteId}`)
    .set('Cookie', cookie)
    .send(QUOTE_BODY)
    .expect(400);
  assert.match(editSent.body.message, /already been sent/i);

  await request(http).post(`${base}/quotes/${quoteId}/send`).set('Cookie', cookie).expect(400);

  // Regenerating a sent quote returns the stored PDF rather than rebuilding it.
  const storedBefore = stored.size;
  const regenerate = await request(http)
    .post(`${base}/quotes/${quoteId}/generate`)
    .set('Cookie', cookie)
    .expect(200);
  assert.equal(stored.size, storedBefore, 'historical PDFs are never regenerated');
  assert.equal(regenerate.body.quote.status, 'SENT');

  // --- a new version continues the history ---------------------------------
  const nextVersion = await request(http)
    .post(`${base}/conversations/${conversationId}/quotes`)
    .set('Cookie', cookie)
    .send({ ...QUOTE_BODY, title: 'Bali Holiday Package v3' })
    .expect(201);
  assert.equal(nextVersion.body.version, 3);

  const history = (
    await request(http)
      .get(`${base}/conversations/${conversationId}/quotes`)
      .set('Cookie', cookie)
      .expect(200)
  ).body;
  assert.deepEqual(
    history.map((quote: { version: number }) => quote.version),
    [3, 2, 1],
    'history is newest first',
  );

  // --- a won conversation keeps its outcome --------------------------------
  await request(http)
    .patch(`${base}/conversations/${conversationId}`)
    .set('Cookie', cookie)
    .send({ status: 'WON' })
    .expect(200);

  await request(http)
    .post(`${base}/quotes/${nextVersion.body.id}/generate`)
    .set('Cookie', cookie)
    .expect(200);
  await request(http)
    .post(`${base}/quotes/${nextVersion.body.id}/send`)
    .set('Cookie', cookie)
    .expect(200);

  const wonConversation = (
    await request(http).get(`${base}/conversations/${conversationId}`).set('Cookie', cookie)
  ).body;
  assert.equal(wonConversation.status, 'WON', 'a won lead is not pushed back to QUOTE_SENT');

  // --- Instagram lead ads cannot receive files -----------------------------
  await ingest.ingest({
    channel: 'INSTAGRAM_LEAD',
    contactExternalId: 'lead_1',
    contactName: 'Priya Nair',
    externalMessageId: 'leadgen:lead_1',
    content: 'Destination: Bali',
    messageType: 'LEAD',
    sentAt: new Date(),
  });
  const leadConversationId = prisma.conversations[1]!.id;

  const leadQuote = await request(http)
    .post(`${base}/conversations/${leadConversationId}/quotes`)
    .set('Cookie', cookie)
    .send(QUOTE_BODY)
    .expect(201);

  // Generating and downloading still work — only delivery is unavailable.
  await request(http)
    .post(`${base}/quotes/${leadQuote.body.id}/generate`)
    .set('Cookie', cookie)
    .expect(200);

  const leadSend = await request(http)
    .post(`${base}/quotes/${leadQuote.body.id}/send`)
    .set('Cookie', cookie)
    .expect(400);
  assert.match(leadSend.body.message, /don't support file replies/i);
  assert.match(leadSend.body.message, /continue the conversation on WhatsApp/i);

  // --- missing quote --------------------------------------------------------
  await request(http)
    .get(`${base}/quotes/11111111-2222-4333-8444-555555555555`)
    .set('Cookie', cookie)
    .expect(404);

  await app.close();
  console.log('All quote smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
