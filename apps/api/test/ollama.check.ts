/**
 * Exercises the real ChatClient against a stand-in Ollama server.
 *
 * The AI smoke test replaces ChatClient with a fake, which is right for testing
 * prompts and parsing but leaves the HTTP wiring itself unverified — URL
 * construction, the `/v1` → `/api/tags` root derivation, headers, the request
 * body, and how status codes map to faults. Those are exactly the things that
 * break when pointing the application at a real server for the first time.
 *
 * The stand-in speaks Ollama's actual shapes and runs in-process on a random
 * port, so this needs no Ollama installed and no network.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// The client logs every call and every fault by design; here that is noise, and
// the failure cases would look alarming in a passing run.
Logger.overrideLogger(false);

interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
  body: Record<string, unknown> | null;
}

const received: Received[] = [];

/** What the next /v1/chat/completions call should do. */
let respond: { status: number; body: unknown } = {
  status: 200,
  body: { choices: [{ message: { content: 'Hello from the model.' } }] },
};

function startStubOllama(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      received.push({
        method: request.method ?? '',
        url: request.url ?? '',
        authorization: request.headers.authorization,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
      });

      // Ollama's model listing sits at the server root, not under /v1.
      if (request.url === '/api/tags') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'qwen2.5:7b' }] }));
        return;
      }

      if (request.url === '/v1/chat/completions') {
        response.writeHead(respond.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(respond.body));
        return;
      }

      response.writeHead(404).end('{}');
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

/** A ConfigService stand-in — the client only ever reads four values. */
function configFor(values: Record<string, unknown>) {
  return { get: (key: string) => values[key] } as never;
}

async function main(): Promise<void> {
  const { server, origin } = await startStubOllama();
  const { ChatClient } = await import('../src/ai/chat.client');
  const { AiError } = await import('../src/ai/ai.error');

  const build = (overrides: Record<string, unknown> = {}) =>
    new ChatClient(
      configFor({
        AI_BASE_URL: `${origin}/v1`,
        AI_MODEL: 'llama3.1:8b',
        AI_API_KEY: '',
        AI_TIMEOUT_MS: 5_000,
        ...overrides,
      }),
    );

  const prompt = {
    messages: [{ role: 'system' as const, content: 'be brief' }],
    maxTokens: 100,
    temperature: 0,
  };

  // --- not configured until a model is named --------------------------------
  const unset = build({ AI_MODEL: '' });
  assert.equal(unset.isConfigured, false, 'no model means not switched on');
  await assert.rejects(
    () => unset.complete(prompt),
    (error: unknown) => error instanceof AiError && error.fault === 'not_configured',
    'an unset model must fail before any request is made',
  );
  assert.equal(received.length, 0, 'nothing is sent when no model is configured');

  // --- a normal completion ---------------------------------------------------
  const client = build();
  assert.equal(client.isConfigured, true);

  const text = await client.complete(prompt);
  assert.equal(text, 'Hello from the model.');

  const call = received.at(-1)!;
  assert.equal(call.method, 'POST');
  assert.equal(call.url, '/v1/chat/completions', 'the /v1 base is used verbatim');
  assert.equal(call.body?.model, 'llama3.1:8b');
  assert.equal(call.body?.max_tokens, 100);
  assert.equal(call.body?.temperature, 0);
  assert.equal(
    call.authorization,
    undefined,
    'no Authorization header is sent when no key is set — Ollama needs none',
  );

  // A trailing slash on the base URL must not produce a doubled path.
  await build({ AI_BASE_URL: `${origin}/v1/` }).complete(prompt);
  assert.equal(received.at(-1)!.url, '/v1/chat/completions', 'a trailing slash is tolerated');

  // A key, when one is configured, travels as a bearer token.
  await build({ AI_API_KEY: 'gateway-key' }).complete(prompt);
  assert.equal(received.at(-1)!.authorization, 'Bearer gateway-key');

  // JSON mode reaches the wire as response_format.
  await client.complete({ ...prompt, json: true });
  assert.deepEqual(received.at(-1)!.body?.response_format, { type: 'json_object' });

  // --- model discovery -------------------------------------------------------
  const status = await client.status();
  assert.equal(status.configured, true);
  assert.equal(status.reachable, true);
  assert.deepEqual(
    status.availableModels,
    ['llama3.1:8b', 'qwen2.5:7b'],
    'the /v1 base is stripped to reach Ollama’s /api/tags',
  );
  assert.equal(received.at(-1)!.url, '/api/tags');

  // --- failures map to faults a salesperson can act on -----------------------
  const faults: [number, string][] = [
    [404, 'model_missing'],
    [429, 'rate_limited'],
    [401, 'rejected'],
    [500, 'unreachable'],
  ];

  for (const [status_, fault] of faults) {
    respond = { status: status_, body: { error: { message: 'sk-secret-in-detail' } } };
    await assert.rejects(
      () => client.complete(prompt),
      (error: unknown) => {
        assert.ok(error instanceof AiError, `HTTP ${status_} produces an AiError`);
        assert.equal(error.fault, fault, `HTTP ${status_} is a ${fault}`);
        // The provider's wording is logged, never returned.
        assert.ok(!JSON.stringify(error.getResponse()).includes('sk-secret'));
        return true;
      },
    );
  }

  // An empty completion is unusable, not success.
  respond = { status: 200, body: { choices: [{ message: { content: '   ' } }] } };
  await assert.rejects(
    () => client.complete(prompt),
    (error: unknown) => error instanceof AiError && error.fault === 'unreadable',
  );

  // --- an unreachable server ------------------------------------------------
  await new Promise<void>((resolve) => server.close(() => resolve()));

  const orphaned = build();
  await assert.rejects(
    () => orphaned.complete(prompt),
    (error: unknown) => error instanceof AiError && error.fault === 'unreachable',
    'a server that is not running must not throw a raw fetch error',
  );

  // Status degrades to "cannot tell" rather than failing.
  const offline = await orphaned.status();
  assert.equal(offline.reachable, false);
  assert.equal(offline.availableModels, null);
  assert.equal(offline.model, 'llama3.1:8b', 'configuration is still reported when offline');

  console.log('All Ollama client checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
