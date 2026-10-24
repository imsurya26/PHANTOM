import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetMotionDue } from './policy.js';

test('offscreen fleet motion is bounded but camera reveals update immediately', () => {
  assert.equal(fleetMotionDue(false, 100, undefined), true);
  assert.equal(fleetMotionDue(false, 1099, 100), false);
  assert.equal(fleetMotionDue(false, 1100, 100), true);
  assert.equal(fleetMotionDue(true, 101, 100), true);
  assert.equal(fleetMotionDue(false, 50, 100), true);
});
