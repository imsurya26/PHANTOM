import test from 'node:test';
import assert from 'node:assert/strict';
import { airQualityPlugin } from '../../server/providers/airQuality.js';

const location = {
  id: 7,
  name: 'Station',
  coordinates: { latitude: 13, longitude: 80 },
  provider: { name: 'Public monitor' },
  sensors: [{ id: 8, parameter: { name: 'pm25', units: 'µg/m³' } }],
  licenses: [{ name: 'Public domain', attribution: { name: 'Agency' } }],
};
const payload = (results, found = results.length) =>
  new Response(JSON.stringify({ results, meta: { found } }));
function fixture(options = {}) {
  let handler;
  airQualityPlugin({ apiKey: 'fixture-key', ...options }).configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      },
    },
  });
  return async (
    url = '/api/air-quality/locations?lat=13&lon=80',
    method = 'GET',
  ) => {
    const headers = {};
    let body,
      next = false;
    const response = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k] = v;
      },
      end(value) {
        body = JSON.parse(value);
      },
    };
    await handler({ url, method }, response, () => {
      next = true;
    });
    return { status: response.statusCode, body, headers, next };
  };
}

test('OpenAQ stays ready for a key without upstream calls or invented measurements', async () => {
  const request = fixture({
    apiKey: '',
    fetchImpl() {
      throw new Error('must not fetch');
    },
  });
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.body.state, 'key-required');
  assert.deepEqual(result.body.results, []);
});

test('OpenAQ rejects invalid coordinates, duplicates, unknown inputs and writes', async () => {
  const request = fixture({
    fetchImpl() {
      throw new Error('must not fetch');
    },
  });
  for (const query of [
    'lat=91&lon=80',
    'lat=&lon=80',
    'lat=13&lon=80&radius=25001',
    'lat=13&lat=14&lon=80',
    'lat=13&lon=80&url=https://evil.test',
  ]) {
    assert.equal(
      (await request(`/api/air-quality/locations?${query}`)).status,
      400,
    );
  }
  assert.equal(
    (await request('/api/air-quality/latest?locationId=1e3')).status,
    400,
  );
  assert.equal(
    (await request('/api/air-quality/locations?lat=13&lon=80', 'POST')).status,
    405,
  );
  assert.equal((await request('/api/unrelated')).next, true);
});

test('OpenAQ pins host and credential header, disables redirects and caches source metadata', async () => {
  const calls = [];
  const request = fixture({
    fetchImpl(url, options) {
      calls.push({ url, options });
      return payload([location], 80);
    },
  });
  const first = await request();
  const second = await request();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://api.openaq.org');
  assert.equal(calls[0].url.searchParams.get('coordinates'), '13,80');
  assert.equal(calls[0].options.headers['X-API-Key'], 'fixture-key');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(first.body.results[0].provider, 'Public monitor');
  assert.equal(first.body.results[0].licenses[0].attribution, 'Agency');
  assert.equal(first.body.truncated, true);
  assert.equal(second.body.cached, true);
  assert.equal(first.body.fetchedAt, second.body.fetchedAt);
  assert.ok(!JSON.stringify(first.body).includes('fixture-key'));
});

test('OpenAQ preserves measurement time and actual units, without deriving AQI', async () => {
  const request = fixture({
    now: () => Date.parse('2026-10-13T00:00:00Z'),
    fetchImpl(url) {
      return payload(
        url.pathname.endsWith('/latest')
          ? [
              {
                sensorsId: 8,
                locationsId: 7,
                value: 12.5,
                datetime: { utc: '2026-10-12T04:00:00Z' },
              },
            ]
          : [location],
      );
    },
  });
  const result = await request('/api/air-quality/latest?locationId=7');
  assert.equal(result.status, 200);
  assert.equal(result.body.results[0].units, 'µg/m³');
  assert.equal(result.body.results[0].observedAt, '2026-10-12T04:00:00Z');
  assert.notEqual(result.body.fetchedAt, result.body.results[0].observedAt);
  assert.equal(result.body.results[0].aqi, undefined);
});

test('OpenAQ shares in-flight lookups and bounds concurrent distinct requests', async () => {
  const releases = [];
  const request = fixture({
    fetchImpl() {
      return new Promise((resolve) =>
        releases.push(() => resolve(payload([location]))),
      );
    },
  });
  const a = request(),
    b = request();
  const other = [1, 2, 3].map((lat) =>
    request(`/api/air-quality/locations?lat=${lat}&lon=80`),
  );
  assert.equal(releases.length, 4);
  const denied = await request('/api/air-quality/locations?lat=4&lon=80');
  assert.equal(denied.status, 503);
  assert.equal(denied.body.state, 'busy');
  for (const release of releases) release();
  assert.equal((await a).status, 200);
  assert.equal((await b).status, 200);
  await Promise.all(other);
});

test('OpenAQ rate limits trigger global cooldown with sanitized failures', async () => {
  let calls = 0,
    clock = 0;
  const request = fixture({
    now: () => clock,
    fetchImpl() {
      calls++;
      return new Response('secret body', { status: 429 });
    },
  });
  const first = await request();
  assert.equal(first.body.state, 'rate-limited');
  clock = 60_000;
  assert.equal(
    (await request('/api/air-quality/locations?lat=14&lon=80')).body.state,
    'cooldown',
  );
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(first.body).includes('secret body'));
});

test('OpenAQ rejects malformed, oversized and unrelated location responses', async () => {
  for (const response of [
    new Response('invalid JSON'),
    new Response('x', { headers: { 'content-length': '1048577' } }),
    payload([{ ...location, id: 9 }]),
  ]) {
    const request = fixture({ fetchImpl: async () => response });
    const result = await request('/api/air-quality/latest?locationId=7');
    assert.equal(result.status, 502);
    assert.equal(result.body.message, 'OpenAQ is temporarily unavailable');
  }
});

test('OpenAQ caches expire and request budget prevents unlimited cache misses', async () => {
  let clock = 0,
    calls = 0;
  const request = fixture({
    now: () => clock,
    fetchImpl() {
      calls++;
      return payload([location]);
    },
  });
  await request();
  clock = 300_001;
  await request();
  assert.equal(calls, 2);
  for (let lat = 0; lat < 24; lat++)
    await request(`/api/air-quality/locations?lat=${lat}&lon=81`);
  const denied = await request('/api/air-quality/locations?lat=30&lon=81');
  assert.equal(denied.status, 429);
  assert.equal(calls, 26);
});

test('OpenAQ malformed null rows and nested licenses fail closed without upstream text', async () => {
  for (const rows of [[null], [{ ...location, licenses: [null] }]]) {
    const request = fixture({ fetchImpl: async () => payload(rows) });
    const result = await request();
    assert.equal(result.status, 502);
    assert.equal(result.body.state, 'unavailable');
    assert.deepEqual(result.body.results, []);
    assert.equal(result.body.message, 'OpenAQ is temporarily unavailable');
  }
  const request = fixture({
    fetchImpl: async (url) =>
      payload(url.pathname.endsWith('/latest') ? [null] : [location]),
  });
  const result = await request('/api/air-quality/latest?locationId=7');
  assert.equal(result.status, 502);
  assert.equal(result.body.message, 'OpenAQ is temporarily unavailable');
});
