import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createProviderStatus } from '../../server/gateway/provider-status.js';
import { redact } from '../../server/gateway/redact.js';
import { geminiTokenPlugin } from '../../server/providers/gemini.js';

test('status separates configured credentials from observed availability and expires observations', () => {
  let clock = 1_000;
  const secret = randomBytes(24).toString('hex');
  const status = createProviderStatus({
    env: { OPENAQ_API_KEY: secret },
    now: () => clock,
  });
  assert.equal(
    status.snapshot().find((p) => p.id === 'openaq').reason,
    'not-verified',
  );
  status.record('openaq', 'AVAILABLE');
  assert.equal(
    status.snapshot().find((p) => p.id === 'openaq').state,
    'AVAILABLE',
  );
  clock += 300_001;
  assert.equal(
    status.snapshot().find((p) => p.id === 'openaq').state,
    'DEGRADED',
  );
  assert.equal(JSON.stringify(status.snapshot()).includes(secret), false);
  assert.throws(() => status.record('openaq', 'arbitrary upstream message'));
});

test('redaction strips headers, quoted assignments, URLs, structured secrets and errors', () => {
  const result = redact({
    Authorization: 'sample',
    nested: { clientSecret: 'sample' },
    message:
      'Cookie: first=one; second=two\nsecret="several words here" https://provider.test/credential/in/path?q=private',
    error: new Error('provider key in error'),
  });
  const text = JSON.stringify(result);
  for (const value of [
    'sample',
    'first=',
    'second=',
    'several words',
    'provider.test',
    'provider key',
  ])
    assert.equal(text.includes(value), false);
});

function fixture({ env = {}, fetchImpl, now = () => Date.now() } = {}) {
  let handler;
  const status = createProviderStatus({ env, now });
  geminiTokenPlugin({ env, fetchImpl, now, status }).configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      },
    },
  });
  return {
    status,
    async request(overrides = {}) {
      let payload,
        code = 200;
      const headers = {};
      await handler(
        {
          url: '/api/gemini/token',
          method: 'POST',
          headers: { host: 'localhost:4173' },
          socket: { remoteAddress: '127.0.0.1' },
          ...overrides,
        },
        {
          set statusCode(value) {
            code = value;
          },
          setHeader(name, value) {
            headers[name] = value;
          },
          end(body) {
            payload = JSON.parse(body);
          },
        },
        () => {
          payload = { next: true };
        },
      );
      return { code, headers, payload };
    },
  };
}

test('Gemini rejects cross-site, nonlocal, malformed and disabled requests without spending quota', async () => {
  let calls = 0;
  const f = fixture({
    fetchImpl: () => {
      calls++;
      throw new Error('must not call');
    },
  });
  assert.equal((await f.request()).code, 503);
  assert.equal((await f.request({ method: 'GET' })).code, 405);
  assert.equal(
    (await f.request({ socket: { remoteAddress: '192.0.2.1' } })).code,
    403,
  );
  assert.equal(
    (
      await f.request({
        headers: { host: 'localhost:4173', origin: 'https://foreign.test' },
      })
    ).code,
    403,
  );
  assert.equal(
    (
      await f.request({
        headers: { host: 'localhost:4173', 'transfer-encoding': 'chunked' },
      })
    ).code,
    400,
  );
  assert.equal(
    (await f.request({ url: '/api/gemini/token?model=override' })).code,
    400,
  );
  assert.equal(calls, 0);
  const publicMode = fixture({ env: { PHANTOM_PUBLIC_MODE: '1' } });
  assert.equal((await publicMode.request()).code, 403);
  assert.equal(
    (await f.request({ headers: { host: 'localhost:4173', origin: 'null' } }))
      .code,
    403,
  );
  assert.equal(
    (
      await f.request({
        headers: { host: 'localhost:4173', 'x-forwarded-for': '127.0.0.1' },
      })
    ).code,
    403,
  );
});

test('Gemini returns only one-use short-lived credentials with fixed server configuration', async () => {
  const secret = randomBytes(24).toString('hex');
  const ephemeral = `auth_tokens/${randomBytes(16).toString('hex')}`;
  let calls = 0;
  const f = fixture({
    env: { GEMINI_API_KEY: secret },
    now: () => 1000,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(new URL(url).search, '');
      assert.equal(options.headers['x-goog-api-key'], secret);
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.uses, 1);
      assert.equal(body.liveConnectConstraints, undefined);
      assert.equal(
        body.bidiGenerateContentSetup.model,
        'models/gemini-3.8-live',
      );
      assert.deepEqual(
        body.bidiGenerateContentSetup.generationConfig.responseModalities,
        ['AUDIO'],
      );
      assert.equal(
        body.bidiGenerateContentSetup.tools[0].functionDeclarations.some(
          (tool) => tool.name === 'openNexus',
        ),
        true,
      );
      assert.equal(Date.parse(body.expireTime), 301000);
      assert.equal(Date.parse(body.newSessionExpireTime), 61000);
      return new Response(
        JSON.stringify({ name: ephemeral, privateEcho: secret }),
      );
    },
  });
  const result = await f.request();
  assert.equal(result.code, 200);
  assert.equal(result.payload.token, ephemeral);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal((await f.request()).code, 429);
  assert.equal(calls, 1);
});

test('Gemini upstream failure is sanitized, opens a circuit and leaves other provider state alone', async () => {
  let calls = 0;
  const f = fixture({
    env: {
      GEMINI_API_KEY: randomBytes(24).toString('hex'),
      PHANTOM_GEMINI_ENABLED: '1',
    },
    fetchImpl: async () => {
      calls++;
      return new Response('sensitive upstream error', { status: 429 });
    },
  });
  const first = await f.request();
  assert.equal(first.code, 503);
  assert.equal(first.payload.state, 'RATE_LIMITED');
  assert.equal(JSON.stringify(first).includes('sensitive'), false);
  assert.equal((await f.request()).code, 429);
  assert.equal(calls, 1);
  assert.equal(
    f.status.snapshot().find((p) => p.id === 'openaq').reason,
    'not-configured',
  );
});

test('Gemini enforces hourly token budget and rejects oversized responses', async () => {
  let clock = 0;
  const env = {
    GEMINI_API_KEY: randomBytes(24).toString('hex'),
    PHANTOM_GEMINI_ENABLED: '1',
  };
  const f = fixture({
    env,
    now: () => clock,
    fetchImpl: async () =>
      new Response(JSON.stringify({ name: 'auth_tokens/local-test' })),
  });
  for (let i = 0; i < 10; i++) {
    assert.equal((await f.request()).code, 200);
    clock += 15_001;
  }
  assert.equal((await f.request()).payload.state, 'QUOTA_EXHAUSTED');
  const oversized = fixture({
    env,
    fetchImpl: async () => new Response('x'.repeat(20_000)),
  });
  assert.equal((await oversized.request()).payload.state, 'OUTAGE');
});
