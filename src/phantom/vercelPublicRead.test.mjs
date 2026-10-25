import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicReadHandler } from '../../server/vercel/public-read.js';
import {
  createFlightSource,
  createMilitarySource,
} from '../sources/live/standalone.js';

function invoke(handler, url, method = 'GET') {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = body;
    },
  };
  return handler({ url, method }, res).then((matched) => ({ ...res, matched }));
}
const aircraft = {
  hex: 'abc123',
  lat: 30.1,
  lon: -97.1,
  flight: 'TEST1',
  alt_baro: 10000,
  gs: 200,
  seen: 1,
  seen_pos: 1,
};
test('deployed flight and military routes feed the actual client source contracts', async () => {
  const urls = [];
  const handler = createPublicReadHandler({
    fetchImpl: async (url) => {
      urls.push(url);
      return Response.json({ now: 1800000000, ac: [aircraft] });
    },
  });
  const fetchImpl = async (url) => {
    const r = await invoke(handler, url);
    return new Response(r.body, { status: r.statusCode, headers: r.headers });
  };
  const flights = await createFlightSource({ fetchImpl }).getSnapshot({
    latitude: 30.1,
    longitude: -97.1,
  });
  const military = await createMilitarySource({ fetchImpl }).getSnapshot();
  assert.equal(flights.records.length, 1);
  assert.equal(military.records.length, 1);
  assert.match(urls[0], /^https:\/\/api.adsb.lol\/v2\/point\/30\/-97\/250$/);
  assert.equal(urls[1], 'https://api.adsb.lol/v2/mil');
});
test('rejects invalid coordinates, duplicate parameters, methods, and arbitrary upstream URLs', async () => {
  let calls = 0;
  const handler = createPublicReadHandler({
    fetchImpl: async () => {
      calls++;
      throw Error('Unexpected');
    },
  });
  for (const url of [
    '/api/flights?lat=91&lon=0',
    '/api/flights?lat=1',
    '/api/flights?lat=1&lat=2&lon=0',
    '/api/military?url=https://evil.example',
    '/api/geocode?q=',
  ])
    assert.equal((await invoke(handler, url)).statusCode, 400);
  assert.equal((await invoke(handler, '/api/flights', 'POST')).statusCode, 405);
  assert.equal((await invoke(handler, '/api/debug')).matched, false);
  assert.equal(calls, 0);
});
test('coalesces concurrent requests and bounds refresh TTL without inventing stale positions', async () => {
  let calls = 0,
    clock = 10000;
  const handler = createPublicReadHandler({
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return Response.json({ ac: [aircraft], now: 1800000000 });
    },
  });
  await Promise.all([
    invoke(handler, '/api/military'),
    invoke(handler, '/api/military'),
  ]);
  await invoke(handler, '/api/military');
  assert.equal(calls, 1);
  clock += 16000;
  await invoke(handler, '/api/military');
  assert.equal(calls, 2);
});
test('search returns Google-compatible result geometry and uses fixed upstream', async () => {
  const handler = createPublicReadHandler({
    fetchImpl: async (url) => {
      assert.equal(new URL(url).hostname, 'photon.komoot.io');
      return Response.json({
        features: [
          {
            properties: { name: 'Chennai', country: 'India' },
            geometry: { coordinates: [80.27, 13.08] },
          },
        ],
      });
    },
  });
  const r = await invoke(handler, '/api/geocode?q=Chennai');
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body).results[0].geometry.location, {
    lat: 13.08,
    lng: 80.27,
  });
});
test('upstream failures remain unavailable rather than fake successful empty feeds', async () => {
  const handler = createPublicReadHandler({
    fetchImpl: async () => new Response('', { status: 429 }),
  });
  assert.equal((await invoke(handler, '/api/military')).statusCode, 503);
});
