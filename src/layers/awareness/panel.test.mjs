import test from 'node:test';
import assert from 'node:assert/strict';
import { awarenessPanelInteractionPaused } from './panel.js';

test('contact inspector does not rotate pages while reading, focused, collapsed or hidden', () => {
  const active = {};
  const panel = {
    contains: (element) => element === active,
    matches: () => false,
    closest: () => null,
  };
  assert.equal(
    awarenessPanelInteractionPaused(panel, { activeElement: active }),
    true,
  );
  assert.equal(awarenessPanelInteractionPaused(panel, { hidden: true }), true);
  assert.equal(
    awarenessPanelInteractionPaused({ ...panel, matches: () => true }, {}),
    true,
  );
  assert.equal(
    awarenessPanelInteractionPaused({ ...panel, closest: () => ({}) }, {}),
    true,
  );
  assert.equal(
    awarenessPanelInteractionPaused({ ...panel, hidden: true }, {}),
    true,
  );
  assert.equal(
    awarenessPanelInteractionPaused(panel, { activeElement: {} }),
    false,
  );
});
