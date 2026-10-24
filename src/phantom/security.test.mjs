import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BoundedCache } from '../../server/cache/bounded.js';
import { createGateway, gatewayPlugin } from '../../server/gateway/index.js';
import { localLimiter, redisLimiter } from '../../server/gateway/limiter.js';

function response() {
  const res = new EventEmitter();
  res.writeHead = (status, headers) =>
    Object.assign(res, { status, headers, headersSent: true });
  res.end = (body) => {
    res.body = body;
    res.writableEnded = true;
    res.emit('finish');
  };
  return res;
}
async function request(gateway, url = '/api/flights', options = {}) {
  const res = response();
  let passed = false;
  await gateway(
    {
      url,
      method: 'GET',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      ...options,
    },
    res,
    () => {
      passed = true;
    },
  );
  return { res, passed };
}
const allow = () => ({
  distributed: true,
  consume: async () => ({ allowed: true, retryAfter: 1 }),
});

test('provider kill switches deny optional routes without blocking unrelated map data', async () => {
  const gateway = createGateway({
    limiter: allow(),
    providerStatus: { disabled: (id) => id === 'tomtom' },
  });
  const traffic = await request(gateway, '/api/tomtom/flow/1/1/1');
  assert.equal(traffic.res.status, 503);
  assert.equal(traffic.passed, false);
  assert.equal((await request(gateway, '/api/flights')).passed, true);
});

test('cache enforces LRU, byte ceilings, immutable snapshots and exact expiration', () => {
  let now = 0;
  const cache = new BoundedCache({
    maxEntries: 2,
    maxBytes: 100,
    ttlMs: 100,
    now: () => now,
  });
  const value = { field: 'a' };
  cache.set('a', value).set('b', null);
  value.field = 'x'.repeat(1000);
  const first = cache.get('a');
  first.field = 'y'.repeat(1000);
  assert.deepEqual(cache.get('a'), { field: 'a' });
  cache.set('c', 1);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.size, 2);
  cache.set('large', 'z'.repeat(100));
  assert.equal(cache.has('large'), false);
  assert.ok(cache.bytes <= 100);
  now = 100;
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
});

test('cache evicts by serialized UTF-8 bytes and expires restored entries at original deadline', () => {
  let now = 0;
  const cache = new BoundedCache({
    maxEntries: 10,
    maxBytes: 25,
    ttlMs: 100,
    now: () => now,
  });
  cache.set('a', 'ééé').set('b', 'ééé');
  assert.equal(cache.size, 1);
  assert.equal(cache.has('a'), false);
  cache.set('b', 'old', 10);
  now = 10;
  assert.deepEqual([...cache.entries()], []);
  assert.throws(() => cache.set('x', undefined), TypeError);
  assert.throws(() => cache.set('x', 1, 101), TypeError);
});

test('gateway rejects ambiguous paths before they can bypass admission', async () => {
  const gateway = createGateway({ limiter: allow() });
  for (const path of [
    '/api%2fflights',
    '/%61pi/flights',
    '//api/flights',
    '/x/../api/flights',
    '/api/./flights',
    '/api\\flights',
    'http://localhost/api/flights',
    '/api/flights#x',
  ]) {
    const result = await request(gateway, path);
    assert.equal(result.res.status, 400, path);
    assert.equal(result.passed, false, path);
  }
  assert.equal((await request(gateway, '/assets/main.js')).passed, true);
  assert.equal(
    (await request(gateway, '/@fs/D:/PERSONAL%20PROJECT/main.js')).passed,
    true,
  );
  assert.equal((await request(gateway, '/%2561pi/flights')).res.status, 400);
});

test('public gateway fails closed without distributed storage and denies non-allowlisted routes', async () => {
  assert.throws(() => createGateway({ publicMode: true }), /distributed/);
  assert.throws(() => gatewayPlugin({ PHANTOM_PUBLIC_MODE: '1' }));
  const gateway = createGateway({ publicMode: true, limiter: allow() });
  for (const path of [
    '/api/openai',
    '/api/local',
    '/mcp',
    '/mcp.json',
    '/API/flights',
    '/api/flights/extra',
  ]) {
    assert.equal((await request(gateway, path)).res.status, 403);
  }
  assert.equal(
    (await request(gateway, '/api/flights', { method: 'POST' })).res.status,
    403,
  );
  assert.equal(
    (
      await request(gateway, '/api/flights', {
        headers: { 'transfer-encoding': 'chunked' },
      })
    ).res.status,
    400,
  );
  assert.equal(
    (
      await request(gateway, '/api/flights', {
        headers: { 'content-length': '65537' },
      })
    ).res.status,
    413,
  );
  assert.equal((await request(gateway, '/api/flights')).passed, true);
});

test('gateway returns safe 429/503 responses and ignores forwarded client identity', async () => {
  const keys = [];
  const gateway = createGateway({
    limiter: {
      consume: async (key) => {
        keys.push(key);
        return { allowed: key === 'global', retryAfter: 7 };
      },
    },
  });
  const denied = await request(gateway, '/API/OpenAI?key=secret', {
    headers: { 'x-forwarded-for': 'spoof' },
  });
  assert.deepEqual(keys, ['global', 'paid:127.0.0.1']);
  assert.equal(denied.res.status, 429);
  assert.equal(denied.res.headers['Retry-After'], '7');
  assert.equal(denied.res.body.includes('secret'), false);
  const unavailable = createGateway({
    publicMode: true,
    limiter: {
      distributed: true,
      consume: async () => {
        throw new Error('secret upstream failure');
      },
    },
  });
  const failed = await request(unavailable);
  assert.equal(failed.res.status, 503);
  assert.equal(failed.passed, false);
  assert.equal(failed.res.body.includes('secret'), false);
});

test('Vite hooks register middleware without returning a post-hook', () => {
  const plugin = gatewayPlugin({});
  let installed = 0;
  const server = {
    middlewares: {
      use() {
        installed++;
        return () => {};
      },
    },
  };
  assert.equal(plugin.configureServer(server), undefined);
  assert.equal(plugin.configurePreviewServer(server), undefined);
  assert.equal(installed, 2);
});

test('local gateway preserves existing parser body ceilings without enabling public mutations', async () => {
  const gateway = createGateway({ limiter: allow() });
  for (const [path, limit] of [
    ['/mcp', 1024 * 1024],
    ['/api/realtime/debug-log', 8 * 1024 * 1024],
    ['/api/local-receivers/aircraft', 2 * 1024 * 1024],
    ['/api/openai/hud-summary', 65536],
  ]) {
    assert.equal(
      (
        await request(gateway, path, {
          method: 'POST',
          headers: { 'content-length': String(limit) },
        })
      ).passed,
      true,
    );
    assert.equal(
      (
        await request(gateway, path, {
          method: 'POST',
          headers: { 'content-length': String(limit + 1) },
        })
      ).res.status,
      413,
    );
    assert.equal(
      (
        await request(
          createGateway({ publicMode: true, limiter: allow() }),
          path,
          { method: 'POST', headers: { 'content-length': String(limit) } },
        )
      ).res.status,
      403,
    );
  }
});

test('gateway holds concurrency slots until response finishes or disconnects', async () => {
  const gateway = createGateway({ limiter: allow() });
  const active = [];
  for (let i = 0; i < 128; i++) active.push(await request(gateway));
  assert.ok(active.every((entry) => entry.passed));
  assert.equal((await request(gateway)).res.status, 503);
  active[0].res.end('done');
  active[0].res.emit('close'); // Must not release twice.
  assert.equal((await request(gateway)).passed, true);
  assert.equal((await request(gateway)).res.status, 503);
  active[1].res.emit('close');
  assert.equal((await request(gateway)).passed, true);
});

test('local limiter resets at window boundary and rejects invalid budgets', async () => {
  let now = 0;
  const limiter = localLimiter({ now: () => now });
  assert.equal((await limiter.consume('client', 1)).allowed, true);
  assert.equal((await limiter.consume('client', 1)).allowed, false);
  now = 60000;
  assert.equal((await limiter.consume('client', 1)).allowed, true);
  await assert.rejects(limiter.consume('client', 0), TypeError);
  await assert.rejects(limiter.consume('client', 1, 120001), TypeError);
});

test('Redis limiter sends atomic expiring command with hashed identity and validates response', async () => {
  let sent;
  const limiter = redisLimiter({
    url: 'https://redis.example',
    token: 'test-only',
    fetchImpl: async (url, options) => {
      sent = options;
      return new Response(JSON.stringify({ result: [3, 1501] }));
    },
  });
  assert.deepEqual(await limiter.consume('data:private-address', 2), {
    allowed: false,
    retryAfter: 2,
  });
  assert.equal(sent.redirect, 'error');
  const command = JSON.parse(sent.body);
  assert.equal(command[0], 'EVAL');
  assert.match(command[1], /PEXPIRE/);
  assert.match(command[3], /^phantom:limit:[a-f0-9]{64}$/);
  assert.equal(sent.body.includes('private-address'), false);
  for (const result of [
    { result: [1, -1] },
    { result: [0, 10] },
    { result: 'wrong' },
    { error: 'secret', result: [1, 10] },
  ]) {
    const broken = redisLimiter({
      url: 'https://redis.example',
      token: 'test-only',
      fetchImpl: async () => new Response(JSON.stringify(result)),
    });
    await assert.rejects(broken.consume('x', 2), /Invalid admission response/);
  }
  for (const url of [
    'http://redis.example',
    'https://user:pass@redis.example',
    'https://redis.example/path',
    'https://redis.example/?secret=x',
  ]) {
    assert.throws(() => redisLimiter({ url, token: 'test-only' }));
  }
});
