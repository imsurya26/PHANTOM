import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelHandler } from '../../server/vercel/handler.js';
import { createPublicAdmission } from '../../server/vercel/admission.js';
import { redisLimiter } from '../../server/gateway/limiter.js';

test('Redis permits durable hour/day windows and rejects oversized windows', async () => {
  const windows = [];
  const limiter = redisLimiter({
    url: 'https://redis.example',
    token: 'test-only',
    fetchImpl: async (_, options) => {
      const command = JSON.parse(options.body);
      windows.push(command[4]);
      return new Response(JSON.stringify({ result: [1, command[4]] }));
    },
  });
  assert.equal((await limiter.consume('hour', 10, 3600000)).allowed, true);
  assert.equal((await limiter.consume('day', 30, 86400000)).allowed, true);
  assert.deepEqual(windows, [3600000, 86400000]);
  await assert.rejects(
    limiter.consume('oversized', 30, 86400001),
    /Invalid admission budget/,
  );
});

const env = {
  VERCEL: '1',
  PHANTOM_PUBLIC_ORIGIN: 'https://phantom.example',
  GEMINI_API_KEY: 'test-voice-key',
  OPENAQ_API_KEY: 'test-air-key',
};
function store() {
  const counts = new Map();
  return {
    distributed: true,
    counts,
    async consume(key, limit) {
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      return { allowed: n <= limit, retryAfter: 3600 };
    },
  };
}
function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
}
function request(url = '/api/gemini/token', overrides = {}) {
  return {
    url,
    method: url.includes('gemini') ? 'POST' : 'GET',
    headers: {
      host: 'phantom.example',
      origin: env.PHANTOM_PUBLIC_ORIGIN,
      'x-forwarded-for': '203.0.113.5',
      'sec-fetch-site': 'same-origin',
    },
    ...overrides,
  };
}
const tokenResponse = () =>
  new Response(JSON.stringify({ name: 'auth_tokens/test-token' }), {
    status: 200,
  });

test('public Gemini mints only bounded one-use token and never returns permanent key', async () => {
  let body;
  const handler = createVercelHandler({
    env,
    limiter: store(),
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      body = JSON.parse(options.body);
      return tokenResponse();
    },
  });
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(body.uses, 1);
  assert.equal(res.body.token, 'auth_tokens/test-token');
  assert.equal(JSON.stringify(res.body).includes(env.GEMINI_API_KEY), false);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('durable IP budget survives separate cold-start handler instances', async () => {
  const limiter = store();
  let calls = 0;
  for (let i = 0; i < 4; i++) {
    const handler = createVercelHandler({
      env,
      limiter,
      fetchImpl: async () => {
        calls++;
        return tokenResponse();
      },
    });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, i < 3 ? 200 : 429);
  }
  assert.equal(calls, 3);
});

test('global Gemini cap applies across distinct visitors and instances', async () => {
  const limiter = store();
  let calls = 0;
  for (let i = 1; i <= 11; i++) {
    const handler = createVercelHandler({
      env,
      limiter,
      fetchImpl: async () => {
        calls++;
        return tokenResponse();
      },
    });
    const req = request();
    req.headers['x-forwarded-for'] = `203.0.113.${i}`;
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, i <= 10 ? 200 : 429);
  }
  assert.equal(calls, 10);
});

test('missing or failed shared admission never reaches upstream', async () => {
  for (const limiter of [
    undefined,
    { distributed: false },
    {
      distributed: true,
      async consume() {
        throw new Error('private-storage-message');
      },
    },
  ]) {
    const handler = createVercelHandler({
      env,
      limiter,
      fetchImpl: async () => assert.fail('upstream must stay closed'),
    });
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.equal(
      JSON.stringify(res.body).includes('private-storage-message'),
      false,
    );
  }
});

test('foreign origins, missing origins and forged non-Vercel runtime are rejected', async () => {
  for (const [environment, origin] of [
    [env, 'https://evil.example'],
    [env, undefined],
    [{ ...env, VERCEL: '0' }, env.PHANTOM_PUBLIC_ORIGIN],
  ]) {
    const handler = createVercelHandler({
      env: environment,
      limiter: store(),
      fetchImpl: async () => assert.fail('blocked'),
    });
    const req = request();
    req.headers.origin = origin;
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
  }
});

test('OpenAQ uses server secret, normalized results and cached requests avoid upstream debit', async () => {
  let calls = 0;
  const limiter = store();
  const handler = createVercelHandler({
    env,
    limiter,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(new URL(url).hostname, 'api.openaq.org');
      assert.equal(options.headers['X-API-Key'], env.OPENAQ_API_KEY);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    },
  });
  for (let i = 0; i < 2; i++) {
    const res = response();
    await handler(request('/api/air-quality/locations?lat=30&lon=-97'), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.results, []);
    assert.equal(JSON.stringify(res.body).includes(env.OPENAQ_API_KEY), false);
  }
  assert.equal(calls, 1);
  assert.equal(limiter.counts.get('public:v1:openaq:upstream:minute'), 1);
});

test('OpenAQ global upstream cap is shared independently of request fan-out', async () => {
  const limiter = store();
  let calls = 0;
  const admission = createPublicAdmission({
    env,
    limiter,
    fetchImpl: async () => {
      calls++;
      return new Response('{}');
    },
  });
  for (let i = 0; i < 25; i++)
    await admission.openaqFetch('https://api.openaq.org/v3/locations', {});
  await assert.rejects(
    admission.openaqFetch('https://api.openaq.org/v3/locations', {}),
    { status: 429 },
  );
  assert.equal(calls, 25);
});

test('unadapted APIs and encoded paths cannot invoke local handlers', async () => {
  const handler = createVercelHandler({
    env,
    limiter: store(),
    fetchImpl: async () => assert.fail('blocked'),
  });
  for (const [url, code] of [
    ['/api/realtime/session', 503],
    ['/api/%67emini/token', 400],
    ['/api/../gemini/token', 400],
  ]) {
    const res = response();
    await handler(request(url), res);
    assert.equal(res.statusCode, code);
  }
});
