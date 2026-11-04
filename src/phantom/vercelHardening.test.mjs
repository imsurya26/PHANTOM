import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVercelHandler } from '../../server/vercel/handler.js';
import { BROWSER_CSP } from '../../build/vite.js';
import { detectSecrets } from '../../scripts/scan-secrets.mjs';
import vercelBuild from '../../build/vercel.config.js';

async function call(handler, url) {
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
  await handler({ url, method: 'GET', headers: {} }, res);
  return res;
}

test('weather and combined signal routes honor provider kill switches', async () => {
  for (const [provider, route] of [['noaa', '/api/weather/forecast'], ['gdelt', '/api/phantom/signals'], ['wikimedia', '/api/phantom/signals']]) {
    const handler = createVercelHandler({ env: { PHANTOM_DISABLED_PROVIDERS: provider }, fetchImpl: async () => assert.fail('disabled route reached upstream') });
    assert.equal((await call(handler, route)).statusCode, 503);
  }
});

test('Vercel disabled providers are denied before status or upstream dispatch', async () => {
  const handler = createVercelHandler({
    env: {
      PHANTOM_DISABLED_PROVIDERS: 'tomtom,mapillary,firms,openaq,gemini',
      TOMTOM_API_KEY: 'synthetic', MAPILLARY_CLIENT_TOKEN: 'synthetic',
      FIRMS_MAP_KEY: 'synthetic', OPENAQ_API_KEY: 'synthetic', GEMINI_API_KEY: 'synthetic',
    },
    fetchImpl: async () => assert.fail('Disabled providers must not contact upstream'),
  });
  for (const url of ['/api/tomtom/status', '/api/tomtom/flow/8/60/104.pbf', '/api/mapillary/status', '/api/mapillary/tiles/coverage/14/1/1', '/api/firms/status', '/api/firms', '/api/air-quality/locations?lat=13&lon=80', '/api/gemini/token']) {
    const res = await call(handler, url);
    assert.equal(res.statusCode, 503, url);
    assert.equal(res.body.state, 'disabled', url);
  }
});

test('production status recognizes configured public adapters without claiming verification', async () => {
  const handler = createVercelHandler({ env: { TOMTOM_API_KEY: 'synthetic', MAPILLARY_CLIENT_TOKEN: 'synthetic' } });
  const { body } = await call(handler, '/api/providers/status');
  for (const id of ['tomtom', 'mapillary', 'noaa', 'gdelt', 'wikimedia']) {
    const provider = body.providers.find(p => p.id === id);
    assert.equal(provider.reason, 'not-verified', id);
    assert.equal(provider.status, 'NOT_VERIFIED', id);
  }
  assert.equal(body.providers.find(p => p.id === 'aisstream').reason, 'public-adapter-unavailable');
});

test('Vercel documents receive the reviewed application CSP', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url)));
  const headers = config.headers.find(rule => rule.source === '/(.*)').headers;
  assert.equal(headers.find(h => h.key === 'Content-Security-Policy')?.value, BROWSER_CSP);
});

test('scanner covers every supported shared storage credential alias', () => {
  const value = ['aB3dE6gH9jK2', 'mN5pQ8sT1vW4yZ7cF0iL'].join('');
  for (const name of ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']) {
    assert.ok(detectSecrets(`${name}=${value}`).includes('private-credential-assignment'), name);
  }
});

test('disabled public browser credentials are omitted from production assets', async (t) => {
  const names = ['PHANTOM_DISABLED_PROVIDERS', 'GOOGLE_MAPS_API_KEY', 'CESIUM_ION_TOKEN', 'MAPILLARY_CLIENT_TOKEN'];
  const prior = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => { for (const name of names) { if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name]; } });
  process.env.PHANTOM_DISABLED_PROVIDERS = 'google-tiles,cesium,mapillary';
  for (const name of names.slice(1)) process.env[name] = 'synthetic-browser-token';
  const config = await vercelBuild({ command: 'build', mode: 'production' });
  for (const name of names.slice(1)) assert.equal(config.define[`import.meta.env.${name}`], '""');
});
