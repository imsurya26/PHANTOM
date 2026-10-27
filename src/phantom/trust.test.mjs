import test from 'node:test';
import assert from 'node:assert/strict';
import { layerTrust } from './trust.js';

test('receiver and continuous collector requirements are explained honestly', () => {
  const local = layerTrust({
    id: 'local-adsb',
    enabled: true,
    stats: { status: 'idle', count: 0 },
  });
  assert.equal(local.state, 'Receiver required');
  assert.match(local.explanation, /radio receiver/);
  const ais = layerTrust({
    id: 'ais-live-vessels',
    enabled: true,
    stats: { unavailable: true },
  });
  assert.match(ais.explanation, /continuously connected AIS collector/);
  assert.equal(
    layerTrust({
      id: 'local-adsb',
      enabled: true,
      stats: { status: 'live', count: 2 },
    }).state,
    'Enabled',
  );
});

test('missing keys and degraded feeds never become live claims', () => {
  assert.equal(
    layerTrust({ enabled: true, stats: { keyRequired: true } }).state,
    'Not configured',
  );
  assert.equal(
    layerTrust({ enabled: true, stats: { stale: true } }).state,
    'Degraded',
  );
  assert.equal(
    layerTrust({ enabled: true, stats: {} }).freshness,
    'Update time unavailable',
  );
});
test('source status explanations do not expose raw provider errors', () => {
  const trust = layerTrust({
    enabled: true,
    stats: {
      transportStatus: 'auth-failed',
      error: 'https://provider.invalid?key=private',
    },
  });
  assert.equal(trust.state, 'Access denied');
  assert.doesNotMatch(trust.explanation, /private|https/);
  assert.equal(
    layerTrust({ enabled: true, stats: { status: 'zoom-in' } }).state,
    'Zoom in',
  );
  assert.equal(
    layerTrust({ enabled: true, stats: { status: 'empty' } }).state,
    'No results',
  );
  assert.equal(
    layerTrust({ enabled: true, stats: { fallback: true } }).state,
    'Alternative source',
  );
});
test('retrieval freshness is distinct from observation time', () => {
  assert.equal(
    layerTrust({ enabled: true, stats: { lastUpdate: 1000 } }, 121000)
      .freshness,
    'Fetched 2 min ago',
  );
  assert.equal(
    layerTrust({ enabled: true, stats: { lastUpdate: NaN } }).freshness,
    'Update time unavailable',
  );
});
test('normalized stale and refresh failures cannot be presented as healthy', () => {
  for (const stats of [
    { status: 'stale' },
    { count: 3, managerRefreshError: 'refresh failed' },
  ]) {
    assert.equal(layerTrust({ enabled: true, stats }).state, 'Degraded');
  }
  assert.equal(
    layerTrust({ enabled: true, stats: { loading: true, fallback: true } })
      .state,
    'Loading',
  );
});
