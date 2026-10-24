import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProviderStatus, providerStatusPlugin } from '../../server/gateway/provider-status.js';

test('registry reports optional, disabled and unverified providers honestly', () => {
  const status = createProviderStatus({ env: { PHANTOM_DISABLED_PROVIDERS: 'usgs' } });
  const byId = Object.fromEntries(status.snapshot().map((row) => [row.id, row]));
  assert.equal(byId.openaq.status, 'OPTIONAL');
  assert.equal(byId.openaq.credentialConfigured, false);
  assert.equal(byId.usgs.status, 'DISABLED');
  assert.equal(byId.photon.status, 'NOT_VERIFIED');
  assert.equal(status.enabled('photon'), true);
  assert.equal(status.enabled('usgs'), false);
  assert.equal(status.enabled('unknown'), false);
  assert.deepEqual(byId.opensky.fallback, ['adsb-lol']);
  for (const row of Object.values(byId)) {
    assert.equal(row.dataFreshness.observedAt, null);
    assert.equal(row.quotaState, 'UNKNOWN');
    assert.equal(row.errorState, null);
  }
});

test('observed quota and error states expire without claiming freshness', () => {
  let clock = 1_000;
  const status = createProviderStatus({ env: {}, now: () => clock });
  status.record('photon', 'RATE_LIMITED');
  let row = status.snapshot().find((p) => p.id === 'photon');
  assert.equal(row.quotaState, 'RATE_LIMITED');
  assert.equal(row.dataFreshness.observedAt, null);
  clock += 300_001;
  row = status.snapshot().find((p) => p.id === 'photon');
  assert.equal(row.status, 'NOT_VERIFIED');
  assert.equal(row.quotaState, 'UNKNOWN');
});

test('both status routes expose metadata only and reject writes', () => {
  let handler;
  providerStatusPlugin(createProviderStatus({ env: {} })).configureServer({ middlewares: { use(fn) { handler = fn; } } });
  for (const url of ['/api/providers/status', '/api/phantom/provider-status']) {
    for (const method of ['GET', 'POST']) {
      const headers = {};
      let body;
      const response = { setHeader(key, value) { headers[key] = value; }, end(value) { body = JSON.parse(value); } };
      handler({ url, method }, response, () => assert.fail('must handle status'));
      assert.equal(headers['Cache-Control'], 'no-store');
      if (method === 'GET') assert.ok(body.providers.length > 10);
      else assert.equal(response.statusCode, 405);
    }
  }
});

test('credential UI remains opt-in even when a setup link is shared', () => {
  const source = readFileSync(new URL('../keySetup.js', import.meta.url), 'utf8');
  assert.match(source, /chip\.hidden = true/);
  assert.doesNotMatch(source, /URLSearchParams\(globalThis\.location/);
  const helper = readFileSync(new URL('./providerSettings.js', import.meta.url), 'utf8');
  assert.match(helper, /import\('\.\.\/keySetup\.js'\)/);
});
