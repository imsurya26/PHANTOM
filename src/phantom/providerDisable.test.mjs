import test from 'node:test';
import assert from 'node:assert/strict';
import { openSkyProxy } from '../../server/providers/aircraft/opensky.js';

test('OpenSky kill switch never calls OpenSky and only uses a bounded regional fallback', async (t) => {
  const prior = process.env.PHANTOM_DISABLED_PROVIDERS;
  process.env.PHANTOM_DISABLED_PROVIDERS = 'opensky';
  t.after(() => {
    if (prior === undefined) delete process.env.PHANTOM_DISABLED_PROVIDERS;
    else process.env.PHANTOM_DISABLED_PROVIDERS = prior;
  });
  const hosts = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    hosts.push(new URL(url).hostname);
    return new Response(JSON.stringify({ now: Date.now() / 1000, ac: [] }));
  });
  let handler;
  openSkyProxy().configureServer({
    middlewares: {
      use(path, fn) {
        if (path === '/api/flights') handler = fn;
      },
    },
  });
  const request = async (url) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      writeHead(code) {
        this.statusCode = code;
      },
      end(body) {
        this.payload = JSON.parse(body);
      },
    };
    await handler({ url }, res, () => {});
    return res;
  };
  assert.equal((await request('/')).statusCode, 503);
  assert.equal(hosts.length, 0);
  assert.equal((await request('/?lat=13&lon=80')).statusCode, 200);
  assert.deepEqual(hosts, ['api.adsb.lol']);
});
