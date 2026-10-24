import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSignalQuery,
  normalizeNews,
  normalizePlaces,
  createSignalsService,
  signalsPlugin,
} from '../../server/providers/signals.js';

test('signals reject malformed, duplicate and operator-injected inputs', () => {
  for (const query of [
    'lat=&lon=1',
    'lat=91&lon=1',
    'lat=1&lon=Infinity',
    'lat=1&lon=2&lat=3',
    'lat=1&lon=2&q=sourcecountry:US',
    'lat=1&lon=2&url=https://private',
  ])
    assert.equal(parseSignalQuery(new URLSearchParams(query)), null);
  assert.deepEqual(
    parseSignalQuery(new URLSearchParams('lat=13.0827&lon=80.2707&q=Chennai')),
    { lat: 13.08, lon: 80.27, query: 'Chennai' },
  );
});
test('news normalization excludes unsafe links and retains indexing uncertainty', () => {
  const rows = normalizeNews({
    articles: [
      { title: 'unsafe', url: 'javascript:alert(1)' },
      {
        title: '<b>Title</b>',
        url: 'https://example.org/a',
        seendate: '20261012T120000Z',
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].indexedAt, '2026-10-12T12:00:00Z');
  assert.equal(rows[0].confidence, 'Unverified news mention');
  assert.equal(
    normalizePlaces({
      query: { geosearch: [{ pageid: 1, title: 'place', lat: 200, lon: 1 }] },
    }).length,
    0,
  );
});
test('provider failures are isolated, cooled down and cached responses are labelled stale', async () => {
  let now = 1_000,
    calls = 0,
    failing = false;
  const service = createSignalsService({
    now: () => now,
    fetchImpl: async (url) => {
      calls++;
      if (failing) throw new Error('provider secret must not escape');
      return new Response(
        JSON.stringify(
          url.includes('gdelt')
            ? { articles: [] }
            : { query: { geosearch: [] } },
        ),
      );
    },
  });
  const query = { lat: 0, lon: 0, query: '' };
  assert.equal((await service.query(query)).news.status, 'empty');
  await service.query(query);
  assert.equal(calls, 2);
  now += 600001;
  failing = true;
  assert.equal((await service.query(query)).news.status, 'stale');
  const prior = calls;
  await service.query(query);
  assert.equal(calls, prior);
  now += 3_600_001;
  const result = await service.query(query);
  assert.equal(result.news.status, 'unavailable');
  assert.equal(result.places.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('Vite installer does not return Connect as a post-install hook', () => {
  const plugin = signalsPlugin();
  const middlewares = {
    use() {
      return middlewares;
    },
  };
  assert.equal(plugin.configureServer({ middlewares }), undefined);
  assert.equal(plugin.configurePreviewServer({ middlewares }), undefined);
});

test('distinct cache misses respect a shared provider admission interval', async () => {
  let calls = 0;
  const service = createSignalsService({
    now: () => 1000,
    fetchImpl: async (url) => {
      calls++;
      return new Response(
        JSON.stringify(
          url.includes('gdelt')
            ? { articles: [] }
            : { query: { geosearch: [] } },
        ),
      );
    },
  });
  await service.query({ lat: 1, lon: 2, query: 'Chennai' });
  const result = await service.query({ lat: 3, lon: 4, query: 'London' });
  assert.equal(calls, 2);
  assert.equal(result.news.status, 'unavailable');
});

test('signals share concurrent requests and keep failure cooldown bounded', async () => {
  let calls = 0;
  const service = createSignalsService({
    fetchImpl: async (url) => {
      calls++;
      await Promise.resolve();
      return new Response(
        JSON.stringify(
          url.includes('gdelt')
            ? { articles: [] }
            : { query: { geosearch: [] } },
        ),
      );
    },
  });
  const query = { lat: 1, lon: 2, query: 'Chennai' };
  await Promise.all([service.query(query), service.query(query)]);
  assert.equal(calls, 2);
});
