import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../public/phantom-sw.js', import.meta.url),
  'utf8',
);
function worker({ cachedNotice = true } = {}) {
  const events = new Map();
  const removed = [];
  const added = [];
  let activated = 0;
  let claimed = 0;
  const fetches = [];
  const context = {
    URL,
    Request,
    Response,
    self: {
      location: { origin: 'https://phantom.test' },
      addEventListener: (name, callback) => events.set(name, callback),
      skipWaiting: () => {
        activated++;
      },
      clients: {
        claim: async () => {
          claimed++;
        },
      },
    },
    caches: {
      keys: async () => [
        'phantom-offline-v0',
        'phantom-offline-v1',
        'unrelated',
      ],
      delete: async (name) => removed.push(name),
      open: async () => ({
        addAll: async (requests) => added.push(...requests),
        match: async () =>
          cachedNotice ? new Response('offline notice') : undefined,
      }),
    },
    fetch: async (request, options) => {
      fetches.push({ request, options });
      throw new Error('offline');
    },
  };
  vm.runInNewContext(source, context);
  return {
    events,
    removed,
    added,
    fetches,
    activated: () => activated,
    claimed: () => claimed,
  };
}
test('worker installs only static notice assets and removes only its obsolete cache', async () => {
  const w = worker();
  let pending;
  w.events.get('install')({
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(w.added.map((r) => new URL(r.url).pathname).sort(), [
    '/offline.css',
    '/offline.html',
    '/phantom.svg',
  ]);
  assert.ok(w.added.every((r) => r.credentials === 'omit'));
  w.events.get('activate')({
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(w.removed, ['phantom-offline-v0']);
  assert.equal(w.claimed(), 1);
  assert.equal(w.activated(), 0, 'installation never forces an update');
  w.events.get('message')({ data: { type: 'PHANTOM_ACTIVATE_UPDATE' } });
  assert.equal(w.activated(), 1);
});
test('offline fallback covers app navigation only, never APIs, tiles or external streams', async () => {
  const w = worker();
  for (const [url, mode, method] of [
    ['https://phantom.test/api/flights', 'navigate', 'GET'],
    ['https://phantom.test/tile.png', 'cors', 'GET'],
    ['https://radio.test/stream', 'navigate', 'GET'],
    ['https://phantom.test/', 'navigate', 'POST'],
  ]) {
    w.events.get('fetch')({
      request: { url, mode, method },
      respondWith: () => assert.fail(url),
    });
  }
  let response;
  w.events.get('fetch')({
    request: {
      url: 'https://phantom.test/?view=1',
      mode: 'navigate',
      method: 'GET',
    },
    respondWith: (p) => {
      response = p;
    },
  });
  assert.equal(await (await response).text(), 'offline notice');
  assert.equal(
    w.fetches[0].options.cache,
    'no-store',
    'stale application HTML cannot masquerade as a connected app',
  );
});

test('missing offline cache returns an honest unavailable document', async () => {
  const w = worker({ cachedNotice: false });
  let response;
  w.events.get('fetch')({
    request: { url: 'https://phantom.test/', mode: 'navigate', method: 'GET' },
    respondWith: (p) => {
      response = p;
    },
  });
  const result = await response;
  assert.equal(result.status, 503);
  assert.match(await result.text(), /unavailable offline/);
});
