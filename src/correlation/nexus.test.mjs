import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateSignals, distanceKm } from './nexus.js';
const now = 1_000_000;
const anchor = { id: 'a', source: 'USGS', lat: 0, lon: 179.9, observedAt: now };
test('Nexus handles antimeridian and separates facts from proximity inference', () => {
  const near = {
    id: 'b',
    source: 'FIRMS',
    lat: 0,
    lon: -179.9,
    observedAt: now - 1000,
  };
  assert.ok(distanceKm(anchor, near) < 23);
  const result = correlateSignals(anchor, [anchor, near, near], { now });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].classification, 'Inference');
  assert.equal(result.fact.source, 'USGS');
  assert.match(result.uncertainty, /cannot establish impact/);
});
test('unknown times, future observations and far/old reports cannot be correlated', () => {
  const records = [
    { ...anchor, id: 'b', observedAt: null },
    { ...anchor, id: 'c', observedAt: now + 120000 },
    { ...anchor, id: 'd', lon: 0 },
    { ...anchor, id: 'e', observedAt: 1 },
  ];
  const result = correlateSignals(anchor, records, { now, windowMs: 10000 });
  assert.equal(result.matches.length, 0);
  assert.equal(result.excluded, 2);
});
test('Nexus enforces result and compute bounds with deterministic nearest ordering', () => {
  const a = { ...anchor, lon: 0 };
  const rows = Array.from({ length: 30 }, (_, i) => ({
    ...a,
    id: String(i),
    lat: i * 0.01,
  }));
  const result = correlateSignals(a, rows, { now, maxResults: 5 });
  assert.equal(result.totalMatches, 30);
  assert.equal(result.matches.length, 5);
  assert.equal(result.matches[0].id, '0');
  assert.throws(() => correlateSignals(a, Array(5001).fill(a), { now }));
  assert.throws(() => correlateSignals({ ...a, lat: 91 }, [], { now }));
  assert.throws(() => correlateSignals(a, [], { now, radiusKm: Infinity }));
});
