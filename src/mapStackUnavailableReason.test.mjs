import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MapStackController,
  photorealUnavailableReason,
} from './mapStackController.js';

test('missing photoreal credentials offer the free globe without setup demands', () => {
  assert.match(photorealUnavailableReason(false), /optional.*free globe/);
  assert.doesNotMatch(photorealUnavailableReason(false), /API|token|key/);
});

test('a configured but failed photoreal route does not ask for another key', () => {
  const reason = photorealUnavailableReason(true);
  assert.match(reason, /unavailable.*free globe.*retry/);
  assert.doesNotMatch(reason, /Needs|add it/);
});

test('controller credential detection accepts ion without a browser global', () => {
  const hasCredentials = MapStackController.prototype._hasPhotorealCredentials;
  assert.equal(hasCredentials.call({ cesiumToken: 'configured' }), true);
  assert.equal(hasCredentials.call({ cesiumToken: '   ' }), false);
});
