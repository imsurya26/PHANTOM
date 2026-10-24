import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodicPollPolicy, createPeriodicPollGate } from './pollingPolicy.js';
import { LayerLifecycle } from './lifecycle.js';

test('periodic polling pauses offline/hidden and adapts to constrained connections', () => {
  assert.equal(periodicPollPolicy({ hidden: true }).paused, true);
  assert.equal(periodicPollPolicy({ online: false }).paused, true);
  for (const connection of [
    { saveData: true },
    { effectiveType: 'slow-2g' },
    { effectiveType: '2g' },
    { effectiveType: '3g' },
  ]) {
    assert.equal(periodicPollPolicy({ connection }).multiplier, 4);
  }
  assert.deepEqual(
    periodicPollPolicy({
      hidden: false,
      online: true,
      connection: { effectiveType: '4g' },
    }),
    { paused: false, multiplier: 1 },
  );
});

test('poll gate skips background ticks without catch-up bursts on resume', () => {
  let now = 0;
  const gate = createPeriodicPollGate(1000, () => now);
  const slow = { paused: false, multiplier: 4 };
  now = 1000;
  assert.equal(gate(slow), false);
  now = 4000;
  assert.equal(gate(slow), true);
  now = 8000;
  assert.equal(gate({ ...slow, paused: true }), false);
  now = 20000;
  assert.equal(gate(slow), true);
  assert.equal(gate(slow), false);
  now = 21000;
  assert.equal(gate({ paused: false, multiplier: 1 }), true);
});

test('lifecycle timer does not call provider update in a hidden document', () => {
  const originalSetInterval = globalThis.setInterval;
  const originalDocument = globalThis.document;
  let tick;
  let updates = 0;
  try {
    globalThis.setInterval = (callback) => {
      tick = callback;
      return 1;
    };
    globalThis.document = { hidden: true };
    const manager = new LayerLifecycle(
      {},
      {
        getPollPolicy: () =>
          periodicPollPolicy({ hidden: globalThis.document.hidden }),
      },
    );
    manager._runPeriodicUpdate = () => {
      updates += 1;
    };
    const entry = { enabled: true, module: { refreshInterval: 1000 } };
    manager._armUpdateLoop('test', entry);
    tick();
    assert.equal(updates, 0);
    globalThis.document.hidden = false;
    tick();
    assert.equal(updates, 1);
    entry.enabled = false;
    tick();
    assert.equal(updates, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
