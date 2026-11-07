import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedRenderFrames } from '../scripts/qa-frame-cadence.mjs';

test('high refresh monitors cannot demand frames beyond the configured app cap', () => {
  assert.equal(
    expectedRenderFrames({ rafs: 330, elapsedMs: 2000, targetFrameRate: 60 }),
    120,
  );
  assert.equal(
    expectedRenderFrames({ rafs: 60, elapsedMs: 2000, targetFrameRate: 60 }),
    60,
  );
  assert.equal(expectedRenderFrames({ rafs: 330, elapsedMs: 2000 }), 330);
});

test('the cadence gate still rejects a stalled renderer and accounts for actual sample duration', () => {
  const expected = expectedRenderFrames({
    rafs: 825,
    elapsedMs: 5000,
    targetFrameRate: 60,
  });
  assert.equal(100 >= expected * 0.7, false);
  assert.equal(240 >= expected * 0.7, true);
  assert.equal(
    expectedRenderFrames({ rafs: 500, elapsedMs: 2500, targetFrameRate: 60 }),
    150,
  );
  assert.throws(
    () => expectedRenderFrames({ rafs: 10, elapsedMs: 0, targetFrameRate: 60 }),
    TypeError,
  );
});
