import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createVercelHandler } from '../../server/vercel/handler.js';
import { restoreApiUrl } from '../../server/vercel/rewrite.js';
import { createSatelliteSource } from '../layers/satellites/source.js';

const NOW = Date.UTC(2026, 8, 16, 2, 12);
const TIME = '2026-09-16T02:08:00.000Z';
const limiter = { distributed: true, consume: async () => ({ allowed: true }) };
async function invoke(handler, path, method = 'GET') {
  const url = new URL(path, 'https://internal');
  const route = url.pathname.slice(5);
  url.searchParams.set('__phantom_route', route);
  url.searchParams.set('path', route);
  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (key, value) => {
    res.headers[key.toLowerCase()] = value;
  };
  res.end = (body) => {
    res.body = body;
  };
  await handler(
    { url: restoreApiUrl(`/api?${url.searchParams}`), method, headers: {} },
    res,
  );
  return res;
}
const json = (res) => JSON.parse(res.body);

test('rewritten satellite routes satisfy real source contract, cache and reject arbitrary groups', async () => {
  let calls = 0;
  const handler = createVercelHandler({
    env: {},
    fetchImpl: async (url) => {
      calls++;
      assert.equal(
        url,
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
      );
      return new Response('ISS\n1 25544 test\n2 25544 test\n');
    },
  });
  const source = createSatelliteSource({
    fetchImpl: async (path) => {
      const res = await invoke(handler, path);
      return new Response(res.body, {
        status: res.statusCode,
        headers: res.headers,
      });
    },
  });
  assert.equal((await source.readGroup('stations')).ok, true);
  await source.readGroup('stations');
  assert.equal(calls, 1);
  assert.equal((await invoke(handler, '/api/celestrak/evil')).statusCode, 400);
  assert.equal(
    (await invoke(handler, '/api/celestrak/stations?url=https://evil.example'))
      .statusCode,
    400,
  );
  assert.equal(
    (await invoke(handler, '/api/celestrak/stations', 'POST')).statusCode,
    405,
  );
});

test('mounted weather manifest and numeric tile query work through Vercel rewrite', async () => {
  const xml = `<WMS_Capabilities><Capability><Layer><Name>global_longwave_imagery_mosaic</Name><EX_GeographicBoundingBox><westBoundLongitude>-180</westBoundLongitude><eastBoundLongitude>180</eastBoundLongitude><southBoundLatitude>-80</southBoundLatitude><northBoundLatitude>80</northBoundLatitude></EX_GeographicBoundingBox><Dimension name="time" default="${TIME}" units="ISO8601">${TIME}</Dimension></Layer></Capability></WMS_Capabilities>`;
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12);
  png.writeUInt32BE(256, 16);
  png.writeUInt32BE(256, 20);
  const handler = createVercelHandler({
    env: {},
    now: () => NOW,
    fetchImpl: async (url) =>
      url.includes('GetCapabilities')
        ? new Response(xml)
        : new Response(png, { headers: { 'Content-Type': 'image/png' } }),
  });
  const manifest = await invoke(
    handler,
    '/api/weather/manifest?product=clouds',
  );
  assert.equal(manifest.statusCode, 200);
  assert.equal(json(manifest).observedAt, TIME);
  const tile = await invoke(
    handler,
    `/api/weather/tile?product=clouds&time=${encodeURIComponent(TIME)}&z=0&x=0&y=0`,
  );
  assert.equal(tile.statusCode, 200);
  assert.equal(tile.headers['content-type'], 'image/png');
  assert.equal(tile.body.length, 33);
  assert.equal(
    (
      await invoke(
        handler,
        '/api/weather/tile?product=clouds&url=https://evil.example',
      )
    ).statusCode,
    400,
  );
});

test('mounted context route preserves query and supplies provider-isolated results', async () => {
  const handler = createVercelHandler({
    env: {},
    now: () => NOW,
    fetchImpl: async (url) => {
      if (url.includes('gdeltproject'))
        return Response.json({
          articles: [
            { title: 'Test news', url: 'https://news.example/article' },
          ],
        });
      assert.ok(url.startsWith('https://en.wikipedia.org/w/api.php?'));
      return Response.json({
        query: {
          geosearch: [
            { pageid: 1, title: 'Place', lat: 13, lon: 80, dist: 20 },
          ],
        },
      });
    },
  });
  const result = await invoke(
    handler,
    '/api/phantom/signals?lat=13&lon=80&q=Chennai',
  );
  assert.equal(result.statusCode, 200);
  assert.equal(json(result).news.items.length, 1);
  assert.equal(json(result).places.items.length, 1);
  assert.equal(
    (await invoke(handler, '/api/phantom/signals?lat=91&lon=80')).statusCode,
    400,
  );
});

test('FIRMS is globally metered, coalesced, cached and keeps key out of response', async () => {
  let calls = 0,
    reservations = 0;
  const handler = createVercelHandler({
    env: { FIRMS_MAP_KEY: 'test-only' },
    now: () => NOW,
    limiter: {
      ...limiter,
      consume: async (key) => {
        assert.match(key, /firms:upstream/);
        reservations++;
        return { allowed: true };
      },
    },
    fetchImpl: async () => {
      calls++;
      return new Response(
        'latitude,longitude,acq_date,acq_time,confidence,frp\n13,80,2026-09-16,0200,n,10\n',
      );
    },
  });
  const [first, second] = await Promise.all([
    invoke(handler, '/api/firms'),
    invoke(handler, '/api/firms'),
  ]);
  assert.equal(first.statusCode, 200);
  assert.equal(json(first).fires.length, 4);
  assert.equal(json(second).count, 4);
  await invoke(handler, '/api/firms');
  assert.equal(calls, 4);
  assert.equal(reservations, 8);
  assert.ok(!first.body.includes('test-only'));
  assert.ok(Buffer.byteLength(first.body) < 4_000_000);
});

test('FIRMS fails closed without distributed limits and when allowance is exhausted', async () => {
  for (const store of [
    undefined,
    { distributed: true, consume: async () => ({ allowed: false }) },
  ]) {
    let calls = 0;
    const handler = createVercelHandler({
      env: { FIRMS_MAP_KEY: 'test-only' },
      limiter: store,
      fetchImpl: async () => {
        calls++;
        throw Error('unexpected');
      },
    });
    assert.equal((await invoke(handler, '/api/firms')).statusCode, 503);
    assert.equal(calls, 0);
  }
});
